import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogEventProjector } from "../src/application/catalog-event-ports.js";
import { createCatalogEventHandler } from "../src/infrastructure/catalog-event-handler.js";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const encoder = new TextEncoder();
const now = 1_700_000_000;
const event = {
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
};
const snapshot = {
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
  const logs: unknown[] = [];
  const observations: string[] = [];
  const state = {
    source: { status: "completed", value: snapshot } as const,
    projection: {
      status: "completed",
      value: { status: "applied", value: {} as never },
    } as Awaited<ReturnType<CatalogEventProjector["apply"]>>,
    quarantine: "stored" as const,
    handled: { status: "completed", value: "checkpointed" } as
      | Readonly<{ status: "completed"; value: "checkpointed" }>
      | Readonly<{ status: "unavailable" }>,
  };
  const handler = createCatalogEventHandler({
    now: () => now,
    source: { current: () => Promise.resolve(state.source) },
    projector: { apply: () => Promise.resolve(state.projection) },
    store: {
      quarantine: () => Promise.resolve(state.quarantine),
      readQuarantine: () => Promise.resolve(undefined),
      completeReplay: () => Promise.resolve(false),
    },
    logger: {
      info: (entry) => {
        logs.push(entry);
        return "written";
      },
    },
    telemetry: {
      startDependencyOperation: () => ({
        status: "started",
        observation: {
          complete: ({ outcome }) => {
            observations.push(outcome);
            return { status: "completed" };
          },
        },
      }),
    },
    recordHandled: () => Promise.resolve(state.handled),
  });
  const record = (value: unknown = event) => ({
    key: encoder.encode(id(1)),
    value: encoder.encode(JSON.stringify(value)),
    headers: {},
    partition: 0,
    offset: "42",
    signal: AbortSignal.timeout(1000),
  });
  return { handler, record, state, logs, observations };
}

test("handler acknowledges applied current-owner projections with bounded identifiers only", async () => {
  const f = fixture();
  await f.handler(f.record());
  assert.deepEqual(f.observations, ["success"]);
  assert.match(JSON.stringify(f.logs), /aster\.discovery\.catalog_event/u);
  assert.match(JSON.stringify(f.logs), new RegExp(id(2), "u"));
  assert.doesNotMatch(JSON.stringify(f.logs), /Signal|publicationId|rightsRevision/u);
});

test("handler acknowledges durable poison quarantine but keeps unavailable outcomes uncommitted", async () => {
  const poison = fixture();
  await poison.handler(poison.record({ invalid: true }));
  assert.deepEqual(poison.observations, ["rejected"]);

  const unavailable = fixture();
  unavailable.state.projection = { status: "unavailable" };
  await assert.rejects(unavailable.handler(unavailable.record()), /requires retry/u);
  assert.deepEqual(unavailable.observations, ["unavailable"]);

  const checkpoint = fixture();
  checkpoint.state.handled = { status: "unavailable" };
  await assert.rejects(checkpoint.handler(checkpoint.record()), /requires retry/u);
});

test("handler propagates broker cancellation without logging event bytes", async () => {
  const f = fixture();
  const input = f.record();
  await assert.rejects(f.handler({ ...input, signal: AbortSignal.abort() }), /requires retry/u);
  assert.deepEqual(f.observations, ["unavailable"]);
  assert.doesNotMatch(JSON.stringify(f.logs), /titleId|payload|aggregate/u);
});
