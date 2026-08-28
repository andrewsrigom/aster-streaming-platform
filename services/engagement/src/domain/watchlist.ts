import { progressIdentifier, progressRecord } from "./progress.js";
import { progressTimestamp } from "./progress-page.js";
import { validProgressEventContext, type ProgressEventContext } from "./progress-event.js";

export interface WatchlistInput {
  readonly profileId: string;
  readonly titleId: string;
  readonly idempotencyKey: string;
  readonly present: boolean;
}
export interface WatchlistChange {
  readonly id: string;
  readonly accountId: string;
  readonly profileId: string;
  readonly titleId: string;
  readonly present: boolean;
  readonly version: number;
  readonly updatedAt: number;
}
export interface WatchlistEntry {
  readonly id: string;
  readonly accountId: string;
  readonly profileId: string;
  readonly titleId: string;
  readonly addedAt: number;
}
export interface WatchlistCursor {
  readonly addedAt: number;
  readonly id: string;
}
export interface WatchlistPageInput {
  readonly profileId: string;
  readonly first: number;
  readonly after: WatchlistCursor | null;
}

export function normalizeWatchlistInput(value: unknown): WatchlistInput | undefined {
  const data = progressRecord(value, ["profileId", "titleId", "idempotencyKey", "present"]);
  if (
    !data ||
    !progressIdentifier(data["profileId"]) ||
    !progressIdentifier(data["titleId"]) ||
    !progressIdentifier(data["idempotencyKey"]) ||
    typeof data["present"] !== "boolean"
  ) {
    return undefined;
  }
  return Object.freeze({
    profileId: data["profileId"],
    titleId: data["titleId"],
    idempotencyKey: data["idempotencyKey"],
    present: data["present"],
  });
}

export function watchlistRequestPayload(input: WatchlistInput): string {
  return JSON.stringify([input.profileId, input.titleId, input.present]);
}

export function normalizeWatchlistChange(value: unknown): WatchlistChange | undefined {
  const data = progressRecord(value, [
    "id",
    "accountId",
    "profileId",
    "titleId",
    "present",
    "version",
    "updatedAt",
  ]);
  if (
    !data ||
    !progressIdentifier(data["id"]) ||
    !progressIdentifier(data["accountId"]) ||
    !progressIdentifier(data["profileId"]) ||
    !progressIdentifier(data["titleId"]) ||
    typeof data["present"] !== "boolean" ||
    typeof data["version"] !== "number" ||
    !Number.isInteger(data["version"]) ||
    data["version"] < 1 ||
    data["version"] > 2_147_483_647 ||
    !progressTimestamp(data["updatedAt"])
  ) {
    return undefined;
  }
  return Object.freeze({
    id: data["id"],
    accountId: data["accountId"],
    profileId: data["profileId"],
    titleId: data["titleId"],
    present: data["present"],
    version: data["version"],
    updatedAt: data["updatedAt"],
  });
}

export function normalizeWatchlistEntry(value: unknown): WatchlistEntry | undefined {
  const data = progressRecord(value, ["id", "accountId", "profileId", "titleId", "addedAt"]);
  if (
    !data ||
    !progressIdentifier(data["id"]) ||
    !progressIdentifier(data["accountId"]) ||
    !progressIdentifier(data["profileId"]) ||
    !progressIdentifier(data["titleId"]) ||
    !progressTimestamp(data["addedAt"])
  ) {
    return undefined;
  }
  return Object.freeze({
    id: data["id"],
    accountId: data["accountId"],
    profileId: data["profileId"],
    titleId: data["titleId"],
    addedAt: data["addedAt"],
  });
}

export function advanceWatchlist(
  current: WatchlistChange | null,
  input: WatchlistInput,
  context: Readonly<{ accountId: string; aggregateId: string; now: number }>,
): WatchlistChange | undefined {
  const prior = current === null ? null : normalizeWatchlistChange(current);
  if (
    (current !== null && !prior) ||
    !normalizeWatchlistInput(input) ||
    !progressIdentifier(context.accountId) ||
    !progressIdentifier(context.aggregateId) ||
    !progressTimestamp(context.now) ||
    (prior &&
      (prior.accountId !== context.accountId ||
        prior.profileId !== input.profileId ||
        prior.id !== context.aggregateId ||
        prior.version === 2_147_483_647 ||
        prior.updatedAt > context.now))
  ) {
    return undefined;
  }
  return Object.freeze({
    id: context.aggregateId,
    accountId: context.accountId,
    profileId: input.profileId,
    titleId: input.titleId,
    present: input.present,
    version: (prior?.version ?? 0) + 1,
    updatedAt: context.now,
  });
}

export function watchlistCursor(profileId: string, entry: WatchlistCursor): string {
  return ["w1", profileId, entry.addedAt, entry.id].join(".");
}
export function followsWatchlistCursor(entry: WatchlistCursor, after: WatchlistCursor): boolean {
  return entry.addedAt < after.addedAt || (entry.addedAt === after.addedAt && entry.id < after.id);
}
export function normalizeWatchlistPageInput(value: unknown): WatchlistPageInput | undefined {
  const data = progressRecord(value, ["profileId", "first", "after"]);
  const profileId = data?.["profileId"];
  const first = data?.["first"];
  const after = data?.["after"];
  if (
    !progressIdentifier(profileId) ||
    typeof first !== "number" ||
    !Number.isInteger(first) ||
    first < 1 ||
    first > 20
  ) {
    return undefined;
  }
  if (after === null) {
    return Object.freeze({ profileId, first, after: null });
  }
  if (typeof after !== "string" || after.length > 128) {
    return undefined;
  }
  const [version, profile, time, id, extra] = after.split(".");
  const addedAt = Number(time);
  if (
    version !== "w1" ||
    profile !== profileId ||
    !progressIdentifier(id) ||
    !progressTimestamp(addedAt) ||
    String(addedAt) !== time ||
    extra !== undefined
  ) {
    return undefined;
  }
  return Object.freeze({ profileId, first, after: Object.freeze({ addedAt, id }) });
}

export function createWatchlistEvent(
  eventId: string,
  change: WatchlistChange,
  context: ProgressEventContext,
) {
  if (
    !progressIdentifier(eventId) ||
    !normalizeWatchlistChange(change) ||
    !validProgressEventContext(context)
  ) {
    throw new Error("Invalid watchlist event.");
  }
  return Object.freeze({
    eventId,
    eventType: "engagement.watchlist-changed" as const,
    schemaVersion: 1 as const,
    producer: "engagement" as const,
    occurredAt: new Date(change.updatedAt * 1000).toISOString(),
    aggregate: Object.freeze({
      type: "Watchlist" as const,
      id: change.id,
      version: change.version,
    }),
    correlationId: context.correlationId,
    causationId: context.causationId,
    trace: Object.freeze(context.traceparent ? { traceparent: context.traceparent } : {}),
    payload: Object.freeze({
      profileId: change.profileId,
      titleId: change.titleId,
      present: change.present,
    }),
  });
}
export type WatchlistChangedEvent = ReturnType<typeof createWatchlistEvent>;
