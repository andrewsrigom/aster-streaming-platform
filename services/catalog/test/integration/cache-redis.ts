import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import { createAsterRedisAdapter } from "@aster/redis";
import { ASTER_METRIC_CATALOG, createAsterTelemetry } from "@aster/telemetry";

import { createCachedCatalogPublicEntities } from "../../src/application/public-cache.js";
import type {
  CatalogPublicEntitySource,
  CatalogPublicFence,
} from "../../src/application/public-ports.js";
import { createRedisCatalogPublicCache } from "../../src/infrastructure/cache/redis-public-cache.js";
import { catalogCacheDigest } from "../../src/infrastructure/cache/node-cache-primitives.js";
import type { PublicCatalogCandidate } from "../../src/domain/public-title.js";
import { publicCandidate } from "../public-fixture.js";
import { catalogTestId as id, catalogTestTime as now } from "../rights-fixture.js";

const port = Number(process.argv[2]);
assert.ok(Number.isSafeInteger(port) && port > 1_023 && port < 65_536);
const telemetry = createAsterTelemetry({
  serviceName: "catalog-cache-integration",
  serviceVersion: "0.0.0",
  environment: "test",
});
const redis = createAsterRedisAdapter({
  url: `redis://127.0.0.1:${String(port)}/0`,
  telemetry,
  maxInFlightCommands: 64,
  connectionTimeoutMs: 1_000,
  operationTimeoutMs: 500,
  closeTimeoutMs: 1_000,
  reconnectMaxAttempts: 1,
  reconnectBaseDelayMs: 25,
});
const requestSignal = () => AbortSignal.timeout(2_000);
const scope = { now, policy: { commercial: true } };
const controlValueKey = `aster:test:catalog:public-title:v1:${id(97)}:5:2:${id(200)}`;

function candidateFence(candidate: PublicCatalogCandidate): CatalogPublicFence {
  const title = candidate.title as {
    id: string;
    version: number;
    rightsRevision: number;
    publicationId: string;
  };
  return Object.freeze({
    id: title.id,
    titleVersion: title.version,
    rightsRevision: title.rightsRevision,
    publicationId: title.publicationId,
  });
}

