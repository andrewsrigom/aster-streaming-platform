import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import { createAsterRedisAdapter } from "@aster/redis";
import { ASTER_METRIC_CATALOG, createAsterTelemetry } from "@aster/telemetry";

import { createCachedDiscoveryHome } from "../../src/application/home-cache.js";
import type { DiscoveryHomeSource } from "../../src/application/home-cache-ports.js";
import type { HomeRail, HomeRailsPage, HomeRailsResult } from "../../src/application/home-rails.js";
import {
  discoveryCacheDigest,
  discoveryCacheToken,
} from "../../src/infrastructure/cache/node-cache-primitives.js";
import { createRedisDiscoveryHomeCache } from "../../src/infrastructure/cache/redis-home-cache.js";

const port = Number(process.argv[2]);
assert.ok(Number.isSafeInteger(port) && port > 1_023 && port < 65_536);
const telemetry = createAsterTelemetry({
  serviceName: "discovery-cache-integration",
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
const baseNow = 1_700_000_000;
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

function rail(
  kind: "featured" | "recently_added" | "trending",
  generatedAt: number,
  populated: boolean,
): HomeRail {
  const edges = populated
    ? Object.freeze([
        Object.freeze({
          titleId: id(1),
          sourceVersion: 1,
          indexedAt: generatedAt,
          visibleUntil: generatedAt + 300,
        }),
      ])
    : Object.freeze([]);
  return Object.freeze({
    key: kind.replaceAll("_", "-"),
    kind,
    genre: null,
    source: kind,
    oldestIndexedAt: populated ? generatedAt : null,
    freshUntil: populated ? generatedAt + 300 : null,
    edges,
  });
}

function page(generatedAt: number): HomeRailsPage {
  return Object.freeze({
    status: "completed",
    generation: id(90),
    generatedAt,
    featured: Object.freeze({
      code: "completed",
      rail: rail("featured", generatedAt, true),
    }),
    recentlyAdded: Object.freeze({
      code: "empty",
      rail: rail("recently_added", generatedAt, false),
    }),
    trending: Object.freeze({
      code: "empty",
      rail: rail("trending", generatedAt, false),
    }),
    genres: Object.freeze({ code: "empty", rails: Object.freeze([]) }),
  });
}

let wallNow = baseNow;
let sourceReads = 0;
const source: DiscoveryHomeSource = {
  async execute(_input, now, signal): Promise<HomeRailsResult> {
    sourceReads += 1;
    await delay(15, undefined, { signal }).catch(() => undefined);
    return signal.aborted
      ? { status: "cancelled" }
      : { status: "completed", value: { status: "completed", value: page(now) } };
  },
};
const cache = createRedisDiscoveryHomeCache(redis);
const homes: Array<ReturnType<typeof createCachedDiscoveryHome>> = [];
const createHome = () => {
  const home = createCachedDiscoveryHome({
    environment: "test",
    source,
    cache,
    digest: discoveryCacheDigest,
    token: discoveryCacheToken,
    now: () => wallNow,
    record: (observation) => {
      telemetry.recordCacheOperation?.({ cache: "discovery_rail", ...observation });
    },
  });
  homes.push(home);
  return home;
};

try {
  assert.deepEqual(await redis.connect(requestSignal()), { status: "completed" });
  assert.deepEqual(await redis.read("aster:test:oversized", requestSignal()), {
    status: "rejected",
    reason: "value_too_large",
  });
  assert.deepEqual(await cache.read("aster:test:oversized", requestSignal()), {
    status: "malformed",
  });
  assert.deepEqual(await cache.delete("aster:test:oversized", requestSignal()), {
    status: "completed",
    value: true,
  });
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
  assert.deepEqual(await redis.compareAndDelete("aster:test:lease", "owner-a"), {
    status: "completed",
    deleted: true,
  });

  const baselineStarted = performance.now();
  const baseline = await Promise.all(
    Array.from({ length: 24 }, () => source.execute({ first: 10 }, baseNow, requestSignal())),
  );
  const baselineDurationMs = performance.now() - baselineStarted;
  assert.ok(baseline.every((result) => result.status === "completed"));
  assert.equal(sourceReads, 24);
  sourceReads = 0;

  const home = createHome();
  const burstStarted = performance.now();
  const burst = await Promise.all(
    Array.from({ length: 24 }, () => home.execute({ first: 10 }, baseNow, requestSignal())),
  );
  const burstDurationMs = performance.now() - burstStarted;
  assert.ok(burst.every((result) => result.status === "completed"));
  assert.equal(sourceReads, 1);

  const warmStarted = performance.now();
  const warm = await home.execute({ first: 10 }, baseNow + 1, requestSignal());
  const warmDurationMs = performance.now() - warmStarted;
  assert.equal(warm.status, "completed");
  assert.equal(sourceReads, 1);

  wallNow = baseNow + 21;
  const staleSourceBefore = sourceReads;
  const staleStarted = performance.now();
  const stale = await Promise.all(
    Array.from({ length: 24 }, () => home.execute({ first: 10 }, wallNow, requestSignal())),
  );
  const staleDurationMs = performance.now() - staleStarted;
  assert.ok(
    stale.every(
      (result) =>
        result.status === "completed" &&
        result.value.status === "completed" &&
        result.value.value.status === "stale",
    ),
  );
  for (let attempt = 0; ; attempt += 1) {
    const raw = await redis.read("aster:test:discovery:home:v1:10", requestSignal());
    if (raw.status === "completed" && raw.value?.includes(`"cachedAt":${String(wallNow)}`)) {
      break;
    }
    assert.ok(attempt < 100, "Expected refreshed Discovery cache value.");
    await delay(5);
  }
  assert.equal(sourceReads - staleSourceBefore, 1);

  const crossInstanceBefore = sourceReads;
  const crossInstance = await Promise.all([
    home.execute({ first: 9 }, wallNow, requestSignal()),
    createHome().execute({ first: 9 }, wallNow, requestSignal()),
  ]);
  assert.ok(crossInstance.every((result) => result.status === "completed"));
  assert.equal(sourceReads - crossInstanceBefore, 1);

  assert.deepEqual(await redis.close(), { status: "completed" });
  const outageBefore = sourceReads;
  const outage = await home.execute({ first: 8 }, wallNow + 1, requestSignal());
  assert.equal(outage.status, "completed");
  assert.equal(sourceReads - outageBefore, 1);

  const metrics = await telemetry.collect();
  assert.equal(metrics.status, "collected");
  const cacheOutcomes = metrics.metrics.find(
    (metric) => metric.name === ASTER_METRIC_CATALOG.cacheOutcomes.name,
  );
  assert.ok(cacheOutcomes);
  assert.ok(
    cacheOutcomes.points.some((point) => point.attributes["aster.outcome"] === "stale_hit"),
  );
  assert.ok(
    cacheOutcomes.points.some((point) => point.attributes["aster.outcome"] === "lease_contended"),
  );
  process.stdout.write(
    JSON.stringify({
      event: "discovery_cache_redis_verified",
      boundedOversizedRead: true,
      atomicCompareDelete: true,
      concurrentCallers: burst.length,
      uncachedSourceReadsDuringBurst: 24,
      uncachedBurstDurationMs: Math.round(baselineDurationMs * 100) / 100,
      sourceReadsDuringBurst: 1,
      burstDurationMs: Math.round(burstDurationMs * 100) / 100,
      warmSourceReads: 0,
      warmDurationMs: Math.round(warmDurationMs * 100) / 100,
      staleCallers: stale.length,
      staleSourceReads: 1,
      staleDurationMs: Math.round(staleDurationMs * 100) / 100,
      crossInstanceCallers: crossInstance.length,
      crossInstanceSourceReads: 1,
      excessiveTtlLeaseRecovered: true,
      outageReturnedOwnerValue: true,
      finiteMetricSeries: cacheOutcomes.points.length,
    }) + "\n",
  );
} finally {
  await Promise.allSettled(homes.map((home) => home.stop(AbortSignal.timeout(1_000))));
  await redis.close();
  await telemetry.shutdown();
}
