import { playbackIdentifier } from "../domain/session.js";

type SessionContext = Readonly<{
  sessionId: string;
  titleId: string;
  checkedAt: number;
  createdAt: number;
  expiresAt: number;
}>;
type SessionContextResult =
  | Readonly<{ status: "completed"; value: SessionContext }>
  | Readonly<{ status: "invalid_input" | "not_playable" | "unavailable" | "cancelled" }>;
export interface PlaybackSessionReadPort {
  read(
    sessionId: string,
    titleId: string,
    signal: AbortSignal,
  ): Promise<
    | Readonly<{ status: "completed"; value: unknown }>
    | Readonly<{ status: "unavailable" | "cancelled" }>
  >;
}
const timestamp = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= 253_402_300_799;

export function createPlaybackSessionInspector(store: PlaybackSessionReadPort, now: () => number) {
  return Object.freeze({
    async inspect(
      sessionId: unknown,
      titleId: unknown,
      signal: AbortSignal,
    ): Promise<SessionContextResult> {
      if (!playbackIdentifier(sessionId) || !playbackIdentifier(titleId)) {
        return { status: "invalid_input" };
      }
      const cancelled = (): boolean => signal.aborted;
      if (cancelled()) {
        return { status: "cancelled" };
      }
      try {
        const result = await store.read(sessionId, titleId, signal);
        signal.throwIfAborted();
        if (result.status !== "completed") {
          return result;
        }
        if (result.value === null) {
          return { status: "not_playable" };
        }
        if (typeof result.value !== "object" || Array.isArray(result.value)) {
          return { status: "unavailable" };
        }
        const fields = Object.getOwnPropertyDescriptors(result.value);
        const keys = ["sessionId", "titleId", "createdAt", "expiresAt"];
        if (
          Reflect.ownKeys(result.value).length !== keys.length ||
          keys.some((key) => !fields[key] || !("value" in fields[key]))
        ) {
          return { status: "unavailable" };
        }
        const createdAt: unknown = fields["createdAt"]?.value;
        const expiresAt: unknown = fields["expiresAt"]?.value;
        const checkedAt = now();
        if (
          !timestamp(createdAt) ||
          !timestamp(expiresAt) ||
          !timestamp(checkedAt) ||
          fields["sessionId"]?.value !== sessionId ||
          fields["titleId"]?.value !== titleId ||
          createdAt > checkedAt ||
          expiresAt <= createdAt
        ) {
          return { status: "unavailable" };
        }
        return expiresAt <= checkedAt
          ? { status: "not_playable" }
          : {
              status: "completed",
              value: Object.freeze({ sessionId, titleId, createdAt, expiresAt, checkedAt }),
            };
      } catch {
        return { status: cancelled() ? "cancelled" : "unavailable" };
      }
    },
  });
}
