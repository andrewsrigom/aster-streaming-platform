import { EVENT_TOPICS, MAX_EVENT_BYTES, eventRecord, normalizeEvent } from "@aster/event-delivery";
import type {
  CatalogEventInspection,
  CatalogEventRecord,
} from "../application/catalog-event-ports.js";

export function snapshotCatalogRecord(record: CatalogEventRecord): CatalogEventRecord | undefined {
  try {
    if (
      !eventRecord(record, ["topic", "partition", "offset", "key", "value", "headers"]) ||
      record.topic !== EVENT_TOPICS.catalog ||
      !Number.isInteger(record.partition) ||
      record.partition < 0 ||
      record.partition > 2_147_483_647 ||
      typeof record.offset !== "string" ||
      !/^(?:0|[1-9][0-9]{0,19})$/u.test(record.offset) ||
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

export function inspectCatalogEvent(input: CatalogEventRecord): CatalogEventInspection {
  const record = snapshotCatalogRecord(input);
  if (!record) {
    return { status: "oversized" };
  }
  try {
    if (!record.key) {
      return { status: "poison", reason: "envelope", record };
    }
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const event = normalizeEvent("catalog", JSON.parse(decoder.decode(record.value)));
    if (!event || decoder.decode(record.key) !== event.aggregate.id) {
      return { status: "poison", reason: "envelope", record };
    }
    return {
      status: "valid",
      record,
      fact: Object.freeze({
        eventId: event.eventId,
        titleId: event.aggregate.id,
        version: event.aggregate.version,
        occurredAt: Date.parse(event.occurredAt) / 1000,
        eventType: event.eventType as "catalog.title-published" | "catalog.title-retired",
        correlationId: event.correlationId,
        ...(event.trace.traceparent === undefined ? {} : { traceparent: event.trace.traceparent }),
      }),
    };
  } catch {
    return { status: "poison", reason: "envelope", record };
  }
}
