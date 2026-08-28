import { createHash } from "node:crypto";
import { mkdir, open, rmdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { AsterObjectStorageAdapter } from "@aster/object-storage-s3";
import type { createCatalogAcquisitions } from "../../application/acquire-media.js";
import type { CatalogCommandRequest } from "../../application/operator-ports.js";

export async function prepareDecoder(
  attemptId: string,
  root: string,
  request: CatalogCommandRequest,
  acquisitions: Pick<ReturnType<typeof createCatalogAcquisitions>, "original">,
  storage: Pick<AsterObjectStorageAdapter, "read">,
) {
  const before = await acquisitions.original(attemptId, request);
  if (before.status !== "completed") {
    return before;
  }
  const directory = join(root, "job");
  await mkdir(directory, { mode: 0o700 });
  let handle;
  let ready = false;
  try {
    const original = before.value.original;
    handle = await open(join(directory, "original"), "wx", 0o600);
    let bytes = 0;
    const digest = createHash("sha256");
    const checked = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > original.bytes) {
          callback(new Error("Original size mismatch"));
          return;
        }
        digest.update(chunk);
        callback(null, chunk);
      },
    });
    const copying = pipeline(checked, handle.createWriteStream(), { signal: request.signal });
    const reading = storage
      .read({ key: original.key, destination: checked }, request.signal)
      .then((result) => {
        if (result.status !== "completed") {
          checked.destroy(new Error("Original unavailable"));
        }
        return result;
      })
      .catch((error: unknown) => {
        checked.destroy(new Error("Original unavailable"));
        throw error;
      });
    const results = await Promise.allSettled([copying, reading]);
    if (
      results.some((result) => result.status !== "fulfilled") ||
      bytes !== original.bytes ||
      digest.digest("hex") !== original.sha256
    ) {
      throw new Error("Invalid retained original");
    }
    const after = await acquisitions.original(attemptId, request);
    if (after.status !== "completed") {
      return after;
    }
    const identity = {
      sha256: original.sha256,
      bytes,
      container: after.value.media.input.source.container,
    };
    await writeFile(join(directory, "identity.json"), JSON.stringify(identity) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    ready = true;
    return { status: "completed" as const, value: { attemptId, identity } };
  } finally {
    await handle?.close();
    if (!ready) {
      if (handle) {
        await unlink(join(directory, "original"));
      }
      await rmdir(directory);
    }
  }
}
