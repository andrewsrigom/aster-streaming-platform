import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rmdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { normalizeMediaSource } from "../../domain/media-request.js";
import { originalKey, type AcquiredOriginal } from "../../domain/media-acquisition.js";
import {
  approvedMediaUrl,
  mediaSourceNetwork,
  MediaAcquisitionError,
  type MediaSourceNetwork,
} from "./source-network.js";

export interface MediaDownloadProgress {
  readonly bytes: number;
  readonly elapsedMs: number;
  readonly memory: NodeJS.MemoryUsage;
}
export interface DownloadedMediaSource {
  readonly original: AcquiredOriginal;
  readonly path: string;
  readonly elapsedMs: number;
  readonly peakMemory: NodeJS.MemoryUsage;
  cleanup(): Promise<void>;
}
export async function downloadMediaSource(
  value: unknown,
  signal: AbortSignal,
  options: Readonly<{
    network?: MediaSourceNetwork;
    deadlineMs?: number;
    onProgress?: (progress: MediaDownloadProgress) => void;
  }> = {},
): Promise<DownloadedMediaSource> {
  const source = normalizeMediaSource(value);
  const deadlineMs = options.deadlineMs ?? 300000;
  if (!source || !Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 300000) {
    throw new MediaAcquisitionError("SOURCE_REJECTED");
  }
  const url = approvedMediaUrl(source.url);
  const cancelled = () => signal.aborted;
  if (cancelled()) {
    throw new MediaAcquisitionError("CANCELLED");
  }
  const timeout = new AbortController();
  const active = AbortSignal.any([signal, timeout.signal]);
  const timer = setTimeout(() => {
    timeout.abort();
  }, deadlineMs);
  const started = performance.now();
  let directory: string | undefined;
  let path: string | undefined;
  let body: Readable | undefined;
  let retained = false;
  let cleaned = false;
  const cleanup = async (): Promise<void> => {
    if (cleaned) {
      return;
    }
    if (path) {
      try {
        await unlink(path);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
          throw error;
        }
      }
    }
    // Non-recursive removal deliberately refuses unexpected files in the owned directory.
    if (directory) {
      await rmdir(directory);
    }
    cleaned = true;
  };
  try {
    active.throwIfAborted();
    directory = await mkdtemp(join(tmpdir(), `aster-source-${process.pid}-`));
    path = join(directory, "source");
    const response = await (options.network ?? mediaSourceNetwork).open(url, source.etag, active);
    body = response.body;
    active.throwIfAborted();
    if (response.status === 412) {
      throw new MediaAcquisitionError("SOURCE_CHANGED");
    }
    if (response.status !== 200) {
      throw new MediaAcquisitionError("SOURCE_REJECTED");
    }
    const headers = response.headers;
    if (headers.etag !== source.etag || headers["content-length"] !== String(source.bytes)) {
      throw new MediaAcquisitionError("SOURCE_CHANGED");
    }
    if (headers["content-encoding"] !== undefined && headers["content-encoding"] !== "identity") {
      throw new MediaAcquisitionError("SOURCE_REJECTED");
    }
    const type = headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
    const allowed =
      source.container === "zip"
        ? ["application/zip", "application/octet-stream"]
        : ["video/mp4", "video/x-m4v", "application/octet-stream"];
    if (!type || !allowed.includes(type)) {
      throw new MediaAcquisitionError("SOURCE_REJECTED");
    }
    let bytes = 0;
    let prefix = Buffer.alloc(0);
    const hash = createHash("sha256");
    const peakMemory = process.memoryUsage();
    let lastProgress = started;
    const sample = (): void => {
      const memory = process.memoryUsage();
      for (const key of ["rss", "heapTotal", "heapUsed", "external", "arrayBuffers"] as const) {
        peakMemory[key] = Math.max(peakMemory[key], memory[key]);
      }
      options.onProgress?.({ bytes, elapsedMs: performance.now() - started, memory });
    };
    const validate = new Transform({
      highWaterMark: 64 * 1024,
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > source.bytes) {
          callback(new MediaAcquisitionError("SOURCE_TOO_LARGE"));
          return;
        }
        if (prefix.length < 8) {
          prefix = Buffer.concat([prefix, chunk.subarray(0, 8 - prefix.length)]);
        }
        if (
          prefix.length >= 8 &&
          (source.container === "zip"
            ? prefix.readUInt32LE(0) !== 0x04034b50
            : prefix.toString("ascii", 4, 8) !== "ftyp")
        ) {
          callback(new MediaAcquisitionError("SOURCE_REJECTED"));
          return;
        }
        hash.update(chunk);
        if (performance.now() - lastProgress >= 1000) {
          sample();
          lastProgress = performance.now();
        }
        callback(null, chunk);
      },
      flush(callback) {
        callback(
          bytes !== source.bytes || prefix.length < 8
            ? new MediaAcquisitionError("SOURCE_CHANGED")
            : null,
        );
      },
    });
    await pipeline(
      body,
      validate,
      createWriteStream(path, { flags: "wx", mode: 0o600, highWaterMark: 64 * 1024 }),
      { signal: active },
    );
    const sha256 = hash.digest("hex");
    if (source.sha256 !== null && source.sha256 !== sha256) {
      throw new MediaAcquisitionError("CHECKSUM_MISMATCH");
    }
    sample();
    active.throwIfAborted();
    retained = true;
    return {
      original: Object.freeze({ sha256, bytes, key: originalKey(sha256) }),
      path,
      elapsedMs: performance.now() - started,
      peakMemory,
      cleanup,
    };
  } catch (error) {
    if (cancelled()) {
      throw new MediaAcquisitionError("CANCELLED");
    }
    if (timeout.signal.aborted) {
      throw new MediaAcquisitionError("SOURCE_TIMEOUT");
    }
    throw error instanceof MediaAcquisitionError
      ? error
      : new MediaAcquisitionError("NETWORK_FAILURE");
  } finally {
    clearTimeout(timer);
    if (!retained) {
      body?.destroy();
      await cleanup();
    }
  }
}
