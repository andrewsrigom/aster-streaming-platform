import { MAX_MEDIA_SOURCE_BYTES } from "./media-request.js";
import { catalogChecksum, catalogIdentifier, catalogRecord, catalogTimestamp } from "./values.js";

export const ACQUISITION_LEASE_SECONDS = 480;
export const MAX_ACQUISITION_ATTEMPTS = 3;
const acquisitionFailures = [
  "NETWORK_FAILURE",
  "SOURCE_TIMEOUT",
  "SOURCE_CHANGED",
  "SOURCE_REJECTED",
  "SOURCE_TOO_LARGE",
  "CHECKSUM_MISMATCH",
  "UNSAFE_SOURCE",
  "STORAGE_FAILURE",
  "CANCELLED",
  "RIGHTS_REVOKED",
  "LEASE_EXPIRED",
  "INTERNAL_FAILURE",
] as const;
export type AcquisitionFailure = (typeof acquisitionFailures)[number];
export interface AcquiredOriginal {
  readonly sha256: string;
  readonly bytes: number;
  readonly key: string;
}
export interface AcquisitionAttempt {
  readonly id: string;
  readonly requestId: string;
  readonly actorId: string;
  readonly correlationId: string;
  readonly number: number;
  readonly startedAt: number;
  readonly expiresAt: number;
  readonly finishedAt: number | null;
  readonly status: "RUNNING" | "SUCCEEDED" | "FAILED";
  readonly failure: AcquisitionFailure | null;
  readonly original: AcquiredOriginal | null;
}
export function originalKey(sha256: string): string {
  return `originals/sha256/${sha256}`;
}
export function normalizeOriginal(value: unknown): AcquiredOriginal | undefined {
  const data = catalogRecord(value, ["sha256", "bytes", "key"]);
  if (
    !data ||
    !catalogChecksum(data["sha256"]) ||
    !Number.isSafeInteger(data["bytes"]) ||
    typeof data["bytes"] !== "number" ||
    data["bytes"] < 1 ||
    data["bytes"] > MAX_MEDIA_SOURCE_BYTES ||
    data["key"] !== originalKey(data["sha256"])
  ) {
    return undefined;
  }
  return Object.freeze({ sha256: data["sha256"], bytes: data["bytes"], key: data["key"] });
}
export function acquisitionFailure(value: unknown): value is AcquisitionFailure {
  return typeof value === "string" && acquisitionFailures.some((item) => item === value);
}
export function retryableAcquisition(failure: AcquisitionFailure | null): boolean {
  return (
    failure !== null &&
    ["NETWORK_FAILURE", "SOURCE_TIMEOUT", "STORAGE_FAILURE", "CANCELLED", "LEASE_EXPIRED"].includes(
      failure,
    )
  );
}
export function normalizeAcquisitionAttempt(value: unknown): AcquisitionAttempt | undefined {
  const data = catalogRecord(value, [
    "id",
    "requestId",
    "actorId",
    "correlationId",
    "number",
    "startedAt",
    "expiresAt",
    "finishedAt",
    "status",
    "failure",
    "original",
  ]);
  if (
    !data ||
    !catalogIdentifier(data["id"]) ||
    !catalogIdentifier(data["requestId"]) ||
    !catalogIdentifier(data["actorId"]) ||
    !catalogIdentifier(data["correlationId"]) ||
    typeof data["number"] !== "number" ||
    !Number.isInteger(data["number"]) ||
    data["number"] < 1 ||
    data["number"] > MAX_ACQUISITION_ATTEMPTS ||
    !catalogTimestamp(data["startedAt"]) ||
    !catalogTimestamp(data["expiresAt"]) ||
    data["expiresAt"] !== data["startedAt"] + ACQUISITION_LEASE_SECONDS
  ) {
    return undefined;
  }
  const status = data["status"];
  const original = data["original"] === null ? null : normalizeOriginal(data["original"]);
  if (status === "RUNNING") {
    if (data["finishedAt"] !== null || data["failure"] !== null || original !== null) {
      return undefined;
    }
  } else if (status === "FAILED" || status === "SUCCEEDED") {
    if (!catalogTimestamp(data["finishedAt"]) || data["finishedAt"] < data["startedAt"]) {
      return undefined;
    }
    if (status === "FAILED" && (!acquisitionFailure(data["failure"]) || original !== null)) {
      return undefined;
    }
    if (
      status === "SUCCEEDED" &&
      (!original || data["failure"] !== null || data["finishedAt"] >= data["expiresAt"])
    ) {
      return undefined;
    }
  } else {
    return undefined;
  }
  return Object.freeze({
    id: data["id"],
    requestId: data["requestId"],
    actorId: data["actorId"],
    correlationId: data["correlationId"],
    number: data["number"],
    startedAt: data["startedAt"],
    expiresAt: data["expiresAt"],
    finishedAt: data["finishedAt"],
    status,
    failure: data["failure"] as AcquisitionFailure | null,
    original: original ?? null,
  });
}
