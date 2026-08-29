import assert from "node:assert/strict";
import test from "node:test";
import { createProjectionRebuilder } from "../src/application/rebuild-projection.js";
import type { RebuildStore } from "../src/application/rebuild-ports.js";
import {
  DISCOVERY_BOOTSTRAP_GENERATION,
  DISCOVERY_REFRESH_AFTER_SECONDS,
  normalizeBrokerOffsets,
  normalizeRebuildCheckpoint,
  normalizeRebuildHandledOffset,
  normalizeRebuildStart,
  offsetsCover,
  projectionRefreshDue,
} from "../src/domain/rebuild-state.js";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const now = 1_700_000_000;

test("broker barriers are bounded, canonical and compared without numeric precision loss", () => {
  const barrier = normalizeBrokerOffsets({ 10: "9223372036854775807", 0: "9", 2: "10" });
  assert.deepEqual(barrier, { 0: "9", 2: "10", 10: "9223372036854775807" });
  assert.ok(barrier);
  assert.equal(offsetsCover({ 0: "10", 2: "10", 10: "9223372036854775807" }, barrier), true);
  assert.equal(offsetsCover({ 0: "8", 2: "11", 10: "9223372036854775807" }, barrier), false);
  assert.equal(offsetsCover({}, { 0: "0" }), true);
  assert.equal(offsetsCover({}, { 0: "1" }), false);
});

test("active projections refresh before their finite visibility leases expire", () => {
  assert.equal(
    projectionRefreshDue({ generation: DISCOVERY_BOOTSTRAP_GENERATION, startedAt: 0 }, now),
    true,
  );
  assert.equal(projectionRefreshDue({ generation: id(91), startedAt: now - 149 }, now), false);
  assert.equal(
    projectionRefreshDue(
      { generation: id(91), startedAt: now - DISCOVERY_REFRESH_AFTER_SECONDS },
      now,
    ),
    true,
  );
  assert.equal(projectionRefreshDue({ generation: id(91), startedAt: now + 1 }, now), undefined);
  assert.equal(projectionRefreshDue({ generation: id(91), startedAt: now }, Number.NaN), undefined);
});

test("offset, checkpoint and generation bounds reject ambiguous state", () => {
  for (const value of [
    null,
    [],
    { "00": "1" },
    { 1024: "1" },
    { 0: "01" },
    { 0: "9223372036854775808" },
    Object.fromEntries(Array.from({ length: 33 }, (_, index) => [String(index), "1"])),
  ]) {
    assert.equal(normalizeBrokerOffsets(value), undefined);
  }
  assert.deepEqual(
    normalizeRebuildStart({ generation: id(90), startedAt: now, barrier: { 0: "10" } }),
    { generation: id(90), startedAt: now, barrier: { 0: "10" } },
  );
  assert.equal(
    normalizeRebuildStart({ generation: id(90), startedAt: now, barrier: {}, extra: true }),
    undefined,
  );
  assert.deepEqual(normalizeRebuildHandledOffset({ partition: 2, offset: "11" }), {
    partition: 2,
    offset: "11",
  });
  assert.equal(normalizeRebuildHandledOffset({ partition: -1, offset: "11" }), undefined);
  assert.deepEqual(
    normalizeRebuildCheckpoint({
      generation: id(90),
      after: id(5),
      scanComplete: false,
      rowsApplied: 5,
    }),
    {
      generation: id(90),
      after: id(5),
      scanComplete: false,
      rowsApplied: 5,
    },
  );
  assert.equal(
    normalizeRebuildCheckpoint({
      generation: id(90),
      after: "bad",
      scanComplete: false,
      rowsApplied: 0,
    }),
    undefined,
  );
});

test("untrusted offset and lifecycle accessors are never invoked", async () => {
  let accesses = 0;
  const hostileOffsets = {
    get 0() {
      accesses++;
      return "1";
    },
  };
  assert.equal(normalizeBrokerOffsets(hostileOffsets), undefined);
  assert.equal(accesses, 0);

  const calls: string[] = [];
  const store: RebuildStore = {
    active: () =>
      Promise.resolve({ status: "completed", value: { generation: id(1), startedAt: now } }),
    start: () => {
      calls.push("start");
      return Promise.resolve({ status: "completed", value: "started" });
    },
    checkpoint: () => {
      calls.push("checkpoint");
      return Promise.resolve({ status: "completed", value: "checkpointed" });
    },
    recordHandled: () => {
      calls.push("handled");
      return Promise.resolve({ status: "completed", value: "checkpointed" });
    },
    promote: () => {
      calls.push("promote");
      return Promise.resolve({ status: "completed", value: "promoted" });
    },
    state: () => Promise.resolve({ status: "completed", value: null }),
    building: () => Promise.resolve({ status: "completed", value: null }),
  };
  const rebuilder = createProjectionRebuilder({ store });
  const hostile = new Proxy(
    {},
    {
      ownKeys() {
        throw new Error("hostile");
      },
    },
  );
  assert.deepEqual(await rebuilder.start(hostile, AbortSignal.timeout(1000)), {
    status: "completed",
    value: "invalid_input",
  });
  assert.deepEqual(await rebuilder.promote(hostile, AbortSignal.timeout(1000)), {
    status: "completed",
    value: "invalid_input",
  });
  assert.deepEqual(calls, []);
});

test("validated lifecycle commands retain exact barrier and checkpoint data", async () => {
  const observed: unknown[] = [];
  const store: RebuildStore = {
    active: () =>
      Promise.resolve({ status: "completed", value: { generation: id(1), startedAt: now } }),
    start: (value) => {
      observed.push(value);
      return Promise.resolve({ status: "completed", value: "started" });
    },
    checkpoint: (value) => {
      observed.push(value);
      return Promise.resolve({ status: "completed", value: "checkpointed" });
    },
    recordHandled: (value) => {
      observed.push(value);
      return Promise.resolve({ status: "completed", value: "checkpointed" });
    },
    promote: (value) => {
      observed.push(value);
      return Promise.resolve({ status: "completed", value: "promoted" });
    },
    state: () => Promise.resolve({ status: "completed", value: null }),
    building: () => Promise.resolve({ status: "completed", value: null }),
  };
  const rebuilder = createProjectionRebuilder({ store });
  const started = await rebuilder.start(
    { generation: id(90), startedAt: now, barrier: { 0: "10" } },
    AbortSignal.timeout(1000),
  );
  assert.equal(started.status, "completed");
  assert.equal(started.value, "started");
  const checkpointed = await rebuilder.checkpoint(
    {
      generation: id(90),
      after: id(5),
      scanComplete: true,
      rowsApplied: 5,
    },
    AbortSignal.timeout(1000),
  );
  assert.equal(checkpointed.status, "completed");
  assert.equal(checkpointed.value, "checkpointed");
  const handled = await rebuilder.recordHandled(
    { partition: 0, offset: "11" },
    AbortSignal.timeout(1000),
  );
  assert.equal(handled.status, "completed");
  assert.equal(handled.value, "checkpointed");
  const promoted = await rebuilder.promote(
    { generation: id(90), completedAt: now + 1 },
    AbortSignal.timeout(1000),
  );
  assert.equal(promoted.status, "completed");
  assert.equal(promoted.value, "promoted");
  assert.deepEqual(observed, [
    { generation: id(90), startedAt: now, barrier: { 0: "10" } },
    {
      generation: id(90),
      after: id(5),
      scanComplete: true,
      rowsApplied: 5,
    },
    { partition: 0, offset: "11" },
    { generation: id(90), completedAt: now + 1 },
  ]);
});
