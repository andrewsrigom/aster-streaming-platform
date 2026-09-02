import { createAsterDeadline } from "@aster/runtime";
import { createAnonymousPlaybackSession, playbackIdentifier } from "../domain/session.js";
import type { PlaybackSessionPorts, PlaybackSessionResult } from "./session-ports.js";

export type PlaybackSessions = ReturnType<typeof createPlaybackSessions>;

function awaitDependencyOrAbort<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
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
        (dependencyValue) => {
          remove();
          resolve(dependencyValue);
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
      const deadline = createAsterDeadline({ parentSignal: context.signal, timeoutMs: 2000 });
      const deadlineSignal = deadline.signal;
      let sessionWriteStarted = false;

      try {
        const publicationLookup = await awaitDependencyOrAbort(
          () => ports.catalog.currentPublication(titleId, deadlineSignal, context.traceparent),
          deadlineSignal,
        );
        deadlineSignal.throwIfAborted();
        if (publicationLookup.status !== "completed") {
          return { status: "unavailable" };
        }
        if (publicationLookup.value === null) {
          return { status: "not_playable" };
        }

        const session = createAnonymousPlaybackSession({
          id: ports.nextId(),
          titleId,
          correlationId: context.correlationId,
          publication: publicationLookup.value,
          now: ports.now(),
          allowLocalMedia: ports.allowLocalMedia,
        });
        if (!session) {
          return { status: "unavailable" };
        }

        deadlineSignal.throwIfAborted();
        sessionWriteStarted = true;
        const sessionWrite = await awaitDependencyOrAbort(
          () => ports.sessions.create(session, deadlineSignal),
          deadlineSignal,
        );
        deadlineSignal.throwIfAborted();
        if (sessionWrite.status !== "completed") {
          return { status: sessionWrite.status };
        }

        const checkedAt = ports.now();
        if (
          !Number.isSafeInteger(checkedAt) ||
          checkedAt < session.createdAt ||
          checkedAt >= session.expiresAt
        ) {
          return { status: "not_playable" };
        }

        return { status: "completed", value: session };
      } catch {
        if (sessionWriteStarted) {
          return { status: "indeterminate" };
        }
        if (context.signal.aborted) {
          return { status: "cancelled" };
        }
        return { status: "unavailable" };
      } finally {
        deadline.dispose();
      }
    },
  });
}
