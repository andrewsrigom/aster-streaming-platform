export const EVENT_TOPICS = Object.freeze({
  identity: "aster.identity.profile.v1",
  catalog: "aster.catalog.publication.v1",
  engagement: "aster.engagement.v1",
});
export type EventOwner = keyof typeof EVENT_TOPICS;
export const MAX_EVENT_BYTES = 8192;

export interface EventEnvelope {
  readonly eventId: string;
  readonly eventType: string;
  readonly schemaVersion: 1;
  readonly occurredAt: string;
  readonly producer: EventOwner;
  readonly aggregate: Readonly<{ type: string; id: string; version: number }>;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly trace: Readonly<{ traceparent?: string }>;
  readonly payload: Readonly<Record<string, string | number | boolean | null>>;
}

export function eventIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value)
  );
}
export function eventVersion(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2147483647
  );
}
export function eventRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  const keys = Reflect.ownKeys(value);
  return (
    keys.length <= required.length + optional.length &&
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every(
      (key) =>
        typeof key === "string" &&
        (required.includes(key) || optional.includes(key)) &&
        Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, "value"),
    )
  );
}

function validPayload(event: Record<string, unknown>, aggregate: Record<string, unknown>): boolean {
  const payload = event["payload"],
    type = event["eventType"];
  switch (event["producer"]) {
    case "identity":
      return (
        [
          "identity.profile-created",
          "identity.profile-updated",
          "identity.profile-deleted",
        ].includes(String(type)) &&
        aggregate["type"] === "Profile" &&
        eventRecord(payload, ["accountId", "profileId"]) &&
        eventIdentifier(payload["accountId"]) &&
        payload["profileId"] === aggregate["id"]
      );
    case "catalog":
      return (
        ["catalog.title-published", "catalog.title-retired"].includes(String(type)) &&
        aggregate["type"] === "Title" &&
        eventRecord(payload, ["titleId", "publicationId", "rightsRevision"]) &&
        payload["titleId"] === aggregate["id"] &&
        (payload["publicationId"] === null || eventIdentifier(payload["publicationId"])) &&
        (payload["rightsRevision"] === null || eventVersion(payload["rightsRevision"]))
      );
    case "engagement": {
      if (type === "engagement.watchlist-changed") {
        return (
          aggregate["type"] === "Watchlist" &&
          eventRecord(payload, ["profileId", "titleId", "present"]) &&
          eventIdentifier(payload["profileId"]) &&
          eventIdentifier(payload["titleId"]) &&
          typeof payload["present"] === "boolean"
        );
      }
      if (
        type !== "engagement.progress-recorded" ||
        aggregate["type"] !== "Progress" ||
        !eventRecord(payload, [
          "profileId",
          "titleId",
          "sequence",
          "positionMs",
          "durationMs",
          "status",
        ])
      ) {
        return false;
      }
      const duration = payload["durationMs"],
        position = payload["positionMs"];
      return (
        eventIdentifier(payload["profileId"]) &&
        eventIdentifier(payload["titleId"]) &&
        eventVersion(payload["sequence"]) &&
        typeof duration === "number" &&
        Number.isSafeInteger(duration) &&
        duration > 0 &&
        duration <= 43200000 &&
        typeof position === "number" &&
        Number.isSafeInteger(position) &&
        position >= 0 &&
        position <= duration &&
        typeof payload["status"] === "string" &&
        ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"].includes(payload["status"])
      );
    }
    default:
      return false;
  }
}

/** Wire compatibility only: business acceptance still belongs to the producing/consuming owner. */
export function normalizeEvent(owner: EventOwner, value: unknown): EventEnvelope | undefined {
  try {
    if (
      !Object.hasOwn(EVENT_TOPICS, owner) ||
      !eventRecord(value, [
        "eventId",
        "eventType",
        "schemaVersion",
        "occurredAt",
        "producer",
        "aggregate",
        "correlationId",
        "causationId",
        "trace",
        "payload",
      ])
    ) {
      return undefined;
    }
    const aggregate = value["aggregate"],
      trace = value["trace"],
      occurredAt = value["occurredAt"];
    if (
      value["producer"] !== owner ||
      value["schemaVersion"] !== 1 ||
      typeof value["eventType"] !== "string" ||
      !eventIdentifier(value["eventId"]) ||
      !eventIdentifier(value["correlationId"]) ||
      !(
        eventIdentifier(value["causationId"]) ||
        (owner === "identity" && value["causationId"] === null)
      ) ||
      !eventRecord(aggregate, ["type", "id", "version"]) ||
      !eventIdentifier(aggregate["id"]) ||
      !eventVersion(aggregate["version"]) ||
      typeof occurredAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/u.test(occurredAt) ||
      Date.parse(occurredAt) < 0 ||
      new Date(occurredAt).toISOString() !== occurredAt ||
      !eventRecord(trace, [], ["traceparent"]) ||
      !validPayload(value, aggregate)
    ) {
      return undefined;
    }
    const traceparent = trace["traceparent"];
    if (
      traceparent !== undefined &&
      (typeof traceparent !== "string" ||
        !/^00-[a-f0-9]{32}-[a-f0-9]{16}-0[01]$/u.test(traceparent) ||
        /^0+$/u.test(traceparent.slice(3, 35)) ||
        /^0+$/u.test(traceparent.slice(36, 52)))
    ) {
      return undefined;
    }
    return Object.freeze({
      ...value,
      aggregate: Object.freeze({ ...aggregate }),
      trace: Object.freeze(traceparent === undefined ? {} : { traceparent }),
      payload: Object.freeze({
        ...(value["payload"] as Record<string, string | number | boolean | null>),
      }),
    }) as EventEnvelope;
  } catch {
    return undefined;
  }
}
