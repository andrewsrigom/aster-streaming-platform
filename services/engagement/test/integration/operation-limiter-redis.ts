import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createAsterRedisAdapter, type AsterRedisAdapter } from "@aster/redis";
import { createAsterTelemetry, type AsterOperationLimitMetricInput } from "@aster/telemetry";
import { createEngagementOperationLimiter } from "../../src/infrastructure/operation-limiter.js";

const port = Number(process.argv[2]);
assert.ok(Number.isSafeInteger(port) && port > 1_023 && port < 65_536);
const telemetry = createAsterTelemetry({
  serviceName: "engagement-rate-limit-integration",
  serviceVersion: "0.0.0",
  environment: "test",
});
const adapter = (): AsterRedisAdapter =>
  createAsterRedisAdapter({
    url: `redis://127.0.0.1:${String(port)}/0`,
    telemetry,
    maxInFlightCommands: 32,
    connectionTimeoutMs: 1_000,
    operationTimeoutMs: 500,
    closeTimeoutMs: 1_000,
    reconnectMaxAttempts: 1,
    reconnectBaseDelayMs: 25,
  });
const first = adapter();
const second = adapter();
const signal = () => AbortSignal.timeout(2_000);
const policy = { capacity: 4, refillPerSecond: 1, cost: 1, ttlMs: 30_000 } as const;
const prefix = "aster:test:engagement:rate:v2:set_watchlist:";
const bucket = (value: string) => prefix + value.repeat(64) + ":bucket";
const admission = (account: string, attempt: string) =>
  prefix + account.repeat(64) + ":admission:" + attempt.repeat(64);
const corruptedKeys = ["b", "c", "d", "e", "f"].map(bucket);

try {
  assert.deepEqual(await first.connect(signal()), { status: "completed" });
  assert.deepEqual(await second.connect(signal()), { status: "completed" });
  const atomicKey = bucket("a");
  const results = await Promise.all(
    Array.from({ length: 24 }, (_, index) =>
      (index % 2 === 0 ? first : second).consumeTokenBucket(
        atomicKey,
        admission("a", String.fromCharCode(103 + index)),
        policy,
        signal(),
      ),
    ),
  );
  assert.ok(results.every((result) => result.status === "completed"));
  const completed = results;
  assert.equal(completed.filter((result) => result.allowed).length, 4);
  assert.ok(
    completed
      .filter((result) => !result.allowed)
      .every((result) => result.retryAfterMs > 0 && result.retryAfterMs <= 1_000),
  );

  for (const key of corruptedKeys) {
    const recovered = await first.consumeTokenBucket(
      key,
      key.replace(":bucket", ":admission:" + "z".repeat(64)),
      policy,
      signal(),
    );
    assert.equal(recovered.status, "completed");
    assert.equal(recovered.recovered, true);
    assert.equal(recovered.allowed, true);
    assert.equal(recovered.remaining, 3);
    assert.equal(recovered.deduplicated, false);
  }
  assert.deepEqual(
    await first.consumeTokenBucket(atomicKey, admission("a", "y"), policy, AbortSignal.abort()),
    { status: "aborted" },
  );

  const duplicateBucket = bucket("g");
  const duplicateAdmission = admission("g", "x");
  const duplicates = await Promise.all(
    Array.from({ length: 24 }, (_, index) =>
      (index % 2 === 0 ? first : second).consumeTokenBucket(
        duplicateBucket,
        duplicateAdmission,
        policy,
        signal(),
      ),
    ),
  );
  assert.ok(duplicates.every((result) => result.status === "completed" && result.allowed));
  const completedDuplicates = duplicates.flatMap((result) =>
    result.status === "completed" ? [result] : [],
  );
  assert.equal(completedDuplicates.length, duplicates.length);
  assert.equal(completedDuplicates.filter((result) => !result.deduplicated).length, 1);
  assert.equal(completedDuplicates.filter((result) => result.deduplicated).length, 23);
  assert.ok(completedDuplicates.every((result) => result.remaining === 3));

  const metrics: AsterOperationLimitMetricInput[] = [];
  let commands = 0;
  const counted = {
    consumeTokenBucket: (...args: Parameters<AsterRedisAdapter["consumeTokenBucket"]>) => {
      commands++;
      return first.consumeTokenBucket(...args);
    },
  };
  const limiter = createEngagementOperationLimiter({
    environment: "test",
    redis: counted,
    digest: (value) => createHash("sha256").update(value).digest("hex"),
    recordMetric: (metric) => metrics.push(metric),
  });
  const accountId = "00000000-0000-4000-8000-000000000001";
  const burst = [];
  for (let index = 0; index < 5; index++) {
    burst.push(
      await limiter.admit(
        "set_watchlist",
        accountId,
        createHash("sha256").update(`burst-${index}`).digest("hex"),
        signal(),
      ),
    );
  }
  assert.deepEqual(
    burst.map((result) => result.status),
    ["allowed", "allowed", "allowed", "allowed", "rejected"],
  );
  assert.equal(commands, 4);
  const hotBurstRedisCommands = commands;

  assert.deepEqual(await first.close(signal()), { status: "completed" });
  assert.deepEqual(
    await limiter.admit(
      "record_progress",
      "00000000-0000-4000-8000-000000000002",
      createHash("sha256").update("outage").digest("hex"),
      signal(),
    ),
    { status: "allowed" },
  );
  assert.equal(metrics.at(-1)?.outcome, "local_fallback");

  process.stdout.write(
    JSON.stringify({
      event: "engagement_operation_limiter_redis_verified",
      concurrentCallers: results.length,
      atomicAllowed: 4,
      atomicRejected: 20,
      duplicateCallers: duplicates.length,
      duplicateCharges: 1,
      duplicateReuses: 23,
      recoveredStates: corruptedKeys.length,
      hotBurstAttempts: burst.length,
      hotBurstRedisCommands,
      outageDecision: "local_fallback",
    }) + "\n",
  );
} finally {
  await Promise.allSettled([first.close(), second.close(), telemetry.shutdown()]);
}
