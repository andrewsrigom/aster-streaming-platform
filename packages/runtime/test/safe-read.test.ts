import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ASTER_SAFE_READ_MAX_ATTEMPTS,
  ASTER_SAFE_READ_OBSERVATION_OUTCOMES,
  AsterSafeReadPolicyError,
  runAsterSafeRead,
  type AsterSafeReadObservation,
  type AsterSafeReadPolicy,
} from "../src/index.js";
import { runAsterSafeReadWithRuntimeForTest } from "../src/safe-read.js";
import {
  createAsterDeadlineWithSchedulerForTest,
  type AsterDeadline,
  type AsterDeadlineOptions,
} from "../src/deadline.js";

function policy(overrides: Partial<AsterSafeReadPolicy> = {}): AsterSafeReadPolicy {
  return {
    operationTimeoutMs: 1_000,
    attemptTimeoutMs: 300,
    responseReserveMs: 50,
    maxAttempts: 2,
    baseBackoffMs: 100,
    maxBackoffMs: 200,
    random: () => 0,
    ...overrides,
  };
}

function fakeDeadline(
  signal: AbortSignal,
  remainingMs: number | (() => number) = 1_000,
): AsterDeadline {
  return Object.freeze({
    signal,
    remainingMs: () =>
      signal.aborted ? 0 : typeof remainingMs === "function" ? remainingMs() : remainingMs,
    dispose: () => "disposed" as const,
  });
}

function runtime(
  options: Readonly<{
    remainingMs?: number;
    remainingMsAfterDelay?: number;
    attemptAborted?: boolean;
  }> = {},
) {
  const operation = new AbortController();
  const delays: number[] = [];
  let deadlines = 0;
  let remainingMs = options.remainingMs ?? 1_000;
  return {
    delays,
    operation,
    value: {
      createDeadline(input: AsterDeadlineOptions): AsterDeadline {
        deadlines += 1;
        if (deadlines === 1) {
          input.parentSignal?.addEventListener(
            "abort",
            () => {
              operation.abort();
            },
            { once: true },
          );
          if (input.parentSignal?.aborted) {
            operation.abort();
          }
          return fakeDeadline(operation.signal, () => remainingMs);
        }
        const attempt = new AbortController();
        operation.signal.addEventListener(
          "abort",
          () => {
            attempt.abort();
          },
          { once: true },
        );
        if (operation.signal.aborted || options.attemptAborted) {
          attempt.abort();
        }
        return fakeDeadline(attempt.signal, input.timeoutMs);
      },
      delay(milliseconds: number, signal: AbortSignal) {
        delays.push(milliseconds);
        remainingMs = options.remainingMsAfterDelay ?? remainingMs;
        return Promise.resolve(signal.aborted ? ("cancelled" as const) : ("elapsed" as const));
      },
    },
  };
}

test("safe read retries one classified transient result with bounded equal jitter", async () => {
  const observations: AsterSafeReadObservation[] = [];
  const f = runtime();
  const attempts: number[] = [];
  const result = await runAsterSafeReadWithRuntimeForTest(
    policy({
      random: () => 0.5,
      observe: (observation) => observations.push(observation),
    }),
    new AbortController().signal,
    (_signal, attempt) => {
      attempts.push(attempt);
      return Promise.resolve(
        attempt === 1
          ? ({ status: "transient" } as const)
          : ({ status: "completed", value: 7 } as const),
      );
    },
    f.value,
  );

  assert.deepEqual(result, { status: "completed", value: 7, attempts: 2 });
  assert.deepEqual(attempts, [1, 2]);
  assert.deepEqual(f.delays, [75]);
  assert.deepEqual(observations, [
    { attempt: 1, outcome: "transient" },
    { attempt: 1, outcome: "retry_scheduled", delayMs: 75 },
    { attempt: 2, outcome: "completed" },
  ]);
});

test("safe read stops on permanent failure, thrown work, and the attempt ceiling", async () => {
  for (const first of [
    () => Promise.resolve({ status: "permanent" } as const),
    () => Promise.reject(new Error("private dependency detail")),
  ]) {
    const f = runtime();
    let calls = 0;
    assert.deepEqual(
      await runAsterSafeReadWithRuntimeForTest(
        policy(),
        new AbortController().signal,
        () => {
          calls += 1;
          return first();
        },
        f.value,
      ),
      { status: "unavailable", attempts: 1 },
    );
    assert.equal(calls, 1);
    assert.deepEqual(f.delays, []);
  }

  const f = runtime();
  let calls = 0;
  assert.deepEqual(
    await runAsterSafeReadWithRuntimeForTest(
      policy({ maxAttempts: ASTER_SAFE_READ_MAX_ATTEMPTS, random: () => 1 }),
      new AbortController().signal,
      () => {
        calls += 1;
        return Promise.resolve({ status: "transient" });
      },
      f.value,
    ),
    { status: "unavailable", attempts: 3 },
  );
  assert.equal(calls, 3);
  assert.deepEqual(f.delays, [100, 200]);
});

