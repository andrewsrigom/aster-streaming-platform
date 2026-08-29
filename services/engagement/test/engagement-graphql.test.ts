import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer, request } from "node:http";
import test from "node:test";
import { graphql, Kind, parse, print, visit } from "graphql";
import { createExpressHttpAdapter, createLocalRouterTrust } from "@aster/http-express";
import { createEngagementSchema } from "../src/transport/engagement-schema.js";
import {
  createEngagementSubgraph,
  type EngagementSubgraphOptions,
} from "../src/transport/engagement-subgraph.js";
import { inspectEngagementOperation } from "../src/transport/graphql-operation.js";
import type { ProgressInput, ProgressState } from "../src/domain/progress.js";
import { watchlistFixture, watchlistInput } from "./watchlist-fixture.js";
import { fieldsFixture } from "./engagement-fields-fixture.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input: ProgressInput = {
  profileId: id(1),
  titleId: id(2),
  playbackSessionId: id(3),
  idempotencyKey: id(4),
  sequence: 1,
  positionMs: 1000,
  durationMs: 6000,
  occurredAt: 100,
};
const state: ProgressState = {
  id: id(5),
  accountId: id(6),
  profileId: input.profileId,
  titleId: input.titleId,
  playbackSessionId: input.playbackSessionId,
  sequence: 1,
  version: 1,
  positionMs: 1000,
  durationMs: 6000,
  status: "IN_PROGRESS",
  occurredAt: 100,
  updatedAt: 100,
};
const query =
  "mutation RecordProgress($input: RecordProgressInput!) { recordProgress(input: $input) { code correlationId retryAfterMs progress { id profileId titleId sequence version positionMs durationMs status occurredAt updatedAt } } }";
const body = { query, operationName: "RecordProgress", variables: { input } };
type RecordProgress = EngagementSubgraphOptions["recorder"]["record"];

const historyQuery =
  "query ProgressHistory($profileId:ID!, $first:Int! = 20, $after:String) { progressHistory(profileId:$profileId, first:$first, after:$after) { code correlationId connection { edges { cursor node { id titleId sequence positionMs durationMs status updatedAt title { __typename id } } } pageInfo { endCursor hasNextPage } } } }";
const homeContinueQuery =
  "query HomeContinueWatching($profileId:ID!, $first:Int! = 10) { homeContinueWatching(profileId:$profileId, first:$first) { code correlationId connection { edges { node { titleId positionMs durationMs status title { __typename id } } } pageInfo { hasNextPage } } } }";

const watchlistMutation =
  "mutation SetWatchlist($input: SetWatchlistInput!) { setWatchlist(input: $input) { code correlationId retryAfterMs change { id profileId titleId present version updatedAt } } }";
const watchlistPage =
  "query Watchlist($profileId: ID!, $first: Int! = 20, $after: String) { watchlist(profileId: $profileId, first: $first, after: $after) { code correlationId connection { edges { cursor node { id profileId titleId addedAt title { __typename id } } } pageInfo { endCursor hasNextPage } } } }";

test("first-party library owner selections fit the unchanged budget at twenty titles", () => {
  const inventory = parse(
    readFileSync(
      new URL("../../../../infra/router/known-operations.graphql", import.meta.url),
      "utf8",
    ),
  );
  const reference = parse("fragment Reference on Title { __typename id }").definitions[0];
  assert.ok(reference?.kind === Kind.FRAGMENT_DEFINITION);
  for (const name of ["ProgressHistory", "ContinueWatching", "Watchlist"]) {
    const document = inventory.definitions.find(
      (item) => item.kind === Kind.OPERATION_DEFINITION && item.name?.value === name,
    );
    assert.ok(document);
    // Catalog resolves localized metadata; Engagement supplies the federated Title key.
    const owner = visit(document, {
      Field(node) {
        return node.name.value === "title" && node.selectionSet
          ? { ...node, selectionSet: reference.selectionSet }
          : undefined;
      },
    });
    const query = print(owner);
    const variables = { profileId: id(2), first: 20, after: null };
    assert.equal(inspectEngagementOperation({ query, variables }).status, "accepted", name);
    if (name === "ContinueWatching") {
      assert.deepEqual(
        inspectEngagementOperation({
          query: query.replace("positionMs", "sequence version updatedAt positionMs"),
          variables,
        }),
        { status: "rejected", code: "LIMIT_EXCEEDED" },
      );
    }
  }
});

