import type { AsterProductOutcome, AsterTelemetry } from "@aster/telemetry";
import type { createProgressRecorder } from "../application/record-progress.js";

type ProgressRecorder = ReturnType<typeof createProgressRecorder>;
const MAXIMUM_PRODUCT_DURATION_MS = 300_000;

function outcomeFor(
  status: Awaited<ReturnType<ProgressRecorder["record"]>>["status"],
): AsterProductOutcome {
  switch (status) {
    case "completed":
      return "completed";
    case "stale":
      return "stale";
    case "conflict":
      return "conflict";
    case "not_playable":
      return "not_playable";
    case "cancelled":
      return "cancelled";
    case "unavailable":
      return "unavailable";
    case "indeterminate":
      return "indeterminate";
    case "invalid_input":
    case "unauthenticated":
    case "not_found":
    case "backpressure":
    case "limit_exceeded":
      return "rejected";
  }
}

export function observeProgressRecorder(
  recorder: ProgressRecorder,
  telemetry: Pick<AsterTelemetry, "recordProductOperation">,
  clock: () => number = () => performance.now(),
): ProgressRecorder {
  return Object.freeze({
    async record(value, request) {
      const startedAt = clock();
      let outcome: AsterProductOutcome = "failed";
      try {
        const result = await recorder.record(value, request);
        outcome = outcomeFor(result.status);
        return result;
      } finally {
        try {
          telemetry.recordProductOperation?.({
            operation: "progress_write",
            outcome,
            durationMs: Math.min(MAXIMUM_PRODUCT_DURATION_MS, Math.max(0, clock() - startedAt)),
          });
        } catch {
          // Product telemetry cannot change the progress result.
        }
      }
    },
  });
}
