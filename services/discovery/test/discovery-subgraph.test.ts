import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer, request, type IncomingHttpHeaders } from "node:http";
import test from "node:test";
import { createExpressHttpAdapter, createLocalRouterTrust } from "@aster/http-express";
import { createHomeRails } from "../src/application/home-rails.js";
import type { HomeRailUnitOfWork } from "../src/application/rail-ports.js";
import { createTitleSearch } from "../src/application/search-titles.js";
import type { SearchUnitOfWork } from "../src/application/search-ports.js";
import {
  createDiscoverySubgraph,
  type DiscoveryOperationTrace,
} from "../src/transport/discovery-subgraph.js";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const now = 1_700_000_000;
const SEARCH_TITLES =
  "query SearchTitles($query: String!, $locale: String!, $first: Int! = 20, $after: String) { searchTitles(query: $query, locale: $locale, first: $first, after: $after) { code correlationId connection { generation edges { cursor sourceVersion indexedAt visibleUntil node { id } } pageInfo { endCursor hasNextPage } } } }";
const HOME_RAILS =
  "query HomeRails($first:Int!=10){homeRails(first:$first){code correlationId generation featured{code rail{key edges{node{id}}}} recentlyAdded{code} trending{code} genres{code rails{key}}}}";

async function fixture(gate?: Promise<unknown>) {
  const key = randomBytes(32).toString("hex");
  const state = { calls: 0, entered: Promise.withResolvers<undefined>() };
  const transactions: SearchUnitOfWork = {
    async run(work, signal) {
      state.calls++;
      if (state.calls === 2) {
        state.entered.resolve(undefined);
      }
      if (gate) {
        await gate;
      }
      return signal.aborted
        ? { status: "cancelled" }
        : {
            status: "completed",
            value: await work({
              activeGeneration: () => Promise.resolve(id(90)),
              projectionStale: () => Promise.resolve(false),
              find: () =>
                Promise.resolve([
                  {
                    titleId: id(1),
                    rank: 900_000,
                    sourceVersion: 7,
                    indexedAt: now,
                    visibleUntil: now + 300,
                  },
                ]),
            }),
          };
    },
  };
  const traces: DiscoveryOperationTrace[] = [];
  const homeTransactions: HomeRailUnitOfWork = {
    async run(work, signal) {
      return signal.aborted
        ? { status: "cancelled" }
        : {
            status: "completed",
            value: await work({
              state: () => Promise.resolve({ generation: id(90), status: "empty" }),
              fixed: () => Promise.resolve([]),
              genres: () => Promise.resolve([]),
            }),
          };
    },
  };
  const graph = await createDiscoverySubgraph({
    routerTrust: createLocalRouterTrust("discovery", key),
    home: createHomeRails({ transactions: homeTransactions }),
    search: createTitleSearch({ transactions }),
    now: () => now,
    monotonicNow: () => 0,
    onOperation: (trace) => traces.push(trace),
  });
  const adapter = createExpressHttpAdapter({ bodyLimitBytes: 16_384 });
  adapter.mountGraphql(graph.middleware);
  const server = createServer({ maxHeaderSize: 16_384 }, adapter.requestListener);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const headers = {
    host: "discovery:3500",
    origin: "http://127.0.0.1:4000",
    "x-aster-csrf": "1",
    "x-aster-router-credential": key,
  };
  return {
    graph,
    headers,
    key,
    state,
    traces,
    send(
      body: unknown = {
        query: SEARCH_TITLES,
        operationName: "SearchTitles",
        variables: { query: "Signal", locale: "en", first: 2, after: null },
      },
      supplied: Readonly<Record<string, string>> = headers,
    ): Promise<
      Readonly<{ status: number; headers: IncomingHttpHeaders; json: Record<string, unknown> }>
    > {
      return new Promise((resolve, reject) => {
        const outgoing = request(
          {
            hostname: "127.0.0.1",
            port: address.port,
            path: "/graphql",
            method: "POST",
            signal: AbortSignal.timeout(5_000),
            headers: { "content-type": "application/json", connection: "close", ...supplied },
          },
          (incoming) => {
            const chunks: Buffer[] = [];
            incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
            incoming.once("error", reject);
            incoming.once("end", () => {
              try {
                resolve({
                  status: incoming.statusCode ?? 500,
                  headers: incoming.headers,
                  json: JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
                    string,
                    unknown
                  >,
                });
              } catch (error) {
                reject(error instanceof Error ? error : new Error("Response parsing failed."));
              }
            });
          },
        );
        outgoing.once("error", reject);
        outgoing.end(JSON.stringify(body));
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

test("subgraph admits one authenticated bounded search and records no query text", async () => {
  const f = await fixture();
  try {
    const result = await f.send();
    assert.equal(result.status, 200);
    assert.equal(
      (result.json["data"] as { searchTitles: { code: string } }).searchTitles.code,
      "COMPLETED",
    );
    assert.match(String(result.headers["x-request-id"]), /^[a-f0-9-]{36}$/u);
    assert.equal(result.headers["cache-control"], "no-store");
    assert.equal(f.state.calls, 1);
    assert.equal(f.traces.length, 1);
    assert.equal(f.traces[0]?.operation, "search_titles");
    assert.doesNotMatch(JSON.stringify(f.traces), /Signal|searchTitles/u);
  } finally {
    await f.close();
  }
});

test("subgraph admits bounded home rails and records only the finite operation", async () => {
  const f = await fixture();
  try {
    const result = await f.send({
      query: HOME_RAILS,
      operationName: "HomeRails",
      variables: { first: 10 },
    });
    assert.equal(result.status, 200);
    assert.equal(
      (result.json["data"] as { homeRails: { code: string } }).homeRails.code,
      "COMPLETED",
    );
    assert.equal(f.traces[0]?.operation, "home_rails");
    assert.doesNotMatch(JSON.stringify(f.traces), /HomeRails|homeRails/u);
  } finally {
    await f.close();
  }
});

test("subgraph rejects substituted trust and malformed operations before search", async () => {
  const f = await fixture();
  try {
    for (const supplied of [
      {},
      { ...f.headers, "x-aster-router-credential": randomBytes(32).toString("hex") },
      { ...f.headers, cookie: "aster_local_session=forged" },
      { ...f.headers, host: "catalog:3200" },
    ]) {
      assert.equal((await f.send(undefined, supplied)).status, 403);
    }
    assert.equal(
      (
        await f.send({
          query: "query Search { __schema { types { name } } }",
          operationName: "Search",
          variables: {},
        })
      ).status,
      400,
    );
    assert.equal(f.state.calls, 0);
  } finally {
    await f.close();
  }
});

test("search bulkhead queues one, rejects excess and preserves home capacity", async () => {
  const release = Promise.withResolvers<undefined>();
  const f = await fixture(release.promise);
  try {
    const admitted = Array.from({ length: 2 }, () => f.send());
    await f.state.entered.promise;
    const queued = f.send();
    await new Promise((resolve) => setImmediate(resolve));
    const excess = await f.send();
    assert.equal(excess.status, 200);
    assert.equal(excess.headers["retry-after"], "1");
    assert.equal(
      (excess.json["data"] as { searchTitles: { code: string; connection: unknown } }).searchTitles
        .code,
      "LIMIT_EXCEEDED",
    );
    assert.equal(
      (excess.json["data"] as { searchTitles: { connection: unknown } }).searchTitles.connection,
      null,
    );
    assert.equal(f.state.calls, 2);
    const homeResult = await f.send({
      query: HOME_RAILS,
      operationName: "HomeRails",
      variables: { first: 10 },
    });
    assert.equal(homeResult.status, 200);
    release.resolve(undefined);
    const completed = await Promise.all([...admitted, queued]);
    assert.ok(completed.every((result) => result.status === 200));
    assert.equal(f.state.calls, 3);
  } finally {
    release.resolve(undefined);
    await f.close();
  }
});
