export {
  ASTER_OBJECT_STORAGE_DEFAULTS,
  AsterObjectStorageConfigurationError,
  AsterObjectStorageLifecycleError,
} from "./object-storage-contract.js";
export type {
  AsterObjectKeyInput,
  AsterObjectReadInput,
  AsterObjectStorageAdapter,
  AsterObjectStorageCloseResult,
  AsterObjectStorageConfigurationIssue,
  AsterObjectStorageConfigurationOption,
  AsterObjectStorageOperationResult,
  AsterObjectStorageOptions,
  AsterObjectStorageSnapshot,
  AsterObjectStorageTelemetry,
  AsterObjectWriteInput,
} from "./object-storage-contract.js";
export { createAsterObjectStorageAdapter } from "./infrastructure/s3-adapter.js";
