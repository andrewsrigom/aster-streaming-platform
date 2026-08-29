import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createProgressRecorder } from "../src/application/record-progress.js";
import {
  DEFAULT_PROGRESS_POLICY,
  type ProgressInput,
  type ProgressState,
} from "../src/domain/progress.js";
import type { ProgressRecordedEvent } from "../src/domain/progress-event.js";
import type {
  ProgressPorts,
  ProgressReceipt,
  ProgressRequest,
} from "../src/application/progress-ports.js";

const id = (value: number) => "00000000-0000-4000-8000-" + String(value).padStart(12, "0");
const start = 1_787_910_000;
const input = (patch: Partial<ProgressInput> = {}): ProgressInput => ({
  profileId: id(3),
  titleId: id(4),
  playbackSessionId: id(5),
  idempotencyKey: id(6),
  sequence: 1,
  positionMs: 1000,
  durationMs: 6000,
  occurredAt: start,
  ...patch,
});
function fixture() {
  let now = start;
  let sequence = 100;
  let inTransaction = false;
  let current: ProgressState | null = null;
  let receipts: ProgressReceipt[] = [];
  let events: ProgressRecordedEvent[] = [];
  const control = {
    deleted: false,
    ambiguous: false,
    receipts: 0,
    outbox: 0,
    afterOutbox: (): void => undefined,
  };
  const calls = { identity: 0, playback: 0, receipt: 0, transaction: 0 };
  const owner = () => ({
    accountId: id(2),
    profileId: id(3),
    checkedAt: now,
    expiresAt: now + 900,
  });
  const controller = new AbortController();
  const request: ProgressRequest = {
    credential: "synthetic-credential",
    correlationId: id(9),
    signal: controller.signal,
  };
  const ports: ProgressPorts = {
    identity: {
      authorizeProfile: () => {
        assert.equal(inTransaction, false);
        calls.identity++;
        return Promise.resolve({ status: "completed", value: owner() });
      },
    },
    playback: {
      inspect: () => {
        assert.equal(inTransaction, false);
        calls.playback++;
        return Promise.resolve({
          status: "completed",
          value: {
            sessionId: id(5),
            titleId: id(4),
            checkedAt: now,
            createdAt: start,
            expiresAt: start + 900,
          },
        });
      },
    },
    receipts: {
      read: (_key, receiptId) => {
        assert.equal(inTransaction, false);
        calls.receipt++;
        return Promise.resolve({
          status: "completed",
          value: receipts.find((entry) => entry.idempotencyKey === receiptId) ?? null,
        });
      },
    },
    transactions: {
      run: async (work, signal) => {
        calls.transaction++;
        inTransaction = true;
        let draftCurrent = structuredClone(current);
        let draftReceipts = structuredClone(receipts);
        const draftEvents = structuredClone(events);
        try {
          const result = await work({
            lock: () => Promise.resolve({ deleted: control.deleted, current: draftCurrent }),
            pruneReceipts: (_key, time, maximum) => {
              let removed = 0;
              draftReceipts = draftReceipts.filter(
                (entry) => entry.expiresAt > time || removed++ >= maximum,
              );
              return Promise.resolve();
            },
            findReceipt: (_key, receiptId) =>
              Promise.resolve(
                draftReceipts.find((entry) => entry.idempotencyKey === receiptId) ?? null,
              ),
            retainedCounts: () =>
              Promise.resolve({
                receipts: draftReceipts.length + control.receipts,
                outbox: draftEvents.length + control.outbox,
              }),
            save: (progress) => {
              draftCurrent = progress;
              return Promise.resolve();
            },
            writeReceipt: (receipt) => {
              draftReceipts.push(receipt);
              return Promise.resolve();
            },
            appendOutbox: (event) => {
              draftEvents.push(event);
              control.afterOutbox();
              return Promise.resolve();
            },
          });
          if (result.status === "completed" && !signal.aborted) {
            current = draftCurrent;
            receipts = draftReceipts;
            events = draftEvents;
            if (control.ambiguous) {
              return { status: "indeterminate" };
            }
          }
          return result;
        } catch {
          return { status: "unavailable" };
        } finally {
          inTransaction = false;
        }
      },
    },
    now: () => now,
    nextId: () => id(sequence++),
    digest: (value) => createHash("sha256").update(value).digest("hex"),
    policy: DEFAULT_PROGRESS_POLICY,
    limits: { receiptSeconds: 3600, maximumReceipts: 512, maximumOutbox: 512 },
  };
  const recorder = createProgressRecorder(ports);
  return {
    ports,
    recorder,
    request,
    controller,
    owner,
    calls,
    control,
    setTime: (value: number) => {
      now = value;
    },
    state: () => structuredClone({ current, receipts, events }),
  };
}

