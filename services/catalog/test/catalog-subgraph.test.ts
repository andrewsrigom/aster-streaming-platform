import assert from "node:assert/strict";
import { test } from "node:test";
import { execute, parse } from "graphql";
import {
  createCatalogGraphqlContext,
  createCatalogSchema,
} from "../src/transport/catalog-schema.js";
import { catalogHttpFixture } from "./catalog-http-fixture.js";
import { publicFixture } from "./public-fixture.js";
import { catalogTestId as id } from "./rights-fixture.js";

const detail =
  'query Detail { title(id: "' +
  id(1) +
  '") { id localized(locale: "pt-BR") { locale title synopsis } attribution { creator licenseUrl } } }';
const entities =
  "query Entities($items: [_Any!]!) { _entities(representations: $items) { ... on Title { id localized { title } } } }";

test("anonymous real HTTP browse/detail use owner attribution, safe metadata and finite correlated telemetry", async () => {
  const f = publicFixture();
  const http = await catalogHttpFixture(f.queries);
  try {
    const response = await http.send(
      { query: detail },
      { cookie: "viewer=untrusted", "x-operator": "true" },
    );
    assert.equal(response.status, 200);
    assert.equal(response.json.errors, undefined);
    assert.deepEqual(response.json.data?.["title"], {
      id: id(1),
      localized: { locale: "en", title: "Synthetic title", synopsis: "Generated test content." },
      attribution: { creator: "Synthetic creator", licenseUrl: "https://example.invalid/license" },
    });
    assert.equal(response.headers.has("set-cookie"), false);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.doesNotMatch(
      response.text,
      /reviewedBy|evidenceLocations|sourceChecksum|assetSourceUrl|manifestUrl/u,
    );
    const page = await http.send({
      query:
        "query Browse { titles(first: 2) { edges { cursor node { id releaseYear runtimeSeconds languages accessibility editorialLabels } } pageInfo { endCursor hasNextPage } } }",
    });
    assert.equal(page.status, 200);
    assert.equal(page.json.errors, undefined);
    const trace = http.traces[0];
    assert.ok(trace);
    assert.equal(trace.code, "COMPLETED");
    assert.equal(trace.correlationId, response.headers.get("x-request-id"));
    assert.match(trace.traceId, /^[a-f0-9]{32}$/u);
    assert.match(trace.spanId, /^[a-f0-9]{16}$/u);
    assert.ok(trace.durationMs >= 0);
    assert.doesNotMatch(JSON.stringify(http.traces), /Synthetic|untrusted|example.invalid/u);
  } finally {
    await http.close();
  }
});

test("entity resolution batches repeated IDs once, preserves order/nulls and never retains a cross-request hit", async () => {
  const f = publicFixture();
  const http = await catalogHttpFixture(f.queries);
  const body = {
    query: entities,
    variables: { items: [3, 99, 1, 3].map((n) => ({ __typename: "Title", id: id(n) })) },
  };
  try {
    const response = await http.send(body);
    assert.equal(response.json.errors, undefined);
    assert.deepEqual(
      (response.json.data?.["_entities"] as ({ id: string } | null)[]).map(
        (entry) => entry?.id ?? null,
      ),
      [id(3), null, id(1), id(3)],
    );
    assert.equal(f.state.calls, 1);
    f.state.candidates = [];
    const afterRetirement = await http.send(body);
    assert.deepEqual(afterRetirement.json.data?.["_entities"], [null, null, null, null]);
    assert.equal(f.state.calls, 2);
  } finally {
    await http.close();
  }
});

test("invalid operations and oversized/simple bodies are rejected without application access", async () => {
  const f = publicFixture();
  const http = await catalogHttpFixture(f.queries);
  try {
    for (const body of [
      { query: "mutation M { publish { id } }" },
      { query: "query Q { __schema { types { name } } }" },
      { query: detail, extensions: { persistedQuery: {} } },
      [{ query: detail }],
      { query: "query Q { titles(first: 21) { edges { node { id } } } }" },
      {
        query: entities,
        variables: { items: [{ __typename: "Title", id: id(1), rights: "forged" }] },
      },
      { query: detail + " ".repeat(16384) },
    ]) {
      assert.equal((await http.send(body)).status, 400);
    }
    assert.equal((await http.send({ query: detail + " ".repeat(33000) })).status, 413);
    assert.equal(
      (await http.send({ query: detail }, { "content-type": "text/plain" })).status,
      415,
    );
    assert.equal(f.state.calls, 0);
    const get = await fetch(http.origin + "/graphql", { signal: AbortSignal.timeout(3000) });
    assert.equal(get.status, 405);
    assert.equal(get.headers.get("allow"), "POST");
    await get.text();
  } finally {
    await http.close();
  }
});

