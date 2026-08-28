import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, unlink } from "node:fs/promises";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { crc32 } from "node:zlib";
import { openPromise, type Entry } from "yauzl";
import { MAX_SOURCE_BYTES, MediaError, sourceIdentity } from "../domain/policy.js";
import { fileDigest } from "./files.js";

function validEntry(entry: Entry): void {
  const name = entry.fileName;
  const directory = name.endsWith("/");
  const segments = (directory ? name.slice(0, -1) : name).split("/");
  const kind = (entry.externalFileAttributes >>> 16) & 0xf000;
  if (
    name.length > 240 ||
    !/^[a-zA-Z0-9_./ -]+$/u.test(name) ||
    segments.length > 4 ||
    segments.some((part) => !part || part === "." || part === "..") ||
    (kind !== 0 && kind !== (directory ? 0x4000 : 0x8000)) ||
    entry.isEncrypted() ||
    ![0, 8].includes(entry.compressionMethod) ||
    entry.fileCommentLength > 1024 ||
    entry.extraFieldLength > 4096 ||
    !Number.isSafeInteger(entry.uncompressedSize) ||
    entry.uncompressedSize > MAX_SOURCE_BYTES ||
    (directory ? entry.uncompressedSize !== 0 : entry.uncompressedSize < 8) ||
    entry.uncompressedSize > Math.max(1, entry.compressedSize) * 20 ||
    (!directory && !/\.(mp4|m4v)$/iu.test(name))
  ) {
    throw new MediaError("INVALID_ARCHIVE");
  }
}

async function extractStream(
  source: Readable,
  target: string,
  expectedBytes: number,
  signal: AbortSignal,
  expectedCrc?: number,
) {
  let handle;
  let retained = false;
  try {
    handle = await open(target, "wx", 0o600);
    const digest = createHash("sha256");
    let bytes = 0;
    let checksum = 0;
    let signature = Buffer.alloc(0);
    const validate = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > expectedBytes || bytes > MAX_SOURCE_BYTES) {
          callback(new MediaError("INVALID_ARCHIVE"));
          return;
        }
        if (signature.length < 12) {
          signature = Buffer.concat([signature, chunk.subarray(0, 12 - signature.length)]);
        }
        digest.update(chunk);
        checksum = crc32(chunk, checksum);
        callback(null, chunk);
      },
    });
    await pipeline(source, validate, handle.createWriteStream(), { signal });
    if (
      bytes !== expectedBytes ||
      (expectedCrc !== undefined && checksum !== expectedCrc) ||
      signature.toString("ascii", 4, 8) !== "ftyp"
    ) {
      throw new MediaError("INVALID_SOURCE");
    }
    retained = true;
    return { bytes, sha256: digest.digest("hex") };
  } finally {
    source.destroy();
    await handle?.close();
    if (handle && !retained) {
      await unlink(target);
    }
  }
}

export async function extractOriginal(
  path: string,
  target: string,
  input: unknown,
  parent: AbortSignal,
) {
  const identity = sourceIdentity(input);
  const signal = AbortSignal.any([parent, AbortSignal.timeout(60000)]);
  const actual = await fileDigest(path, MAX_SOURCE_BYTES, signal);
  if (actual.sha256 !== identity.sha256 || actual.bytes !== identity.bytes) {
    throw new MediaError("INVALID_SOURCE");
  }
  if (identity.container === "mp4") {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const extracted = await extractStream(
      handle.createReadStream({
        highWaterMark: 65536,
        signal,
      }),
      target,
      actual.bytes,
      signal,
    );
    return { ...extracted, archiveEntry: null };
  }
  const zip = await openPromise(path, {
    autoClose: false,
    strictFileNames: true,
    validateEntrySizes: true,
  });
  try {
    if (zip.entryCount < 1 || zip.entryCount > 32 || zip.comment.length > 1024) {
      throw new MediaError("INVALID_ARCHIVE");
    }
    const names = new Set<string>();
    let selected: Entry | undefined;
    // Inspect the complete bounded directory before writing any extracted bytes.
    for await (const entry of zip.eachEntry()) {
      signal.throwIfAborted();
      validEntry(entry);
      if (names.has(entry.fileName.toLowerCase())) {
        throw new MediaError("INVALID_ARCHIVE");
      }
      names.add(entry.fileName.toLowerCase());
      if (names.size > 32) {
        throw new MediaError("INVALID_ARCHIVE");
      }
      if (!entry.fileName.endsWith("/")) {
        if (selected) {
          throw new MediaError("INVALID_ARCHIVE");
        }
        selected = entry;
      }
    }
    if (!selected) {
      throw new MediaError("INVALID_ARCHIVE");
    }
    signal.throwIfAborted();
    const stream = await zip.openReadStreamPromise(selected);
    const extracted = await extractStream(
      stream,
      target,
      selected.uncompressedSize,
      signal,
      selected.crc32,
    );
    return { ...extracted, archiveEntry: selected.fileName };
  } finally {
    zip.close();
  }
}
