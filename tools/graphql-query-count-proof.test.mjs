import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

import {
  assertDiscoveryProjectionFreshness,
  assertHydratedTitleBatch,
  assertFederatedQueryBudget,
  FEDERATED_QUERY_COUNT_WORKLOAD,
  READ_QUERY_COUNT_SQL,
  selectCurrentTrustedOperation,
} from "./graphql-query-count-proof.mjs";

const root = new URL("../", import.meta.url);
const persisted = await readFile(
  new URL("infra/router/generated/persisted-query-manifest.json", root),
  "utf8",
);
const delivery = await readFile(new URL("infra/router/generated/manifest.json", root), "utf8");

test("query-count proof selects exact current trusted bodies across a rollout union", () => {
  const selected = selectCurrentTrustedOperation(persisted, delivery, "HomePublic");
  assert.equal(createHash("sha256").update(selected.body).digest("hex"), selected.id);
  assert.match(selected.body, /^query HomePublic/u);
  const retained = JSON.parse(persisted);
  retained.operations.unshift({
    ...selected,
    body: "query HomePublic { homeRails { code } }",
    id: createHash("sha256").update("query HomePublic { homeRails { code } }").digest("hex"),
  });
  assert.deepEqual(
    selectCurrentTrustedOperation(JSON.stringify(retained), delivery, "HomePublic"),
    selected,
  );
});

test("query-count proof requires every expected owner and rejects query amplification", () => {
  assert.equal(
    assertFederatedQueryBudget(
      "SearchTitles",
      { catalog: 1, discovery: 3 },
      { catalog: 1, discovery: 3 },
    ),
    4,
  );
  assert.throws(
    () =>
      assertFederatedQueryBudget("SearchTitles", { discovery: 3 }, { catalog: 1, discovery: 3 }),
    /unexpected owner set/u,
  );
  assert.throws(
    () =>
      assertFederatedQueryBudget(
        "SearchTitles",
        { catalog: 1, discovery: 4 },
        { catalog: 1, discovery: 3 },
      ),
    /exceeds its bound/u,
  );
});

test("query-count proof requires a representative multi-entity workload", () => {
  assert.deepEqual(FEDERATED_QUERY_COUNT_WORKLOAD, {
    distinctTitles: 10,
    homeFirst: 10,
    searchFirst: 20,
  });
  const edges = Array.from(
    { length: FEDERATED_QUERY_COUNT_WORKLOAD.distinctTitles },
    (_, index) => ({
      node: {
        id: `00000000-0000-4000-8000-0000051${String(index + 1).padStart(5, "0")}`,
        localized: { locale: "en", title: `Signal / ${String(index + 1).padStart(2, "0")}` },
      },
    }),
  );
  assert.equal(
    assertHydratedTitleBatch("SearchTitles", edges, FEDERATED_QUERY_COUNT_WORKLOAD.distinctTitles)
      .length,
    10,
  );
  assert.throws(
    () =>
      assertHydratedTitleBatch(
        "SearchTitles",
        edges.slice(0, 1),
        FEDERATED_QUERY_COUNT_WORKLOAD.distinctTitles,
      ),
    /hydrate exactly 10/u,
  );
  assert.throws(
    () =>
      assertHydratedTitleBatch(
        "HomePublic",
        edges.map((edge, index) => (index === 9 ? edges[0] : edge)),
        FEDERATED_QUERY_COUNT_WORKLOAD.distinctTitles,
      ),
    /10 distinct/u,
  );
});

test("query-count proof accepts only the bounded Discovery projection lease window", () => {
  assert.equal(assertDiscoveryProjectionFreshness({ indexedAt: 100, visibleUntil: 400 }), 300);
  assert.equal(assertDiscoveryProjectionFreshness({ indexedAt: 101, visibleUntil: 400 }), 299);
  assert.equal(assertDiscoveryProjectionFreshness({ indexedAt: 102, visibleUntil: 400 }), 298);
  for (const value of [
    { indexedAt: 103, visibleUntil: 400 },
    { indexedAt: 99, visibleUntil: 400 },
    { indexedAt: 100.5, visibleUntil: 400 },
  ]) {
    assert.throws(() => assertDiscoveryProjectionFreshness(value), /bounded lease window/u);
  }
});

test("query-count overlay enables only bounded statement instrumentation", async () => {
  const overlay = await readFile(new URL("infra/compose/query-count-proof.yml", root), "utf8");
  for (const value of [
    "command: !override",
    "shared_preload_libraries=pg_stat_statements",
    "compute_query_id=on",
    "pg_stat_statements.track=all",
    "pg_stat_statements.track_utility=off",
  ]) {
    assert.ok(overlay.includes(value), value);
  }
  assert.doesNotMatch(overlay, /ports:|volumes:|privileged:|cap_add:|network_mode:|\$\{/u);
  for (const role of ["catalog", "discovery", "engagement", "identity", "playback"]) {
    assert.ok(
      READ_QUERY_COUNT_SQL.includes(`aster_${role === "catalog" ? "catalog_reader" : role}_local`),
    );
    assert.ok(READ_QUERY_COUNT_SQL.includes(`${role}.`));
  }
  for (const readinessFingerprint of [
    "public_candidates WHERE",
    "profile_admission WHERE singleton",
    "identity\\.accounts a",
    "pg_(roles|namespace|class|constraint|attribute|proc|trigger)",
  ]) {
    assert.ok(READ_QUERY_COUNT_SQL.includes(readinessFingerprint), readinessFingerprint);
  }
  for (const runner of ["run-discovery-runtime.mjs", "run-engagement-runtime.mjs"]) {
    const source = await readFile(new URL(`tools/${runner}`, root), "utf8");
    assert.ok(source.includes('"infra/compose/query-count-proof.yml"'), runner);
    assert.ok(source.includes("selectCurrentTrustedOperation"), runner);
    assert.ok(source.includes("phase13_federated_query_count") || runner.includes("engagement"));
  }
  const engagementWorker = await readFile(
    new URL("services/engagement/test/integration/federated-query-count.ts", root),
    "utf8",
  );
  assert.ok(engagementWorker.includes('operation.name, "ContinueWatching"'));
  assert.ok(engagementWorker.includes('admin.query("SELECT pg_stat_statements_reset()")'));
  assert.ok(engagementWorker.includes('event: "phase13_federated_query_count"'));
  assert.ok(engagementWorker.includes('process.env["ASTER_QUERY_COUNT_PROFILE_ID"]'));
  assert.ok(engagementWorker.includes("AND profile_id=$1"));
  assert.doesNotMatch(engagementWorker, /ORDER BY profile_id LIMIT 1/u);
  const engagementRunner = await readFile(
    new URL("tools/run-engagement-runtime.mjs", root),
    "utf8",
  );
  assert.ok(engagementRunner.includes('["stop", "--timeout", "5", "playback"]'));
  assert.ok(engagementRunner.includes("ASTER_QUERY_COUNT_SQL="));
  assert.ok(engagementRunner.includes("ASTER_QUERY_COUNT_PROFILE_ID="));
  assert.ok(engagementRunner.includes('record.event === "phase13_query_count_control"'));
  assert.ok(engagementRunner.includes("aster:local:catalog:*"));
});