test("safe read refuses retry when the remaining deadline cannot cover delay, attempt and reserve", async () => {
  const observations: AsterSafeReadObservation[] = [];
  const f = runtime({ remainingMs: 349 });
  let calls = 0;
  assert.deepEqual(
    await runAsterSafeReadWithRuntimeForTest(
      policy({ observe: (observation) => observations.push(observation) }),
      new AbortController().signal,
      () => {
        calls += 1;
        return Promise.resolve({ status: "transient" });
      },
      f.value,
    ),
    { status: "unavailable", attempts: 1 },
  );
  assert.equal(calls, 1);
  assert.deepEqual(f.delays, []);
  assert.deepEqual(observations.at(-1), { attempt: 1, outcome: "budget_exhausted" });

  const delayedObservations: AsterSafeReadObservation[] = [];
  const delayed = runtime({ remainingMs: 1_000, remainingMsAfterDelay: 349 });
  calls = 0;
  assert.deepEqual(
    await runAsterSafeReadWithRuntimeForTest(
      policy({ observe: (observation) => delayedObservations.push(observation) }),
      new AbortController().signal,
      () => {
        calls += 1;
        return Promise.resolve({ status: "transient" });
      },
      delayed.value,
    ),
    { status: "unavailable", attempts: 1 },
  );
  assert.equal(calls, 1);
  assert.deepEqual(delayed.delays, [50]);
  assert.deepEqual(delayedObservations.at(-1), {
    attempt: 1,
    outcome: "budget_exhausted",
  });
});

test("safe read uses the propagated parent deadline as its retry budget", async () => {
  const scheduler = {
    now: () => 0,
    schedule: () => () => undefined,
  };
  const parent = createAsterDeadlineWithSchedulerForTest({ timeoutMs: 399 }, scheduler);
  const delays: number[] = [];
  let calls = 0;
  const result = await runAsterSafeReadWithRuntimeForTest(
    policy(),
    parent.signal,
    () => {
      calls += 1;
      return Promise.resolve({ status: "transient" });
    },
    {
      createDeadline: (options) => createAsterDeadlineWithSchedulerForTest(options, scheduler),
      delay: (milliseconds) => {
        delays.push(milliseconds);
        return Promise.resolve("elapsed");
      },
    },
  );

  assert.deepEqual(result, { status: "unavailable", attempts: 1 });
  assert.equal(calls, 1);
  assert.deepEqual(delays, []);
  parent.dispose();
});

test("safe read does not retry an attempt timeout or caller cancellation", async () => {
  const timed = runtime({ attemptAborted: true });
  let timedCalls = 0;
  assert.deepEqual(
    await runAsterSafeReadWithRuntimeForTest(
      policy(),
      new AbortController().signal,
      () => {
        timedCalls += 1;
        return Promise.resolve({ status: "completed", value: true });
      },
      timed.value,
    ),
    { status: "unavailable", attempts: 1 },
  );
  assert.equal(timedCalls, 0);

  const parent = new AbortController();
  parent.abort();
  const cancelled = runtime();
  assert.deepEqual(
    await runAsterSafeReadWithRuntimeForTest(
      policy(),
      parent.signal,
      () => Promise.resolve({ status: "completed", value: true }),
      cancelled.value,
    ),
    { status: "cancelled", attempts: 0 },
  );
});

test("safe read cancellation during backoff prevents the next attempt", async () => {
  const parent = new AbortController();
  const f = runtime();
  f.value.delay = (milliseconds: number) => {
    f.delays.push(milliseconds);
    parent.abort();
    f.operation.abort();
    return Promise.resolve("cancelled" as const);
  };
  let calls = 0;
  assert.deepEqual(
    await runAsterSafeReadWithRuntimeForTest(
      policy(),
      parent.signal,
      () => {
        calls += 1;
        return Promise.resolve({ status: "transient" });
      },
      f.value,
    ),
    { status: "cancelled", attempts: 1 },
  );
  assert.equal(calls, 1);
  assert.deepEqual(f.delays, [50]);
});

