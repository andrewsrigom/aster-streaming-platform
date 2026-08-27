import type { PublicCatalogCandidate } from "../domain/public-title.js";
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
