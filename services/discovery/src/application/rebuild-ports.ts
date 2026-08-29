import type { BrokerOffsets, RebuildCheckpoint, RebuildStart } from "../domain/rebuild-state.js";
import type { ProjectionStoreResult } from "./projection-ports.js";

export type RebuildOutcome = "started" | "checkpointed" | "promoted" | "busy" | "conflict";

export interface RebuildStore {
  start(value: RebuildStart, signal: AbortSignal): Promise<ProjectionStoreResult<RebuildOutcome>>;
  checkpoint(
    value: RebuildCheckpoint,
    signal: AbortSignal,
  ): Promise<ProjectionStoreResult<RebuildOutcome>>;
  promote(
    value: Readonly<{ generation: string; completedAt: number }>,
    signal: AbortSignal,
  ): Promise<ProjectionStoreResult<RebuildOutcome>>;
  state(
    generation: string,
    signal: AbortSignal,
  ): Promise<
    ProjectionStoreResult<Readonly<{
      state: "ACTIVE" | "BUILDING" | "PREVIOUS";
      barrier: BrokerOffsets;
      handled: BrokerOffsets;
      after: string | null;
      scanComplete: boolean;
      rowsApplied: number;
    }> | null>
  >;
}
