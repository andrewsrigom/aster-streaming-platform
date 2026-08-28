import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEvent, type EventEnvelope } from "../src/domain/envelope.js";
import { EVENT_ID, OTHER_ID, PROFILE_ID, profileEvent } from "./event-fixture.js";

test("preserves v1 wire facts for all three existing outbox owners", () => {
  const identity = profileEvent();
  const events: EventEnvelope[] = [
    ...["identity.profile-created", "identity.profile-updated", "identity.profile-deleted"].map(
      (eventType) => ({ ...identity, eventType }),
    ),
    ...["catalog.title-published", "catalog.title-retired"].map((eventType) => ({
      ...identity,
      producer: "catalog" as const,
      eventType,
      causationId: EVENT_ID,
      aggregate: { type: "Title", id: OTHER_ID, version: 9 },
      payload: { titleId: OTHER_ID, publicationId: EVENT_ID, rightsRevision: 4 },
    })),
    {
      ...identity,
      producer: "engagement",
      eventType: "engagement.progress-recorded",
      causationId: EVENT_ID,
      aggregate: { type: "Progress", id: OTHER_ID, version: 1 },
      payload: {
        profileId: PROFILE_ID,
        titleId: EVENT_ID,
        sequence: 3,
        positionMs: 1000,
        durationMs: 6000,
        status: "IN_PROGRESS",
      },
    },
    {
      ...identity,
      producer: "engagement",
      eventType: "engagement.watchlist-changed",
      causationId: EVENT_ID,
      aggregate: { type: "Watchlist", id: OTHER_ID, version: 1 },
      payload: { profileId: PROFILE_ID, titleId: EVENT_ID, present: true },
    },
  ];
  for (const event of events) {
    assert.deepEqual(normalizeEvent(event.producer, JSON.parse(JSON.stringify(event))), event);
  }
});

test("rejects substituted producer, schema, aggregate, UUID, payload and time", () => {
  const event = profileEvent();
  for (const changed of [
    { producer: "catalog" },
    { schemaVersion: 2 },
    { eventId: "not-a-uuid" },
    { eventType: "identity.command-delete" },
    { correlationId: OTHER_ID.toUpperCase().replace("00000", "FFFFF") },
    { aggregate: { ...event.aggregate, version: 0 } },
    { aggregate: { ...event.aggregate, type: "Title" } },
    { payload: { ...event.payload, profileId: OTHER_ID } },
    { payload: { ...event.payload, token: "unexpected" } },
    { occurredAt: "2026-02-30T00:00:00.000Z" },
    { occurredAt: "1969-12-31T00:00:00.000Z" },
    { trace: { traceparent: "00-" + "0".repeat(32) + "-" + "1".repeat(16) + "-01" } },
    { unexpected: true },
  ]) {
    assert.equal(normalizeEvent("identity", { ...event, ...changed }), undefined);
  }
});

test("rejects accessors and nested payloads without running getters; copies immutable facts", () => {
  let reads = 0;
  const event = profileEvent();
  const accessor = Object.defineProperty({ ...event }, "producer", {
    get: () => {
      reads++;
      return "identity";
    },
  });
  assert.equal(normalizeEvent("identity", accessor), undefined);
  assert.equal(reads, 0);
  assert.equal(
    normalizeEvent("identity", { ...event, payload: { accountId: {}, profileId: PROFILE_ID } }),
    undefined,
  );
  const frozen = normalizeEvent("identity", event);
  assert.ok(frozen);
  assert.ok(
    Object.isFrozen(frozen) && Object.isFrozen(frozen.aggregate) && Object.isFrozen(frozen.payload),
  );
  assert.notEqual(frozen.payload, event.payload);
});
