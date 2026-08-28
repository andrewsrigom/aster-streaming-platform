import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { MediaError } from "../domain/policy.js";

export async function fileDigest(path: string, maxBytes: number, signal: AbortSignal) {
  signal.throwIfAborted();
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > maxBytes) {
      throw new MediaError("INVALID_SOURCE");
    }
    const digest = createHash("sha256");
    let bytes = 0;
    for await (const chunk of handle.createReadStream({ highWaterMark: 65536, signal })) {
      if (!(chunk instanceof Buffer)) {
        throw new MediaError("INVALID_SOURCE");
      }
      bytes += chunk.length;
      if (bytes > maxBytes) {
        throw new MediaError("OUTPUT_LIMIT");
      }
      digest.update(chunk);
    }
    if (bytes !== stat.size) {
      throw new MediaError("INVALID_SOURCE");
    }
    return { bytes, sha256: digest.digest("hex") };
  } finally {
    await handle.close();
  }
}
