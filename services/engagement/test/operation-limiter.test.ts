import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { AsterRedisAdapter } from "@aster/redis";
import type { AsterOperationLimitMetricInput } from "@aster/telemetry";
import { createEngagementOperationLimiter } from "../src/infrastructure/operation-limiter.js";

const accountId = "00000000-0000-4000-8000-000000000001";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const admissionId = digest("admission-a");

test("distributed admission uses a pseudonymous bounded key and the fixed operation policy", async () => {
  const calls: Parameters<AsterRedisAdapter["consumeTokenBucket"]>[] = [];
  const metrics: AsterOperationLimitMetricInput[] = [];
  const limiter = createEngagementOperationLimiter({
    environment: "test",
    digest,
    monotonicNow: () => 100,
    recordMetric: (metric) => metrics.push(metric),
    redis: {
      consumeTokenBucket: (...args) => {
        calls.push(args);
        return Promise.resolve({
          status: "completed",
          allowed: true,
          remaining: 11,
          retryAfterMs: 0,
          resetAfterMs: 250,
          recovered: false,
          deduplicated: false,
        });
      },
    },
  });

  assert.deepEqual(
    await limiter.admit("record_progress", accountId, admissionId, new AbortController().signal),
    { status: "allowed" },
  );
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.ok(call);
  assert.equal(
    call[0],
    `aster:test:engagement:rate:v2:record_progress:${digest(accountId)}:bucket`,
  );
  assert.equal(call[0].includes(accountId), false);
  assert.equal(
    call[1],
    `aster:test:engagement:rate:v2:record_progress:${digest(accountId)}:admission:${admissionId}`,
  );
  assert.deepEqual(call[2], {
    capacity: 12,
    refillPerSecond: 4,
    cost: 1,
    ttlMs: 30_000,
  });
  assert.equal(metrics.at(-1)?.outcome, "allowed");
});

test("separate limiter replicas reuse one shared idempotency admission", async () => {
  const seen = new Set<string>();
  const calls: Parameters<AsterRedisAdapter["consumeTokenBucket"]>[] = [];
  let charges = 0;
  const redis = {
    consumeTokenBucket: (...args: Parameters<AsterRedisAdapter["consumeTokenBucket"]>) => {
      calls.push(args);
      const duplicate = seen.has(args[1]);
      if (!duplicate) {
        seen.add(args[1]);
        charges++;
      }
      return Promise.resolve({
        status: "completed" as const,
        allowed: true,
        remaining: 3,
        retryAfterMs: 0,
        resetAfterMs: 1_000,
        recovered: false,
        deduplicated: duplicate,
      });
    },
  };
  const first = createEngagementOperationLimiter({ environment: "test", digest, redis });
  const second = createEngagementOperationLimiter({ environment: "test", digest, redis });
  const signal = new AbortController().signal;

  const results = await Promise.all([
    first.admit("set_watchlist", accountId, admissionId, signal),
    second.admit("set_watchlist", accountId, admissionId, signal),
  ]);

  assert.deepEqual(results, [{ status: "allowed" }, { status: "allowed" }]);
  assert.equal(calls.length, 2);
  assert.equal(charges, 1);
  assert.equal(calls[0]?.[0], calls[1]?.[0]);
  assert.equal(calls[0]?.[1], calls[1]?.[1]);
  assert.equal(
    (await second.admit("set_watchlist", accountId, digest("independent-admission"), signal))
      .status,
    "allowed",
  );
  assert.equal(charges, 2);
});

test("the local shield rejects a hot account before another Redis command", async () => {
  let calls = 0;
  const limiter = createEngagementOperationLimiter({
    environment: "test",
    digest,
    monotonicNow: () => 0,
    redis: {
      consumeTokenBucket: () => {
        calls++;
        return Promise.resolve({ status: "unavailable" });
      },
    },
  });
  const signal = new AbortController().signal;
  for (let index = 0; index < 12; index++) {
    assert.equal(
      (await limiter.admit("record_progress", accountId, digest(`progress-${index}`), signal))
        .status,
      "allowed",
    );
  }
  assert.deepEqual(await limiter.admit("record_progress", accountId, digest("rejected"), signal), {
    status: "rejected",
    retryAfterMs: 250,
  });
  assert.equal(calls, 12);
});