test("authorized update intends state, receipt and v1 event in one transaction; owner reads stay outside", async () => {
  const f = fixture();
  const result = await f.recorder.record(input(), f.request);
  assert.equal(result.status, "completed");
  assert.equal(result.value.sequence, 1);
  const saved = f.state();
  assert.equal(saved.receipts.length, 1);
  assert.equal(saved.events.length, 1);
  const event = saved.events[0];
  assert.ok(event);
  assert.ok(saved.current);
  assert.deepEqual(saved.receipts[0]?.result, saved.current);
  assert.equal(event.aggregate.version, saved.current.version);
  assert.equal(event.eventType, "engagement.progress-recorded");
  assert.equal(event.schemaVersion, 1);
  assert.equal(event.occurredAt, new Date(start * 1000).toISOString());
  assert.doesNotMatch(
    JSON.stringify(saved.events),
    /credential|accountId|playbackSessionId|https?:|cookie|manifest/iu,
  );
  assert.deepEqual(f.calls, { identity: 1, playback: 1, receipt: 1, transaction: 1 });
});

test("exact replay survives playback expiry and returns the original result even after newer progress", async () => {
  const f = fixture();
  const first = await f.recorder.record(input(), f.request);
  await f.recorder.record(
    input({ sequence: 2, idempotencyKey: id(7), positionMs: 2000 }),
    f.request,
  );
  f.setTime(start + 901);
  const again = await f.recorder.record(input(), f.request);
  assert.deepEqual(again, first);
  assert.equal(f.calls.playback, 2);
  assert.equal(f.calls.transaction, 2);
  assert.equal(f.calls.identity, 3);
  assert.equal(f.state().current?.sequence, 2);
  assert.equal(f.state().events.length, 2);
});

test("operation admission follows owner and replay but precedes Playback and persistence", async () => {
  const rejected = fixture();
  let admissions = 0;
  const recorder = createProgressRecorder({
    ...rejected.ports,
    limiter: {
      admit: (_operation, accountId) => {
        admissions++;
        assert.equal(accountId, id(2));
        return Promise.resolve({ status: "rejected", retryAfterMs: 250 });
      },
    },
  });
  assert.deepEqual(await recorder.record(input(), rejected.request), {
    status: "limit_exceeded",
    retryAfterMs: 250,
  });
  assert.equal(admissions, 1);
  assert.deepEqual(rejected.calls, { identity: 1, playback: 0, receipt: 1, transaction: 0 });

  const replayed = fixture();
  const first = await replayed.recorder.record(input(), replayed.request);
  const replayRecorder = createProgressRecorder({
    ...replayed.ports,
    limiter: {
      admit: () => {
        throw new Error("must not admit replay");
      },
    },
  });
  assert.deepEqual(await replayRecorder.record(input(), replayed.request), first);
});

test("same key with changed raw payload conflicts even when positions clamp to the same value", async () => {
  const f = fixture();
  await f.recorder.record(input({ positionMs: 7000 }), f.request);
  assert.equal(
    (await f.recorder.record(input({ positionMs: 8000 }), f.request)).status,
    "conflict",
  );
  assert.equal(f.state().events.length, 1);
  assert.equal(f.calls.playback, 1);
});

test("a key belongs to the profile request, so changing title conflicts before Playback or SQL writes", async () => {
  const f = fixture();
  await f.recorder.record(input(), f.request);
  const before = f.state();
  const calls = { ...f.calls };
  assert.equal((await f.recorder.record(input({ titleId: id(44) }), f.request)).status, "conflict");
  assert.deepEqual(f.state(), before);
  assert.equal(f.calls.playback, calls.playback);
  assert.equal(f.calls.transaction, calls.transaction);
});

