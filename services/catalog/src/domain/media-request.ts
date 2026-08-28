import { currentApprovedRights, type RightsUsePolicy } from "./rights.js";
import type { CatalogTitleLifecycle } from "./title.js";
import {
  catalogChecksum,
  catalogIdentifier,
  catalogRecord,
  catalogTimestamp,
  catalogUrl,
  catalogVersion,
} from "./values.js";

export const MEDIA_RECIPE_VERSION = "hls-avc-aac-v1";
export const MAX_MEDIA_SOURCE_BYTES = 256 * 1024 * 1024;
export const MAX_MEDIA_REQUESTS_PER_TITLE = 16;

interface MediaSourceIdentity {
  readonly url: string;
  readonly bytes: number;
  readonly etag: string;
  readonly sha256: string | null;
  readonly container: "zip" | "mp4";
}
export interface MediaRequestInput {
  readonly requestId: string;
  readonly titleId: string;
  readonly expectedVersion: number;
  readonly rightsRevision: number;
  readonly recipeVersion: typeof MEDIA_RECIPE_VERSION;
  readonly source: MediaSourceIdentity;
}
export interface CatalogMediaRequest {
  readonly input: MediaRequestInput;
  readonly actorId: string;
  readonly correlationId: string;
  readonly requestedAt: number;
  readonly sourceFingerprint: string;
}

function normalizeMediaSource(value: unknown): MediaSourceIdentity | undefined {
  const input = catalogRecord(value, ["url", "bytes", "etag", "sha256", "container"]);
  if (
    !input ||
    !catalogUrl(input["url"]) ||
    typeof input["bytes"] !== "number" ||
    !Number.isSafeInteger(input["bytes"]) ||
    input["bytes"] < 1 ||
    input["bytes"] > MAX_MEDIA_SOURCE_BYTES ||
    typeof input["etag"] !== "string" ||
    !/^"[\x21\x23-\x7e]{1,126}"$/u.test(input["etag"]) ||
    (input["sha256"] !== null && !catalogChecksum(input["sha256"])) ||
    (input["container"] !== "zip" && input["container"] !== "mp4")
  ) {
    return undefined;
  }
  return Object.freeze({
    url: input["url"],
    bytes: input["bytes"],
    etag: input["etag"],
    sha256: input["sha256"],
    container: input["container"],
  });
}

export function normalizeMediaRequestInput(value: unknown): MediaRequestInput | undefined {
  const input = catalogRecord(value, [
    "requestId",
    "titleId",
    "expectedVersion",
    "rightsRevision",
    "recipeVersion",
    "source",
  ]);
  const source = input && normalizeMediaSource(input["source"]);
  if (
    !input ||
    !source ||
    !catalogIdentifier(input["requestId"]) ||
    !catalogIdentifier(input["titleId"]) ||
    !catalogVersion(input["expectedVersion"]) ||
    !catalogVersion(input["rightsRevision"]) ||
    input["recipeVersion"] !== MEDIA_RECIPE_VERSION
  ) {
    return undefined;
  }
  return Object.freeze({
    requestId: input["requestId"],
    titleId: input["titleId"],
    expectedVersion: input["expectedVersion"],
    rightsRevision: input["rightsRevision"],
    recipeVersion: MEDIA_RECIPE_VERSION,
    source,
  });
}

export function normalizeMediaRequest(value: unknown): CatalogMediaRequest | undefined {
  const record = catalogRecord(value, [
    "input",
    "actorId",
    "correlationId",
    "requestedAt",
    "sourceFingerprint",
  ]);
  const input = record && normalizeMediaRequestInput(record["input"]);
  if (
    !record ||
    !input ||
    !catalogIdentifier(record["actorId"]) ||
    !catalogIdentifier(record["correlationId"]) ||
    !catalogTimestamp(record["requestedAt"]) ||
    !catalogChecksum(record["sourceFingerprint"])
  ) {
    return undefined;
  }
  return Object.freeze({
    input,
    actorId: record["actorId"],
    correlationId: record["correlationId"],
    requestedAt: record["requestedAt"],
    sourceFingerprint: record["sourceFingerprint"],
  });
}

export function mediaRequestEligible(
  input: MediaRequestInput,
  title: CatalogTitleLifecycle,
  latestRightsRevision: number,
  rights: unknown,
  now: number,
  policy: RightsUsePolicy,
): boolean {
  const approved = currentApprovedRights(rights, now, policy);
  return (
    approved !== undefined &&
    ["RIGHTS_REVIEWED", "MEDIA_READY", "PUBLISHED"].includes(title.state) &&
    title.id === input.titleId &&
    approved.titleId === title.id &&
    title.rightsRevision === input.rightsRevision &&
    approved.revision === input.rightsRevision &&
    latestRightsRevision === approved.revision &&
    approved.assetSourceUrl === input.source.url &&
    (approved.sourceChecksum === null || approved.sourceChecksum === input.source.sha256)
  );
}

export function mediaRequestFingerprintInput(input: MediaRequestInput): string {
  return JSON.stringify({
    rightsRevision: input.rightsRevision,
    recipeVersion: input.recipeVersion,
    source: input.source,
  });
}
