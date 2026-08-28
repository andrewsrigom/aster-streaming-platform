import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { graphql } from "graphql";
import { createLocalCatalogPlaybackTrust, createLocalRouterTrust } from "@aster/http-express";
import { createCatalogPlaybackQueries } from "../src/application/playback-queries.js";
import {
  createCatalogGraphqlContext,
  createCatalogSchema,
} from "../src/transport/catalog-schema.js";
import { inspectCatalogOperation } from "../src/transport/graphql-operation.js";
import {
  CATALOG_PLAYBACK_OPERATION,
  inspectCatalogPlaybackOperation,
} from "../src/transport/playback-operation.js";
import { catalogHttpFixture } from "./catalog-http-fixture.js";
import { publicFixture } from "./public-fixture.js";
import { catalogTestId as id } from "./rights-fixture.js";

const body = (ids: readonly unknown[] = [id(1)]) => ({
  query: CATALOG_PLAYBACK_OPERATION,
  operationName: "PlaybackPublications",
  variables: { ids },
});

async function fixture() {
  const owner = publicFixture();
  const key = randomBytes(32).toString("hex");
  const routerKey = randomBytes(32).toString("hex");
  const queries = createCatalogPlaybackQueries({
    transactions: owner.transactions,
    policy: { commercial: true },
    now: () => owner.state.time,
  });
  const http = await catalogHttpFixture(owner.queries, undefined, {
    routerTrust: createLocalRouterTrust("catalog", routerKey),
    playback: { trust: createLocalCatalogPlaybackTrust(key), queries },
  });
  return {
    owner,
    http,
    key,
    headers: {
      host: "catalog:3200",
      origin: "http://playback:3300",
      "x-aster-csrf": "1",
      "x-aster-playback-credential": key,
    },
    routerHeaders: {
      host: "catalog:3200",
      origin: "http://127.0.0.1:4000",
      "x-aster-csrf": "1",
      "x-aster-router-credential": routerKey,
    },
  };
}

test("private Catalog HTTP read batches current publications, ordered nulls and fresh rights without public metadata changes", async () => {
  const f = await fixture();
  try {
    const response = await f.http.send(body([id(3), id(99), id(1), id(3)]), f.headers);
    assert.equal(response.status, 200);
    assert.equal(response.json.errors, undefined);
    const publications = response.json.data?.["_playbackPublications"] as ({
      titleId: string;
    } | null)[];
    assert.deepEqual(
      publications.map((value) => value?.titleId ?? null),
      [id(3), null, id(1), id(3)],
    );
    assert.equal(f.owner.state.calls, 1);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.doesNotMatch(
      response.text,
      /reviewedBy|evidenceLocations|sourceChecksum|assetSourceUrl/u,
    );
    f.owner.state.candidates = f.owner.state.candidates.map((candidate) => ({
      ...candidate,
      rights: { ...(candidate.rights as object), status: "DISPUTED" },
    }));
    const retired = await f.http.send(body(), f.headers);
    assert.deepEqual(retired.json.data?.["_playbackPublications"], [null]);
    assert.equal(f.owner.state.calls, 2);
    assert.ok(f.http.traces.every((trace) => trace.code === "COMPLETED"));
    assert.ok(!JSON.stringify(f.http.traces).includes(f.key));
    assert.doesNotMatch(JSON.stringify(f.http.traces), /manifestUrl|master\.m3u8/u);
  } finally {
    await f.http.close();
  }
});

test("private read rejects forged identity, wrong caller and arbitrary operations before owner access", async () => {
  const f = await fixture();
  try {
    for (const headers of [
      {},
      f.routerHeaders,
      { ...f.headers, "x-aster-playback-credential": randomBytes(32).toString("hex") },
      { ...f.headers, origin: "http://127.0.0.1:4000" },
      { ...f.headers, cookie: "aster_local_session=forged" },
      { ...f.headers, "x-aster-profile-id": id(1) },
      { ...f.headers, ...f.routerHeaders },
    ]) {
      const rejected = await f.http.send(body(), headers);
      assert.ok([400, 403].includes(rejected.status));
      assert.equal(rejected.json.data, undefined);
      assert.ok(!rejected.text.includes(f.key));
    }
    for (const value of [
      { query: 'query Browse { title(id: "' + id(1) + '") { id } }' },
      { ...body(), query: CATALOG_PLAYBACK_OPERATION + " " },
      { ...body(), operationName: "Other" },
      { ...body(), extensions: {} },
      body([]),
      body(["bad"]),
      body(Array.from({ length: 21 }, () => id(1))),
    ]) {
      assert.equal((await f.http.send(value, f.headers)).status, 400);
    }
    assert.equal(f.owner.state.calls, 0);
    const publicRead = await f.http.send(
      { query: 'query Title { title(id: "' + id(1) + '") { id } }' },
      f.routerHeaders,
    );
    assert.equal(publicRead.status, 200);
    assert.equal(f.owner.state.calls, 1);
  } finally {
    await f.http.close();
  }
});

test("directive is not authorization: public preflight and resolver both deny the private field", async () => {
  const schema = createCatalogSchema();
  const f = publicFixture();
  assert.equal(inspectCatalogPlaybackOperation(body()).status, "accepted");
  for (const query of [
    CATALOG_PLAYBACK_OPERATION,
    "query Hidden($ids: [ID!]!) { alias: _playbackPublications(ids: $ids) { titleId } }",
    "query Hidden($ids: [ID!]!) { ...F } fragment F on Query { _playbackPublications(ids: $ids) { titleId } }",
  ]) {
    assert.equal(
      inspectCatalogOperation({ query, variables: { ids: [id(1)] } }, schema).status,
      "rejected",
    );
  }
  const result = await graphql({
    schema,
    source: CATALOG_PLAYBACK_OPERATION,
    variableValues: { ids: [id(1)] },
    contextValue: createCatalogGraphqlContext(f.queries, AbortSignal.timeout(1000), id(99)),
  });
  assert.equal(result.errors?.[0]?.extensions["code"], "FORBIDDEN");
  assert.equal(f.state.calls, 0);
});
