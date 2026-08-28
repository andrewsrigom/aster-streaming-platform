import type {
  WatchlistChange,
  WatchlistChangedEvent,
  WatchlistEntry,
  WatchlistPageInput,
} from "../domain/watchlist.js";
import type { ProgressCatalog, ProgressPorts } from "./progress-ports.js";

export type WatchlistResult<T> =
  | Readonly<{ status: "completed"; value: T }>
  | Readonly<{
      status:
        | "invalid_input"
        | "unauthenticated"
        | "not_found"
        | "not_visible"
        | "conflict"
        | "backpressure"
        | "unavailable"
        | "cancelled"
        | "indeterminate";
    }>;
export interface WatchlistOwner {
  readonly accountId: string;
  readonly profileId: string;
}
export interface WatchlistReceipt extends WatchlistOwner {
  readonly idempotencyKey: string;
  readonly requestDigest: string;
  readonly result: WatchlistChange;
  readonly expiresAt: number;
}
export interface CatalogVisibility {
  readonly titleId: string;
  readonly visible: boolean;
  readonly checkedAt: number;
  readonly expiresAt: number;
}
export interface WatchlistTransaction {
  lock(
    owner: WatchlistOwner,
  ): Promise<Readonly<{ deleted: boolean; current: WatchlistChange | null }>>;
  pruneReceipts(owner: WatchlistOwner, now: number): Promise<void>;
  receipt(owner: WatchlistOwner, key: string): Promise<WatchlistReceipt | null>;
  counts(owner: WatchlistOwner): Promise<Readonly<{ receipts: number; outbox: number }>>;
  save(
    change: WatchlistChange,
    authority: Readonly<{ checkedAt: number; expiresAt: number }>,
    entryId: string,
  ): Promise<void>;
  writeReceipt(receipt: WatchlistReceipt): Promise<void>;
  appendOutbox(event: WatchlistChangedEvent): Promise<void>;
}
export interface WatchlistStore {
  receipt(
    owner: WatchlistOwner,
    key: string,
    signal: AbortSignal,
  ): Promise<WatchlistResult<WatchlistReceipt | null>>;
  candidates(
    owner: WatchlistOwner,
    input: WatchlistPageInput,
    signal: AbortSignal,
  ): Promise<WatchlistResult<readonly WatchlistEntry[]>>;
  run(
    work: (tx: WatchlistTransaction) => Promise<WatchlistResult<WatchlistChange>>,
    signal: AbortSignal,
  ): Promise<WatchlistResult<WatchlistChange>>;
}
export interface WatchlistPorts {
  readonly identity: ProgressPorts["identity"];
  readonly catalog: ProgressCatalog;
  readonly store: WatchlistStore;
  readonly now: () => number;
  readonly nextId: () => string;
  readonly digest: (payload: string) => string;
}
