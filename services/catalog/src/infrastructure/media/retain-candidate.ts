import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, opendir } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import type { AsterObjectStorageAdapter } from "@aster/object-storage-s3";
import type { createCatalogAcquisitions } from "../../application/acquire-media.js";
import type { CatalogCommandRequest } from "../../application/operator-ports.js";
import { catalogChecksum, catalogRecord } from "../../domain/values.js";
import { MEDIA_RECIPE_VERSION } from "../../domain/media-request.js";
import {
  ARTWORK_RECIPE_VERSION,
  processingKeyInput,
  type ProcessingRecipe,
} from "../../domain/media-processing.js";
import { MediaProcessingError } from "./processing-error.js";
import { validateArtworkReport } from "./candidate-artwork.js";

type CandidateObject = Readonly<{ name: string; bytes: number; sha256: string }>;
function filesFromReport(value: unknown, recipe: ProcessingRecipe): readonly CandidateObject[] {
  const artwork = recipe === ARTWORK_RECIPE_VERSION;
  if (
    !Array.isArray(value) ||
    value.length < (artwork ? 4 : 3) ||
    value.length > (artwork ? 5 : 2048)
  ) {
    throw new MediaProcessingError("INVALID_OUTPUT", "Invalid candidate object count");
  }
  const names = new Set<string>();
  let bytes = 0;
  return value.map((item: unknown) => {
    const file = catalogRecord(item, ["name", "bytes", "sha256"]);
    if (
      !file ||
      typeof file["name"] !== "string" ||
      !(
        artwork
          ? /^(?:poster-[0-9]{3}|poster-[0-9]{4}|thumbnail-0[123])\.jpg$/u
          : /^(?:master\.m3u8|v[0-9]{2,3}(?:\.m3u8|-[0-9]{4}\.ts))$/u
      ).test(file["name"]) ||
      names.has(file["name"]) ||
      !catalogChecksum(file["sha256"]) ||
      typeof file["bytes"] !== "number" ||
      !Number.isSafeInteger(file["bytes"]) ||
      file["bytes"] < 1 ||
      file["bytes"] > (artwork ? 2 : 16) * 1024 * 1024
    ) {
      throw new MediaProcessingError("INVALID_OUTPUT", "Invalid candidate object");
    }
    bytes += file["bytes"];
    if (bytes > 512 * 1024 * 1024) {
      throw new MediaProcessingError("INVALID_OUTPUT", "Candidate too large");
    }
    names.add(file["name"]);
    return { name: file["name"], bytes: file["bytes"], sha256: file["sha256"] };
  });
}

async function putVerified(
  storage: Pick<AsterObjectStorageAdapter, "write" | "read">,
  key: string,
  source: Readable,
  expected: Readonly<{ bytes: number; sha256: string }>,
  signal: AbortSignal,
) {
  try {
    const written = await storage.write(
      {
        key,
        source,
        contentLength: expected.bytes,
        checksumSha256: expected.sha256,
        ifAbsent: true,
        contentType: "application/octet-stream",
      },
      signal,
    );
    if (written.status !== "completed" && written.status !== "already_exists") {
      throw new MediaProcessingError("STORAGE_FAILURE", "Candidate storage unavailable");
    }
  } finally {
    source.destroy();
  }
  await verifyCandidateObject(storage, key, expected, signal);
}

export async function verifyCandidateObject(
  storage: Pick<AsterObjectStorageAdapter, "read">,
  key: string,
  expected: Readonly<{ bytes: number; sha256: string }>,
  signal: AbortSignal,
) {
  let bytes = 0;
  const digest = createHash("sha256");
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > expected.bytes) {
        callback(new Error("Candidate size mismatch"));
        return;
      }
      digest.update(chunk);
      callback();
    },
  });
  try {
    const read = await storage.read({ key, destination }, signal);
    if (
      read.status !== "completed" ||
      bytes !== expected.bytes ||
      digest.digest("hex") !== expected.sha256
    ) {
      throw new MediaProcessingError("STORAGE_FAILURE", "Candidate readback mismatch");
    }
  } finally {
    destination.destroy();
  }
}

