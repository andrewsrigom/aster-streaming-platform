import type {
  BrokerOffsets,
  RebuildCheckpoint,
  RebuildHandledOffset,
  RebuildStart,
} from "../domain/rebuild-state.js";
import type { ProjectionStoreResult } from "./projection-ports.js";
import type { ProjectionApplyResult } from "./apply-title-snapshot.js";

export type RebuildOutcome = "started" | "checkpointed" | "promoted" | "busy" | "conflict";

export interface RebuildGenerationState {
  readonly generation: string;
  readonly state: "ACTIVE" | "BUILDING" | "PREVIOUS";
  readonly barrier: BrokerOffsets;
  readonly handled: BrokerOffsets;
  readonly after: string | null;
  readonly scanComplete: boolean;
  readonly rowsApplied: number;
}

interface ActiveRebuildGeneration {
  readonly generation: string;
  readonly startedAt: number;
}

export interface CatalogSnapshotExportPage {
  readonly snapshots: readonly unknown[];
  readonly endCursor: string | null;
  readonly hasNextPage: boolean;
}

export interface CatalogSnapshotExportSource {
  exportPage(
    after: string | null,
    correlationId: string,
    signal: AbortSignal,
  ): Promise<ProjectionStoreResult<CatalogSnapshotExportPage>>;
}

export interface RebuildProjector {
  apply(
    snapshot: unknown,
    context: Readonly<{ now: number; event: null }>,
    signal: AbortSignal,
  ): Promise<ProjectionApplyResult>;
}

export interface RebuildStore {
  active(signal: AbortSignal): Promise<ProjectionStoreResult<ActiveRebuildGeneration>>;
  start(value: RebuildStart, signal: AbortSignal): Promise<ProjectionStoreResult<RebuildOutcome>>;
  checkpoint(
    value: RebuildCheckpoint,
    signal: AbortSignal,
  ): Promise<ProjectionStoreResult<RebuildOutcome>>;
  recordHandled(
    value: RebuildHandledOffset,
    signal: AbortSignal,
  ): Promise<ProjectionStoreResult<RebuildOutcome>>;
  promote(
    value: Readonly<{ generation: string; completedAt: number }>,
    signal: AbortSignal,
  ): Promise<ProjectionStoreResult<RebuildOutcome>>;
  state(
    generation: string,
    signal: AbortSignal,
  ): Promise<ProjectionStoreResult<RebuildGenerationState | null>>;
  building(signal: AbortSignal): Promise<ProjectionStoreResult<RebuildGenerationState | null>>;
}
