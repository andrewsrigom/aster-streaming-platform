import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { graphql } from "graphql";
import {
  createLocalCatalogPlaybackTrust,
  createLocalEngagementReadTrust,
  createLocalRouterTrust,
} from "@aster/http-express";
import { createCatalogEngagementQueries } from "../src/application/engagement-queries.js";
import { createCatalogPlaybackQueries } from "../src/application/playback-queries.js";
import {
  CATALOG_ENGAGEMENT_OPERATION,
  inspectCatalogEngagementOperation,
} from "../src/transport/engagement-operation.js";
import {
  createCatalogGraphqlContext,
  createCatalogSchema,
} from "../src/transport/catalog-schema.js";
import { inspectCatalogOperation } from "../src/transport/graphql-operation.js";
import { catalogHttpFixture } from "./catalog-http-fixture.js";
import { publicFixture } from "./public-fixture.js";
import { catalogTestId as id } from "./rights-fixture.js";

const body = (ids: readonly unknown[] = [id(1)]) => ({
  query: CATALOG_ENGAGEMENT_OPERATION,
  operationName: "EngagementTitles",
  variables: { ids },
});
async function fixture() {
  const owner = publicFixture();
  const key = randomBytes(32).toString("hex");
  const routerKey = randomBytes(32).toString("hex");
  const playbackKey = randomBytes(32).toString("hex");
  const ports = {
    transactions: owner.transactions,
    policy: { commercial: true },
    now: () => owner.state.time,
  };
  const queries = { ...createCatalogEngagementQueries(ports) };
  const http = await catalogHttpFixture(owner.queries, () => 0, {
    routerTrust: createLocalRouterTrust("catalog", routerKey),
    playback: {
      trust: createLocalCatalogPlaybackTrust(playbackKey),
      queries: createCatalogPlaybackQueries(ports),
    },
    engagement: { trust: createLocalEngagementReadTrust("catalog", key), queries },
  });
  return {
    owner,
    queries,
    http,
    key,
    headers: {
      host: "catalog:3200",
      origin: "http://engagement:3400",
      "x-aster-csrf": "1",
      "x-aster-engagement-credential": key,
      "x-aster-correlation-id": id(99),
    },
    routerHeaders: {
      host: "catalog:3200",
      origin: "http://127.0.0.1:4000",
      "x-aster-csrf": "1",
      "x-aster-router-credential": routerKey,
    },
    playbackHeaders: {
      host: "catalog:3200",
      origin: "http://playback:3300",
      "x-aster-csrf": "1",
      "x-aster-playback-credential": playbackKey,
    },
  };
}
test("private visibility preserves order/hidden results and current retirement/dispute/expiry without media fields", async () => {
  const f = await fixture();
  try {
    const result = await f.http.send(body([id(3), id(99), id(1), id(3)]), f.headers);
    assert.equal(result.status, 200);
    assert.equal(result.json.errors, undefined);
    assert.deepEqual(result.json.data?.["_engagementTitles"], {
      code: "COMPLETED",
      checkedAt: f.owner.state.time,
      expiresAt: f.owner.state.time + 2,
      titles: [
        { titleId: id(3), visible: true },
        { titleId: id(99), visible: false },
        { titleId: id(1), visible: true },
        { titleId: id(3), visible: true },
      ],
    });
    assert.equal(f.owner.state.calls, 1);
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal(result.headers.get("x-request-id"), id(99));
    assert.doesNotMatch(result.text, /manifest|publicationId|rights|reviewedBy|cookie/u);
    const original = f.owner.state.candidates;
    for (const kind of ["retired", "disputed", "expiring"] as const) {
      f.owner.state.candidates = original.map((candidate) => ({
        ...candidate,
        ...(kind === "retired"
          ? { title: { ...(candidate.title as object), state: "RETIRED" } }
          : {}),
        ...(kind === "disputed"
          ? { rights: { ...(candidate.rights as object), status: "DISPUTED" } }
          : {}),
        ...(kind === "expiring"
          ? { rights: { ...(candidate.rights as object), validUntil: f.owner.state.time + 1 } }
          : {}),
      }));
      const hidden = await f.http.send(body(), f.headers);
      assert.deepEqual(
        (hidden.json.data?.["_engagementTitles"] as { titles: object[] }).titles,
        [{ titleId: id(1), visible: false }],
        kind,
      );
    }
    assert.equal(JSON.stringify(f.http.traces).includes(f.key), false);
  } finally {
    await f.http.close();
  }
});