test("watchlist preflight validates commands, page shape, cursor scope and multiplied list cost", async () => {
  const mutation = { query: watchlistMutation, variables: { input: watchlistInput() } };
  const page = { query: watchlistPage, variables: { profileId: id(2) } };
  assert.equal(inspectEngagementOperation(mutation).status, "accepted");
  assert.equal(inspectEngagementOperation(page).status, "accepted");
  for (const value of [
    { ...mutation, variables: { input: watchlistInput({ present: false }) } },
    { ...page, variables: { profileId: id(2), first: 1 } },
  ]) {
    assert.equal(inspectEngagementOperation(value).status, "accepted");
  }
  for (const value of [
    { ...mutation, variables: { input: { ...watchlistInput(), present: "true" } } },
    { ...mutation, variables: { input: { ...watchlistInput(), accountId: id(9) } } },
    { ...mutation, query: watchlistMutation.replace("change { id", "change { accountId") },
    { ...page, variables: { profileId: id(2), first: 21 } },
    { ...page, variables: { profileId: id(2), after: "e1.history.foreign" } },
    { ...page, query: watchlistPage.replace("code correlationId", "code correlationId accountId") },
    {
      ...page,
      query:
        "query Two($profileId:ID!) { watchlist(profileId:$profileId) { code } progressHistory(profileId:$profileId) { code } }",
    },
    {
      ...page,
      query: watchlistPage.replace(
        "id profileId titleId addedAt",
        "id profileId titleId addedAt a:id b:id c:id d:id id id id id id id id id id id id id",
      ),
    },
  ]) {
    assert.equal(inspectEngagementOperation(value).status, "rejected");
  }
  const forged = await graphql({
    schema: createEngagementSchema(),
    source: watchlistMutation,
    variableValues: mutation.variables,
    contextValue: {
      watchlist: {
        writer: {
          set: () => {
            throw new Error("must not dispatch");
          },
        },
      },
    },
  });
  assert.equal(forged.errors?.[0]?.extensions["code"], "UNAVAILABLE");
});

test("HTTP watchlist uses owned applications, sanitizes membership and preserves opposite-command replay", async () => {
  const w = watchlistFixture();
  const f = await fixture(
    () => {
      throw new Error("watchlist must not record progress");
    },
    undefined,
    { writer: w.writer, queries: w.queries },
  );
  const command = watchlistInput();
  const set = (value: object) => f.send({ query: watchlistMutation, variables: { input: value } });
  try {
    const saved = await set(command);
    assert.equal(saved.status, 200);
    assert.equal(saved.cache, "no-store");
    assert.equal(saved.cookie, undefined);
    const decode = (text: string) =>
      JSON.parse(text) as {
        errors?: unknown[];
        data: {
          setWatchlist?: {
            code: string;
            change: { id: string; present: boolean; version: number } | null;
          };
          watchlist?: {
            code: string;
            connection: { edges: { node: { title: { id: string } } }[] };
          };
        };
      };
    const first = decode(saved.text);
    assert.equal(first.errors, undefined);
    assert.equal(first.data.setWatchlist?.code, "COMPLETED");
    assert.equal(first.data.setWatchlist.change?.present, true);
    assert.doesNotMatch(
      saved.text,
      /accountId|credential|signature|playbackSessionId|manifestUrl/u,
    );
    const page = await f.send({
      query: watchlistPage,
      variables: { profileId: command.profileId },
    });
    assert.equal(
      decode(page.text).data.watchlist?.connection.edges[0]?.node.title.id,
      command.titleId,
    );
    const removed = decode((await set({ ...command, idempotencyKey: id(8), present: false })).text);
    assert.equal(removed.data.setWatchlist?.change?.version, 2);
    w.ports.catalog.visibility = () => Promise.resolve({ status: "unavailable" });
    assert.deepEqual(
      decode((await set(command)).text).data.setWatchlist?.change,
      first.data.setWatchlist.change,
    );
    const empty = await f.send({
      query: watchlistPage,
      variables: { profileId: command.profileId },
    });
    assert.deepEqual(decode(empty.text).data.watchlist?.connection.edges, []);
    const before = w.calls.transaction;
    const forged = await f.send(
      { query: watchlistMutation, variables: { input: command } },
      { ...f.headers, "x-aster-router-credential": "forged" },
    );
    assert.equal(forged.status, 403);
    assert.equal(w.calls.transaction, before);
  } finally {
    await f.close();
  }
});

