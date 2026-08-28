import type { AcquisitionAttempt } from "../domain/media-acquisition.js";
import type { CatalogMediaRequest } from "../domain/media-request.js";
import type { RightsUsePolicy } from "../domain/rights.js";
import type { CatalogMediaTransaction } from "./media-ports.js";
import type { CatalogOperatorAuthority } from "./operator-ports.js";
import type { CatalogStoreResult } from "./rights-ports.js";

export interface AcquisitionApproval {
  readonly media: CatalogMediaRequest;
  readonly reuseApproved: boolean;
}

export interface AcquisitionTransaction extends CatalogMediaTransaction {
  lockAcquisitionSlot(): Promise<boolean>;
  runningAcquisition(): Promise<AcquisitionAttempt | undefined>;
  findAcquisition(id: string): Promise<AcquisitionAttempt | undefined>;
  listAcquisitions(requestId: string): Promise<readonly AcquisitionAttempt[]>;
  insertAcquisition(attempt: AcquisitionAttempt): Promise<void>;
  finishAcquisition(attempt: AcquisitionAttempt): Promise<void>;
}
export interface AcquisitionUnitOfWork {
  run<T>(
    work: (tx: AcquisitionTransaction) => Promise<CatalogStoreResult<T>>,
    signal: AbortSignal,
  ): Promise<CatalogStoreResult<T>>;
}
export interface AcquisitionPorts {
  readonly authority: CatalogOperatorAuthority;
  readonly transactions: AcquisitionUnitOfWork;
  readonly policy: RightsUsePolicy;
  readonly now: () => number;
  readonly nextId: () => string;
}
