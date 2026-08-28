import type { AcquisitionAttempt } from "../domain/media-acquisition.js";
import type { ProcessingAttempt } from "../domain/media-processing.js";
import type { CatalogMediaPorts, CatalogMediaTransaction } from "./media-ports.js";
import type { CatalogStoreResult } from "./rights-ports.js";

export interface ProcessingTransaction extends CatalogMediaTransaction {
  findAcquisition(id: string): Promise<AcquisitionAttempt | undefined>;
  lockProcessingSlot(): Promise<boolean>;
  runningProcessing(): Promise<ProcessingAttempt | undefined>;
  findProcessing(id: string): Promise<ProcessingAttempt | undefined>;
  listProcessing(processingKey: string): Promise<readonly ProcessingAttempt[]>;
  insertProcessing(attempt: ProcessingAttempt): Promise<void>;
  finishProcessing(attempt: ProcessingAttempt): Promise<void>;
}
export interface ProcessingUnitOfWork {
  run<T>(
    work: (tx: ProcessingTransaction) => Promise<CatalogStoreResult<T>>,
    signal: AbortSignal,
  ): Promise<CatalogStoreResult<T>>;
}
export interface ProcessingPorts extends Omit<CatalogMediaPorts, "transactions"> {
  readonly transactions: ProcessingUnitOfWork;
  readonly nextId: () => string;
}
