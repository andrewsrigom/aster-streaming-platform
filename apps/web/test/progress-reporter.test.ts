import assert from "node:assert/strict";
import test from "node:test";
import {
  createProgressReporter,
  type ProgressCommand,
  type ProgressSaveResult,
  type ProgressSaveStatus,
} from "../features/engagement/progress-reporter.ts";

const id = (n: number) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const sample = (positionMs: number) => ({ positionMs, durationMs: 60000 });
function fixture(sequence = 7) {
  let clock = 1000000;
  let identifiers = 100;
  let timerId = 0;
  const timers = new Map<number, { at: number; work: () => void }>();
  const calls: {
    input: ProgressCommand;
    signal: AbortSignal;
    resolve: (result: ProgressSaveResult) => void;
    reject: () => void;
  }[] = [];
  const finals: ProgressCommand[] = [];
  const statuses: ProgressSaveStatus[] = [];
  const reporter = createProgressReporter({
    profileId: id(1),
    titleId: id(2),
    playbackSessionId: id(3),
    sequence,
    now: () => clock,
    identify: () => id(++identifiers),
    schedule: (work, delayMs) => {
      const key = ++timerId;
      timers.set(key, { at: clock + delayMs, work });
      return () => {
        timers.delete(key);
      };
    },
    save: (input, signal) =>
      new Promise((resolve, reject) => {
        calls.push({
          input,
          signal,
          resolve,
          reject: () => {
            reject(new Error("Lost response."));
          },
        });
      }),
    finish: (input) => {
      finals.push(input);
    },
    onStatus: (status) => {
      statuses.push(status);
    },
  });
  return {
    reporter,
    calls,
    finals,
    statuses,
    timers,
    async advance(milliseconds: number) {
      clock += milliseconds;
      const due = [...timers.values()].filter((timer) => timer.at <= clock);
      for (const timer of due) {
        timer.work();
      }
      await Promise.resolve();
      await Promise.resolve();
    },
    async accept(index = calls.length - 1) {
      const call = calls[index];
      assert.ok(call);
      call.resolve({ code: "COMPLETED", sequence: call.input.sequence });
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

test("periodic reporting coalesces samples and only a matching acknowledgement is saved", async () => {
  const f = fixture();
  f.reporter.observe(sample(1000));
  await f.advance(14999);
  assert.equal(f.calls.length, 0);
  for (let position = 2000; position <= 12000; position += 1000) {
    f.reporter.observe(sample(position));
  }
  assert.equal(f.timers.size, 1);
  await f.advance(1);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0]?.input.positionMs, 12000);
  assert.equal(f.calls[0].input.sequence, 8);
  assert.equal(f.statuses.at(-1), "saving");
  assert.equal(f.statuses.includes("saved"), false);
  await f.accept();
  assert.equal(f.statuses.at(-1), "saved");
  f.reporter.dispose();
});

test("one active save and one latest sample remain bounded; backward seeking is new intent", async () => {
  const f = fixture();
  f.reporter.observe(sample(30000));
  f.reporter.flush();
  await f.advance(0);
  for (let position = 1000; position <= 20000; position += 1000) {
    f.reporter.observe(sample(position));
    f.reporter.flush();
  }
  assert.equal(f.calls.length, 1);
  assert.equal(f.timers.size, 0);
  await f.accept();
  assert.equal(f.statuses.at(-1), "pending");
  await f.advance(15000);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1]?.input.positionMs, 20000);
  assert.equal(f.calls[1].input.sequence, 9);
  await f.accept();
  f.reporter.dispose();
});

test("uncertain acknowledgement retries the identical immutable key and payload only once", async () => {
  const f = fixture();
  f.reporter.observe(sample(1000));
  f.reporter.flush();
  await f.advance(0);
  const first = f.calls[0];
  assert.ok(first);
  first.reject();
  await f.advance(0);
  f.reporter.observe(sample(8000));
  f.reporter.flush();
  await f.advance(1999);
  assert.equal(f.calls.length, 1);
  await f.advance(1);
  assert.strictEqual(f.calls[1]?.input, first.input);
  f.calls[1].reject();
  await f.advance(0);
  assert.equal(f.statuses.at(-1), "unconfirmed");
  f.reporter.observe(sample(9000));
  f.reporter.flush();
  await f.advance(60000);
  assert.equal(f.calls.length, 2);
  f.reporter.dispose(true);
  assert.equal(f.finals.length, 0);
});

