import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceProgress,
  DEFAULT_PROGRESS_POLICY,
  normalizeProgressInput,
  normalizeProgressState,
  normalizeProgressPolicy,
  progressRequestPayload,
  type ProgressInput,
  type ProgressState,
} from "../src/domain/progress.js";

const id = (value: number) => "00000000-0000-4000-8000-" + String(value).padStart(12, "0");
const now = 1_787_910_000;
const context = { aggregateId: id(1), accountId: id(2), now, policy: DEFAULT_PROGRESS_POLICY };
const report = (patch: Partial<ProgressInput> = {}): ProgressInput => ({
  profileId: id(3),
  titleId: id(4),
  playbackSessionId: id(5),
  idempotencyKey: id(6),
  sequence: 1,
  positionMs: 1000,
  durationMs: 6000,
  occurredAt: now,
  ...patch,
});
const accepted = (input = report(), current: ProgressState | null = null, clock = context) => {
  const result = advanceProgress(current, input, clock);
  assert.equal(result.status, "accepted");
  return result.value;
};

test("six-second demo has precise opening and completion edges", () => {
  for (const [positionMs, status] of [
    [0, "NOT_STARTED"],
    [299, "NOT_STARTED"],
    [300, "NOT_STARTED"],
    [301, "IN_PROGRESS"],
    [5699, "IN_PROGRESS"],
    [5700, "COMPLETED"],
    [6000, "COMPLETED"],
  ] as const) {
    assert.equal(accepted(report({ positionMs })).status, status);
  }
});

test("long-title thresholds cap opening and remaining tail, not total watched percentage", () => {
  const durationMs = 3_600_000;
  assert.equal(accepted(report({ durationMs, positionMs: 30_000 })).status, "NOT_STARTED");
  assert.equal(accepted(report({ durationMs, positionMs: 30_001 })).status, "IN_PROGRESS");
  assert.equal(accepted(report({ durationMs, positionMs: 3_420_000 })).status, "IN_PROGRESS");
  assert.equal(accepted(report({ durationMs, positionMs: 3_569_999 })).status, "IN_PROGRESS");
  assert.equal(accepted(report({ durationMs, positionMs: 3_570_000 })).status, "COMPLETED");
});

test("clamps impossible positions while retaining raw payload identity", () => {
  assert.equal(accepted(report({ positionMs: -1000 })).positionMs, 0);
  const first = report({ positionMs: 7000 });
  const second = report({ positionMs: 8000 });
  assert.equal(accepted(first).positionMs, 6000);
  assert.equal(accepted(second).positionMs, 6000);
  assert.notEqual(progressRequestPayload(first), progressRequestPayload(second));
  assert.equal(accepted(report({ durationMs: 1, positionMs: 1 })).status, "COMPLETED");
});

test("sequence is per profile/title across sessions and rejects every stale delivery", () => {
  const current = accepted(report({ sequence: 50, positionMs: 5000 }));
  const snapshot = structuredClone(current);
  for (let sequence = 1; sequence <= 50; sequence++) {
    assert.equal(
      advanceProgress(
        current,
        report({ sequence, positionMs: 100, playbackSessionId: id(9) }),
        context,
      ).status,
      "stale",
    );
  }
  assert.deepEqual(current, snapshot);
  assert.ok(Object.isFrozen(current));
  const next = accepted(
    report({ sequence: 51, positionMs: 2000, playbackSessionId: id(9) }),
    current,
  );
  assert.equal(next.positionMs, 2000);
  assert.equal(next.version, 2);
  assert.equal(next.playbackSessionId, id(9));
});

test("newer intentional seek or replay may make a completed title resumable again", () => {
  const completed = accepted(report({ positionMs: 6000 }));
  const replay = accepted(report({ sequence: 2, positionMs: 2000 }), completed);
  assert.equal(completed.status, "COMPLETED");
  assert.equal(replay.status, "IN_PROGRESS");
  assert.equal(replay.id, completed.id);
});

test("profile, title, account and aggregate substitutions cannot reuse another state", () => {
  const current = accepted();
  for (const input of [
    report({ profileId: id(7), sequence: 2 }),
    report({ titleId: id(8), sequence: 2 }),
  ]) {
    assert.equal(advanceProgress(current, input, context).status, "invalid_state");
  }
  for (const patch of [{ aggregateId: id(7) }, { accountId: id(8) }, { now: now - 1 }]) {
    assert.equal(
      advanceProgress(current, report({ sequence: 2 }), { ...context, ...patch }).status,
      "invalid_state",
    );
  }
});

test("new reports enforce exact clock-skew and delivery-age bounds", () => {
  for (const occurredAt of [now - 120, now, now + 30]) {
    accepted(report({ occurredAt }));
  }
  for (const occurredAt of [now - 121, now + 31]) {
    assert.equal(advanceProgress(null, report({ occurredAt }), context).status, "invalid_input");
  }
  for (const invalid of [-1, NaN, Infinity, 1.5, 253_402_300_800]) {
    assert.equal(
      advanceProgress(null, report(), { ...context, now: invalid }).status,
      "invalid_state",
    );
  }
});

