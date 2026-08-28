import type { AsterObjectStorageAdapter } from "@aster/object-storage-s3";
import type { createCatalogAcquisitions } from "../../application/acquire-media.js";
import type { AcquisitionApproval } from "../../application/acquisition-ports.js";
import type { CatalogCommandRequest } from "../../application/operator-ports.js";
import type { AcquisitionFailure } from "../../domain/media-acquisition.js";
import {
  downloadMediaSource,
  type DownloadedMediaSource,
  type MediaDownloadProgress,
} from "./download-source.js";
import { MediaAcquisitionError } from "./source-network.js";
import { storeOriginal } from "./store-original.js";
import { reuseOriginal } from "./reuse-original.js";

export async function runMediaAcquisition(
  requestId: string,
  request: CatalogCommandRequest,
  ports: Readonly<{
    acquisitions: ReturnType<typeof createCatalogAcquisitions>;
    storage: Pick<AsterObjectStorageAdapter, "write" | "read">;
    prepareStorage: (signal: AbortSignal) => Promise<void>;
    download?: typeof downloadMediaSource;
    onProgress?: (progress: MediaDownloadProgress) => void;
  }>,
) {
  const claimed = await ports.acquisitions.claim(requestId, request);
  if (claimed.status === "completed" && claimed.value.status === "FAILED") {
    return {
      status: "failed" as const,
      attemptId: claimed.value.id,
      failure: claimed.value.failure,
      auditStatus: "completed" as const,
    };
  }
  if (claimed.status !== "completed" || claimed.value.status !== "RUNNING") {
    return claimed;
  }
  const attempt = claimed.value;
  const controller = new AbortController();
  const signal = AbortSignal.any([request.signal, controller.signal]);
  const current = { ...request, signal };
  let failure: AcquisitionFailure | undefined;
  let timer: NodeJS.Timeout | undefined;
  let checking: Promise<void> = Promise.resolve();
  let pendingCheck: Promise<AcquisitionApproval> | undefined;
  let source: DownloadedMediaSource | undefined;
  let finished = false;
  async function verifyRights() {
    const checked = await ports.acquisitions.check(attempt.id, current);
    if (checked.status !== "completed") {
      failure =
        checked.status === "rights_not_approved" || checked.status === "unauthorized"
          ? "RIGHTS_REVOKED"
          : "INTERNAL_FAILURE";
      controller.abort();
      throw new MediaAcquisitionError(failure);
    }
    return checked.value;
  }
  function check(): Promise<AcquisitionApproval> {
    pendingCheck ??= verifyRights().finally(() => {
      pendingCheck = undefined;
    });
    return pendingCheck;
  }
  function schedule() {
    timer = setTimeout(() => {
      checking = check()
        .then(() => {
          if (!finished && !signal.aborted) {
            schedule();
          }
        })
        .catch(() => undefined);
    }, 5000);
  }
  try {
    await check();
    schedule();
    await ports.prepareStorage(signal);
    const { media, reuseApproved } = await check();
    const reused = reuseApproved
      ? await reuseOriginal(media.input.source, ports.storage, signal)
      : undefined;
    if (!reused) {
      source = await (ports.download ?? downloadMediaSource)(media.input.source, signal, {
        ...(ports.onProgress ? { onProgress: ports.onProgress } : {}),
      });
    }
    await check();
    if (source) {
      await storeOriginal(source, ports.storage, signal);
    }
    // Stop the periodic query before completion so a completed attempt cannot revoke itself.
    finished = true;
    clearTimeout(timer);
    await checking;
    signal.throwIfAborted();
    const result = await ports.acquisitions.complete(
      attempt.id,
      reused ?? source?.original,
      current,
    );
    if (result.status !== "completed") {
      failure = result.status === "rights_not_approved" ? "RIGHTS_REVOKED" : "INTERNAL_FAILURE";
      throw new MediaAcquisitionError(failure);
    }
    return {
      ...result,
      evidence: source
        ? { reused: false, downloadElapsedMs: source.elapsedMs, peakMemory: source.peakMemory }
        : { reused: true },
    };
  } catch (error) {
    finished = true;
    clearTimeout(timer);
    controller.abort();
    await checking;
    failure ??= request.signal.aborted
      ? "CANCELLED"
      : error instanceof MediaAcquisitionError
        ? error.code
        : "INTERNAL_FAILURE";
    // Cancellation cannot cancel its own bounded audit write. Expiry still fences late results.
    const audit = await ports.acquisitions.fail(attempt.id, failure, {
      ...request,
      signal: AbortSignal.timeout(3000),
    });
    return { status: "failed" as const, attemptId: attempt.id, failure, auditStatus: audit.status };
  } finally {
    finished = true;
    clearTimeout(timer);
    controller.abort();
    await checking;
    await source?.cleanup();
  }
}
