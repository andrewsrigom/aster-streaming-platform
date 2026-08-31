import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type { AsterRedisAdapter } from "@aster/redis";
import type { AsterOperationLimitMetricInput } from "@aster/telemetry";

import { createIdentityProfileOperationLimiter } from "../src/infrastructure/profile-operation-limiter.js";

const accountId = "00000000-0000-4000-8000-000000000001";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

test("uses a pseudonymous account partition and the fixed profile policy", async () => {
  const calls: Parameters<AsterRedisAdapter["consumeTokenBucket"]>[] = [];
  const metrics: AsterOperationLimitMetricInput[] = [];
  const limiter = createIdentityProfileOperationLimiter({
    environment: "test",
    digest,
    monotonicNow: () => 100,
    recordMetric: (metric) => metrics.push(metric),
    redis: {
      consumeTokenBucket: (...arguments_) => {
        calls.push(arguments_);
        return Promise.resolve({
          status: "completed",
          allowed: true,
          remaining: 7,
          retryAfterMs: 0,
          resetAfterMs: 500,
          recovered: false,
          deduplicated: false,
        });
      },
    },
  });
  const admission = digest("owned-random-admission");

  assert.deepEqual(
    await limiter.admit("profile_mutation", accountId, admission, AbortSignal.timeout(1_000)),
    { status: "allowed" },
  );
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.ok(call);
  assert.equal(call[0], `aster:test:identity:rate:v1:profile_mutation:${digest(accountId)}:bucket`);
  assert.equal(call[0].includes(accountId), false);
  assert.equal(
    call[1],
    `aster:test:identity:rate:v1:profile_mutation:${digest(accountId)}:admission:${admission}`,
  );
  assert.deepEqual(call[2], {
    capacity: 8,
    refillPerSecond: 2,
    cost: 1,
    ttlMs: 30_000,
  });
  assert.equal(metrics.at(-1)?.outcome, "allowed");
});

test("local profile buckets reject hot accounts, refill and stay independent", async () => {
  let clock = 0;
  let redisCalls = 0;
  const limiter = createIdentityProfileOperationLimiter({
    environment: "test",
    digest,
    monotonicNow: () => clock,
    redis: {
      consumeTokenBucket: () => {
        redisCalls++;
        return Promise.resolve({ status: "unavailable" });
      },
    },
  });
  const signal = new AbortController().signal;
  for (let index = 0; index < 8; index++) {
    assert.equal(
      (await limiter.admit("profile_mutation", accountId, digest(`mutation-${index}`), signal))
        .status,
      "allowed",
    );
  }
  assert.deepEqual(
    await limiter.admit("profile_mutation", accountId, digest("mutation-rejected"), signal),
    { status: "rejected", retryAfterMs: 500 },
  );
  assert.equal(redisCalls, 8);
  assert.equal(
    (await limiter.admit("profile_selection", accountId, digest("selection"), signal)).status,
    "allowed",
  );
  clock = 500;
  assert.equal(
    (await limiter.admit("profile_mutation", accountId, digest("mutation-refilled"), signal))
      .status,
    "allowed",
  );
});

test("connects Redis on demand without making outage admission unbounded", async () => {
  let ready = false;
  let connects = 0;
  let commands = 0;
  let available = true;
  const limiter = createIdentityProfileOperationLimiter({
    environment: "test",
    digest,
    redis: {
      snapshot: () => ({
        state: ready ? "ready" : "idle",
        open: ready,
        ready,
        inFlightCommands: 0,
        reconnectAttempts: 0,
      }),
      connect: () => {
        connects++;
        ready = available;
        return Promise.resolve(available ? { status: "completed" } : { status: "unavailable" });
      },
      consumeTokenBucket: () => {
        commands++;
        return Promise.resolve({
          status: "completed",
          allowed: true,
          remaining: 7,
          retryAfterMs: 0,
          resetAfterMs: 500,
          recovered: false,
          deduplicated: false,
        });
      },
    },
  });
  const signal = new AbortController().signal;
  assert.equal(
    (await limiter.admit("profile_mutation", accountId, digest("connect"), signal)).status,
    "allowed",
  );
  assert.deepEqual({ connects, commands }, { connects: 1, commands: 1 });
  ready = false;
  available = false;
  assert.equal(
    (await limiter.admit("profile_selection", accountId, digest("fallback"), signal)).status,
    "allowed",
  );
  assert.deepEqual({ connects, commands }, { connects: 2, commands: 1 });
});