test("local operation buckets refill independently and keep partition cardinality bounded", async () => {
  let clock = 0;
  const limiter = createEngagementOperationLimiter({
    environment: "test",
    digest,
    monotonicNow: () => clock,
  });
  const signal = new AbortController().signal;
  for (let index = 0; index < 4; index++) {
    assert.equal(
      (await limiter.admit("set_watchlist", accountId, digest(`watchlist-${index}`), signal))
        .status,
      "allowed",
    );
  }
  assert.deepEqual(
    await limiter.admit("set_watchlist", accountId, digest("watch-rejected"), signal),
    {
      status: "rejected",
      retryAfterMs: 1_000,
    },
  );
  assert.equal(
    (await limiter.admit("record_progress", accountId, digest("progress-independent"), signal))
      .status,
    "allowed",
  );
  clock = 1_000;
  assert.equal(
    (await limiter.admit("set_watchlist", accountId, digest("watch-refill"), signal)).status,
    "allowed",
  );

  const bounded = createEngagementOperationLimiter({
    environment: "test",
    digest,
    monotonicNow: () => 0,
  });
  const identifier = (index: number) =>
    `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  for (let index = 1; index <= 1_024; index++) {
    assert.equal(
      (
        await bounded.admit(
          "record_progress",
          identifier(index),
          digest(`bounded-${index}`),
          signal,
        )
      ).status,
      "allowed",
    );
  }
  assert.deepEqual(
    {
      result: await bounded.admit(
        "record_progress",
        identifier(1_025),
        digest("bounded-1025"),
        signal,
      ),
      snapshot: bounded.snapshot(),
    },
    {
      result: { status: "rejected", retryAfterMs: 1_000 },
      snapshot: { closed: false, partitions: 1_024, maximumPartitions: 1_024 },
    },
  );
});

test("Redis rejection, cancellation, recovery and local degraded mode stay explicit", async () => {
  const metrics: AsterOperationLimitMetricInput[] = [];
  let result: Awaited<ReturnType<AsterRedisAdapter["consumeTokenBucket"]>> = {
    status: "completed",
    allowed: false,
    remaining: 0,
    retryAfterMs: 777,
    resetAfterMs: 777,
    recovered: false,
    deduplicated: false,
  };
  let clock = 0;
  const limiter = createEngagementOperationLimiter({
    environment: "local",
    digest,
    monotonicNow: () => clock++,
    recordMetric: (metric) => metrics.push(metric),
    redis: { consumeTokenBucket: () => Promise.resolve(result) },
  });
  const signal = new AbortController().signal;
  assert.deepEqual(await limiter.admit("set_watchlist", accountId, digest("first"), signal), {
    status: "rejected",
    retryAfterMs: 777,
  });
  result = { status: "unavailable" };
  assert.deepEqual(await limiter.admit("set_watchlist", accountId, digest("second"), signal), {
    status: "allowed",
  });
  result = {
    status: "completed",
    allowed: true,
    remaining: 3,
    retryAfterMs: 0,
    resetAfterMs: 1_000,
    recovered: true,
    deduplicated: false,
  };
  assert.deepEqual(await limiter.admit("set_watchlist", accountId, digest("third"), signal), {
    status: "allowed",
  });
  const cancelled = new AbortController();
  cancelled.abort();
  assert.deepEqual(
    await limiter.admit("set_watchlist", accountId, digest("fourth"), cancelled.signal),
    {
      status: "cancelled",
    },
  );
  limiter.close();
  assert.deepEqual(await limiter.admit("set_watchlist", accountId, digest("fifth"), signal), {
    status: "unavailable",
  });
  assert.deepEqual(
    metrics.map((metric) => metric.outcome),
    ["rejected", "local_fallback", "recovered", "cancelled", "closed"],
  );
});
