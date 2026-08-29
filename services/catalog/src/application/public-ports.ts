import type { PublicCatalogCandidate, PublicCatalogTitle } from "../domain/public-title.js";
import type { RightsUsePolicy } from "../domain/rights.js";
import type { CatalogStoreResult } from "./rights-ports.js";

export interface CatalogReadScope {
  readonly now: number;
  readonly policy: RightsUsePolicy;
}
export interface CatalogPublicRepository {
  browse(
    afterId: string | null,
    limit: number,
    scope: CatalogReadScope,
  ): Promise<readonly PublicCatalogCandidate[]>;
  findMany(
    ids: readonly string[],
    scope: CatalogReadScope,
  ): Promise<readonly PublicCatalogCandidate[]>;
}
export interface CatalogPublicUnitOfWork {
  run<T>(
    work: (repository: CatalogPublicRepository) => Promise<CatalogStoreResult<T>>,
    signal: AbortSignal,
  ): Promise<CatalogStoreResult<T>>;
}

export interface CatalogPublicFence {
  readonly id: string;
  readonly titleVersion: number;
  readonly rightsRevision: number;
  readonly publicationId: string;
}

export interface CatalogPublicEntitySource {
  findFences(
    ids: readonly string[],
    scope: CatalogReadScope,
    signal: AbortSignal,
  ): Promise<CatalogStoreResult<readonly CatalogPublicFence[]>>;
  findManyAtFences(
    fences: readonly CatalogPublicFence[],
    scope: CatalogReadScope,
    signal: AbortSignal,
  ): Promise<CatalogStoreResult<readonly PublicCatalogCandidate[]>>;
}

export interface CatalogPublicEntityReader {
  findMany(
    ids: readonly string[],
    scope: CatalogReadScope,
    signal: AbortSignal,
  ): Promise<CatalogStoreResult<readonly PublicCatalogTitle[]>>;
}

export type CatalogCacheResult<T> =
  | Readonly<{ status: "completed"; value: T }>
  | Readonly<{ status: "malformed" }>
  | Readonly<{ status: "cancelled" }>
  | Readonly<{ status: "bypass" }>;

export interface CatalogPublicCacheStore {
  read(key: string, signal: AbortSignal): Promise<CatalogCacheResult<string | null>>;
  write(
    key: string,
    value: string,
    ttlMs: number,
    mode: "replace" | "if_absent",
    signal: AbortSignal,
  ): Promise<CatalogCacheResult<boolean>>;
  acquireLease(
    key: string,
    ownershipToken: string,
    ttlMs: number,
    signal: AbortSignal,
  ): Promise<CatalogCacheResult<boolean>>;
  delete(key: string, signal: AbortSignal): Promise<CatalogCacheResult<boolean>>;
  compareAndDelete(
    key: string,
    expectedValue: string,
    signal: AbortSignal,
  ): Promise<CatalogCacheResult<boolean>>;
}

type CatalogCacheOutcome =
  | "hit"
  | "negative_hit"
  | "miss"
  | "malformed"
  | "bypass"
  | "source_load"
  | "fence_changed"
  | "coalesced"
  | "lease_acquired"
  | "lease_contended"
  | "lease_lost";

export interface CatalogCacheObservation {
  readonly outcome: CatalogCacheOutcome;
  readonly durationMs: number;
  readonly payloadBytes?: number;
  readonly waiterBucket?: "one" | "two_to_four" | "five_plus";
}