test("rapid flushes are rate bounded and identical acknowledged samples need no new write", async () => {
  const f = fixture();
  f.reporter.observe(sample(1000));
  f.reporter.flush();
  await f.advance(0);
  await f.accept();
  f.reporter.observe(sample(1000));
  f.reporter.flush();
  await f.advance(100);
  assert.equal(f.timers.size, 0);
  f.reporter.observe(sample(2000));
  for (let n = 0; n < 100; n++) {
    f.reporter.flush();
  }
  assert.equal(f.timers.size, 1);
  await f.advance(1899);
  assert.equal(f.calls.length, 1);
  await f.advance(1);
  assert.equal(f.calls.length, 2);
  await f.accept();
  f.reporter.dispose();
});

test("stale, conflicting, denied and mismatched acknowledgements cannot claim saved or loop", async () => {
  for (const result of [
    { code: "STALE" },
    { code: "CONFLICT" },
    { code: "UNAUTHENTICATED" },
    { code: "NOT_PLAYABLE" },
    { code: "COMPLETED", sequence: 99 },
  ] as const) {
    const f = fixture();
    f.reporter.observe(sample(1000));
    f.reporter.flush();
    await f.advance(0);
    f.calls[0]?.resolve(result);
    await f.advance(60000);
    assert.equal(f.calls.length, 1);
    assert.equal(f.statuses.includes("saved"), false);
    f.reporter.dispose(true);
    assert.equal(f.finals.length, 0);
  }
});

test("profile teardown cancels old work and ignores late success without a second terminal request", async () => {
  const f = fixture();
  f.reporter.observe(sample(1000));
  f.reporter.flush();
  await f.advance(0);
  const before = [...f.statuses];
  f.reporter.dispose(true);
  assert.equal(f.calls[0]?.signal.aborted, true);
  await f.accept();
  assert.deepEqual(f.statuses, before);
  assert.equal(f.finals.length, 0);
  assert.equal(f.timers.size, 0);
  f.reporter.observe(sample(2000));
  f.reporter.flush();
  await f.advance(60000);
  assert.equal(f.calls.length, 1);
});

test("terminal flush sends at most one best-effort command and never calls it saved", () => {
  const f = fixture();
  f.reporter.observe(sample(1000));
  f.reporter.dispose(true);
  f.reporter.dispose(true);
  assert.equal(f.finals.length, 1);
  assert.equal(f.finals[0]?.sequence, 8);
  assert.equal(f.statuses.includes("saved"), false);
  assert.equal(f.timers.size, 0);
});

test("terminal retry preserves uncertain intent rather than replacing it with a newer sample", async () => {
  const f = fixture();
  f.reporter.observe(sample(1000));
  f.reporter.flush();
  await f.advance(0);
  f.calls[0]?.reject();
  await f.advance(0);
  f.reporter.observe(sample(9000));
  f.reporter.dispose(true);
  assert.strictEqual(f.finals[0], f.calls[0]?.input);
});

test("invalid samples and exhausted sequences never reach the transport", async () => {
  const f = fixture();
  for (const value of [
    sample(-1),
    sample(NaN),
    sample(0.5),
    sample(60001),
    { positionMs: 0, durationMs: 0 },
    { positionMs: 0, durationMs: 43200001 },
  ]) {
    f.reporter.observe(value);
    f.reporter.flush();
  }
  await f.advance(60000);
  assert.equal(f.calls.length, 0);
  f.reporter.dispose();
  const exhausted = fixture(2147483647);
  exhausted.reporter.observe(sample(1000));
  exhausted.reporter.flush();
  await exhausted.advance(0);
  assert.equal(exhausted.calls.length, 0);
  assert.equal(exhausted.statuses.at(-1), "unavailable");
  exhausted.reporter.dispose();
  assert.throws(() => fixture(-1), /Invalid progress reporting context/u);
});

test("returning to the acknowledged position cancels a superseded unsent sample", async () => {
  const f = fixture();
  f.reporter.observe(sample(1000));
  f.reporter.flush();
  await f.advance(0);
  await f.accept();
  f.reporter.observe(sample(5000));
  assert.equal(f.timers.size, 1);
  f.reporter.observe(sample(1000));
  assert.equal(f.statuses.at(-1), "saved");
  await f.advance(15000);
  assert.equal(f.calls.length, 1);
  f.reporter.dispose(true);
  assert.equal(f.finals.length, 0);
});

test("a successful retry releases the attempt budget for a distinct terminal intent", async () => {
  const f = fixture();
  f.reporter.observe(sample(1000));
  f.reporter.flush();
  await f.advance(0);
  f.calls[0]?.reject();
  await f.advance(0);
  await f.advance(2000);
  await f.accept();
  f.reporter.observe(sample(9000));
  f.reporter.dispose(true);
  assert.equal(f.finals.length, 1);
  assert.equal(f.finals[0]?.positionMs, 9000);
  assert.equal(f.finals[0].sequence, 9);
  assert.notEqual(f.finals[0].idempotencyKey, f.calls[0]?.input.idempotencyKey);
});
