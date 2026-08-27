import { profileIdentifier, profileVersion } from "./profile.js";

export type ProfileEventType =
  "identity.profile-created" | "identity.profile-updated" | "identity.profile-deleted";

export interface ProfileEventContext {
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly traceparent?: string;
}

export interface ProfileEvent {
  readonly eventId: string;
  readonly eventType: ProfileEventType;
  readonly schemaVersion: 1;
  readonly occurredAt: string;
  readonly producer: "identity";
  readonly aggregate: Readonly<{ type: "Profile"; id: string; version: number }>;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly trace: Readonly<{ traceparent?: string }>;
  readonly payload: Readonly<{ accountId: string; profileId: string }>;
}

export function validProfileEventContext(context: ProfileEventContext): boolean {
  const trace = context.traceparent;
  return (
    profileIdentifier(context.correlationId) &&
    (context.causationId === null || profileIdentifier(context.causationId)) &&
    (trace === undefined ||
      (/^00-[a-f0-9]{32}-[a-f0-9]{16}-0[01]$/.test(trace) &&
        !trace.slice(3, 35).match(/^0+$/) &&
        !trace.slice(36, 52).match(/^0+$/)))
  );
}

export function createProfileEvent(
  input: Readonly<{
    eventId: string;
    eventType: ProfileEventType;
    accountId: string;
    profileId: string;
    version: number;
    now: number;
    context: ProfileEventContext;
  }>,
): ProfileEvent {
  if (
    !profileIdentifier(input.eventId) ||
    !profileIdentifier(input.accountId) ||
    !profileIdentifier(input.profileId) ||
    !profileVersion(input.version) ||
    !Number.isSafeInteger(input.now) ||
    input.now < 0 ||
    input.now > 253_402_300_799 ||
    !validProfileEventContext(input.context)
  ) {
    throw new Error("Invalid Identity profile event.");
  }
  return Object.freeze({
    eventId: input.eventId,
    eventType: input.eventType,
    schemaVersion: 1,
    occurredAt: new Date(input.now * 1_000).toISOString(),
    producer: "identity",
    aggregate: Object.freeze({ type: "Profile", id: input.profileId, version: input.version }),
    correlationId: input.context.correlationId,
    causationId: input.context.causationId,
    trace: Object.freeze(
      input.context.traceparent ? { traceparent: input.context.traceparent } : {},
    ),
    payload: Object.freeze({ accountId: input.accountId, profileId: input.profileId }),
  });
}