test("bounds local partitions and rejects malformed identity or clock state", async () => {
  const signal = new AbortController().signal;
  const limiter = createIdentityProfileOperationLimiter({
    environment: "test",
    digest,
    monotonicNow: () => 0,
  });
  const identifier = (index: number) =>
    `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  for (let index = 1; index <= 1_024; index++) {
    assert.equal(
      (
        await limiter.admit(
          "profile_mutation",
          identifier(index),
          digest(`bounded-${index}`),
          signal,
        )
      ).status,
      "allowed",
    );
  }
  assert.deepEqual(
    await limiter.admit("profile_mutation", identifier(1_025), digest("overflow"), signal),
    { status: "rejected", retryAfterMs: 1_000 },
  );
  assert.deepEqual(limiter.snapshot(), {
    closed: false,
    partitions: 1_024,
    maximumPartitions: 1_024,
  });
  assert.deepEqual(
    await limiter.admit("profile_mutation", "raw-account", digest("invalid"), signal),
    { status: "unavailable" },
  );
  const invalidClock = createIdentityProfileOperationLimiter({
    environment: "test",
    digest,
    monotonicNow: () => Number.NaN,
  });
  assert.deepEqual(
    await invalidClock.admit("profile_mutation", accountId, digest("clock"), signal),
    { status: "unavailable" },
  );
});

test("keeps Redis rejection, degradation, recovery, cancellation and closure explicit", async () => {
  const metrics: AsterOperationLimitMetricInput[] = [];
  let result: Awaited<ReturnType<AsterRedisAdapter["consumeTokenBucket"]>> = {
    status: "completed",
    allowed: false,
    remaining: 0,
    retryAfterMs: 700,
    resetAfterMs: 700,
    recovered: false,
    deduplicated: false,
  };
  let clock = 0;
  const limiter = createIdentityProfileOperationLimiter({
    environment: "local",
    digest,
    monotonicNow: () => clock++,
    recordMetric: (metric) => metrics.push(metric),
    redis: { consumeTokenBucket: () => Promise.resolve(result) },
  });
  const signal = new AbortController().signal;
  assert.deepEqual(await limiter.admit("profile_selection", accountId, digest("one"), signal), {
    status: "rejected",
    retryAfterMs: 700,
  });
  result = { status: "unavailable" };
  assert.deepEqual(await limiter.admit("profile_selection", accountId, digest("two"), signal), {
    status: "allowed",
  });
  result = {
    status: "completed",
    allowed: true,
    remaining: 15,
    retryAfterMs: 0,
    resetAfterMs: 250,
    recovered: true,
    deduplicated: false,
  };
  assert.deepEqual(await limiter.admit("profile_selection", accountId, digest("three"), signal), {
    status: "allowed",
  });
  const cancelled = new AbortController();
  cancelled.abort();
  assert.deepEqual(
    await limiter.admit("profile_selection", accountId, digest("four"), cancelled.signal),
    { status: "cancelled" },
  );
  limiter.close();
  assert.deepEqual(await limiter.admit("profile_selection", accountId, digest("five"), signal), {
    status: "unavailable",
  });
  assert.deepEqual(
    metrics.map(({ outcome }) => outcome),
    ["rejected", "local_fallback", "recovered", "cancelled", "closed"],
  );
});
