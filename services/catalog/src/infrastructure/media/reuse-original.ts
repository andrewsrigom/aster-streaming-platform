import { createHash } from "node:crypto";
import { Writable } from "node:stream";
import type { AsterObjectStorageAdapter } from "@aster/object-storage-s3";
import { originalKey, type AcquiredOriginal } from "../../domain/media-acquisition.js";
import { normalizeMediaSource } from "../../domain/media-request.js";
import { approvedMediaUrl, MediaAcquisitionError } from "./source-network.js";

export async function reuseOriginal(
  value: unknown,
  storage: Pick<AsterObjectStorageAdapter, "read">,
  signal: AbortSignal,
): Promise<AcquiredOriginal | undefined> {
  const source = normalizeMediaSource(value);
  if (!source) {
    throw new MediaAcquisitionError("SOURCE_REJECTED");
  }
  approvedMediaUrl(source.url);
  signal.throwIfAborted();
  if (source.sha256 === null) {
    return undefined;
  }
  const key = originalKey(source.sha256);
  const hash = createHash("sha256");
  let bytes = 0;
  let prefix = Buffer.alloc(0);
  const destination = new Writable({
    highWaterMark: 64 * 1024,
    write(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > source.bytes) {
        callback(new MediaAcquisitionError("STORAGE_FAILURE"));
        return;
      }
      if (prefix.length < 8) {
        prefix = Buffer.concat([prefix, chunk.subarray(0, 8 - prefix.length)]);
      }
      hash.update(chunk);
      callback();
    },
  });
  try {
    const result = await storage.read({ key, destination }, signal);
    signal.throwIfAborted();
    // Only an explicit absence permits acquisition; failed/corrupt reads must not trigger egress.
    if (result.status === "not_found" && bytes === 0) {
      return undefined;
    }
    if (
      result.status !== "completed" ||
      bytes !== source.bytes ||
      prefix.length !== 8 ||
      (source.container === "zip"
        ? prefix.readUInt32LE(0) !== 0x04034b50
        : prefix.toString("ascii", 4, 8) !== "ftyp") ||
      hash.digest("hex") !== source.sha256
    ) {
      throw new MediaAcquisitionError("STORAGE_FAILURE");
    }
    return Object.freeze({ sha256: source.sha256, bytes, key });
  } catch {
    signal.throwIfAborted();
    throw new MediaAcquisitionError("STORAGE_FAILURE");
  } finally {
    destination.destroy();
  }
}
