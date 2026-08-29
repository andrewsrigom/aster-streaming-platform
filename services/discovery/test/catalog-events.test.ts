import assert from "node:assert/strict";
import test from "node:test";
import type {
  CatalogEventPorts,
  CatalogEventRecord,
  CatalogPoisonReason,
} from "../src/application/catalog-event-ports.js";
import { createCatalogEventConsumer } from "../src/application/consume-catalog-event.js";
import { inspectCatalogEvent } from "../src/infrastructure/catalog-event-wire.js";

const now = 1_700_000_000;
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const encoder = new TextEncoder();
const event = (overrides: Record<string, unknown> = {}) => ({
  eventId: id(2),
  eventType: "catalog.title-published",
  schemaVersion: 1,
  occurredAt: "2023-11-14T22:13:20.000Z",
  producer: "catalog",
  aggregate: { type: "Title", id: id(1), version: 7 },
  correlationId: id(3),
  causationId: id(4),
  trace: {},
  payload: { titleId: id(1), publicationId: id(5), rightsRevision: 2 },
  ...overrides,
});
const record = (value: unknown = event()): CatalogEventRecord => ({
  topic: "aster.catalog.publication.v1",
  partition: 0,
  offset: "42",
  key: encoder.encode(id(1)),
  value: encoder.encode(JSON.stringify(value)),
  headers: { "content-type": encoder.encode("application/json") },
});
const source = {
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
};

function fixture() {
  const state = {
    sourceCalls: 0,
    projectorCalls: 0,
    quarantined: [] as CatalogPoisonReason[],
    completed: [] as string[],
    sourceResult: { status: "completed", value: source } as Awaited<
      ReturnType<CatalogEventPorts["source"]["current"]>
    >,
    projectionResult: {
      status: "completed",
      value: { status: "applied", value: {} as never },
    } as Awaited<ReturnType<CatalogEventPorts["projector"]["apply"]>>,
    quarantineResult: "stored" as Awaited<ReturnType<CatalogEventPorts["store"]["quarantine"]>>,
    replayRecord: undefined as CatalogEventRecord | undefined,
    completeReplay: true,
  };
  const ports: CatalogEventPorts = {
    inspect: inspectCatalogEvent,
    now: () => now,
    source: {
      current(titleId, correlationId) {
        state.sourceCalls++;
        assert.equal(titleId, id(1));
        assert.equal(correlationId, id(3));
        return Promise.resolve(state.sourceResult);
      },
    },
    projector: {
      apply(snapshot, context) {
        state.projectorCalls++;
        assert.strictEqual(snapshot, source);
        assert.deepEqual(context, {
          now,
          event: { id: id(2), titleId: id(1), version: 7 },
        });
        return Promise.resolve(state.projectionResult);
      },
    },
    store: {
      quarantine(_record, reason) {
        state.quarantined.push(reason);
        return Promise.resolve(state.quarantineResult);
      },
      readQuarantine() {
        return Promise.resolve(state.replayRecord);
      },
      completeReplay(value) {
        state.completed.push(value);
        return Promise.resolve(state.completeReplay);
      },
    },
  };
  return { state, consumer: createCatalogEventConsumer(ports) };
}

test("wire copies one bounded Catalog hint and extracts no metadata authority", () => {
  const input = record();
  const inspected = inspectCatalogEvent(input);
  assert.equal(inspected.status, "valid");
  assert.deepEqual(inspected.fact, {
    eventId: id(2),
    titleId: id(1),
    version: 7,
    occurredAt: now,
    eventType: "catalog.title-published",
    correlationId: id(3),
  });
  assert.notStrictEqual(inspected.record.value, input.value);
  input.value.fill(0);
  assert.notEqual(inspected.record.value[0], 0);
  assert.doesNotMatch(JSON.stringify(inspected.fact), /publicationId|rightsRevision|metadata/u);
});

test("malformed bounded records quarantine while oversized records remain uncommitted", async () => {
  assert.equal(inspectCatalogEvent({ ...record(), key: encoder.encode(id(9)) }).status, "poison");
  assert.equal(inspectCatalogEvent(record({ ...event(), extra: true })).status, "poison");
  assert.equal(
    inspectCatalogEvent({ ...record(), value: new Uint8Array(8193) }).status,
    "oversized",
  );
  const f = fixture();
  assert.equal(
    await f.consumer.handle(record({ invalid: true }), AbortSignal.timeout(1000)),
    "quarantined",
  );
  assert.deepEqual(f.state.quarantined, ["envelope"]);
  assert.equal(
    await f.consumer.handle(
      { ...record(), value: new Uint8Array(8193) },
      AbortSignal.timeout(1000),
    ),
    "retry",
  );
  assert.equal(f.state.quarantined.length, 1);
});

