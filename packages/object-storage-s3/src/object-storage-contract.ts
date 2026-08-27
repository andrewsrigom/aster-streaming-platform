import type { Readable, Writable } from "node:stream";

import type { AsterTelemetry } from "@aster/telemetry";

export const ASTER_OBJECT_STORAGE_DEFAULTS = Object.freeze({
  maxInFlightOperations: 8,
  maxObjectBytes: 256 * 1024 * 1024,
  connectionTimeoutMs: 2_000,
  operationTimeoutMs: 60_000,
  closeTimeoutMs: 2_000,
  uploadQueueSize: 2,
  uploadPartSizeBytes: 5 * 1024 * 1024,
  fixtureKeyPrefix: "aster-fixtures/",
} as const);

export type AsterObjectStorageConfigurationOption =
  | "<options>"
  | "endpoint"
  | "region"
  | "bucket"
  | "accessKeyId"
  | "secretAccessKey"
  | "sessionToken"
  | "telemetry"
  | "maxInFlightOperations"
  | "maxObjectBytes"
  | "connectionTimeoutMs"
  | "operationTimeoutMs"
  | "closeTimeoutMs"
  | "uploadQueueSize"
  | "uploadPartSizeBytes"
  | "fixtureKeyPrefix";

export type AsterObjectStorageConfigurationIssue = Readonly<{
  option: AsterObjectStorageConfigurationOption;
  reason: "missing" | "invalid" | "unknown" | "internal";
}>;

export type AsterObjectStorageTelemetry = Pick<AsterTelemetry, "startDependencyOperation">;

export interface AsterObjectStorageOptions {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
  readonly telemetry: AsterObjectStorageTelemetry;
  readonly maxInFlightOperations?: number;
  readonly maxObjectBytes?: number;
  readonly connectionTimeoutMs?: number;
  readonly operationTimeoutMs?: number;
  readonly closeTimeoutMs?: number;
  readonly uploadQueueSize?: number;
  readonly uploadPartSizeBytes?: number;
  readonly fixtureKeyPrefix?: string;
}

export interface AsterObjectKeyInput {
  readonly key: string;
}

export interface AsterObjectWriteInput {
  readonly key: string;
  readonly source: Readable;
  readonly contentLength: number;
  readonly contentType?: string;
}

export interface AsterObjectReadInput {
  readonly key: string;
  readonly destination: Writable;
}

export type AsterObjectStorageOperationResult =
  | Readonly<{ status: "completed" }>
  | Readonly<{ status: "not_found" }>
  | Readonly<{ status: "timed_out" }>
  | Readonly<{ status: "aborted" }>
  | Readonly<{ status: "unavailable" }>
  | Readonly<{
      status: "rejected";
      reason:
        | "invalid_request"
        | "object_too_large"
        | "unsafe_fixture_target"
        | "capacity_exceeded"
        | "adapter_closed"
        | "invalid_signal";
    }>
  | Readonly<{ status: "failed" }>;

export type AsterObjectStorageCloseResult = Readonly<{
  status: "completed" | "already_completed" | "timed_out" | "aborted" | "failed";
}>;

export type AsterObjectStorageSnapshot = Readonly<{
  state: "idle" | "open" | "degraded" | "closing" | "closed";
  inFlightOperations: number;
}>;

export interface AsterObjectStorageAdapter {
  probe(signal?: AbortSignal): Promise<AsterObjectStorageOperationResult>;
  head(
    input: AsterObjectKeyInput,
    signal?: AbortSignal,
  ): Promise<AsterObjectStorageOperationResult>;
  write(
    input: AsterObjectWriteInput,
    signal?: AbortSignal,
  ): Promise<AsterObjectStorageOperationResult>;
  read(
    input: AsterObjectReadInput,
    signal?: AbortSignal,
  ): Promise<AsterObjectStorageOperationResult>;
  deleteFixture(
    input: AsterObjectKeyInput,
    signal?: AbortSignal,
  ): Promise<AsterObjectStorageOperationResult>;
  snapshot(): AsterObjectStorageSnapshot;
  close(signal?: AbortSignal): Promise<AsterObjectStorageCloseResult>;
  lifecycleHooks(): Readonly<{
    closeDependencies(signal: AbortSignal): Promise<void>;
  }>;
}

export class AsterObjectStorageConfigurationError extends Error {
  readonly issues: readonly AsterObjectStorageConfigurationIssue[];

  constructor(issues: readonly AsterObjectStorageConfigurationIssue[]) {
    super("Invalid Aster object-storage configuration.");
    this.name = "AsterObjectStorageConfigurationError";
    this.issues = Object.freeze([...issues]);
  }
}

export class AsterObjectStorageLifecycleError extends Error {
  constructor() {
    super("Aster object-storage dependency closure did not complete.");
    this.name = "AsterObjectStorageLifecycleError";
  }
}