test("watchlist HTTP non-success and uncertain commits never fabricate acknowledged membership", async () => {
  const w = watchlistFixture();
  let status: "not_visible" | "unavailable" | "indeterminate" = "not_visible";
  const f = await fixture(
    () => {
      throw new Error("not progress");
    },
    undefined,
    {
      writer: { set: () => Promise.resolve({ status }) },
      queries: w.queries,
    },
  );
  try {
    for (status of ["not_visible", "unavailable", "indeterminate"] as const) {
      const response = await f.send({
        query: watchlistMutation,
        variables: { input: watchlistInput() },
      });
      const result = JSON.parse(response.text) as {
        errors?: unknown[];
        data: { setWatchlist: { code: string; change: unknown } };
      };
      assert.equal(result.errors, undefined);
      assert.equal(result.data.setWatchlist.code, status.toUpperCase());
      assert.equal(result.data.setWatchlist.change, null);
    }
  } finally {
    await f.close();
  }

  const limited = await fixture(
    () => {
      throw new Error("not progress");
    },
    undefined,
    {
      writer: {
        set: () => Promise.resolve({ status: "limit_exceeded", retryAfterMs: 1_001 }),
      },
      queries: w.queries,
    },
  );
  try {
    const response = await limited.send({
      query: watchlistMutation,
      variables: { input: watchlistInput() },
    });
    const result = JSON.parse(response.text) as {
      data: { setWatchlist: { code: string; retryAfterMs: number; change: unknown } };
    };
    assert.equal(result.data.setWatchlist.code, "LIMIT_EXCEEDED");
    assert.equal(result.data.setWatchlist.retryAfterMs, 1_001);
    assert.equal(result.data.setWatchlist.change, null);
    assert.equal(response.retryAfter, "2");
  } finally {
    await limited.close();
  }
});

test("read preflight bounds pages, canonical cursors, list cost and root fan-out", () => {
  const history = { query: historyQuery, variables: { profileId: input.profileId } };
  const home = { query: homeContinueQuery, variables: { profileId: input.profileId } };
  assert.equal(inspectEngagementOperation(history).status, "accepted");
  assert.equal(inspectEngagementOperation(home).status, "accepted");
  assert.equal(
    String(createEngagementSchema().getQueryType()?.getFields()["homeContinueWatching"]?.type),
    "ProgressPagePayload",
  );
  for (const value of [
    { ...history, variables: { profileId: input.profileId, first: 21 } },
    { ...history, variables: { profileId: input.profileId, first: 0 } },
    { ...history, variables: { profileId: input.profileId, after: "e1.continue.invalid" } },
    { ...history, query: historyQuery.replace("code correlationId", "code accountId") },
    { ...history, query: historyQuery.replace("first:$first", "first:1, first:20") },
    { ...home, variables: { profileId: input.profileId, first: 21 } },
    {
      ...history,
      query:
        "query Two($profileId:ID!) { progressHistory(profileId:$profileId) { code } continueWatching(profileId:$profileId) { code } }",
    },
    {
      ...history,
      query: historyQuery.replace(
        "id titleId sequence",
        "id a:id b:id c:id d:id titleId profileId version occurredAt sequence",
      ),
    },
  ]) {
    assert.equal(inspectEngagementOperation(value).status, "rejected");
  }
});

