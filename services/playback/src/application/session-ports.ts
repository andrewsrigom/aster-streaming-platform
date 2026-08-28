import type { PlaybackSession } from "../domain/session.js";

export type PublicationLookup =
  | Readonly<{ status: "completed"; value: unknown }>
  | Readonly<{ status: "unavailable" | "cancelled" }>;
export type SessionWrite = Readonly<{
  // completed requires an acknowledged commit; uncertain writes are never retried automatically.
  status: "completed" | "unavailable" | "cancelled" | "indeterminate" | "limit_exceeded";
}>;
export interface PlaybackSessionPorts {
  readonly catalog: {
    currentPublication(
      titleId: string,
      signal: AbortSignal,
      traceparent?: string,
    ): Promise<PublicationLookup>;
  };
  readonly sessions: {
    create(session: PlaybackSession, signal: AbortSignal): Promise<SessionWrite>;
  };
  readonly now: () => number;
  readonly nextId: () => string;
  readonly allowLocalMedia: boolean;
}

export type PlaybackSessionResult =
  | Readonly<{ status: "completed"; value: PlaybackSession }>
  | Readonly<{
      status:
        | "invalid_input"
        | "not_playable"
        | "unavailable"
        | "cancelled"
        | "indeterminate"
        | "limit_exceeded";
    }>;
