import { MEDIA_RECIPE_VERSION } from "./media-request.js";
import { catalogChecksum, catalogIdentifier, catalogRecord, catalogTimestamp } from "./values.js";

export const PROCESSING_LEASE_SECONDS = 1800;
export const MAX_PROCESSING_ATTEMPTS = 3;
export const ARTWORK_RECIPE_VERSION = "frame-jpeg-v1";
export type ProcessingRecipe = typeof MEDIA_RECIPE_VERSION | typeof ARTWORK_RECIPE_VERSION;
const failures = [
  "STORAGE_FAILURE",
  "CONTROL_UNAVAILABLE",
  "INVALID_OUTPUT",
  "CANCELLED",
  "RIGHTS_REVOKED",
  "LEASE_EXPIRED",
  "INTERNAL_FAILURE",
] as const;
export type ProcessingFailure = (typeof failures)[number];
export interface ProcessingCandidate {
  readonly prefix: string;
  readonly reportChecksum: string;
  readonly files: number;
  readonly bytes: number;
  readonly publicationAuthority: false;
}
export interface ProcessingAttempt {
  readonly id: string;
  readonly acquisitionId: string;
  readonly requestId: string;
  readonly actorId: string;
  readonly correlationId: string;
  readonly processingKey: string;
  readonly sourceChecksum: string;
  readonly recipeVersion: ProcessingRecipe;
  readonly number: number;
  readonly requestedAt: number;
  readonly startedAt: number;
  readonly expiresAt: number;
  readonly finishedAt: number | null;
  readonly status: "RUNNING" | "SUCCEEDED" | "FAILED";
  readonly failure: ProcessingFailure | null;
  readonly candidate: ProcessingCandidate | null;
}
export function processingFailure(value: unknown): value is ProcessingFailure {
  return typeof value === "string" && failures.some((failure) => failure === value);
}
export function retryableProcessing(failure: ProcessingFailure | null): boolean {
  return (
    failure !== null &&
    ["STORAGE_FAILURE", "CONTROL_UNAVAILABLE", "CANCELLED", "LEASE_EXPIRED"].includes(failure)
  );
}
export function processingKeyInput(
  sourceChecksum: string,
  recipeVersion: ProcessingRecipe = MEDIA_RECIPE_VERSION,
): string {
  return sourceChecksum + "\0" + recipeVersion;
}
export function normalizeProcessingCandidate(
  value: unknown,
  processingKey: string,
): ProcessingCandidate | undefined {
  const data = catalogRecord(value, [
    "prefix",
    "reportChecksum",
    "files",
    "bytes",
    "publicationAuthority",
  ]);
  if (
    !data ||
    !catalogChecksum(processingKey) ||
    typeof data["prefix"] !== "string" ||
    !/^candidates\/[a-f0-9]{64}\/[a-f0-9]{64}\/$/u.test(data["prefix"]) ||
    !data["prefix"].startsWith("candidates/" + processingKey + "/") ||
    !catalogChecksum(data["reportChecksum"]) ||
    typeof data["files"] !== "number" ||
    !Number.isInteger(data["files"]) ||
    data["files"] < 3 ||
    data["files"] > 2048 ||
    typeof data["bytes"] !== "number" ||
    !Number.isSafeInteger(data["bytes"]) ||
    data["bytes"] < 1 ||
    data["bytes"] > 512 * 1024 * 1024 ||
    data["publicationAuthority"] !== false
  ) {
    return undefined;
  }
  return Object.freeze({
    prefix: data["prefix"],
    reportChecksum: data["reportChecksum"],
    files: data["files"],
    bytes: data["bytes"],
    publicationAuthority: false,
  });
}
export function normalizeProcessingAttempt(value: unknown): ProcessingAttempt | undefined {
  const data = catalogRecord(value, [
    "id",
    "acquisitionId",
    "requestId",
    "actorId",
    "correlationId",
    "processingKey",
    "sourceChecksum",
    "recipeVersion",
    "number",
    "requestedAt",
    "startedAt",
    "expiresAt",
    "finishedAt",
    "status",
    "failure",
    "candidate",
  ]);
  if (
    !data ||
    !["id", "acquisitionId", "requestId", "actorId", "correlationId"].every((key) =>
      catalogIdentifier(data[key]),
    ) ||
    !catalogChecksum(data["processingKey"]) ||
    !catalogChecksum(data["sourceChecksum"]) ||
    (data["recipeVersion"] !== MEDIA_RECIPE_VERSION &&
      data["recipeVersion"] !== ARTWORK_RECIPE_VERSION) ||
    typeof data["number"] !== "number" ||
    !Number.isInteger(data["number"]) ||
    data["number"] < 1 ||
    data["number"] > MAX_PROCESSING_ATTEMPTS ||
    !catalogTimestamp(data["requestedAt"]) ||
    !catalogTimestamp(data["startedAt"]) ||
    !catalogTimestamp(data["expiresAt"]) ||
    data["requestedAt"] > data["startedAt"] ||
    data["expiresAt"] !== data["startedAt"] + PROCESSING_LEASE_SECONDS
  ) {
    return undefined;
  }
  const candidate =
    data["candidate"] === null
      ? null
      : normalizeProcessingCandidate(data["candidate"], data["processingKey"]);
  if (data["status"] === "RUNNING") {
    if (data["finishedAt"] !== null || data["failure"] !== null || candidate !== null) {
      return undefined;
    }
  } else if (data["status"] === "FAILED" || data["status"] === "SUCCEEDED") {
    if (!catalogTimestamp(data["finishedAt"]) || data["finishedAt"] < data["startedAt"]) {
      return undefined;
    }
    if (
      data["status"] === "FAILED" &&
      (!processingFailure(data["failure"]) || candidate !== null)
    ) {
      return undefined;
    }
    if (
      data["status"] === "SUCCEEDED" &&
      (!candidate || data["failure"] !== null || data["finishedAt"] >= data["expiresAt"])
    ) {
      return undefined;
    }
  } else {
    return undefined;
  }
  return Object.freeze({ ...data, candidate }) as unknown as ProcessingAttempt;
}
