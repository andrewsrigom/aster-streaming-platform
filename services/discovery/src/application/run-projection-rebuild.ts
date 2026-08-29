import type { ProjectionStoreResult } from "./projection-ports.js";
import type {
  CatalogSnapshotExportPage,
  CatalogSnapshotExportSource,
  RebuildGenerationState,
  RebuildProjector,
  RebuildStore,
} from "./rebuild-ports.js";
import { normalizeRebuildStart, offsetsCover } from "../domain/rebuild-state.js";
import { discoveryIdentifier } from "../domain/title-projection.js";

export type ProjectionRebuildRunOutcome =
  | Readonly<{ status: "promoted"; generation: string; rowsApplied: number }>
  | Readonly<{ status: "catchup_pending"; generation: string; rowsApplied: number }>
  | Readonly<{ status: "busy" | "conflict" }>;

interface RebuildBarrier {
  barrier(signal: AbortSignal): Promise<ProjectionStoreResult<Readonly<Record<string, string>>>>;
}

function incomplete<T>(
  result: Readonly<{ status: "cancelled" | "unavailable" | "indeterminate" }>,
): ProjectionStoreResult<T> {
  return { status: result.status };
}

function pageProgress(
  value: CatalogSnapshotExportPage,
  after: string | null,
):
  Readonly<{ snapshots: readonly unknown[]; after: string | null; complete: boolean }> | undefined {
  try {
    if (
      !Array.isArray(value.snapshots) ||
      value.snapshots.length > 2 ||
      Reflect.ownKeys(value.snapshots).length !== value.snapshots.length + 1 ||
      typeof value.hasNextPage !== "boolean" ||
      (value.hasNextPage && value.snapshots.length !== 2)
    ) {
      return undefined;
    }
    let previous = after;
    const snapshots: unknown[] = [];
    for (let index = 0; index < value.snapshots.length; index++) {
      const entry = Object.getOwnPropertyDescriptor(value.snapshots, String(index));
      const snapshot = entry && "value" in entry ? (entry.value as unknown) : undefined;
      const descriptor =
        snapshot && typeof snapshot === "object"
          ? Object.getOwnPropertyDescriptor(snapshot, "titleId")
          : undefined;
      const titleId =
        descriptor && "value" in descriptor ? (descriptor.value as unknown) : undefined;
      if (!discoveryIdentifier(titleId) || (previous !== null && titleId <= previous)) {
        return undefined;
      }
      previous = titleId;
      snapshots.push(snapshot);
    }
    const expected = snapshots.length === 0 ? null : previous;
    if (value.endCursor !== expected) {
      return undefined;
    }
    return Object.freeze({
      snapshots: Object.freeze(snapshots),
      after: expected ?? after,
      complete: !value.hasNextPage,
    });
  } catch {
    return undefined;
  }
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 253_402_300_799;
}

export function createProjectionRebuildRunner(
  ports: Readonly<{
    store: RebuildStore;
    source: CatalogSnapshotExportSource;
    projector: RebuildProjector;
    events: RebuildBarrier;
    now: () => number;
    nextId: () => string;
  }>,
) {
  let active = false;

  const execute = async (
    signal: AbortSignal,
  ): Promise<ProjectionStoreResult<ProjectionRebuildRunOutcome>> => {
    const cancelled = () => signal.aborted;
    if (cancelled()) {
      return { status: "cancelled" };
    }
    if (active) {
      return { status: "completed", value: { status: "busy" } };
    }
    active = true;
    try {
      let currentResult = await ports.store.building(signal);
      if (currentResult.status !== "completed") {
        return incomplete(currentResult);
      }
      let current: RebuildGenerationState;
      if (currentResult.value) {
        current = currentResult.value;
      } else {
        const barrier = await ports.events.barrier(signal);
        if (barrier.status !== "completed") {
          return incomplete(barrier);
        }
        const start = normalizeRebuildStart({
          generation: ports.nextId(),
          startedAt: ports.now(),
          barrier: barrier.value,
        });
        if (!start) {
          return { status: "completed", value: { status: "conflict" } };
        }
        const started = await ports.store.start(start, signal);
        if (started.status !== "completed") {
          return incomplete(started);
        }
        if (started.value !== "started") {
          return {
            status: "completed",
            value: { status: started.value === "busy" ? "busy" : "conflict" },
          };
        }
        currentResult = await ports.store.state(start.generation, signal);
        if (currentResult.status !== "completed") {
          return incomplete(currentResult);
        }
        if (!currentResult.value || currentResult.value.state !== "BUILDING") {
          return { status: "completed", value: { status: "conflict" } };
        }
        current = currentResult.value;
      }

      while (!current.scanComplete) {
        const exported = await ports.source.exportPage(current.after, current.generation, signal);
        if (exported.status !== "completed") {
          return incomplete(exported);
        }
        const progress = pageProgress(exported.value, current.after);
        if (!progress || current.rowsApplied + progress.snapshots.length > 1_000_000) {
          return { status: "completed", value: { status: "conflict" } };
        }
        for (const snapshot of progress.snapshots) {
          const indexedAt = ports.now();
          if (!validTime(indexedAt)) {
            return { status: "completed", value: { status: "conflict" } };
          }
          const projected = await ports.projector.apply(
            snapshot,
            { now: indexedAt, event: null },
            signal,
          );
          if (projected.status !== "completed") {
            return incomplete(projected);
          }
          if (
            projected.value.status === "invalid_input" ||
            projected.value.status === "invalid_state" ||
            projected.value.status === "conflict"
          ) {
            return { status: "completed", value: { status: "conflict" } };
          }
        }
        const checkpointed = await ports.store.checkpoint(
          {
            generation: current.generation,
            after: progress.after,
            scanComplete: progress.complete,
            rowsApplied: current.rowsApplied + progress.snapshots.length,
          },
          signal,
        );
        if (checkpointed.status !== "completed") {
          return incomplete(checkpointed);
        }
        if (checkpointed.value !== "checkpointed") {
          return { status: "completed", value: { status: "conflict" } };
        }
        const refreshed = await ports.store.state(current.generation, signal);
        if (refreshed.status !== "completed") {
          return incomplete(refreshed);
        }
        if (!refreshed.value || refreshed.value.state !== "BUILDING") {
          return { status: "completed", value: { status: "conflict" } };
        }
        current = refreshed.value;
      }

      if (!offsetsCover(current.handled, current.barrier)) {
        return {
          status: "completed",
          value: {
            status: "catchup_pending",
            generation: current.generation,
            rowsApplied: current.rowsApplied,
          },
        };
      }
      const completedAt = ports.now();
      if (!validTime(completedAt)) {
        return { status: "completed", value: { status: "conflict" } };
      }
      const promoted = await ports.store.promote(
        { generation: current.generation, completedAt },
        signal,
      );
      if (promoted.status !== "completed") {
        return incomplete(promoted);
      }
      return promoted.value === "promoted"
        ? {
            status: "completed",
            value: {
              status: "promoted",
              generation: current.generation,
              rowsApplied: current.rowsApplied,
            },
          }
        : { status: "completed", value: { status: "conflict" } };
    } catch {
      return { status: cancelled() ? "cancelled" : "indeterminate" };
    } finally {
      active = false;
    }
  };

  return Object.freeze({ execute });
}
