import assert from "node:assert/strict";
import test from "node:test";
import { graphql } from "graphql";
import { createEngagementSchema } from "../src/transport/engagement-schema.js";
import { createEngagementFieldLoaders } from "../src/transport/engagement-field-loaders.js";
import { inspectEngagementOperation } from "../src/transport/graphql-operation.js";
import { fieldsFixture, id, pair } from "./engagement-fields-fixture.js";

const source = `query TitleFields($representations: [_Any!]!, $profileId: ID!) {
  _entities(representations: $representations) { ... on Title {
    id progress(profileId: $profileId) { titleId positionMs status }
    inWatchlist(profileId: $profileId)
  } }
}`;
const body = (count = 20) => ({
  query: source,
  variables: {
    profileId: id(2),
    representations: Array.from({ length: count }, (_, n) => ({
      __typename: "Title",
      id: id(n + 100),
    })),
  },
});
const code = (value: unknown, expected: string) => {
  assert.equal((value as { extensions?: { code?: string } }).extensions?.code, expected);
  return true;
};

test("twenty federated titles batch progress and membership into one owned SQL read and one visibility batch", async () => {
  const f = fieldsFixture();
  const input = body();
  assert.equal(inspectEngagementOperation(input).status, "accepted");
  const result = await graphql({
    schema: createEngagementSchema(),
    source,
    variableValues: input.variables,
    contextValue: f.context(),
  });
  assert.equal(result.errors, undefined);
  const entities = result.data?.["_entities"] as {
    id: string;
    progress: { titleId: string };
    inWatchlist: boolean;
  }[];
  assert.equal(entities.length, 20);
  for (const [index, entity] of entities.entries()) {
    assert.equal(entity.id, id(index + 100));
    assert.equal(entity.progress.titleId, entity.id);
    assert.equal(entity.inWatchlist, true);
  }
  assert.deepEqual(f.calls.owners, [id(2)]);
  assert.equal(f.calls.sql.length, 1);
  assert.equal(f.calls.sql[0]?.length, 20);
  assert.equal(f.calls.catalog.length, 1);
  assert.equal(f.calls.catalog[0]?.length, 20);
  assert.doesNotMatch(JSON.stringify(result), /accountId|playbackSessionId|synthetic-fields/u);
});

test("Title/Profile references and aliases share canonical pairs but never cache between requests or credentials", async () => {
  const f = fieldsFixture();
  const query = `query Shared($representations: [_Any!]!, $profileId: ID!, $titleId: ID!) {
    _entities(representations: $representations) {
      ... on Title { a:progress(profileId:$profileId) { positionMs } b:progress(profileId:$profileId) { positionMs } }
      ... on Profile { progress(titleId:$titleId) { positionMs } inWatchlist(titleId:$titleId) }
    }
  }`;
  const variables = {
    profileId: id(2),
    titleId: id(3),
    representations: [
      { __typename: "Title", id: id(3) },
      { __typename: "Profile", id: id(2) },
      { __typename: "Title", id: id(3) },
    ],
  };
  assert.equal(inspectEngagementOperation({ query, variables }).status, "accepted");
  for (let n = 0; n < 2; n++) {
    const result = await graphql({
      schema: createEngagementSchema(),
      source: query,
      variableValues: variables,
      contextValue: { ...f.context() },
    });
    assert.equal(result.errors, undefined);
  }
  assert.deepEqual(
    f.calls.sql.map((keys) => keys.length),
    [1, 1],
  );
  assert.equal(f.calls.owners.length, 2);
  const foreign = await graphql({
    schema: createEngagementSchema(),
    source: query,
    variableValues: variables,
    contextValue: f.context({ ...f.request, credential: "synthetic-other-account" }),
  });
  assert.ok(foreign.errors?.every((error) => error.extensions["code"] === "NOT_FOUND"));
  assert.equal(f.calls.sql.length, 2);
});

test("missing progress and absent/hidden membership are distinct from optional Catalog failure", async () => {
  const f = fieldsFixture();
  f.missing.add(id(3));
  f.absent.add(id(3));
  f.hidden.add(id(4));
  const loader = f.loaders();
  assert.equal(await loader.progress(pair()), null);
  assert.equal(await loader.inWatchlist(pair()), false);
  assert.equal(f.calls.catalog.length, 0);
  assert.equal(await loader.inWatchlist(pair(4)), false);
  f.control.catalogDown = true;
  const independent = f.loaders();
  assert.ok(await independent.progress(pair(5)));
  await assert.rejects(independent.inWatchlist(pair(5)), (error: unknown) =>
    code(error, "UNAVAILABLE"),
  );
  assert.ok(await independent.progress(pair(5)));
});

test("foreign/deleted profiles fail only their optional fields; owned profiles still use one query", async () => {
  const f = fieldsFixture();
  f.denied.add(id(21));
  f.deleted.add(id(22));
  const loader = f.loaders();
  const results = await Promise.allSettled([
    loader.progress(pair(3, 20)),
    loader.progress(pair(3, 21)),
    loader.progress(pair(3, 22)),
  ]);
  assert.equal(results[0].status, "fulfilled");
  for (const result of results.slice(1)) {
    assert.equal(result.status, "rejected");
    code(result.reason, "NOT_FOUND");
  }
  assert.equal(f.calls.sql.length, 1);
  assert.equal(f.calls.sql[0]?.length, 2);
});

