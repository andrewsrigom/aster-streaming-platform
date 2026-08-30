import assert from "node:assert/strict";
import test from "node:test";
import {
  ASTER_CIRCUIT_BREAKER_MAX_SAMPLES,
  AsterCircuitBreakerPolicyError,
  createAsterCircuitBreaker,
  type AsterCircuitBreakerObservation,
  type AsterCircuitBreakerOutcome,
  type AsterCircuitBreakerPolicy,
} from "../src/circuit-breaker.js";

function harness(overrides: Partial<AsterCircuitBreakerPolicy> = {}) {
  let current = 0;
  const observations: AsterCircuitBreakerObservation[] = [];
  const breaker = createAsterCircuitBreaker({
    samplingWindowMs: 1_000,
    minimumThroughput: 4,
    failureRateThresholdPercentage: 50,
    openDurationMs: 500,
    now: () => current,
    observe: (observation) => observations.push(observation),
    ...overrides,
  });
  return {
    breaker,
    observations,
    advance(milliseconds: number) {
      current += milliseconds;
    },
    setNow(milliseconds: number) {
      current = milliseconds;
    },
  };
}

async function execute(
  breaker: ReturnType<typeof createAsterCircuitBreaker>,
  outcome: AsterCircuitBreakerOutcome,
  value = outcome,
) {
  return breaker.execute(new AbortController().signal, () => Promise.resolve({ outcome, value }));
}

test("opens only after minimum rolling throughput reaches the configured failure rate", async () => {
  const h = harness();
  assert.equal((await execute(h.breaker, "failure")).status, "completed");
  assert.equal((await execute(h.breaker, "success")).status, "completed");
  assert.equal((await execute(h.breaker, "failure")).status, "completed");
  assert.deepEqual(h.breaker.snapshot(), {
    state: "closed",
    sampleCount: 3,
    failureCount: 2,
    openRemainingMs: 0,
  });

  assert.equal((await execute(h.breaker, "success")).status, "completed");
  assert.deepEqual(h.breaker.snapshot(), {
    state: "open",
    sampleCount: 0,
    failureCount: 0,
    openRemainingMs: 500,
  });
  assert.deepEqual(await execute(h.breaker, "success"), {
    status: "rejected",
    reason: "open",
  });
  assert.deepEqual(
    h.observations.map(({ event, state }) => `${event}:${state}`),
    [
      "failure:closed",
      "success:closed",
      "failure:closed",
      "success:closed",
      "opened:open",
      "rejected_open:open",
    ],
  );
});

test("prunes expired samples and bounds the rolling window", async () => {
  const h = harness({ minimumThroughput: 64, failureRateThresholdPercentage: 100 });
  await execute(h.breaker, "failure");
  h.advance(1_001);
  await execute(h.breaker, "success");
  assert.deepEqual(h.breaker.snapshot(), {
    state: "closed",
    sampleCount: 1,
    failureCount: 0,
    openRemainingMs: 0,
  });
  for (let index = 0; index < ASTER_CIRCUIT_BREAKER_MAX_SAMPLES + 10; index++) {
    await execute(h.breaker, "success");
  }
  assert.equal(h.breaker.snapshot().sampleCount, ASTER_CIRCUIT_BREAKER_MAX_SAMPLES);
});

test("admits exactly one half-open probe and closes only after its success", async () => {
  const h = harness({ minimumThroughput: 1, failureRateThresholdPercentage: 100 });
  await execute(h.breaker, "failure");
  h.advance(500);
  const probe = Promise.withResolvers<{
    outcome: "success";
    value: number;
  }>();
  const first = h.breaker.execute(new AbortController().signal, () => probe.promise);
  assert.equal(h.breaker.snapshot().state, "half_open");
  assert.deepEqual(await execute(h.breaker, "success"), {
    status: "rejected",
    reason: "half_open",
  });
  probe.resolve({ outcome: "success", value: 7 });
  assert.deepEqual(await first, { status: "completed", value: 7 });
  assert.deepEqual(h.breaker.snapshot(), {
    state: "closed",
    sampleCount: 0,
    failureCount: 0,
    openRemainingMs: 0,
  });
});

test("failed or inconclusive half-open probes restart the open interval", async () => {
  for (const outcome of ["failure", "ignored"] as const) {
    const h = harness({ minimumThroughput: 1, failureRateThresholdPercentage: 100 });
    await execute(h.breaker, "failure");
    h.advance(500);
    await execute(h.breaker, outcome);
    assert.deepEqual(h.breaker.snapshot(), {
      state: "open",
      sampleCount: 0,
      failureCount: 0,
      openRemainingMs: 500,
    });
    h.advance(499);
    assert.deepEqual(await execute(h.breaker, "success"), {
      status: "rejected",
      reason: "open",
    });
  }
});

