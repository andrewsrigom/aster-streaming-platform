import assert from "node:assert/strict";
import test from "node:test";
import type { ProjectionApplyResult } from "../src/application/apply-title-snapshot.js";
import type {
  CatalogSnapshotExportPage,
  RebuildGenerationState,
  RebuildStore,
} from "../src/application/rebuild-ports.js";
import { createProjectionRebuildRunner } from "../src/application/run-projection-rebuild.js";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const now = 1_700_000_000;
const snapshot = (value: number) => ({ titleId: id(value) });

function fixture() {
  const calls: string[] = [];
  const state: {
    building: RebuildGenerationState | null;
    handled: string;
    sourceFailureAfter: string | null;
  } = {
    building: null,
    handled: "10",
    sourceFailureAfter: null,
  };
  const pages = new Map<string, CatalogSnapshotExportPage>([
    ["start", { snapshots: [snapshot(1), snapshot(2)], endCursor: id(2), hasNextPage: true }],
    [id(2), { snapshots: [snapshot(3)], endCursor: id(3), hasNextPage: false }],
  ]);
  const store: RebuildStore = {
    active: () =>
      Promise.resolve({ status: "completed", value: { generation: id(1), startedAt: now } }),
    building: () => {
      if (state.building) {
        state.building = { ...state.building, handled: { 0: state.handled } };
      }
      return Promise.resolve({ status: "completed", value: state.building });
    },
    start: (value) => {
      calls.push(`start:${JSON.stringify(value.barrier)}`);
      state.building = {
        generation: value.generation,
        state: "BUILDING",
        barrier: value.barrier,
        handled: { 0: state.handled },
        after: null,
        scanComplete: false,
        rowsApplied: 0,
      };
      return Promise.resolve({ status: "completed", value: "started" });
    },
    checkpoint: (value) => {
      calls.push(`checkpoint:${value.after}:${value.rowsApplied}:${value.scanComplete}`);
      assert.ok(state.building);
      state.building = {
        ...state.building,
        after: value.after,
        scanComplete: value.scanComplete,
        rowsApplied: value.rowsApplied,
        handled: { 0: state.handled },
      };
      return Promise.resolve({ status: "completed", value: "checkpointed" });
    },
    recordHandled: () => Promise.resolve({ status: "completed", value: "checkpointed" }),
    promote: (value) => {
      calls.push(`promote:${value.generation}`);
      return Promise.resolve({ status: "completed", value: "promoted" });
    },
    state: () => {
      if (state.building) {
        state.building = { ...state.building, handled: { 0: state.handled } };
      }
      return Promise.resolve({ status: "completed", value: state.building });
    },
  };
  const runner = createProjectionRebuildRunner({
    store,
    events: {
      barrier: () => {
        calls.push("barrier");
        return Promise.resolve({ status: "completed", value: { 0: "10" } });
      },
    },
    source: {
      exportPage: (after) => {
        calls.push(`export:${after ?? "start"}`);
        if (state.sourceFailureAfter === (after ?? "start")) {
          return Promise.resolve({ status: "unavailable" });
        }
        const page = pages.get(after ?? "start");
        assert.ok(page);
        return Promise.resolve({ status: "completed", value: page });
      },
    },
    projector: {
      apply: (value) => {
        calls.push(`apply:${(value as { titleId: string }).titleId}`);
        return Promise.resolve({
          status: "completed",
          value: { status: "unchanged", value: {} as never },
        } satisfies ProjectionApplyResult);
      },
    },
    now: () => now,
    nextId: () => id(90),
  });
  return { calls, pages, runner, state };
}

test("rebuild captures a broker barrier, scans bounded pages and promotes only after catch-up", async () => {
  const f = fixture();
  assert.deepEqual(await f.runner.execute(AbortSignal.timeout(1000)), {
    status: "completed",
    value: { status: "promoted", generation: id(90), rowsApplied: 3 },
  });
  assert.deepEqual(f.calls, [
    "barrier",
    'start:{"0":"10"}',
    "export:start",
    `apply:${id(1)}`,
    `apply:${id(2)}`,
    `checkpoint:${id(2)}:2:false`,
    `export:${id(2)}`,
    `apply:${id(3)}`,
    `checkpoint:${id(3)}:3:true`,
    `promote:${id(90)}`,
  ]);
});

test("rebuild resumes its durable cursor after source failure without recapturing the barrier", async () => {
  const f = fixture();
  f.pages.set(id(2), { snapshots: [], endCursor: null, hasNextPage: false });
  f.state.sourceFailureAfter = id(2);
  assert.deepEqual(await f.runner.execute(AbortSignal.timeout(1000)), { status: "unavailable" });
  f.state.sourceFailureAfter = null;
  assert.deepEqual(await f.runner.execute(AbortSignal.timeout(1000)), {
    status: "completed",
    value: { status: "promoted", generation: id(90), rowsApplied: 2 },
  });
  assert.equal(f.calls.filter((call) => call === "barrier").length, 1);
  assert.equal(f.calls.filter((call) => call.startsWith("start:")).length, 1);
  assert.equal(f.calls.filter((call) => call === "export:start").length, 1);
});

test("completed scan waits for durable consumer catch-up and later resumes at promotion", async () => {
  const f = fixture();
  f.state.handled = "9";
  assert.deepEqual(await f.runner.execute(AbortSignal.timeout(1000)), {
    status: "completed",
    value: { status: "catchup_pending", generation: id(90), rowsApplied: 3 },
  });
  f.state.handled = "10";
  const exports = f.calls.filter((call) => call.startsWith("export:")).length;
  assert.deepEqual(await f.runner.execute(AbortSignal.timeout(1000)), {
    status: "completed",
    value: { status: "promoted", generation: id(90), rowsApplied: 3 },
  });
  assert.equal(f.calls.filter((call) => call.startsWith("export:")).length, exports);
});

test("rebuild rejects malformed page progress without moving its checkpoint", async () => {
  const f = fixture();
  f.pages.set("start", {
    snapshots: [snapshot(2), snapshot(1)],
    endCursor: id(1),
    hasNextPage: true,
  });
  assert.deepEqual(await f.runner.execute(AbortSignal.timeout(1000)), {
    status: "completed",
    value: { status: "conflict" },
  });
  assert.equal(
    f.calls.some((call) => call.startsWith("checkpoint:")),
    false,
  );
  assert.deepEqual(await f.runner.execute(AbortSignal.abort()), { status: "cancelled" });
});
