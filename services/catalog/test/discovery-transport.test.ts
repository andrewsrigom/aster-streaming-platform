import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { graphql } from "graphql";
import {
  createLocalCatalogDiscoveryTrust,
  createLocalCatalogPlaybackTrust,
  createLocalEngagementReadTrust,
  createLocalRouterTrust,
} from "@aster/http-express";
import { createCatalogDiscoveryQueries } from "../src/application/discovery-queries.js";
import { createCatalogEngagementQueries } from "../src/application/engagement-queries.js";
import { createCatalogPlaybackQueries } from "../src/application/playback-queries.js";
import type { CatalogDiscoveryUnitOfWork } from "../src/application/discovery-ports.js";
import type { DiscoveryCandidate } from "../src/domain/discovery-snapshot.js";
import {
  CATALOG_DISCOVERY_EXPORT,
  CATALOG_DISCOVERY_SNAPSHOTS,
  inspectCatalogDiscoveryOperation,
} from "../src/transport/discovery-operation.js";
import { CATALOG_ENGAGEMENT_OPERATION } from "../src/transport/engagement-operation.js";
import { createCatalogGraphqlContext } from "../src/transport/catalog-schema.js";
import { inspectCatalogOperation } from "../src/transport/graphql-operation.js";
import { catalogHttpFixture } from "./catalog-http-fixture.js";
import { publicCandidate, publicFixture } from "./public-fixture.js";
import { metadataFixture } from "./workflow-fixture.js";
import { catalogTestId as id, catalogTestTime as now } from "./rights-fixture.js";

const snapshots = (ids: readonly unknown[] = [id(1)]) => ({
  query: CATALOG_DISCOVERY_SNAPSHOTS,
  operationName: "DiscoverySnapshots",
  variables: { ids },
});
const page = (after: string | null = null) => ({
  query: CATALOG_DISCOVERY_EXPORT,
  operationName: "DiscoveryExport",
  variables: { after },
});
async function fixture() {
  const owner = publicFixture();
  const key = randomBytes(32).toString("hex");
  const routerKey = randomBytes(32).toString("hex");
  const engagementKey = randomBytes(32).toString("hex");
  const playbackKey = randomBytes(32).toString("hex");
  const state = {
    calls: 0,
    sources: [1, 2, 3].map((n): DiscoveryCandidate => ({
      titleId: id(n),
      sourceVersion: n === 2 ? 6 : 5,
      candidate: n === 2 ? null : publicCandidate(n),
      publishedAt: n === 2 ? null : now,
    })),
  };
  const transactions: CatalogDiscoveryUnitOfWork = {
    run(work) {
      state.calls++;
      return work({
        findMany: (ids) => Promise.resolve(state.sources.filter((s) => ids.includes(s.titleId))),
        scan: (after, limit) =>
          Promise.resolve(
            state.sources.filter((s) => after === null || s.titleId > after).slice(0, limit),
          ),
      });
    },
  };
  const queries = {
    ...createCatalogDiscoveryQueries({
      transactions,
      policy: { commercial: true },
      now: () => now,
    }),
  };
  const ports = {
    transactions: owner.transactions,
    policy: { commercial: true },
    now: () => owner.state.time,
  };
  const base = { host: "catalog:3200", "x-aster-csrf": "1" };
  const headers = {
    ...base,
    origin: "http://discovery:3500",
    "x-aster-discovery-credential": key,
    "x-aster-correlation-id": id(99),
  };
  const routerHeaders = {
    ...base,
    origin: "http://127.0.0.1:4000",
    "x-aster-router-credential": routerKey,
  };
  const engagementHeaders = {
    ...base,
    origin: "http://engagement:3400",
    "x-aster-engagement-credential": engagementKey,
    "x-aster-correlation-id": id(99),
  };
  const playbackHeaders = {
    ...base,
    origin: "http://playback:3300",
    "x-aster-playback-credential": playbackKey,
  };
  const http = await catalogHttpFixture(owner.queries, () => 0, {
    routerTrust: createLocalRouterTrust("catalog", routerKey),
    discovery: { trust: createLocalCatalogDiscoveryTrust(key), queries },
    engagement: {
      trust: createLocalEngagementReadTrust("catalog", engagementKey),
      queries: createCatalogEngagementQueries(ports),
    },
    playback: {
      trust: createLocalCatalogPlaybackTrust(playbackKey),
      queries: createCatalogPlaybackQueries(ports),
    },
  });
  return {
    owner,
    state,
    queries,
    http,
    key,
    headers,
    routerHeaders,
    engagementHeaders,
    playbackHeaders,
  };
}

