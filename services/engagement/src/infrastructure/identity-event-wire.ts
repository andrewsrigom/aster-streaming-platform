import {
  createIdentityEventSignature,
  EVENT_TOPICS,
  IDENTITY_EVENT_SIGNATURE,
  MAX_EVENT_BYTES,
  eventIdentifier,
  eventRecord,
  normalizeEvent,
} from "@aster/event-delivery";
import type {
  IdentityEventInspection,
  IdentityEventRecord,
} from "../application/identity-event-ports.js";

export function snapshotIdentityRecord(
  record: IdentityEventRecord,
): IdentityEventRecord | undefined {
  try {
    if (
      !eventRecord(record, ["topic", "partition", "offset", "key", "value", "headers"]) ||
      record.topic !== EVENT_TOPICS.identity ||
      !Number.isInteger(record.partition) ||
      record.partition < 0 ||
      record.partition > 2147483647 ||
      typeof record.offset !== "string" ||
      !/^(0|[1-9][0-9]{0,19})$/u.test(record.offset) ||
      !(record.value instanceof Uint8Array) ||
      record.value.byteLength > MAX_EVENT_BYTES ||
      (record.key !== null && (!(record.key instanceof Uint8Array) || record.key.byteLength > 128))
    ) {
      return undefined;
    }
    const names = Object.keys(record.headers);
    if (names.length > 8 || !eventRecord(record.headers, names)) {
      return undefined;
    }
    const headers: Record<string, Uint8Array> = {};
    let bytes = 0;
    for (const name of names) {
      const value = record.headers[name];
      if (
        !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(name) ||
        !(value instanceof Uint8Array) ||
        value.byteLength > 1024
      ) {
        return undefined;
      }
      bytes += name.length + value.byteLength;
      if (bytes > 4096) {
        return undefined;
      }
      headers[name] = Uint8Array.from(value);
    }
    return Object.freeze({
      topic: record.topic,
      partition: record.partition,
      offset: record.offset,
      key: record.key === null ? null : Uint8Array.from(record.key),
      value: Uint8Array.from(record.value),
      headers: Object.freeze(headers),
    });
  } catch {
    return undefined;
  }
}

export function createIdentityEventInspector(credential: string) {
  const signature = createIdentityEventSignature(credential);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  return (input: IdentityEventRecord): IdentityEventInspection => {
    const record = snapshotIdentityRecord(input);
    if (!record) {
      return { status: "oversized" };
    }
    const signed = record.headers[IDENTITY_EVENT_SIGNATURE];
    if (
      !record.key ||
      !signed ||
      !signature.verify(record.topic, record.key, record.value, signed)
    ) {
      return { status: "poison", reason: "signature", record };
    }
    try {
      const event = normalizeEvent("identity", JSON.parse(decoder.decode(record.value)));
      if (
        !event ||
        decoder.decode(record.key) !== event.aggregate.id ||
        !eventIdentifier(event.payload["accountId"])
      ) {
        return { status: "poison", reason: "envelope", record };
      }
      return {
        status: "valid",
        record,
        fact: Object.freeze({
          eventId: event.eventId,
          accountId: event.payload["accountId"],
          profileId: event.aggregate.id,
          version: event.aggregate.version,
          occurredAt: Date.parse(event.occurredAt) / 1000,
          deleted: event.eventType === "identity.profile-deleted",
          correlationId: event.correlationId,
        }),
      };
    } catch {
      return { status: "poison", reason: "envelope", record };
    }
  };
}