test("HTTP history forwards profile authority and emits bounded public state with a Catalog reference", async () => {
  let reads = 0;
  const f = await fixture(
    () => {
      throw new Error("read must not write");
    },
    {
      page: (kind, value, request) => {
        reads++;
        assert.equal(kind, "history");
        assert.deepEqual(value, { profileId: input.profileId, first: 20, after: null });
        assert.equal(request.credential, "synthetic.viewer.signature");
        return Promise.resolve({
          status: "completed",
          value: {
            edges: [{ cursor: "synthetic-cursor", node: state }],
            pageInfo: { endCursor: "synthetic-cursor", hasNextPage: false },
          },
        });
      },
    },
  );
  try {
    const response = await f.send({
      query: historyQuery,
      variables: { profileId: input.profileId },
    });
    assert.equal(response.status, 200);
    assert.equal(response.cache, "no-store");
    assert.equal(response.cookie, undefined);
    const body = JSON.parse(response.text) as {
      data: {
        progressHistory: {
          code: string;
          connection: { edges: { node: { title: { id: string } } }[] };
        };
      };
    };
    assert.equal(body.data.progressHistory.code, "COMPLETED");
    assert.equal(body.data.progressHistory.connection.edges[0]?.node.title.id, state.titleId);
    assert.doesNotMatch(response.text, /accountId|playbackSessionId|signature|credential/u);
    assert.equal(reads, 1);
  } finally {
    await f.close();
  }
});

test("nullable home continue-watching reuses Engagement owner authorization", async () => {
  let reads = 0;
  const f = await fixture(
    () => {
      throw new Error("home read must not write");
    },
    {
      page: (kind, value) => {
        reads++;
        assert.equal(kind, "continue");
        assert.deepEqual(value, { profileId: input.profileId, first: 10, after: null });
        return Promise.resolve({
          status: "completed",
          value: {
            edges: [{ cursor: "home-cursor", node: state }],
            pageInfo: { endCursor: "home-cursor", hasNextPage: false },
          },
        });
      },
    },
  );
  try {
    const response = await f.send({
      query: homeContinueQuery,
      variables: { profileId: input.profileId },
    });
    assert.equal(response.status, 200);
    const body = JSON.parse(response.text) as {
      data: { homeContinueWatching: { code: string; connection: { edges: unknown[] } } };
    };
    assert.equal(body.data.homeContinueWatching.code, "COMPLETED");
    assert.equal(body.data.homeContinueWatching.connection.edges.length, 1);
    assert.equal(reads, 1);
  } finally {
    await f.close();
  }
});

test("progress preflight bounds input, mutation fan-out and schema exposure", async () => {
  assert.equal(inspectEngagementOperation(body).status, "accepted");
  assert.equal(
    inspectEngagementOperation({ query: "query Service { _service { sdl } }" }).status,
    "accepted",
  );
  for (const value of [
    { ...body, variables: { input: { ...input, accountId: id(6) } } },
    { ...body, variables: { input: { ...input, sequence: 0 } } },
    { ...body, variables: { input, unused: { arbitrary: "object" } } },
    { ...body, query: query.replace("id profileId", "accountId profileId") },
    {
      ...body,
      query:
        query.replace("recordProgress(input: $input)", "a: recordProgress(input: $input)") +
        " mutation Other { __typename }",
    },
    { ...body, query: "query Introspect { __schema { types { name } } }" },
    { ...body, query: query + " ".repeat(4096) },
    {
      ...body,
      query:
        "mutation RecordProgress($input: RecordProgressInput!) { a: recordProgress(input: $input) { code } b: recordProgress(input: $input) { code } }",
    },
  ]) {
    assert.equal(inspectEngagementOperation(value).status, "rejected");
  }
  const schema = createEngagementSchema();
  const result = await graphql({
    schema,
    source: query,
    variableValues: { input },
    contextValue: {
      recorder: {
        record: () => {
          throw new Error("must not dispatch");
        },
      },
    },
  });
  assert.equal(result.errors?.[0]?.extensions["code"], "UNAVAILABLE");
});