test("fresh owner snapshot is projected and duplicate delivery stays idempotent", async () => {
  const f = fixture();
  assert.equal(await f.consumer.handle(record(), AbortSignal.timeout(1000)), "applied");
  assert.equal(f.state.sourceCalls, 1);
  assert.equal(f.state.projectorCalls, 1);
  f.state.projectionResult = {
    status: "completed",
    value: { status: "unchanged", value: {} as never },
  };
  assert.equal(await f.consumer.handle(record(), AbortSignal.timeout(1000)), "duplicate");
  assert.deepEqual(f.state.quarantined, []);
});

test("owner absence and source/projection conflicts are durably quarantined", async () => {
  for (const [sourceResult, projectionResult, reason] of [
    [{ status: "completed", value: null }, null, "source_absent"],
    [
      { status: "completed", value: source },
      { status: "completed", value: { status: "invalid_input" } },
      "source_conflict",
    ],
    [
      { status: "completed", value: source },
      { status: "completed", value: { status: "conflict" } },
      "projection_conflict",
    ],
  ] as const) {
    const f = fixture();
    f.state.sourceResult = sourceResult;
    if (projectionResult) {
      f.state.projectionResult = projectionResult;
    }
    assert.equal(await f.consumer.handle(record(), AbortSignal.timeout(1000)), "quarantined");
    assert.deepEqual(f.state.quarantined, [reason]);
  }
});

test("dependency failure, invalid generation state and full quarantine keep the offset retryable", async () => {
  for (const configure of [
    (f: ReturnType<typeof fixture>) => {
      f.state.sourceResult = { status: "unavailable" };
    },
    (f: ReturnType<typeof fixture>) => {
      f.state.projectionResult = { status: "completed", value: { status: "invalid_state" } };
    },
    (f: ReturnType<typeof fixture>) => {
      f.state.sourceResult = { status: "completed", value: null };
      f.state.quarantineResult = "full";
    },
  ]) {
    const f = fixture();
    configure(f);
    assert.equal(await f.consumer.handle(record(), AbortSignal.timeout(1000)), "retry");
  }
});

test("one active event is admitted and caller cancellation never commits", async () => {
  const entered = Promise.withResolvers<undefined>();
  const released = Promise.withResolvers<undefined>();
  const f = fixture();
  f.state.sourceResult = { status: "cancelled" };
  const original = f.consumer;
  const ports: CatalogEventPorts = {
    inspect: inspectCatalogEvent,
    now: () => now,
    source: {
      async current() {
        entered.resolve(undefined);
        await released.promise;
        return { status: "cancelled" };
      },
    },
    projector: {
      apply() {
        throw new Error("must not project");
      },
    },
    store: {
      quarantine() {
        throw new Error("must not quarantine");
      },
      readQuarantine: () => Promise.resolve(undefined),
      completeReplay: () => Promise.resolve(false),
    },
  };
  const consumer = createCatalogEventConsumer(ports);
  const first = consumer.handle(record(), AbortSignal.timeout(1000));
  await entered.promise;
  assert.equal(await consumer.handle(record(), AbortSignal.timeout(1000)), "retry");
  released.resolve(undefined);
  assert.equal(await first, "retry");
  const controller = new AbortController();
  controller.abort();
  assert.equal(await original.handle(record(), controller.signal), "retry");
});

test("replay removes a repaired exact record only after durable projection", async () => {
  const f = fixture();
  f.state.replayRecord = record();
  assert.equal(await f.consumer.replay(id(90), AbortSignal.timeout(1000)), "applied");
  assert.deepEqual(f.state.completed, [id(90)]);

  const retained = fixture();
  retained.state.replayRecord = record({ invalid: true });
  assert.equal(await retained.consumer.replay(id(91), AbortSignal.timeout(1000)), "retry");
  assert.deepEqual(retained.state.completed, []);

  const uncertain = fixture();
  uncertain.state.replayRecord = record();
  uncertain.state.completeReplay = false;
  assert.equal(await uncertain.consumer.replay(id(92), AbortSignal.timeout(1000)), "retry");
});