test("private snapshots/export preserve versions, null absence and hidden fences without authority fields", async () => {
  const f = await fixture();
  try {
    const result = await f.http.send(snapshots([id(2), id(99)]), f.headers);
    assert.equal(result.status, 200);
    assert.equal(result.json.errors, undefined);
    assert.deepEqual(result.json.data?.["_discoverySnapshots"], [
      { titleId: id(2), sourceVersion: 6, observedAt: now, visibleUntil: null, document: null },
      null,
    ]);
    const first = await f.http.send(page(), f.headers);
    assert.equal(first.json.errors, undefined);
    const data = first.json.data?.["_discoveryExport"] as {
      snapshots: { titleId: string }[];
      endCursor: string;
      hasNextPage: boolean;
    };
    assert.deepEqual(
      data.snapshots.map((s) => s.titleId),
      [id(1), id(2)],
    );
    assert.equal(data.endCursor, id(2));
    assert.equal(data.hasNextPage, true);
    const last = await f.http.send(page(data.endCursor), f.headers);
    assert.equal(last.json.errors, undefined);
    assert.equal(f.state.calls, 3);
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal(result.headers.get("x-request-id"), id(99));
    assert.doesNotMatch(first.text, /manifest|publicationId|rights|reviewedBy|profile/u);
    assert.equal(JSON.stringify(f.http.traces).includes(f.key), false);
  } finally {
    await f.http.close();
  }
});

test("caller purposes and resolver authorization cannot substitute for Discovery", async () => {
  const f = await fixture();
  try {
    for (const [purpose, headers] of [
      ["anonymous", {}],
      ["Router", f.routerHeaders],
      ["Engagement", f.engagementHeaders],
      ["Playback", f.playbackHeaders],
      [
        "wrong credential",
        { ...f.headers, "x-aster-discovery-credential": randomBytes(32).toString("hex") },
      ],
      ["invalid correlation", { ...f.headers, "x-aster-correlation-id": "invalid" }],
      ["cookie", { ...f.headers, cookie: "aster_local_session=forged" }],
      ["profile", { ...f.headers, "x-aster-profile-id": id(1) }],
      ["mixed credentials", { ...f.headers, ...f.routerHeaders }],
      ["wrong host", { ...f.headers, host: "identity:3100" }],
      ["wrong origin", { ...f.headers, origin: "http://127.0.0.1:3000" }],
    ] as const) {
      const response = await f.http.send(snapshots(), headers);
      assert.ok([400, 403].includes(response.status), `${purpose} returned ${response.status}`);
    }
    assert.equal(inspectCatalogOperation(snapshots(), f.http.graph.schema).status, "rejected");
    const response = await graphql({
      schema: f.http.graph.schema,
      source: CATALOG_DISCOVERY_SNAPSHOTS,
      variableValues: { ids: [id(1)] },
      contextValue: createCatalogGraphqlContext(f.owner.queries, AbortSignal.timeout(1000), id(99)),
    });
    assert.equal(response.errors?.[0]?.extensions["code"], "FORBIDDEN");
    assert.equal(f.state.calls, 0);
  } finally {
    await f.http.close();
  }
});

