import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { AsterObjectStorageAdapter } from "@aster/object-storage-s3";
import { verifyCandidateObject } from "./retain-candidate.js";
import {
  mediaSha256,
  validatePublicationPlaylists,
  type PublicationBundle,
} from "./publication-bundle.js";
import { MediaProcessingError } from "./processing-error.js";

type File = Readonly<{ name: string; bytes: number; sha256: string }>;
type Reader = Pick<AsterObjectStorageAdapter, "read">;
type Storage = Pick<AsterObjectStorageAdapter, "read" | "write">;
const unavailable = (): never => {
  throw new MediaProcessingError("STORAGE_FAILURE", "Publication object verification failed");
};

async function stage(
  storage: Reader,
  key: string,
  file: File,
  path: string,
  signal: AbortSignal,
): Promise<void> {
  if (file.bytes < 1 || file.bytes > 16 * 1024 * 1024) {
    return unavailable();
  }
  let bytes = 0;
  const hash = createHash("sha256");
  const sink = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > file.bytes) {
        callback(new Error("Object exceeded its bound"));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
    flush(callback) {
      callback(
        bytes === file.bytes && hash.digest("hex") === file.sha256
          ? null
          : new Error("Object checksum mismatch"),
      );
    },
  });
  const destination = createWriteStream(path, { flags: "wx", mode: 0o600 });
  try {
    const results = await Promise.allSettled([
      pipeline(sink, destination, { signal }),
      storage
        .read({ key, destination: sink }, signal)
        .then((result) => {
          if (result.status !== "completed") {
            return unavailable();
          }
        })
        .catch((error: unknown) => {
          sink.destroy(new Error("Object read failed"));
          throw error;
        }),
    ]);
    if (results.some((result) => result.status !== "fulfilled")) {
      return unavailable();
    }
  } finally {
    sink.destroy();
    destination.destroy();
  }
}
function contentType(name: string): string {
  return name.endsWith(".m3u8")
    ? "application/vnd.apple.mpegurl"
    : name.endsWith(".ts")
      ? "video/mp2t"
      : name.endsWith(".jpg")
        ? "image/jpeg"
        : "application/json";
}
async function put(
  storage: Storage,
  key: string,
  file: File,
  source: Readable,
  signal: AbortSignal,
): Promise<void> {
  try {
    const result = await storage.write(
      {
        key,
        source,
        contentLength: file.bytes,
        checksumSha256: file.sha256,
        ifAbsent: true,
        contentType: contentType(file.name),
        cacheControl: "public, max-age=31536000, immutable",
      },
      signal,
    );
    if (result.status !== "completed" && result.status !== "already_exists") {
      return unavailable();
    }
  } finally {
    source.destroy();
  }
  await verifyCandidateObject(storage, key, file, signal);
}

export async function copyPublication(
  bundle: PublicationBundle,
  privateStorage: Reader,
  publicStorage: Storage,
  currentApproval: () => Promise<void>,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  await currentApproval();
  const directory = await mkdtemp(join(tmpdir(), "aster-publication-"));
  const path = join(directory, "object");
  let copiedBytes = 0;
  const all = [
    ...bundle.hls.files.map((file) => ({ ...file, prefix: bundle.hls.prefix })),
    ...bundle.artwork.files.map((file) => ({ ...file, prefix: bundle.artwork.prefix })),
  ];
  try {
    const playlists = new Map<string, string>();
    for (const file of all.filter((file) => file.name.endsWith(".m3u8"))) {
      if (file.bytes > 65536) {
        return unavailable();
      }
      await stage(privateStorage, file.prefix + file.name, file, path, signal);
      playlists.set(file.name, await readFile(path, "utf8"));
      await unlink(path);
    }
    validatePublicationPlaylists(bundle, playlists);
    const priority = (name: string) =>
      name === "master.m3u8" ? 2 : name.endsWith(".m3u8") ? 1 : 0;
    all.sort((a, b) => priority(a.name) - priority(b.name));
    const attribution = {
      name: "attribution.json",
      bytes: bundle.attribution.length,
      sha256: mediaSha256(bundle.attribution),
    };
    await currentApproval();
    await put(
      publicStorage,
      bundle.prefix + attribution.name,
      attribution,
      Readable.from([bundle.attribution]),
      signal,
    );
    copiedBytes += attribution.bytes;
    for (const file of all) {
      signal.throwIfAborted();
      await currentApproval();
      // Complete and verify each read before the write: the private POSIX gateway has one action slot.
      await stage(privateStorage, file.prefix + file.name, file, path, signal);
      await currentApproval();
      await put(
        publicStorage,
        bundle.prefix + file.name,
        file,
        createReadStream(path, { highWaterMark: 65536, signal }),
        signal,
      );
      copiedBytes += file.bytes;
      await unlink(path);
    }
    await currentApproval();
    return { files: all.length + 1, bytes: copiedBytes };
  } finally {
    // Only this freshly allocated, non-input-selectable temporary directory is disposable.
    await rm(directory, { recursive: true, force: true });
  }
}