test("private dependency failures and unknown fields become sanitized correlated errors", async () => {
  const f = publicFixture();
  const http = await catalogHttpFixture({
    ...f.queries,
    byIds: () => Promise.reject(new Error("private connectionString and credentials")),
  });
  try {
    const response = await http.send({ query: detail });
    assert.equal(response.json.errors?.[0]?.extensions.code, "UNAVAILABLE");
    assert.equal(
      response.json.errors[0].extensions.correlationId,
      response.headers.get("x-request-id"),
    );
    assert.doesNotMatch(response.text, /connectionString|credentials|stack|at .*\.ts/u);
    const invalid = await http.send({
      query: 'query Q { title(id: "' + id(1) + '") { unknownField } }',
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.json.errors?.[0]?.extensions.code, "INVALID_INPUT");
  } finally {
    await http.close();
  }
});

test("three-second deadline cancels owner work; global rate and concurrency bounds are enforced", async () => {
  const f = publicFixture();
  let aborted = 0;
  const http = await catalogHttpFixture({
    ...f.queries,
    byIds: (_ids, signal) =>
      new Promise((resolve) => {
        signal.addEventListener(
          "abort",
          () => {
            aborted++;
            resolve({ status: "cancelled" });
          },
          { once: true },
        );
      }),
  });
  try {
    const start = performance.now();
    const response = await http.send({ query: detail });
    assert.equal(response.status, 503);
    assert.equal(response.json.errors?.[0]?.extensions.code, "CANCELLED");
    assert.equal(aborted, 1);
    assert.ok(performance.now() - start < 4500);
  } finally {
    await http.close();
  }
  let tick = 0;
  const limited = await catalogHttpFixture(f.queries, () => tick);
  try {
    for (let n = 0; n < 64; n++) {
      assert.equal((await limited.send({ query: "query Q { __typename }" })).status, 200);
    }
    assert.equal((await limited.send({ query: detail })).status, 429);
    tick = 1000;
    assert.equal((await limited.send({ query: detail })).status, 200);
  } finally {
    await limited.close();
  }
  const started = Promise.withResolvers<undefined>();
  let active = 0;
  const concurrent = await catalogHttpFixture({
    ...f.queries,
    byIds: (_ids, signal) =>
      new Promise((resolve) => {
        if (++active === 8) {
          started.resolve(undefined);
        }
        signal.addEventListener(
          "abort",
          () => {
            resolve({ status: "cancelled" });
          },
          { once: true },
        );
      }),
  });
  try {
    const pending = Array.from({ length: 8 }, () => concurrent.send({ query: detail }));
    await started.promise;
    assert.equal((await concurrent.send({ query: detail })).status, 503);
    await concurrent.graph.stop();
    await Promise.all(pending);
    assert.equal((await concurrent.send({ query: detail })).status, 503);
  } finally {
    await concurrent.close();
  }
});

test("client disconnect cancels its owner request", { timeout: 5000 }, async () => {
  const f = publicFixture();
  const entered = Promise.withResolvers<undefined>();
  const cancelled = Promise.withResolvers<undefined>();
  const http = await catalogHttpFixture({
    ...f.queries,
    byIds: (_ids, signal) =>
      new Promise((resolve) => {
        signal.addEventListener(
          "abort",
          () => {
            cancelled.resolve(undefined);
            resolve({ status: "cancelled" });
          },
          { once: true },
        );
        entered.resolve(undefined);
      }),
  });
  try {
    const controller = new AbortController();
    const request = fetch(http.origin + "/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: detail }),
      signal: controller.signal,
    });
    const rejected = assert.rejects(request);
    await entered.promise;
    controller.abort();
    await rejected;
    await cancelled.promise;
  } finally {
    await http.close();
  }
});

test("request cache is bounded and schema rejects an unowned execution context", async () => {
  const f = publicFixture();
  const context = createCatalogGraphqlContext(f.queries, new AbortController().signal, id(4));
  for (let n = 0; n < 128; n++) {
    context.titles.prime(id(n), null);
  }
  assert.throws(() => context.titles.prime(id(129), null));
  context.titles.clearAll();
  const result = await execute({
    schema: createCatalogSchema(),
    document: parse(detail),
    contextValue: {},
  });
  assert.equal(result.errors?.[0]?.extensions["code"], "UNAVAILABLE");
});