test("cache hits recheck authority, visibility and cancellation rather than refreshing stale data", async () => {
  for (const boundary of ["authority", "visibility", "cancel"] as const) {
    const f = fieldsFixture();
    const loader = f.loaders();
    assert.equal(await loader.inWatchlist(pair()), true);
    if (boundary === "cancel") {
      f.controller.abort();
    } else {
      f.setTime(boundary === "authority" ? 103 : 102);
    }
    await assert.rejects(loader.inWatchlist(pair()), (error: unknown) =>
      code(error, boundary === "cancel" ? "CANCELLED" : "UNAVAILABLE"),
    );
    assert.equal(f.calls.owners.length, 1);
    assert.equal(f.calls.sql.length, 1);
    assert.equal(f.calls.catalog.length, 1);
  }
});

test("expired authority after SQL and malformed/reordered results fail closed", async () => {
  const variants = ["expiry", "order", "owner", "missing", "future"] as const;
  for (const variant of variants) {
    const f = fieldsFixture();
    if (variant === "expiry") {
      f.control.afterStore = () => {
        f.setTime(103);
      };
    } else {
      f.control.rows = (rows) => {
        if (variant === "missing") {
          return [];
        }
        if (variant === "order") {
          return rows.reverse();
        }
        return rows.map((row) =>
          variant === "owner"
            ? { ...row, accountId: id(99) }
            : { ...row, progress: row.progress ? { ...row.progress, updatedAt: 101 } : null },
        );
      };
    }
    const loader = f.loaders();
    const result = await Promise.allSettled([loader.progress(pair()), loader.progress(pair(4))]);
    assert.ok(result.every((entry) => entry.status === "rejected"));
  }
});

test("twenty pair and five profile cache caps reject overflow before it joins a dispatch", async () => {
  const f = fieldsFixture();
  const loader = f.loaders();
  const work = Array.from({ length: 20 }, (_, n) => loader.progress(pair(n + 100)));
  await assert.rejects(loader.progress(pair(999)), (error: unknown) =>
    code(error, "LIMIT_EXCEEDED"),
  );
  assert.equal((await Promise.all(work)).length, 20);
  assert.equal(f.calls.sql[0]?.length, 20);
  const g = fieldsFixture();
  const scoped = g.loaders();
  const profiles = Array.from({ length: 5 }, (_, n) => scoped.progress(pair(3, n + 100)));
  await assert.rejects(scoped.progress(pair(3, 200)), (error: unknown) =>
    code(error, "LIMIT_EXCEEDED"),
  );
  assert.equal((await Promise.all(profiles)).length, 5);
  assert.equal(g.calls.owners.length, 5);
  assert.equal(g.calls.sql.length, 1);
});

test("cancelled pending Identity reads settle without later SQL and do not exceed two owner calls", async () => {
  const f = fieldsFixture();
  let started = 0;
  f.ports.identity.authorizeProfile = () => {
    started++;
    return new Promise(() => undefined);
  };
  const loader = f.loaders();
  const work = Promise.allSettled(
    Array.from({ length: 5 }, (_, n) => loader.progress(pair(3, n + 100))),
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
  f.controller.abort();
  assert.ok((await work).every((entry) => entry.status === "rejected"));
  assert.equal(started, 2);
  assert.equal(f.calls.sql.length, 0);
});

test("invalid input/context/representations and abusive recursive or multiplied queries fail before I/O", async () => {
  const good = body(1);
  for (const representations of [
    [],
    Array.from({ length: 21 }, () => ({ __typename: "Title", id: id(3) })),
    [{ __typename: "Account", id: id(3) }],
    [{ __typename: "Title", id: "invalid" }],
    [{ __typename: "Title", id: id(3), accountId: id(1) }],
  ]) {
    assert.equal(
      inspectEngagementOperation({ ...good, variables: { ...good.variables, representations } })
        .status,
      "rejected",
    );
  }
  for (const query of [
    source.replace("... on Title", "... on Account"),
    source.replace("profileId: $profileId", 'profileId: "invalid"'),
    source.replace("id progress", "a:id b:id c:id d:id e:id progress"),
    source.replace(
      "titleId positionMs status",
      "titleId positionMs status title { progress(profileId:$profileId) { title { progress(profileId:$profileId) { id } } } }",
    ),
  ]) {
    assert.equal(inspectEngagementOperation({ ...good, query }).status, "rejected");
  }
  const named = `query Fields($representations: [_Any!]!, $profileId: ID!) {
    _entities(representations:$representations) { ... Value }
  } fragment Value on Title { progress(profileId:$profileId) { positionMs } }`;
  assert.equal(inspectEngagementOperation({ ...good, query: named }).status, "accepted");
  const f = fieldsFixture();
  const forged = await graphql({
    schema: createEngagementSchema(),
    source,
    variableValues: good.variables,
    contextValue: { fields: f.loaders(), signal: f.controller.signal },
  });
  assert.ok(forged.errors?.length);
  assert.equal(f.calls.sql.length, 0);
  const loader = createEngagementFieldLoaders(f.queries, {
    ...f.request,
    correlationId: "invalid",
  });
  await assert.rejects(loader.progress(pair()), (error: unknown) => code(error, "INVALID_INPUT"));
  assert.equal(f.calls.owners.length, 0);
});
