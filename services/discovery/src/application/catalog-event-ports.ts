import type { ProjectionApplyResult } from "./apply-title-snapshot.js";
import type { ProjectionStoreResult } from "./projection-ports.js";

export interface CatalogEventRecord {
  readonly topic: string;
  readonly partition: number;
  readonly offset: string;
  readonly key: Uint8Array | null;
  readonly value: Uint8Array;
  readonly headers: Readonly<Record<string, Uint8Array>>;
}

export interface CatalogEventFact {
  readonly eventId: string;
  readonly titleId: string;
  readonly version: number;
  readonly occurredAt: number;
  readonly eventType: "catalog.title-published" | "catalog.title-retired";
  readonly correlationId: string;
  readonly traceparent?: string;
}

export type CatalogPoisonReason =
  "envelope" | "source_absent" | "source_conflict" | "projection_conflict";

export type CatalogEventInspection =
  | Readonly<{ status: "valid"; fact: CatalogEventFact; record: CatalogEventRecord }>
  | Readonly<{ status: "poison"; reason: "envelope"; record: CatalogEventRecord }>
  | Readonly<{ status: "oversized" }>;

export interface CatalogSnapshotSource {
  current(
    titleId: string,
    correlationId: string,
    signal: AbortSignal,
  ): Promise<ProjectionStoreResult<unknown>>;
}

export interface CatalogEventStore {
  quarantine(
    record: CatalogEventRecord,
    reason: CatalogPoisonReason,
    signal: AbortSignal,
  ): Promise<"stored" | "duplicate" | "full" | "unavailable">;
  readQuarantine(id: string, signal: AbortSignal): Promise<CatalogEventRecord | undefined>;
  completeReplay(id: string, signal: AbortSignal): Promise<boolean>;
}

export interface CatalogEventProjector {
  apply(
    snapshot: unknown,
    context: Readonly<{
      now: number;
      event: Readonly<{ id: string; titleId: string; version: number }> | null;
    }>,
    signal: AbortSignal,
  ): Promise<ProjectionApplyResult>;
}

export interface CatalogEventPorts {
  readonly inspect: (record: CatalogEventRecord) => CatalogEventInspection;
  readonly source: CatalogSnapshotSource;
  readonly projector: CatalogEventProjector;
  readonly store: CatalogEventStore;
  readonly now: () => number;
}