try {
  assert.deepEqual(await redis.connect(requestSignal()), { status: "completed" });
  assert.deepEqual(await redis.read("aster:test:oversized", requestSignal()), {
    status: "rejected",
    reason: "value_too_large",
  });
  const boundedCache = createRedisCatalogPublicCache(redis);
  assert.deepEqual(await boundedCache.read("aster:test:oversized", requestSignal()), {
    status: "malformed",
  });
  assert.deepEqual(await boundedCache.delete("aster:test:oversized", requestSignal()), {
    status: "completed",
    value: true,
  });
  assert.deepEqual(await redis.read("aster:test:oversized", requestSignal()), {
    status: "completed",
    value: null,
  });
  assert.deepEqual(await redis.read("aster:test:wrong-type", requestSignal()), {
    status: "rejected",
    reason: "value_too_large",
  });
  assert.deepEqual(await boundedCache.read("aster:test:wrong-type", requestSignal()), {
    status: "malformed",
  });
  assert.deepEqual(await boundedCache.delete("aster:test:wrong-type", requestSignal()), {
    status: "completed",
    value: true,
  });
  assert.deepEqual(await redis.read("aster:test:wrong-type", requestSignal()), {
    status: "completed",
    value: null,
  });
  assert.deepEqual(await redis.read(controlValueKey, requestSignal()), {
    status: "completed",
    value: "malformed\nvalue",
  });
  assert.deepEqual(await redis.probe(requestSignal()), { status: "completed" });
  assert.deepEqual(await redis.write("aster:test:lease", "owner-a", 2_000, "if_absent"), {
    status: "completed",
    stored: true,
  });
  assert.deepEqual(await redis.write("aster:test:lease", "owner-b", 2_000, "if_absent"), {
    status: "completed",
    stored: false,
  });
  assert.deepEqual(await redis.compareAndDelete("aster:test:lease", "owner-b"), {
    status: "completed",
    deleted: false,
  });
  assert.deepEqual(await redis.read("aster:test:lease"), {
    status: "completed",
    value: "owner-a",
  });
  assert.deepEqual(await redis.compareAndDelete("aster:test:lease", "owner-a"), {
    status: "completed",
    deleted: true,
  });
  assert.deepEqual(await redis.write("aster:test:lease-expiry", "owner-a", 30, "if_absent"), {
    status: "completed",
    stored: true,
  });
  await delay(70);
  assert.deepEqual(await redis.write("aster:test:lease-expiry", "owner-b", 2_000, "if_absent"), {
    status: "completed",
    stored: true,
  });
  assert.deepEqual(await redis.compareAndDelete("aster:test:lease-expiry", "owner-b"), {
    status: "completed",
    deleted: true,
  });

  const candidates = [publicCandidate(2), publicCandidate(3), publicCandidate(97)];
  const expectedFences = candidates.map(candidateFence);
  const state = { fenceReads: 0, sourceReads: 0 };
  const source: CatalogPublicEntitySource = {
    findFences(ids) {
      state.fenceReads += 1;
      return Promise.resolve({
        status: "completed",
        value: expectedFences.filter((value) => ids.includes(value.id)),
      });
    },
    async findManyAtFences(fences) {
      state.sourceReads += 1;
      await delay(15);
      return {
        status: "completed",
        value: candidates.filter((candidate) =>
          fences.some(
            (value) => JSON.stringify(value) === JSON.stringify(candidateFence(candidate)),
          ),
        ),
      };
    },
  };
  let token = 8_000;
  const createReader = () =>
    createCachedCatalogPublicEntities({
      environment: "test",
      source,
      cache: createRedisCatalogPublicCache(redis),
      digest: catalogCacheDigest,
      token: () => id(token++),
      record: (observation) => {
        telemetry.recordCacheOperation?.({ cache: "catalog_public_title", ...observation });
      },
    });
  const baselineFence = expectedFences[0];
  assert.ok(baselineFence);
  const corruptedNegative = await createReader().findMany([id(97)], scope, requestSignal());
  assert.equal(corruptedNegative.status, "completed");
  assert.deepEqual(
    corruptedNegative.value.map((title) => title.id),
    [id(97)],
  );
  const repairedControlValue = await redis.read(controlValueKey, requestSignal());
  assert.ok(repairedControlValue.status === "completed" && repairedControlValue.value !== null);
  const repairedPayload = repairedControlValue.value;
  assert.notEqual(repairedPayload, "malformed\nvalue");
  assert.doesNotThrow(() => JSON.parse(repairedPayload));
  assert.deepEqual(
    await redis.read(`aster:test:catalog:public-title-absent:v1:${id(97)}`, requestSignal()),
    { status: "completed", value: null },
  );
  state.fenceReads = 0;
  state.sourceReads = 0;
  const baselineStarted = performance.now();
  const baseline = await Promise.all(
    Array.from({ length: 24 }, () =>
      source.findManyAtFences([baselineFence], scope, requestSignal()),
    ),
  );
  const baselineDurationMs = performance.now() - baselineStarted;
  assert.equal(
    baseline.every((result) => result.status === "completed"),
    true,
  );
  assert.equal(state.sourceReads, 24);
  state.sourceReads = 0;
  const reader = createReader();

  const burstStarted = performance.now();
  const burst = await Promise.all(
    Array.from({ length: 24 }, () => reader.findMany([id(2)], scope, requestSignal())),
  );
  const burstDurationMs = performance.now() - burstStarted;
  assert.equal(
    burst.every((result) => result.status === "completed"),
    true,
  );
  assert.equal(state.sourceReads, 1);
  assert.equal(state.fenceReads, 1);
  const warmStarted = performance.now();
  const warm = await reader.findMany([id(2)], scope, requestSignal());
  const warmDurationMs = performance.now() - warmStarted;
  assert.equal(warm.status, "completed");
  assert.equal(state.sourceReads, 1);
  assert.equal(state.fenceReads, 2);

  const crossInstanceNegativeFenceBefore = state.fenceReads;
  const crossInstanceNegative = await Promise.all([
    reader.findMany([id(98)], scope, requestSignal()),
    createReader().findMany([id(98)], scope, requestSignal()),
  ]);
  assert.ok(
    crossInstanceNegative.every(
      (result) => result.status === "completed" && result.value.length === 0,
    ),
  );
  assert.equal(state.fenceReads - crossInstanceNegativeFenceBefore, 1);

  assert.deepEqual(await reader.findMany([id(99)], scope, requestSignal()), {
    status: "completed",
    value: [],
  });
  const negativeFenceReads = state.fenceReads;
  assert.deepEqual(await reader.findMany([id(99)], scope, requestSignal()), {
    status: "completed",
    value: [],
  });
  assert.equal(state.fenceReads, negativeFenceReads);

  const crossInstanceSourceBefore = state.sourceReads;
  const crossInstanceFenceBefore = state.fenceReads;
  const crossInstance = await Promise.all([
    reader.findMany([id(3)], scope, requestSignal()),
    createReader().findMany([id(3)], scope, requestSignal()),
  ]);
  assert.equal(
    crossInstance.every((result) => result.status === "completed"),
    true,
  );
  assert.equal(state.sourceReads - crossInstanceSourceBefore, 1);
  assert.equal(state.fenceReads - crossInstanceFenceBefore, 2);

  assert.deepEqual(await redis.close(), { status: "completed" });
  const outageSourceBefore = state.sourceReads;
  const outage = await reader.findMany([id(2)], scope, requestSignal());
  assert.equal(outage.status, "completed");
  assert.deepEqual(
    outage.value.map((title) => title.id),
    [id(2)],
  );
  assert.equal(state.sourceReads - outageSourceBefore, 1);

  const metrics = await telemetry.collect();
  assert.equal(metrics.status, "collected");
  const cacheOutcomes = metrics.metrics.find(
    (metric) => metric.name === ASTER_METRIC_CATALOG.cacheOutcomes.name,
  );
  assert.ok(cacheOutcomes);
  assert.equal(
    cacheOutcomes.points.some((point) => point.attributes["aster.outcome"] === "lease_contended"),
    true,
  );
  process.stdout.write(
    JSON.stringify({
      event: "catalog_cache_redis_verified",
      boundedOversizedRead: true,
      wrongTypeDeleted: true,
      controlValueDeleted: true,
      unboundedNegativeDeleted: true,
      atomicCompareDelete: true,
      expiryObserved: true,
      expiredLeaseRecovered: true,
      concurrentCallers: burst.length,
      uncachedFullSourceReadsDuringBurst: 24,
      uncachedBurstDurationMs: Math.round(baselineDurationMs * 100) / 100,
      fullSourceReadsDuringBurst: 1,
      fenceReadsDuringBurst: 1,
      burstDurationMs: Math.round(burstDurationMs * 100) / 100,
      warmFullSourceReads: 0,
      warmDurationMs: Math.round(warmDurationMs * 100) / 100,
      negativeFenceReadsOnSecondCall: 0,
      crossInstanceCallers: crossInstance.length,
      crossInstanceFullSourceReads: 1,
      crossInstanceNegativeCallers: crossInstanceNegative.length,
      crossInstanceNegativeFenceReads: 1,
      leaseContentionObserved: true,
      outageReturnedOwnerValue: true,
      finiteMetricSeries: cacheOutcomes.points.length,
    }) + "\n",
  );
} finally {
  await redis.close();
  await telemetry.shutdown();
}