test("new key with stale sequence cannot change state or create receipt/event", async () => {
  const f = fixture();
  await f.recorder.record(input({ sequence: 10 }), f.request);
  const snapshot = f.state();
  assert.equal(
    (await f.recorder.record(input({ sequence: 9, idempotencyKey: id(7) }), f.request)).status,
    "stale",
  );
  assert.deepEqual(f.state(), snapshot);
});

test("missing credentials, wrong owner and malformed request stop before receipt disclosure", async () => {
  for (const credential of [undefined, "", "x".repeat(4097)]) {
    const f = fixture();
    assert.equal(
      (await f.recorder.record(input(), { ...f.request, credential })).status,
      "unauthenticated",
    );
    assert.equal(f.calls.receipt, 0);
  }
  const f = fixture();
  f.ports.identity.authorizeProfile = () => Promise.resolve({ status: "not_found" });
  assert.equal((await f.recorder.record(input(), f.request)).status, "not_found");
  assert.equal(f.calls.receipt, 0);
  assert.equal(
    (await f.recorder.record({ ...input(), accountId: id(2) }, f.request)).status,
    "invalid_input",
  );
  assert.equal(
    (await f.recorder.record(input(), { ...f.request, traceparent: "forged" })).status,
    "invalid_input",
  );
});

test("malformed or expired owner snapshots and substituted playback IDs fail closed", async () => {
  for (const patch of [
    { accountId: "wrong" },
    { profileId: id(8) },
    { checkedAt: start - 3 },
    { expiresAt: start },
  ]) {
    const f = fixture();
    f.ports.identity.authorizeProfile = () =>
      Promise.resolve({
        status: "completed",
        value: { ...f.owner(), ...patch },
      });
    assert.equal((await f.recorder.record(input(), f.request)).status, "unavailable");
    assert.equal(f.calls.receipt, 0);
  }
  for (const patch of [
    { titleId: id(8) },
    { sessionId: id(8) },
    { expiresAt: start },
    { checkedAt: start + 1 },
  ]) {
    const f = fixture();
    f.ports.playback.inspect = () =>
      Promise.resolve({
        status: "completed",
        value: {
          sessionId: id(5),
          titleId: id(4),
          checkedAt: start,
          createdAt: start,
          expiresAt: start + 900,
          ...patch,
        },
      });
    assert.equal((await f.recorder.record(input(), f.request)).status, "not_playable");
    assert.equal(f.calls.transaction, 0);
  }
});

test("a deleted-profile tombstone and receipt/outbox capacity roll back the whole attempt", async () => {
  for (const [patch, status] of [
    [{ deleted: true }, "not_found"],
    [{ receipts: 512 }, "backpressure"],
    [{ outbox: 512 }, "backpressure"],
  ] as const) {
    const f = fixture();
    Object.assign(f.control, patch);
    assert.equal((await f.recorder.record(input(), f.request)).status, status);
    assert.deepEqual(f.state(), { current: null, receipts: [], events: [] });
  }
});

test("expiry or exception after outbox append cannot leave partial acknowledged effects", async () => {
  for (const mode of ["expiry", "exception"] as const) {
    const f = fixture();
    f.control.afterOutbox = () => {
      if (mode === "exception") {
        throw new Error("synthetic commit failure");
      }
      f.setTime(start + 3);
    };
    assert.equal(
      (await f.recorder.record(input(), f.request)).status,
      mode === "expiry" ? "not_playable" : "unavailable",
    );
    assert.deepEqual(f.state(), { current: null, receipts: [], events: [] });
  }
});

test("ambiguous commit can be retried with the same key without duplicating effects", async () => {
  const f = fixture();
  f.control.ambiguous = true;
  assert.equal((await f.recorder.record(input(), f.request)).status, "indeterminate");
  const result = await f.recorder.record(input(), f.request);
  assert.equal(result.status, "completed");
  assert.equal(f.state().events.length, 1);
  assert.equal(f.calls.transaction, 1);
});

