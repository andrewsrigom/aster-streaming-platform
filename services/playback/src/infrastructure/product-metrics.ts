import type { AsterProductOutcome, AsterTelemetry } from "@aster/telemetry";
import type { PlaybackSessions } from "../application/create-session.js";

const MAXIMUM_PRODUCT_DURATION_MS = 300_000;

function outcomeFor(
  status: Awaited<ReturnType<PlaybackSessions["create"]>>["status"],
): AsterProductOutcome {
  switch (status) {
    case "completed":
      return "completed";
    case "not_playable":
      return "not_playable";
    case "cancelled":
      return "cancelled";
    case "indeterminate":
      return "indeterminate";
    case "unavailable":
      return "unavailable";
    case "invalid_input":
    case "limit_exceeded":
      return "rejected";
  }
}

export function observePlaybackSessions(
  sessions: PlaybackSessions,
  telemetry: Pick<AsterTelemetry, "recordProductOperation">,
  clock: () => number = () => performance.now(),
): PlaybackSessions {
  return Object.freeze({
    async create(titleId, context) {
      const startedAt = clock();
      let outcome: AsterProductOutcome = "failed";
      try {
        const result = await sessions.create(titleId, context);
        outcome = outcomeFor(result.status);
        return result;
      } finally {
        try {
          telemetry.recordProductOperation?.({
            operation: "playback_session",
            outcome,
            durationMs: Math.min(MAXIMUM_PRODUCT_DURATION_MS, Math.max(0, clock() - startedAt)),
          });
        } catch {
          // Product telemetry cannot change the session result.
        }
      }
    },
  });
}