test("rejects malformed bounds, unknown keys, accessors and hostile records without invoking getters", () => {
  for (const value of [
    null,
    [],
    "bad",
    { ...report(), accountId: id(2) },
    { ...report(), [Symbol("extra")]: 1 },
  ]) {
    assert.equal(normalizeProgressInput(value), undefined);
  }
  for (const key of ["profileId", "titleId", "playbackSessionId", "idempotencyKey"]) {
    assert.equal(normalizeProgressInput({ ...report(), [key]: "x".repeat(4097) }), undefined);
  }
  for (const [key, values] of [
    ["sequence", [0, -1, 1.5, 2_147_483_648, NaN, Infinity, "1"]],
    ["positionMs", [-43_200_001, 43_200_001, NaN, Infinity, 1.5]],
    ["durationMs", [0, -1, 43_200_001, NaN, Infinity, 1.5]],
    ["occurredAt", [-1, NaN, Infinity, 1.5, 253_402_300_800]],
  ] as const) {
    for (const value of values) {
      assert.equal(normalizeProgressInput({ ...report(), [key]: value }), undefined);
    }
  }
  let getterCalls = 0;
  const accessor = Object.defineProperty({ ...report() }, "positionMs", {
    get() {
      getterCalls++;
      return 1;
    },
  });
  assert.equal(normalizeProgressInput(accessor), undefined);
  assert.equal(getterCalls, 0);
  assert.equal(
    normalizeProgressInput(
      new Proxy(
        {},
        {
          getPrototypeOf() {
            throw new Error("hostile");
          },
        },
      ),
    ),
    undefined,
  );
  assert.ok(normalizeProgressInput(Object.assign(Object.create(null) as object, report())));
});

test("policy is validated configuration, not client input or an unbounded threshold", () => {
  assert.deepEqual(normalizeProgressPolicy(DEFAULT_PROGRESS_POLICY), DEFAULT_PROGRESS_POLICY);
  for (const patch of [
    { openingSeconds: -1 },
    { openingSeconds: 301 },
    { openingFraction: NaN },
    { openingFraction: 1 },
    { completionFraction: 0.01 },
    { completionFraction: 1.01 },
    { completionTailSeconds: 3601 },
    { completionTailSeconds: 0.5 },
    { extra: true },
  ]) {
    assert.equal(normalizeProgressPolicy({ ...DEFAULT_PROGRESS_POLICY, ...patch }), undefined);
  }
  const policy = {
    openingSeconds: 1,
    openingFraction: 0.1,
    completionFraction: 0.8,
    completionTailSeconds: 1,
  };
  assert.equal(
    accepted(report({ positionMs: 600 }), null, { ...context, policy }).status,
    "NOT_STARTED",
  );
  assert.equal(
    accepted(report({ positionMs: 601 }), null, { ...context, policy }).status,
    "IN_PROGRESS",
  );
  assert.equal(
    accepted(report({ positionMs: 5000 }), null, { ...context, policy }).status,
    "COMPLETED",
  );
});

test("corrupt or exhausted durable state cannot overflow its version", () => {
  const current = accepted();
  for (const patch of [
    { version: 2_147_483_647 },
    { version: 0 },
    { sequence: 0 },
    { positionMs: -1 },
    { positionMs: 7000 },
    { durationMs: 0 },
    { occurredAt: Infinity },
  ]) {
    assert.equal(
      advanceProgress({ ...current, ...patch }, report({ sequence: 2 }), context).status,
      "invalid_state",
    );
  }
});

test("canonical request payload ignores object key order, never loses submitted fields", () => {
  const first = report();
  const reversed = normalizeProgressInput(Object.fromEntries(Object.entries(first).reverse()));
  assert.ok(reversed);
  assert.equal(progressRequestPayload(first), progressRequestPayload(reversed));
  for (const patch of [
    { sequence: 2 },
    { durationMs: 7000 },
    { occurredAt: now + 1 },
    { playbackSessionId: id(7) },
  ]) {
    assert.notEqual(progressRequestPayload(first), progressRequestPayload(report(patch)));
  }
});

test("durable-state validation does not invoke accessors or coerce a forged status", () => {
  const state = accepted();
  let calls = 0;
  const accessor = Object.defineProperty({ ...state }, "status", {
    get() {
      calls++;
      return "COMPLETED";
    },
  });
  assert.equal(normalizeProgressState(accessor), undefined);
  assert.equal(advanceProgress(accessor, report({ sequence: 2 }), context).status, "invalid_state");
  assert.equal(
    normalizeProgressState({
      ...state,
      status: {
        toString() {
          calls++;
          return "COMPLETED";
        },
      },
    }),
    undefined,
  );
  assert.equal(calls, 0);
});
