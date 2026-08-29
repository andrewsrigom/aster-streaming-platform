import {
  normalizeRebuildCheckpoint,
  normalizeRebuildStart,
  validPromotion,
} from "../domain/rebuild-state.js";
import type { ProjectionStoreResult } from "./projection-ports.js";
import type { RebuildOutcome, RebuildStore } from "./rebuild-ports.js";

type Result = ProjectionStoreResult<RebuildOutcome | "invalid_input">;

export function createProjectionRebuilder(ports: Readonly<{ store: RebuildStore }>) {
  return Object.freeze({
    start(value: unknown, signal: AbortSignal): Promise<Result> {
      const input = normalizeRebuildStart(value);
      return input
        ? ports.store.start(input, signal)
        : Promise.resolve({ status: "completed", value: "invalid_input" });
    },
    checkpoint(value: unknown, signal: AbortSignal): Promise<Result> {
      const input = normalizeRebuildCheckpoint(value);
      return input
        ? ports.store.checkpoint(input, signal)
        : Promise.resolve({ status: "completed", value: "invalid_input" });
    },
    promote(value: unknown, signal: AbortSignal): Promise<Result> {
      return validPromotion(value)
        ? ports.store.promote(value, signal)
        : Promise.resolve({ status: "completed", value: "invalid_input" });
    },
  });
}