async function fixture(
  record: RecordProgress,
  queries?: EngagementSubgraphOptions["queries"],
  watchlist?: EngagementSubgraphOptions["watchlist"],
  fields?: EngagementSubgraphOptions["fields"],
) {
  const key = randomBytes(32).toString("hex");
  const adapter = createExpressHttpAdapter({ bodyLimitBytes: 16384 });
  const server = createServer({ maxHeaderSize: 16384 }, adapter.requestListener);
  const graph = await createEngagementSubgraph({
    routerTrust: createLocalRouterTrust("engagement", key),
    recorder: { record },
    ...(queries ? { queries } : {}),
    ...(watchlist ? { watchlist } : {}),
    ...(fields ? { fields } : {}),
  });
  adapter.mountGraphql(graph.middleware);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const headers = {
    host: "engagement:3400",
    origin: "http://127.0.0.1:4000",
    "x-aster-csrf": "1",
    "x-aster-router-credential": key,
    cookie: "aster_local_session=synthetic.viewer.signature",
  };
  return {
    key,
    headers,
    graph,
    send(value: unknown = body, suppliedHeaders: Record<string, string> = headers) {
      return new Promise<{
        status: number;
        text: string;
        cache: string | undefined;
        cookie: string[] | undefined;
        retryAfter: string | undefined;
      }>((resolve, reject) => {
        const outgoing = request(
          {
            hostname: "127.0.0.1",
            port: address.port,
            method: "POST",
            path: "/graphql",
            signal: AbortSignal.timeout(4000),
            headers: {
              "content-type": "application/json",
              connection: "close",
              ...suppliedHeaders,
            },
          },
          (incoming) => {
            const chunks: Buffer[] = [];
            incoming.on("data", (chunk: Buffer) => {
              chunks.push(chunk);
            });
            incoming.once("error", reject);
            incoming.once("end", () => {
              resolve({
                status: incoming.statusCode ?? 500,
                text: Buffer.concat(chunks).toString("utf8"),
                cache: incoming.headers["cache-control"],
                cookie: incoming.headers["set-cookie"],
                retryAfter: incoming.headers["retry-after"],
              });
            });
          },
        );
        outgoing.once("error", reject);
        outgoing.end(JSON.stringify(value));
      });
    },
    async close() {
      await graph.stop();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
        server.closeAllConnections();
      });
    },
  };
}

test("HTTP entity fields use the request owner, batch SQL and keep Catalog failure nullable", async () => {
  const fields = fieldsFixture();
  fields.control.credential = "synthetic.viewer.signature";
  const f = await fixture(
    () => Promise.resolve({ status: "unavailable" }),
    undefined,
    undefined,
    fields.queries,
  );
  const query = `query Fields($representations:[_Any!]!, $profileId:ID!) {
    _entities(representations:$representations) { ... on Title {
      progress(profileId:$profileId) { positionMs } inWatchlist(profileId:$profileId)
    } }
  }`;
  const request = {
    query,
    variables: {
      profileId: id(2),
      representations: Array.from({ length: 20 }, (_, n) => ({
        __typename: "Title",
        id: id(n + 100),
      })),
    },
  };
  try {
    const response = await f.send(request);
    assert.equal(response.status, 200);
    assert.equal(response.cache, "no-store");
    assert.equal(response.cookie, undefined);
    const result = JSON.parse(response.text) as {
      errors?: unknown[];
      data: { _entities: { progress: { positionMs: number }; inWatchlist: boolean }[] };
    };
    assert.equal(result.errors, undefined);
    assert.equal(result.data._entities.length, 20);
    assert.ok(
      result.data._entities.every((row) => row.progress.positionMs === 1000 && row.inWatchlist),
    );
    assert.equal(fields.calls.sql.length, 1);
    fields.control.catalogDown = true;
    const partial = await f.send({
      ...request,
      variables: {
        ...request.variables,
        representations: request.variables.representations.slice(0, 1),
      },
    });
    const payload = JSON.parse(partial.text) as {
      errors?: { extensions: { code: string } }[];
      data: { _entities: { progress: { positionMs: number }; inWatchlist: null }[] };
    };
    assert.equal(payload.data._entities[0]?.progress.positionMs, 1000);
    assert.equal(payload.data._entities[0].inWatchlist, null);
    assert.equal(payload.errors?.[0]?.extensions.code, "UNAVAILABLE");
    assert.doesNotMatch(
      partial.text,
      /accountId|playbackSessionId|signature|credential|stacktrace/u,
    );
    assert.equal(
      (
        await f.send({
          ...request,
          variables: {
            ...request.variables,
            representations: [{ __typename: "Title", id: id(3), accountId: id(1) }],
          },
        })
      ).status,
      400,
    );
    assert.equal(fields.calls.sql.length, 2);
  } finally {
    await f.close();
  }
});

