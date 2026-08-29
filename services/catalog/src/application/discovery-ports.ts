import type { DiscoveryCandidate } from "../domain/discovery-snapshot.js";
import type { CatalogStoreResult } from "./rights-ports.js";

export interface CatalogDiscoveryRepository {
  findMany(ids: readonly string[]): Promise<readonly DiscoveryCandidate[]>;
  scan(afterId: string | null, limit: number): Promise<readonly DiscoveryCandidate[]>;
}
export interface CatalogDiscoveryUnitOfWork {
  run<T>(
    work: (repository: CatalogDiscoveryRepository) => Promise<CatalogStoreResult<T>>,
    signal: AbortSignal,
  ): Promise<CatalogStoreResult<T>>;
}
