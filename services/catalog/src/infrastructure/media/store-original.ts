import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { Writable } from "node:stream";
import type { AsterObjectStorageAdapter } from "@aster/object-storage-s3";
import type { DownloadedMediaSource } from "./download-source.js";
import { MediaAcquisitionError } from "./source-network.js";

export async function storeOriginal(
  source: DownloadedMediaSource,
  storage: Pick<AsterObjectStorageAdapter, "write" | "read">,
  signal: AbortSignal,
): Promise<void> {
  const input = createReadStream(source.path, { highWaterMark: 64 * 1024 });
  try {
    const result = await storage.write(
      {
        key: source.original.key,
        source: input,
        contentLength: source.original.bytes,
        contentType: "application/octet-stream",
        ifAbsent: true,
        checksumSha256: source.original.sha256,
      },
      signal,
    );
    if (result.status !== "completed" && result.status !== "already_exists") {
      throw new MediaAcquisitionError("STORAGE_FAILURE");
    }
  } finally {
    input.destroy();
  }
  const hash = createHash("sha256");
  let bytes = 0;
  const destination = new Writable({
    highWaterMark: 64 * 1024,
    write(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > source.original.bytes) {
        callback(new MediaAcquisitionError("STORAGE_FAILURE"));
        return;
      }
      hash.update(chunk);
      callback();
    },
  });
  try {
    const read = await storage.read({ key: source.original.key, destination }, signal);
    if (
      read.status !== "completed" ||
      bytes !== source.original.bytes ||
      hash.digest("hex") !== source.original.sha256
    ) {
      throw new MediaAcquisitionError("STORAGE_FAILURE");
    }
  } finally {
    destination.destroy();
  }
}