test("HTTP progress exposes only committed result fields and rejects forged transport before dispatch", async () => {
  let calls = 0;
  const f = await fixture((value, request) => {
    calls++;
    assert.deepEqual(value, input);
    assert.equal(request.credential, "synthetic.viewer.signature");
    assert.ok(request.signal instanceof AbortSignal);
    return Promise.resolve({ status: "completed", value: state });
  });
  try {
    const accepted = await f.send();
    assert.equal(accepted.status, 200);
    assert.equal(accepted.cache, "no-store");
    assert.equal(accepted.cookie, undefined);
    const value = JSON.parse(accepted.text) as {
      data: { recordProgress: { code: string; progress: Record<string, unknown> } };
    };
    assert.equal(value.data.recordProgress.code, "COMPLETED");
    assert.equal(value.data.recordProgress.progress["positionMs"], 1000);
    assert.doesNotMatch(accepted.text, /accountId|playbackSessionId|signature|credential/u);
    for (const headers of [
      {},
      { ...f.headers, "x-aster-account-id": id(6) },
      { ...f.headers, "x-aster-engagement-credential": f.key },
      { ...f.headers, host: "identity:3100" },
    ]) {
      assert.equal((await f.send(body, headers)).status, 403);
    }
    assert.equal(
      (
        await f.send(body, {
          ...f.headers,
          cookie: f.headers.cookie + "; aster_local_session=other.viewer.signature",
        })
      ).status,
      400,
    );
    assert.equal(
      (await f.send({ ...body, variables: { input: { ...input, durationMs: -1 } } })).status,
      400,
    );
    assert.equal(calls, 1);
  } finally {
    await f.close();
  }
});

test("non-success, ambiguous commit and exceptions never fabricate progress", async () => {
  for (const status of [
    "unauthenticated",
    "stale",
    "conflict",
    "backpressure",
    "indeterminate",
  ] as const) {
    const f = await fixture(() => Promise.resolve({ status }));
    try {
      const value = JSON.parse((await f.send()).text) as {
        data: { recordProgress: { code: string; progress: unknown } };
      };
      assert.equal(value.data.recordProgress.code, status.toUpperCase());
      assert.equal(value.data.recordProgress.progress, null);
    } finally {
      await f.close();
    }
  }
  const limited = await fixture(() =>
    Promise.resolve({ status: "limit_exceeded", retryAfterMs: 30_001 }),
  );
  try {
    const response = await limited.send();
    const value = JSON.parse(response.text) as {
      data: { recordProgress: { code: string; retryAfterMs: number | null; progress: unknown } };
    };
    assert.equal(value.data.recordProgress.code, "LIMIT_EXCEEDED");
    assert.equal(value.data.recordProgress.retryAfterMs, 30_000);
    assert.equal(value.data.recordProgress.progress, null);
    assert.equal(response.retryAfter, "30");
  } finally {
    await limited.close();
  }
  const f = await fixture(() => Promise.reject(new Error("private SQL cookie details")));
  try {
    const result = await f.send();
    assert.doesNotMatch(result.text, /private SQL|cookie details|stack/u);
    assert.match(result.text, /UNAVAILABLE/u);
  } finally {
    await f.close();
  }
});

test("four admitted progress requests are bounded and shutdown cancels their owner signals", async () => {
  let entered = 0;
  const ready = Promise.withResolvers<undefined>();
  const f = await fixture(
    (_value, request) =>
      new Promise((resolve) => {
        if (++entered === 4) {
          ready.resolve(undefined);
        }
        const cancel = () => {
          resolve({ status: "cancelled" });
        };
        if (request.signal.aborted) {
          cancel();
        } else {
          request.signal.addEventListener("abort", cancel, { once: true });
        }
      }),
  );
  const pending = Array.from({ length: 4 }, () => f.send());
  try {
    await ready.promise;
    assert.equal((await f.send()).status, 503);
    assert.equal(entered, 4);
    await f.graph.stop();
    const results = await Promise.all(pending);
    assert.ok(results.every((result) => result.text.includes("CANCELLED")));
    assert.equal((await f.send()).status, 503);
  } finally {
    await Promise.allSettled(pending);
    await f.close();
  }
});
