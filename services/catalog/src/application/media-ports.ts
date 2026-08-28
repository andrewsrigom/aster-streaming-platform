import type { CatalogMediaRequest } from "../domain/media-request.js";
import type { RightsUsePolicy } from "../domain/rights.js";
import type { CatalogOperatorAuthority } from "./operator-ports.js";
import type { CatalogRightsTransaction, CatalogStoreResult } from "./rights-ports.js";

export interface CatalogMediaTransaction extends CatalogRightsTransaction {
  findMediaRequest(requestId: string): Promise<CatalogMediaRequest | undefined>;
  findMediaFingerprint(
    titleId: string,
    fingerprint: string,
  ): Promise<CatalogMediaRequest | undefined>;
  countMediaRequests(titleId: string): Promise<number>;
  insertMediaRequest(request: CatalogMediaRequest): Promise<boolean>;
}
export interface CatalogMediaUnitOfWork {
  run<T>(
    operation: (transaction: CatalogMediaTransaction) => Promise<CatalogStoreResult<T>>,
    signal: AbortSignal,
  ): Promise<CatalogStoreResult<T>>;
}
export interface CatalogMediaPorts {
  readonly authority: CatalogOperatorAuthority;
  readonly transactions: CatalogMediaUnitOfWork;
  readonly policy: RightsUsePolicy;
  readonly now: () => number;
  readonly digest: (text: string) => string;
}