test("cancelled owner lookup consumes a late result without starting persistence", async () => {
  const f = fixture();
  let enter: () => void = () => undefined;
  let finish: () => void = () => undefined;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  f.ports.identity.authorizeProfile = () =>
    new Promise((resolve) => {
      finish = () => {
        resolve({ status: "completed", value: f.owner() });
      };
      enter();
    });
  const pending = f.recorder.record(input(), f.request);
  await entered;
  f.controller.abort();
  assert.equal((await pending).status, "cancelled");
  finish();
  await Promise.resolve();
  assert.equal(f.calls.receipt, 0);
  assert.equal(f.calls.transaction, 0);
});

test("foreign receipt cannot be replayed under a different authorized account", async () => {
  const f = fixture();
  await f.recorder.record(input(), f.request);
  f.ports.identity.authorizeProfile = () =>
    Promise.resolve({
      status: "completed",
      value: { ...f.owner(), accountId: id(8) },
    });
  assert.equal((await f.recorder.record(input(), f.request)).status, "unavailable");
  assert.equal(f.calls.transaction, 1);
});

test("racing receipt replay rechecks Identity after the locked receipt read", async () => {
  const f = fixture();
  await f.recorder.record(input(), f.request);
  f.ports.receipts.read = () => Promise.resolve({ status: "completed", value: null });
  const run = f.ports.transactions.run.bind(f.ports.transactions);
  f.ports.transactions.run = (work, signal) =>
    run(
      (tx) =>
        work({
          ...tx,
          findReceipt: async (key, receiptId) => {
            const receipt = await tx.findReceipt(key, receiptId);
            f.setTime(start + 3);
            return receipt;
          },
        }),
      signal,
    );
  assert.equal((await f.recorder.record(input(), f.request)).status, "not_found");
  assert.equal(f.state().events.length, 1);
});

test("owner reads and outbox carry validated correlation and trace without browser authority claims", async () => {
  const f = fixture();
  const traceparent = "00-" + "a".repeat(32) + "-" + "b".repeat(16) + "-01";
  const originalIdentity = f.ports.identity.authorizeProfile.bind(f.ports.identity);
  const originalPlayback = f.ports.playback.inspect.bind(f.ports.playback);
  f.ports.identity.authorizeProfile = (credential, profileId, request) => {
    assert.equal(request.correlationId, f.request.correlationId);
    assert.equal(request.traceparent, traceparent);
    assert.ok(request.signal instanceof AbortSignal);
    return originalIdentity(credential, profileId, request);
  };
  f.ports.playback.inspect = (sessionId, titleId, request) => {
    assert.equal(request.correlationId, f.request.correlationId);
    assert.equal(request.traceparent, traceparent);
    return originalPlayback(sessionId, titleId, request);
  };
  assert.equal(
    (await f.recorder.record(input(), { ...f.request, traceparent })).status,
    "completed",
  );
  assert.deepEqual(f.state().events[0]?.trace, { traceparent });
});

test("retention limits and terminal timestamps cannot create an overflowing receipt", async () => {
  const f = fixture();
  for (const limits of [
    { ...f.ports.limits, receiptSeconds: 0 },
    { ...f.ports.limits, maximumOutbox: 10001 },
    { ...f.ports.limits, maximumReceipts: NaN },
  ]) {
    assert.throws(() => createProgressRecorder({ ...f.ports, limits }));
  }
  const now = 253_402_300_798;
  f.setTime(now);
  f.ports.identity.authorizeProfile = () =>
    Promise.resolve({ status: "completed", value: { ...f.owner(), expiresAt: now + 1 } });
  f.ports.playback.inspect = () =>
    Promise.resolve({
      status: "completed",
      value: {
        sessionId: id(5),
        titleId: id(4),
        checkedAt: now,
        createdAt: now,
        expiresAt: now + 1,
      },
    });
  assert.equal(
    (await f.recorder.record(input({ occurredAt: now }), f.request)).status,
    "unavailable",
  );
  assert.equal(f.state().receipts.length, 0);
});
