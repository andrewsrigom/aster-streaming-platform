import { createAnonymousPlaybackSession, playbackIdentifier } from "../domain/session.js";
import type { PlaybackSessionPorts, PlaybackSessionResult } from "./session-ports.js";

export type PlaybackSessions = ReturnType<typeof createPlaybackSessions>;

function untilAborted<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const remove = () => {
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      remove();
      reject(new Error("Playback operation cancelled."));
    };
    signal.addEventListener("abort", abort, { once: true });
    // Consume late success/failure even if an adapter ignores cancellation; never start later stages.
    void Promise.resolve()
      .then(() => {
        signal.throwIfAborted();
        return work();
      })
      .then(
        (value) => {
          remove();
          resolve(value);
        },
        (error: unknown) => {
          remove();
          reject(error instanceof Error ? error : new Error("Playback dependency failed."));
        },
      );
    if (signal.aborted) {
      abort();
    }
  });
}

export function createPlaybackSessions(ports: PlaybackSessionPorts) {
  return Object.freeze({
    async create(
      titleId: unknown,
      context: Readonly<{ correlationId: string; signal: AbortSignal; traceparent?: string }>,
    ): Promise<PlaybackSessionResult> {
      if (!playbackIdentifier(titleId) || !playbackIdentifier(context.correlationId)) {
        return { status: "invalid_input" };
      }
      const active = AbortSignal.any([context.signal, AbortSignal.timeout(2000)]);
      let inserting = false;
      try {
        const current = await untilAborted(
          () => ports.catalog.currentPublication(titleId, active, context.traceparent),
          active,
        );
        active.throwIfAborted();
        if (current.status !== "completed") {
          return { status: "unavailable" };
        }
        if (current.value === null) {
          return { status: "not_playable" };
        }
        const session = createAnonymousPlaybackSession({
          id: ports.nextId(),
          titleId,
          correlationId: context.correlationId,
          publication: current.value,
          now: ports.now(),
          allowLocalMedia: ports.allowLocalMedia,
        });
        if (!session) {
          return { status: "unavailable" };
        }
        active.throwIfAborted();
        inserting = true;
        const result = await untilAborted(() => ports.sessions.create(session, active), active);
        active.throwIfAborted();
        if (result.status !== "completed") {
          return { status: result.status };
        }
        const now = ports.now();
        if (!Number.isSafeInteger(now) || now < session.createdAt || now >= session.expiresAt) {
          return { status: "not_playable" };
        }
        return { status: "completed", value: session };
      } catch {
        return {
          status: inserting
            ? "indeterminate"
            : context.signal.aborted
              ? "cancelled"
              : "unavailable",
        };
      }
    },
  });
}