test("late completions from the closed generation cannot mutate an open circuit", async () => {
  const h = harness({ minimumThroughput: 1, failureRateThresholdPercentage: 100 });
  const pending = Promise.withResolvers<{ outcome: "success"; value: string }>();
  const stale = h.breaker.execute(new AbortController().signal, () => pending.promise);
  await execute(h.breaker, "failure");
  pending.resolve({ outcome: "success", value: "late" });
  assert.deepEqual(await stale, { status: "completed", value: "late" });
  assert.equal(h.breaker.snapshot().state, "open");
  assert.equal(h.observations.at(-1)?.event, "ignored_stale");
});

test("cancelled, malformed and rejected actions remain finite", async () => {
  const h = harness({ minimumThroughput: 1, failureRateThresholdPercentage: 100 });
  assert.deepEqual(
    await h.breaker.execute(AbortSignal.abort(), () =>
      Promise.resolve({ outcome: "success", value: 1 }),
    ),
    { status: "rejected", reason: "cancelled" },
  );
  assert.deepEqual(await execute(h.breaker, "ignored"), {
    status: "completed",
    value: "ignored",
  });
  assert.equal(h.breaker.snapshot().sampleCount, 0);
  assert.deepEqual(
    await h.breaker.execute(
      new AbortController().signal,
      () => Promise.resolve({ status: "wrong" }) as never,
    ),
    { status: "failed" },
  );
  assert.equal(h.breaker.snapshot().state, "open");

  const rejected = harness({ minimumThroughput: 1, failureRateThresholdPercentage: 100 });
  assert.deepEqual(
    await rejected.breaker.execute(new AbortController().signal, () => Promise.reject(new Error())),
    { status: "failed" },
  );
  assert.equal(rejected.breaker.snapshot().state, "open");

  let invoked = false;
  const hostileSignal = Object.defineProperty({}, "aborted", {
    get: () => {
      invoked = true;
      return false;
    },
  });
  assert.deepEqual(
    await rejected.breaker.execute(hostileSignal as AbortSignal, () =>
      Promise.resolve({
        outcome: "success",
        value: true,
      }),
    ),
    { status: "failed" },
  );
  assert.equal(invoked, false);
});

test("clock regression and observer failure cannot escape finite breaker behavior", async () => {
  let current = 10;
  let calls = 0;
  const breaker = createAsterCircuitBreaker({
    samplingWindowMs: 100,
    minimumThroughput: 1,
    failureRateThresholdPercentage: 100,
    openDurationMs: 100,
    now: () => current,
    observe: () => {
      throw new Error("telemetry unavailable");
    },
  });
  await execute(breaker, "failure");
  current = 0;
  assert.equal(breaker.snapshot().openRemainingMs, 100);
  current = 110;
  assert.deepEqual(
    await breaker.execute(new AbortController().signal, () => {
      calls++;
      return Promise.resolve({ outcome: "success", value: true });
    }),
    { status: "completed", value: true },
  );
  assert.equal(calls, 1);
  assert.equal(breaker.snapshot().state, "closed");
});

test("rejects malformed, accessor and out-of-range policies", () => {
  for (const policy of [
    null,
    {},
    {
      samplingWindowMs: 99,
      minimumThroughput: 1,
      failureRateThresholdPercentage: 100,
      openDurationMs: 100,
    },
    {
      samplingWindowMs: 100,
      minimumThroughput: 65,
      failureRateThresholdPercentage: 100,
      openDurationMs: 100,
    },
    {
      samplingWindowMs: 100,
      minimumThroughput: 1,
      failureRateThresholdPercentage: 0,
      openDurationMs: 100,
    },
    {
      samplingWindowMs: 100,
      minimumThroughput: 1,
      failureRateThresholdPercentage: 100,
      openDurationMs: 100,
      now: () => Number.NaN,
    },
    Object.defineProperty(
      {
        minimumThroughput: 1,
        failureRateThresholdPercentage: 100,
        openDurationMs: 100,
      },
      "samplingWindowMs",
      { get: () => 100, enumerable: true },
    ),
  ]) {
    assert.throws(() => createAsterCircuitBreaker(policy as never), AsterCircuitBreakerPolicyError);
  }
});