test("only exact bounded snapshot/export documents reach persistence", async () => {
  const f = await fixture();
  try {
    for (const body of [
      snapshots([]),
      snapshots(["bad"]),
      snapshots([id(1), id(2), id(3)]),
      { ...snapshots(), query: CATALOG_DISCOVERY_SNAPSHOTS + " " },
      { ...snapshots(), operationName: "Other" },
      { ...snapshots(), variables: { ids: [id(1)], extra: true } },
      { ...page(), variables: {} },
      { ...page(), variables: { after: "bad" } },
      { ...page(), extensions: {} },
      { query: "query Public { titles(first: 1) { edges { node { id } } } }" },
    ]) {
      assert.equal(inspectCatalogDiscoveryOperation(body).status, "rejected");
      assert.equal((await f.http.send(body, f.headers)).status, 400);
    }
    const getter = Object.defineProperty([id(1)], "0", {
      get() {
        throw new Error("getter must not run");
      },
    });
    assert.equal(inspectCatalogDiscoveryOperation(snapshots(getter)).status, "rejected");
    assert.equal(f.state.calls, 0);
  } finally {
    await f.http.close();
  }
});

test("source outage is unavailable, never empty search authority", async () => {
  const f = await fixture();
  f.queries.byIds = () => Promise.resolve({ status: "unavailable" });
  try {
    const result = await f.http.send(snapshots(), f.headers);
    assert.equal(result.json.data, null);
    assert.equal(result.json.errors?.[0]?.extensions.code, "UNAVAILABLE");
  } finally {
    await f.http.close();
  }
});

test("one pending snapshot does not occupy public or Engagement admission and shutdown cancels it", async () => {
  const f = await fixture();
  const entered = Promise.withResolvers<undefined>();
  f.queries.byIds = async (_ids, signal) => {
    entered.resolve(undefined);
    await new Promise<undefined>((resolve) => {
      signal.addEventListener(
        "abort",
        () => {
          resolve(undefined);
        },
        { once: true },
      );
    });
    return { status: "cancelled" };
  };
  try {
    const pending = f.http.send(snapshots(), f.headers);
    await entered.promise;
    assert.equal((await f.http.send(page(), f.headers)).status, 503);
    assert.equal(
      (
        await f.http.send(
          { query: 'query Title { title(id: "' + id(1) + '") { id } }' },
          f.routerHeaders,
        )
      ).status,
      200,
    );
    const other = await f.http.send(
      {
        query: CATALOG_ENGAGEMENT_OPERATION,
        operationName: "EngagementTitles",
        variables: { ids: [id(1)] },
      },
      f.engagementHeaders,
    );
    assert.equal(other.json.errors, undefined);
    await f.http.graph.stop();
    assert.equal((await pending).json.errors?.[0]?.extensions.code, "CANCELLED");
  } finally {
    await f.http.close();
  }
});

test("Discovery rate credits are independent from public reads", async () => {
  const f = await fixture();
  try {
    for (let attempt = 0; attempt < 32; attempt++) {
      assert.equal((await f.http.send(snapshots(), f.headers)).json.errors, undefined);
    }
    assert.equal((await f.http.send(snapshots(), f.headers)).status, 429);
    assert.equal(
      (
        await f.http.send(
          { query: 'query Title { title(id: "' + id(1) + '") { id } }' },
          f.routerHeaders,
        )
      ).status,
      200,
    );
  } finally {
    await f.http.close();
  }
});

test("two maximum-length localized source documents fit the private response budget", async () => {
  const f = await fixture();
  f.state.sources = [1, 3].map((n) => ({
    titleId: id(n),
    sourceVersion: 5,
    publishedAt: now,
    candidate: {
      ...publicCandidate(n),
      metadata: {
        ...metadataFixture(),
        localizations: ["en", "es", "fr", "pt"].map((locale) => ({
          locale,
          title: "界".repeat(160),
          synopsis: "界".repeat(1024),
        })),
      },
    },
  }));
  try {
    const result = await f.http.send(snapshots([id(1), id(3)]), f.headers);
    assert.equal(result.json.errors, undefined);
    assert.ok(Buffer.byteLength(result.text) < 65536);
    assert.equal((result.json.data?.["_discoverySnapshots"] as unknown[]).length, 2);
  } finally {
    await f.http.close();
  }
});