export function parseCandidateReport(
  reportBytes: Buffer,
  expected: Readonly<{ sha256: string; bytes: number; container: "zip" | "mp4" }>,
  recipe: ProcessingRecipe = MEDIA_RECIPE_VERSION,
) {
  let parsed: unknown;
  try {
    if (reportBytes.length < 1 || reportBytes.length > 512 * 1024) {
      throw new Error();
    }
    parsed = JSON.parse(reportBytes.toString("utf8")) as unknown;
  } catch {
    throw new MediaProcessingError("INVALID_OUTPUT", "Invalid candidate report");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new MediaProcessingError("INVALID_OUTPUT", "Invalid candidate report");
  }
  const report = parsed as Record<string, unknown>;
  const identity = catalogRecord(report["identity"], ["sha256", "bytes", "container"]);
  const processingKey = createHash("sha256")
    .update(processingKeyInput(expected.sha256, recipe))
    .digest("hex");
  const files = filesFromReport(report["files"], recipe);
  if (recipe === ARTWORK_RECIPE_VERSION) {
    validateArtworkReport(
      report,
      files.map((file) => file.name),
    );
  }
  const manifestHash = createHash("sha256").update(JSON.stringify(files)).digest("hex");
  if (
    report["event"] !== "media_candidate_validated" ||
    report["publicationAuthority"] !== false ||
    report["recipe"] !== recipe ||
    report["processingKey"] !== processingKey ||
    report["manifestHash"] !== manifestHash ||
    identity?.["sha256"] !== expected.sha256 ||
    identity["bytes"] !== expected.bytes ||
    identity["container"] !== expected.container ||
    (recipe === MEDIA_RECIPE_VERSION && !files.some((file) => file.name === "master.m3u8"))
  ) {
    throw new MediaProcessingError("INVALID_OUTPUT", "Candidate source identity mismatch");
  }
  return { processingKey, manifestHash, files };
}

export async function retainDecoderCandidate(
  attemptId: string,
  directory: string,
  request: CatalogCommandRequest,
  acquisitions: Pick<ReturnType<typeof createCatalogAcquisitions>, "original">,
  storage: Pick<AsterObjectStorageAdapter, "write" | "read">,
  recipe: ProcessingRecipe = MEDIA_RECIPE_VERSION,
) {
  async function current() {
    const result = await acquisitions.original(attemptId, request);
    if (result.status !== "completed") {
      throw new MediaProcessingError(
        result.status === "rights_not_approved" ? "RIGHTS_REVOKED" : "CONTROL_UNAVAILABLE",
        "Candidate rights unavailable",
      );
    }
    return result.value;
  }
  const original = await current();
  const dir = await lstat(directory);
  if (!dir.isDirectory() || dir.isSymbolicLink()) {
    throw new Error("Invalid candidate directory");
  }
  const reportHandle = await open(
    join(directory, "report.json"),
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  let reportBytes: Buffer;
  try {
    const stat = await reportHandle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > 512 * 1024) {
      throw new Error("Invalid candidate report");
    }
    const buffer = Buffer.alloc(512 * 1024 + 1);
    const read = await reportHandle.read(buffer, 0, buffer.length, 0);
    reportBytes = buffer.subarray(0, read.bytesRead);
    if (reportBytes.length !== stat.size) {
      throw new Error("Unstable candidate report");
    }
  } finally {
    await reportHandle.close();
  }
  const { processingKey, manifestHash, files } = parseCandidateReport(
    reportBytes,
    {
      ...original.original,
      container: original.media.input.source.container,
    },
    recipe,
  );
  const expectedNames = [...files.map((file) => file.name), "report.json"].sort();
  const actualNames: string[] = [];
  for await (const entry of await opendir(directory)) {
    actualNames.push(entry.name);
    if (actualNames.length > 2049) {
      throw new Error("Too many candidate files");
    }
  }
  actualNames.sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error("Unexpected candidate files");
  }
  const prefix = "candidates/" + processingKey + "/" + manifestHash + "/";
  // A candidate is private opaque computation, not a trusted publication attestation.
  for (const file of files) {
    await current();
    const handle = await open(
      join(directory, file.name),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size !== file.bytes) {
        throw new Error("Candidate object changed");
      }
      await putVerified(
        storage,
        prefix + file.name,
        handle.createReadStream({ highWaterMark: 65536, signal: request.signal }),
        file,
        request.signal,
      );
    } finally {
      await handle.close();
    }
  }
  await current();
  const reportChecksum = createHash("sha256").update(reportBytes).digest("hex");
  await putVerified(
    storage,
    prefix + "report.json",
    Readable.from([reportBytes]),
    { bytes: reportBytes.length, sha256: reportChecksum },
    request.signal,
  );
  await current();
  return {
    status: "completed" as const,
    value: {
      prefix,
      reportChecksum,
      files: files.length,
      bytes: files.reduce((sum, file) => sum + file.bytes, 0),
      publicationAuthority: false,
    },
  };
}

export async function awaitDecoderCandidate(
  attemptId: string,
  request: CatalogCommandRequest,
  acquisitions: Pick<ReturnType<typeof createCatalogAcquisitions>, "original">,
  storage: Pick<AsterObjectStorageAdapter, "write" | "read">,
  recipe: ProcessingRecipe = MEDIA_RECIPE_VERSION,
) {
  for (;;) {
    request.signal.throwIfAborted();
    const current = await acquisitions.original(attemptId, request);
    if (current.status !== "completed") {
      return current;
    }
    try {
      await lstat("/decoder-output/candidate/report.json");
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
      await delay(1000, undefined, { signal: request.signal });
      continue;
    }
    return await retainDecoderCandidate(
      attemptId,
      "/decoder-output/candidate",
      request,
      acquisitions,
      storage,
      recipe,
    );
  }
}
