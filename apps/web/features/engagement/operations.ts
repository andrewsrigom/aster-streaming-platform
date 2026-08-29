import { gql, type TypedDocumentNode } from "@apollo/client";
import { playerIdentifier } from "../playback/operations.ts";
import type { ProgressCommand, ProgressSaveResult } from "./progress-reporter.ts";

export interface SavedProgress {
  readonly id: string;
  readonly profileId: string;
  readonly titleId: string;
  readonly sequence: number;
  readonly version: number;
  readonly positionMs: number;
  readonly durationMs: number;
  readonly status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  readonly occurredAt: number;
  readonly updatedAt: number;
}
export interface ProgressOutcome {
  readonly code: ProgressSaveResult["code"];
  readonly correlationId: string;
  readonly retryAfterMs?: number;
  readonly progress: SavedProgress | null;
}
export interface ProgressPair {
  readonly profileId: string;
  readonly titleId: string;
}
export const PLAYER_PROGRESS: TypedDocumentNode<
  { profile: { id: string; progress: SavedProgress | null } },
  ProgressPair
> = gql`
  query PlayerProgress($profileId: ID!, $titleId: ID!) {
    profile(id: $profileId) {
      id
      progress(titleId: $titleId) {
        id
        profileId
        titleId
        sequence
        version
        positionMs
        durationMs
        status
        occurredAt
        updatedAt
      }
    }
  }
`;
export const RECORD_PROGRESS: TypedDocumentNode<
  { recordProgress: ProgressOutcome },
  { input: ProgressCommand }
> = gql`
  mutation RecordProgress($input: RecordProgressInput!) {
    recordProgress(input: $input) {
      code
      correlationId
      retryAfterMs
      progress {
        id
        profileId
        titleId
        sequence
        version
        positionMs
        durationMs
        status
        occurredAt
        updatedAt
      }
    }
  }
`;

export const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid engagement data.");
  }
  return value as Record<string, unknown>;
};
export const integer = (value: unknown, min: number, max = 2147483647): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error("Invalid engagement number.");
  }
  return value;
};
export const identifier = (value: unknown): string => {
  if (!playerIdentifier(value)) {
    throw new Error("Invalid engagement identifier.");
  }
  return value;
};
export function readProgressCommand(value: unknown, profileId: string): ProgressCommand {
  const input = record(value);
  if (Object.keys(input).length !== 8 || input["profileId"] !== profileId) {
    throw new Error("Invalid engagement ownership.");
  }
  const durationMs = integer(input["durationMs"], 1, 43200000);
  return Object.freeze({
    profileId: identifier(input["profileId"]),
    titleId: identifier(input["titleId"]),
    playbackSessionId: identifier(input["playbackSessionId"]),
    idempotencyKey: identifier(input["idempotencyKey"]),
    sequence: integer(input["sequence"], 1),
    positionMs: integer(input["positionMs"], 0, durationMs),
    durationMs,
    occurredAt: integer(input["occurredAt"], 0, Number.MAX_SAFE_INTEGER),
  });
}
function readSavedProgress(value: unknown, pair: ProgressPair): SavedProgress {
  const input = record(value);
  if (input["profileId"] !== pair.profileId || input["titleId"] !== pair.titleId) {
    throw new Error("Invalid engagement ownership.");
  }
  const status = input["status"];
  if (status !== "NOT_STARTED" && status !== "IN_PROGRESS" && status !== "COMPLETED") {
    throw new Error("Invalid engagement status.");
  }
  const durationMs = integer(input["durationMs"], 1, 43200000);
  return {
    id: identifier(input["id"]),
    profileId: identifier(input["profileId"]),
    titleId: identifier(input["titleId"]),
    sequence: integer(input["sequence"], 1),
    version: integer(input["version"], 1),
    positionMs: integer(input["positionMs"], 0, durationMs),
    durationMs,
    status,
    occurredAt: integer(input["occurredAt"], 0, Number.MAX_SAFE_INTEGER),
    updatedAt: integer(input["updatedAt"], 0, Number.MAX_SAFE_INTEGER),
  };
}
export function readPlayerProgress(value: unknown, pair: ProgressPair) {
  const profile = record(value);
  if (profile["id"] !== pair.profileId) {
    throw new Error("Invalid engagement ownership.");
  }
  return {
    id: identifier(profile["id"]),
    progress: profile["progress"] === null ? null : readSavedProgress(profile["progress"], pair),
  };
}
export function readProgressOutcome(value: unknown, command: ProgressCommand): ProgressOutcome {
  const input = record(value);
  const code = input["code"];
  const correlationId = identifier(input["correlationId"]);
  const retryAfterMs = input["retryAfterMs"];
  if (code === "COMPLETED") {
    if (retryAfterMs !== null && retryAfterMs !== undefined) {
      throw new Error("Invalid progress retry policy.");
    }
    const progress = readSavedProgress(input["progress"], command);
    if (
      progress.sequence !== command.sequence ||
      progress.positionMs !== command.positionMs ||
      progress.durationMs !== command.durationMs ||
      progress.occurredAt !== command.occurredAt
    ) {
      throw new Error("Mismatched progress acknowledgement.");
    }
    return { code, correlationId, progress };
  }
  if (
    input["progress"] !== null ||
    (code !== "INVALID_INPUT" &&
      code !== "UNAUTHENTICATED" &&
      code !== "NOT_FOUND" &&
      code !== "NOT_PLAYABLE" &&
      code !== "STALE" &&
      code !== "CONFLICT" &&
      code !== "BACKPRESSURE" &&
      code !== "LIMIT_EXCEEDED" &&
      code !== "UNAVAILABLE" &&
      code !== "CANCELLED" &&
      code !== "INDETERMINATE")
  ) {
    throw new Error("Invalid progress outcome.");
  }
  if (code === "LIMIT_EXCEEDED") {
    return { code, correlationId, retryAfterMs: integer(retryAfterMs, 1, 30_000), progress: null };
  }
  if (retryAfterMs !== null && retryAfterMs !== undefined) {
    throw new Error("Invalid progress retry policy.");
  }
  return { code, correlationId, progress: null };
}
