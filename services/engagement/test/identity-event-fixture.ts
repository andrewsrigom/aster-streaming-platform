import {
  createIdentityEventSignature,
  EVENT_TOPICS,
  IDENTITY_EVENT_SIGNATURE,
} from "@aster/event-delivery";
import type { IdentityEventRecord, IdentityFact } from "../src/application/identity-event-ports.js";
export const eventId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const eventCredential = "12".repeat(32);
export const deletionFact: IdentityFact = {
  eventId: eventId(1),
  accountId: eventId(2),
  profileId: eventId(3),
  version: 2,
  occurredAt: 1787875200,
  deleted: true,
  correlationId: eventId(4),
};
export function identityEnvelope() {
  return {
    eventId: deletionFact.eventId,
    eventType: "identity.profile-deleted",
    schemaVersion: 1,
    occurredAt: new Date(deletionFact.occurredAt * 1000).toISOString(),
    producer: "identity",
    aggregate: { type: "Profile", id: deletionFact.profileId, version: 2 },
    correlationId: deletionFact.correlationId,
    causationId: null,
    trace: {},
    payload: { accountId: deletionFact.accountId, profileId: deletionFact.profileId },
  };
}
export function signedIdentityRecord(
  envelope: unknown = identityEnvelope(),
  key = deletionFact.profileId,
  credential = eventCredential,
): IdentityEventRecord {
  const bytes = Buffer.from(JSON.stringify(envelope));
  const keyBytes = Buffer.from(key);
  return {
    topic: EVENT_TOPICS.identity,
    partition: 0,
    offset: "0",
    key: keyBytes,
    value: bytes,
    headers: {
      [IDENTITY_EVENT_SIGNATURE]: createIdentityEventSignature(credential).sign(keyBytes, bytes),
    },
  };
}
