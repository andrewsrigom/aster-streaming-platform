import { createHash } from "node:crypto";
import { Writable } from "node:stream";
import type { AsterObjectStorageAdapter } from "@aster/object-storage-s3";
import type { createCatalogAcquisitions } from "../../application/acquire-media.js";
import type { CatalogCommandRequest } from "../../application/operator-ports.js";
import { catalogChecksum } from "../../domain/values.js";
import { processingKeyInput, type ProcessingCandidate } from "../../domain/media-processing.js";
import { MediaProcessingError } from "./processing-error.js";
import { parseCandidateReport, verifyCandidateObject } from "./retain-candidate.js";

export interface CandidateSelector {
  readonly manifestHash: string;
  readonly reportChecksum: string;
}
export async function reuseDecoderCandidate(
  acquisitionId: string,
  selector: CandidateSelector,
  request: CatalogCommandRequest,
  acquisitions: Pick<ReturnType<typeof createCatalogAcquisitions>, "original">,
  storage: Pick<AsterObjectStorageAdapter, "read">,
): Promise<ProcessingCandidate> {
  if (!catalogChecksum(selector.manifestHash) || !catalogChecksum(selector.reportChecksum)) {
    throw new MediaProcessingError("INVALID_OUTPUT", "Invalid candidate selector");
  }
  async function current() {
    request.signal.throwIfAborted();
    const result = await acquisitions.original(acquisitionId, request);
    if (result.status !== "completed") {
      throw new MediaProcessingError(
        result.status === "rights_not_approved" ? "RIGHTS_REVOKED" : "CONTROL_UNAVAILABLE",
        "Candidate authority unavailable",
      );
    }
    return result.value;
  }
  const original = await current();
  const processingKey = createHash("sha256")
    .update(processingKeyInput(original.original.sha256))
    .digest("hex");
  const prefix = "candidates/" + processingKey + "/" + selector.manifestHash + "/";
  const chunks: Buffer[] = [];
  let size = 0;
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > 512 * 1024) {
        callback(new MediaProcessingError("INVALID_OUTPUT", "Candidate report too large"));
        return;
      }
      chunks.push(chunk);
      callback();
    },
  });
  try {
    const stored = await storage.read(
      { key: prefix + "report.json", destination: sink },
      request.signal,
    );
    if (stored.status !== "completed") {
      throw new MediaProcessingError("STORAGE_FAILURE", "Candidate report unavailable");
    }
  } finally {
    sink.destroy();
  }
  const bytes = Buffer.concat(chunks);
  if (createHash("sha256").update(bytes).digest("hex") !== selector.reportChecksum) {
    throw new MediaProcessingError("INVALID_OUTPUT", "Candidate report checksum mismatch");
  }
  const report = parseCandidateReport(bytes, {
    ...original.original,
    container: original.media.input.source.container,
  });
  if (report.manifestHash !== selector.manifestHash) {
    throw new MediaProcessingError("INVALID_OUTPUT", "Candidate manifest mismatch");
  }
  for (const file of report.files) {
    await current();
    await verifyCandidateObject(storage, prefix + file.name, file, request.signal);
  }
  await current();
  return {
    prefix,
    reportChecksum: selector.reportChecksum,
    files: report.files.length,
    bytes: report.files.reduce((total, file) => total + file.bytes, 0),
    publicationAuthority: false,
  };
}
