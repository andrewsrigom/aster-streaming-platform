import type { AsterObjectStorageAdapter } from "@aster/object-storage-s3";
import type { createCatalogAcquisitions } from "../../application/acquire-media.js";
import type { createCatalogProcessing } from "../../application/process-media.js";
import type { CatalogCommandRequest } from "../../application/operator-ports.js";
import type { CatalogStoreResult } from "../../application/rights-ports.js";
import type { ProcessingAttempt, ProcessingFailure } from "../../domain/media-processing.js";
import { prepareDecoder } from "./prepare-decoder.js";
import { awaitDecoderCandidate } from "./retain-candidate.js";
import { reuseDecoderCandidate, type CandidateSelector } from "./reuse-candidate.js";
import { MediaProcessingError } from "./processing-error.js";

export async function runMediaProcessing(
  acquisitionId: string,
  request: CatalogCommandRequest,
  ports: Readonly<{
    processing: ReturnType<typeof createCatalogProcessing>;
    acquisitions: Pick<ReturnType<typeof createCatalogAcquisitions>, "original">;
    storage: Pick<AsterObjectStorageAdapter, "read" | "write">;
    selector?: CandidateSelector;
    onReady: () => void;
  }>,
): Promise<CatalogStoreResult<Readonly<{ attempt: ProcessingAttempt; reused: boolean }>>> {
  const claimed = await ports.processing.claim(acquisitionId, request);
  if (claimed.status !== "completed") {
    return claimed;
  }
  const attempt = claimed.value;
  if (attempt.status === "FAILED") {
    return { status: "invalid_transition" };
  }
  const reused = attempt.status === "SUCCEEDED";
  const guarded = reused
    ? ports.acquisitions
    : {
        original: () => ports.processing.check(attempt.id, request),
      };
  async function failed(failure: ProcessingFailure) {
    if (!reused) {
      // Cancellation still gets one short audit transaction; a dead process is recovered by its lease.
      await ports.processing.fail(attempt.id, failure, {
        ...request,
        signal: AbortSignal.timeout(3000),
      });
    }
  }
  try {
    if (
      ports.selector &&
      attempt.candidate &&
      (ports.selector.manifestHash !== attempt.candidate.prefix.split("/")[2] ||
        ports.selector.reportChecksum !== attempt.candidate.reportChecksum)
    ) {
      throw new MediaProcessingError("INVALID_OUTPUT", "Conflicting completed candidate selector");
    }
    const selector = attempt.candidate
      ? {
          manifestHash: attempt.candidate.prefix.split("/")[2] ?? "",
          reportChecksum: attempt.candidate.reportChecksum,
        }
      : ports.selector;
    let candidate;
    if (selector) {
      candidate = await reuseDecoderCandidate(
        acquisitionId,
        selector,
        request,
        guarded,
        ports.storage,
        attempt.recipeVersion,
      );
    } else {
      const ready = await prepareDecoder(
        acquisitionId,
        "/decoder-input",
        request,
        guarded,
        ports.storage,
      );
      if (ready.status !== "completed") {
        await failed(
          ready.status === "rights_not_approved" ? "RIGHTS_REVOKED" : "CONTROL_UNAVAILABLE",
        );
        return ready;
      }
      ports.onReady();
      const retained = await awaitDecoderCandidate(
        acquisitionId,
        request,
        guarded,
        ports.storage,
        attempt.recipeVersion,
      );
      if (retained.status !== "completed") {
        await failed(
          retained.status === "rights_not_approved" ? "RIGHTS_REVOKED" : "CONTROL_UNAVAILABLE",
        );
        return retained;
      }
      candidate = retained.value;
    }
    if (reused) {
      if (JSON.stringify(candidate) !== JSON.stringify(attempt.candidate)) {
        throw new MediaProcessingError("INVALID_OUTPUT", "Retained candidate identity changed");
      }
      return { status: "completed", value: { attempt, reused: true } };
    }
    const completed = await ports.processing.complete(attempt.id, candidate, request);
    if (completed.status !== "completed") {
      await failed(
        completed.status === "rights_not_approved" ? "RIGHTS_REVOKED" : "CONTROL_UNAVAILABLE",
      );
      return completed;
    }
    return {
      status: "completed",
      value: { attempt: completed.value, reused: selector !== undefined },
    };
  } catch (error) {
    await failed(
      request.signal.aborted
        ? "CANCELLED"
        : error instanceof MediaProcessingError
          ? error.failure
          : "INTERNAL_FAILURE",
    );
    return { status: request.signal.aborted ? "cancelled" : "unavailable" };
  }
}
