import assert from "node:assert/strict";
import test from "node:test";
import { createTitleProjector } from "../src/application/apply-title-snapshot.js";
import type {
  ProjectionRepository,
  ProjectionUnitOfWork,
} from "../src/application/projection-ports.js";
import type { TitleProjection } from "../src/domain/title-projection.js";

const now = 1_700_000_000;
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const source = (overrides: Record<string, unknown> = {}) => ({
  titleId: id(1),
  sourceVersion: 7,
  observedAt: now,
  visibleUntil: now + 300,
  document: {
    defaultLocale: "en",
    localizations: [{ locale: "en", title: "Signal", synopsis: "A generated journey." }],
    genres: ["animation"],
    editorialLabels: ["featured"],
    releaseYear: 2026,
    publishedAt: now - 1,
  },
  ...overrides,
});
const context = (version = 7) => ({
  now,
  event: { id: id(2), titleId: id(1), version },
});

function fixture(previous: TitleProjection | null = null, targets = [id(90)]) {
  const state = {
    transactions: 0,
    previous,
    fences: [] as TitleProjection[],
    generations: [] as Array<{ generation: string; value: TitleProjection }>,
  };
  const repository: ProjectionRepository = {
    lockFence: () => Promise.resolve(state.previous),
    targetGenerations: () => Promise.resolve(targets),
    saveFence(value) {
      state.fences.push(value);
      state.previous = value;
      return Promise.resolve();
    },
    saveGeneration(generation, value) {
      state.generations.push({ generation, value });
      return Promise.resolve();
    },
  };
  const transactions: ProjectionUnitOfWork = {
    async run(work, signal) {
      state.transactions++;
      return signal.aborted
        ? { status: "cancelled" }
        : { status: "completed", value: await work(repository) };
    },
  };
  return { state, projector: createTitleProjector({ transactions }) };
}

test("authoritative event writes one fence and every active/building generation", async () => {
  const f = fixture(null, [id(90), id(91)]);
  const result = await f.projector.apply(source(), context(), AbortSignal.timeout(1000));
  assert.equal(result.status, "completed");
  assert.equal(result.value.status, "applied");
  assert.equal(f.state.fences.length, 1);
  assert.deepEqual(
    f.state.generations.map((item) => item.generation),
    [id(90), id(91)],
  );
  assert.ok(f.state.generations.every((item) => item.value === f.state.fences[0]));
});

test("duplicate source keeps its original provenance while backfilling a building generation", async () => {
  const first = fixture();
  const applied = await first.projector.apply(source(), context(), AbortSignal.timeout(1000));
  assert.equal(applied.status, "completed");
  assert.ok("value" in applied.value);
  const f = fixture(applied.value.value, [id(90), id(91)]);
  const duplicate = await f.projector.apply(
    source(),
    { ...context(), now: now + 1, event: { ...context().event, id: id(3) } },
    AbortSignal.timeout(1000),
  );
  assert.equal(duplicate.status, "completed");
  assert.equal(duplicate.value.status, "unchanged");
  assert.equal(f.state.fences.length, 0);
  assert.equal(f.state.generations.length, 2);
  assert.ok(f.state.generations.every((item) => item.value.triggerEventId === id(2)));
});

test("newer hidden fence cannot be resurrected by an older rebuild page", async () => {
  const hidden = fixture();
  const retired = await hidden.projector.apply(
    source({ sourceVersion: 8, visibleUntil: null, document: null }),
    context(8),
    AbortSignal.timeout(1000),
  );
  assert.equal(retired.status, "completed");
  assert.ok("value" in retired.value);
  const f = fixture(retired.value.value, [id(91)]);
  const stale = await f.projector.apply(source(), { now, event: null }, AbortSignal.timeout(1000));
  assert.equal(stale.status, "completed");
  assert.equal(stale.value.status, "stale");
  assert.equal(f.state.fences.length, 0);
  assert.equal(f.state.generations[0]?.value.document, null);
  assert.equal(f.state.generations[0].value.sourceVersion, 8);
});

test("invalid targets and future event versions fail closed without writes", async () => {
  const missing = fixture(null, []);
  const invalidState = await missing.projector.apply(
    source(),
    context(),
    AbortSignal.timeout(1000),
  );
  assert.equal(invalidState.status, "completed");
  assert.equal(invalidState.value.status, "invalid_state");
  assert.equal(missing.state.fences.length, 0);
  const conflict = fixture();
  const eventAhead = await conflict.projector.apply(
    source(),
    context(8),
    AbortSignal.timeout(1000),
  );
  assert.equal(eventAhead.status, "completed");
  assert.equal(eventAhead.value.status, "conflict");
  assert.equal(conflict.state.generations.length, 0);
});

test("cancellation avoids persistence and hostile identity accessors never run", async () => {
  const cancelled = fixture();
  const controller = new AbortController();
  controller.abort();
  assert.deepEqual(await cancelled.projector.apply(source(), context(), controller.signal), {
    status: "cancelled",
  });
  assert.equal(cancelled.state.transactions, 0);

  let accesses = 0;
  const hostile = {
    ...source(),
    get titleId() {
      accesses++;
      return id(1);
    },
  };
  const result = await fixture().projector.apply(hostile, context(), AbortSignal.timeout(1000));
  assert.equal(result.status, "completed");
  assert.equal(result.value.status, "invalid_input");
  assert.equal(accesses, 0);
});
