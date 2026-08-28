import type { ProgressPolicy, ProgressState } from "../domain/progress.js";
import type { ProgressRecordedEvent } from "../domain/progress-event.js";

export type ProgressResult<T> =
  | Readonly<{ status: "completed"; value: T }>
  | Readonly<{
      status:
        | "invalid_input"
        | "unauthenticated"
        | "not_found"
        | "not_playable"
        | "stale"
        | "conflict"
        | "backpressure"
        | "unavailable"
        | "cancelled"
        | "indeterminate";
    }>;
export interface ProgressKey {
  readonly accountId: string;
  readonly profileId: string;
  readonly titleId: string;
}
export interface ProgressReceipt extends ProgressKey {
  readonly idempotencyKey: string;
  readonly requestDigest: string;
  readonly result: ProgressState;
  readonly expiresAt: number;
}
interface ProgressTransaction {
  // Serialize this aggregate and its profile-deletion tombstone before inspecting receipts/state.
  lock(key: ProgressKey): Promise<Readonly<{ deleted: boolean; current: ProgressState | null }>>;
  pruneReceipts(key: ProgressKey, now: number, maximum: number): Promise<void>;
  findReceipt(key: ProgressKey, idempotencyKey: string): Promise<ProgressReceipt | null>;
  retainedCounts(key: ProgressKey): Promise<Readonly<{ receipts: number; outbox: number }>>;
  save(progress: ProgressState): Promise<void>;
  writeReceipt(receipt: ProgressReceipt): Promise<void>;
  appendOutbox(event: ProgressRecordedEvent): Promise<void>;
}
export interface ProgressPorts {
  readonly identity: {
    authorizeProfile(
      credential: string,
      profileId: string,
      request: Pick<ProgressRequest, "signal" | "correlationId" | "traceparent">,
    ): Promise<
      ProgressResult<
        Readonly<{
          accountId: string;
          profileId: string;
          checkedAt: number;
          expiresAt: number;
        }>
      >
    >;
  };
  readonly playback: {
    inspect(
      sessionId: string,
      titleId: string,
      request: Pick<ProgressRequest, "signal" | "correlationId" | "traceparent">,
    ): Promise<
      ProgressResult<
        Readonly<{
          sessionId: string;
          titleId: string;
          checkedAt: number;
          createdAt: number;
          expiresAt: number;
        }>
      >
    >;
  };
  readonly receipts: {
    read(
      key: ProgressKey,
      idempotencyKey: string,
      signal: AbortSignal,
    ): Promise<ProgressResult<ProgressReceipt | null>>;
  };
  readonly transactions: {
    // Commit only completed callbacks; distinguish acknowledged commit from unknown outcome.
    run(
      work: (transaction: ProgressTransaction) => Promise<ProgressResult<ProgressState>>,
      signal: AbortSignal,
    ): Promise<ProgressResult<ProgressState>>;
  };
  readonly now: () => number;
  readonly nextId: () => string;
  readonly digest: (payload: string) => string;
  readonly policy: ProgressPolicy;
  readonly limits: Readonly<{
    receiptSeconds: number;
    maximumReceipts: number;
    maximumOutbox: number;
  }>;
}
export interface ProgressRequest {
  readonly credential: unknown;
  readonly correlationId: string;
  readonly traceparent?: string;
  readonly signal: AbortSignal;
}
