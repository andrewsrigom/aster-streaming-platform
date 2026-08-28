import { normalizeProgressState, progressIdentifier, type ProgressState } from "./progress.js";

export interface ProgressEventContext {
  readonly correlationId: string;
  readonly causationId: string;
  readonly traceparent?: string;
}
export interface ProgressRecordedEvent {
  readonly eventId: string;
  readonly eventType: "engagement.progress-recorded";
  readonly schemaVersion: 1;
  readonly producer: "engagement";
  readonly occurredAt: string;
  readonly aggregate: Readonly<{ type: "Progress"; id: string; version: number }>;
  readonly correlationId: string;
  readonly causationId: string;
  readonly trace: Readonly<{ traceparent?: string }>;
  readonly payload: Readonly<
    Pick<
      ProgressState,
      "profileId" | "titleId" | "sequence" | "positionMs" | "durationMs" | "status"
    >
  >;
}
export function validProgressEventContext(context: ProgressEventContext): boolean {
  const trace = context.traceparent;
  return (
    progressIdentifier(context.correlationId) &&
    progressIdentifier(context.causationId) &&
    (trace === undefined ||
      (typeof trace === "string" &&
        /^00-[a-f0-9]{32}-[a-f0-9]{16}-0[01]$/u.test(trace) &&
        !/^0+$/u.test(trace.slice(3, 35)) &&
        !/^0+$/u.test(trace.slice(36, 52))))
  );
}
export function createProgressEvent(
  eventId: string,
  value: ProgressState,
  context: ProgressEventContext,
): ProgressRecordedEvent {
  const progress = normalizeProgressState(value);
  if (!progress || !progressIdentifier(eventId) || !validProgressEventContext(context)) {
    throw new Error("Invalid progress event.");
  }
  return Object.freeze({
    eventId,
    eventType: "engagement.progress-recorded",
    schemaVersion: 1,
    producer: "engagement",
    occurredAt: new Date(progress.updatedAt * 1000).toISOString(),
    aggregate: Object.freeze({ type: "Progress", id: progress.id, version: progress.version }),
    correlationId: context.correlationId,
    causationId: context.causationId,
    trace: Object.freeze(context.traceparent ? { traceparent: context.traceparent } : {}),
    payload: Object.freeze({
      profileId: progress.profileId,
      titleId: progress.titleId,
      sequence: progress.sequence,
      positionMs: progress.positionMs,
      durationMs: progress.durationMs,
      status: progress.status,
    }),
  });
}