test("safe-read policies and observations have finite public vocabularies", async () => {
  assert.equal(Object.isFrozen(ASTER_SAFE_READ_OBSERVATION_OUTCOMES), true);
  for (const invalid of [
    policy({ maxAttempts: 0 }),
    policy({ maxAttempts: ASTER_SAFE_READ_MAX_ATTEMPTS + 1 }),
    policy({ operationTimeoutMs: 300 }),
    policy({ baseBackoffMs: 201 }),
    policy({ random: undefined as unknown as () => number }),
  ]) {
    await assert.rejects(
      runAsterSafeRead(invalid, new AbortController().signal, () =>
        Promise.resolve({ status: "completed", value: true }),
      ),
      AsterSafeReadPolicyError,
    );
  }

  const observations: AsterSafeReadObservation[] = [];
  const f = runtime();
  assert.deepEqual(
    await runAsterSafeReadWithRuntimeForTest(
      policy({
        random: () => Number.NaN,
        observe: (observation) => {
          observations.push(observation);
          throw new Error("optional observer failure");
        },
      }),
      new AbortController().signal,
      () => Promise.resolve({ status: "transient" }),
      f.value,
    ),
    { status: "unavailable", attempts: 1 },
  );
  assert.deepEqual(
    observations.map(({ outcome }) => outcome),
    ["transient", "permanent"],
  );
});

test("safe read rejects accessor policies and hostile attempt results without invoking them", async () => {
  let reads = 0;
  const accessorPolicy = { ...policy() };
  Object.defineProperty(accessorPolicy, "random", {
    enumerable: true,
    get(): () => number {
      reads += 1;
      return () => 0;
    },
  });
  await assert.rejects(
    runAsterSafeRead(accessorPolicy, new AbortController().signal, () =>
      Promise.resolve({ status: "completed", value: true }),
    ),
    AsterSafeReadPolicyError,
  );
  assert.equal(reads, 0);

  const f = runtime();
  const hostile = {};
  Object.defineProperty(hostile, "status", {
    enumerable: true,
    get(): string {
      reads += 1;
      return "transient";
    },
  });
  assert.deepEqual(
    await runAsterSafeReadWithRuntimeForTest(
      policy(),
      new AbortController().signal,
      () => Promise.resolve(hostile as { status: "transient" }),
      f.value,
    ),
    { status: "unavailable", attempts: 1 },
  );
  assert.equal(reads, 0);
});

test("dependency registry covers every current operation class and names one retry owner", async () => {
  const registry = await readFile(
    new URL("../../../../docs/architecture/DEPENDENCY_POLICY_REGISTRY.md", import.meta.url),
    "utf8",
  );
  const rows = registry
    .split("\n")
    .filter((line) => line.startsWith("| `"))
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
  const expected = [
    "web.public-query",
    "web.protected-mutation",
    "router.catalog-identity",
    "router.playback-engagement",
    "router.discovery",
    "owner.playback-publication",
    "owner.discovery-snapshot",
    "owner.engagement-authority",
    "postgres.read",
    "postgres.write",
    "redis.cache",
    "redis.admission",
    "broker.publish",
    "broker.consume",
    "object.read",
    "object.write-delete",
    "media.source-download",
    "media.ffmpeg",
    "telemetry.export",
  ];
  assert.equal(rows.length, expected.length);
  assert.deepEqual(
    rows.map(([id]) => id?.replaceAll("`", "")),
    expected,
  );
  assert.ok(rows.every((row) => row.length === 11 && row.every((cell) => cell.length > 0)));
  assert.ok(rows.filter(([id]) => id?.startsWith("`router.")).every((row) => row[10] === "none"));
  assert.equal(
    rows.find(([id]) => id === "`owner.playback-publication`")?.[10],
    "Playback Catalog client",
  );
  assert.equal(
    rows.find(([id]) => id === "`owner.discovery-snapshot`")?.[10],
    "Discovery Catalog client",
  );
  for (const field of [
    "Role / safety",
    "Overall and attempt timeout",
    "Attempts and backoff",
    "Breaker",
    "Bulkhead / queue",
    "Fallback",
    "Telemetry",
    "User outcome",
    "Retry owner",
  ]) {
    assert.match(registry, new RegExp(`\\| ${field.replace("/", "\\/")}`));
  }
});