test("exact visibility operation, caller purpose and resolver authorization reject substitution before SQL", async () => {
  const f = await fixture();
  try {
    for (const headers of [
      {},
      f.routerHeaders,
      f.playbackHeaders,
      { ...f.headers, "x-aster-engagement-credential": randomBytes(32).toString("hex") },
      { ...f.headers, cookie: "aster_local_session=forged" },
      { ...f.headers, "x-aster-profile-id": id(3) },
      { ...f.headers, ...f.routerHeaders },
    ]) {
      assert.ok([400, 403].includes((await f.http.send(body(), headers)).status));
    }
    for (const value of [
      body([]),
      body(["invalid"]),
      body(Array.from({ length: 21 }, () => id(1))),
      { ...body(), operationName: "Other" },
      { ...body(), query: CATALOG_ENGAGEMENT_OPERATION + " " },
      { ...body(), variables: { ids: [id(1)], extra: id(2) } },
      { ...body(), extensions: {} },
    ]) {
      assert.equal(inspectCatalogEngagementOperation(value).status, "rejected");
      assert.equal((await f.http.send(value, f.headers)).status, 400);
    }
    const schema = createCatalogSchema();
    assert.equal(inspectCatalogOperation(body(), schema).status, "rejected");
    const result = await graphql({
      schema,
      source: CATALOG_ENGAGEMENT_OPERATION,
      variableValues: { ids: [id(1)] },
      contextValue: createCatalogGraphqlContext(f.owner.queries, AbortSignal.timeout(1000), id(99)),
    });
    assert.equal(result.errors?.[0]?.extensions["code"], "FORBIDDEN");
    assert.equal(f.owner.state.calls, 0);
  } finally {
    await f.http.close();
  }
});

test("pending private visibility occupies only one lane; public Catalog remains available and shutdown cancels it", async () => {
  const f = await fixture();
  let entered: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  f.queries.byIds = async (_ids, signal) => {
    entered();
    await new Promise<void>((resolve) => {
      signal.addEventListener(
        "abort",
        () => {
          resolve();
        },
        { once: true },
      );
    });
    return { status: "cancelled" };
  };
  try {
    const pending = f.http.send(body(), f.headers);
    await started;
    assert.equal((await f.http.send(body(), f.headers)).status, 503);
    assert.equal(
      (
        await f.http.send(
          { query: 'query Title { title(id: "' + id(1) + '") { id } }' },
          f.routerHeaders,
        )
      ).status,
      200,
    );
    await f.http.graph.stop();
    const cancelled = await pending;
    assert.equal(cancelled.json.data, null);
    assert.equal(cancelled.json.errors?.[0]?.extensions.code, "CANCELLED");
  } finally {
    await f.http.close();
  }
});

test("private visibility rate credit cannot exhaust public Catalog credit", async () => {
  const f = await fixture();
  try {
    for (let attempt = 0; attempt < 32; attempt++) {
      assert.equal((await f.http.send(body(), f.headers)).status, 200);
    }
    assert.equal((await f.http.send(body(), f.headers)).status, 429);
    const publicRead = await f.http.send(
      { query: 'query Title { title(id: "' + id(1) + '") { id } }' },
      f.routerHeaders,
    );
    assert.equal(publicRead.status, 200);
    assert.equal(publicRead.json.errors, undefined);
  } finally {
    await f.http.close();
  }
});
