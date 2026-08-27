import type { RightsRecord } from "../domain/rights.js";
import type { CatalogTitleLifecycle } from "../domain/title.js";

export interface StoredCatalogTitle extends CatalogTitleLifecycle {
  readonly latestRightsRevision: number;
}

export interface RightsProvenance {
  readonly actorId: string;
  readonly recordedAt: number;
  readonly correlationId: string;
}

export interface CatalogRightsRevision extends RightsProvenance {
  readonly record: RightsRecord;
  readonly titleVersion: number;
}

export type CatalogStoreResult<T> =
  | Readonly<{ status: "completed"; value: T }>
  | Readonly<{
      status:
        | "conflict"
        | "not_found"
        | "invalid_input"
        | "unavailable"
        | "cancelled"
        | "indeterminate"
        | "unauthorized"
        | "invalid_transition"
        | "rights_not_approved"
        | "media_not_ready"
        | "backpressure";
    }>;

export interface CatalogRightsTransaction {
  createDraft(titleId: string): Promise<boolean>;
  lockTitle(titleId: string): Promise<StoredCatalogTitle | undefined>;
  appendRights(
    record: unknown,
    expectedTitleVersion: number,
    provenance: unknown,
  ): Promise<boolean>;
  findRights(titleId: string, revision: number | null): Promise<CatalogRightsRevision | undefined>;
  listRights(
    titleId: string,
    beforeRevision: number | null,
    first: number,
  ): Promise<readonly CatalogRightsRevision[]>;
}

/** The owning application authorizes the operator before entering this transaction. */
export interface CatalogRightsUnitOfWork {
  run<T>(
    operation: (transaction: CatalogRightsTransaction) => Promise<CatalogStoreResult<T>>,
    signal: AbortSignal,
  ): Promise<CatalogStoreResult<T>>;
}
