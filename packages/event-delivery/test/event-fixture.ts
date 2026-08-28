import type { EventEnvelope } from "../src/domain/envelope.js";

export const EVENT_ID = "00000000-0000-4000-8000-000000000001";
export const PROFILE_ID = "00000000-0000-4000-8000-000000000002";
export const ACCOUNT_ID = "00000000-0000-4000-8000-000000000003";
export const TOKEN = "00000000-0000-4000-8000-000000000004";
export const OTHER_ID = "00000000-0000-4000-8000-000000000005";
export function profileEvent(): EventEnvelope {
  return {
    eventId: EVENT_ID,
    eventType: "identity.profile-deleted",
    schemaVersion: 1,
    occurredAt: "2026-08-28T00:00:00.000Z",
    producer: "identity",
    aggregate: { type: "Profile", id: PROFILE_ID, version: 2 },
    correlationId: EVENT_ID,
    causationId: null,
    trace: {},
    payload: { accountId: ACCOUNT_ID, profileId: PROFILE_ID },
  };
}
