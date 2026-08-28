import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, opendir } from "node:fs/promises";
import { join } from "node:path";
import { generatedSeed, type GeneratedFile } from "./generated-seed.js";

export async function boundedFixtureFile(
  path: string,
  maximum: number,
  signal: AbortSignal,
): Promise<Buffer> {
  signal.throwIfAborted();
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > maximum) {
      throw new Error("Invalid generated fixture file.");
    }
    const buffer = Buffer.alloc(maximum + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    signal.throwIfAborted();
    if (bytesRead !== stat.size) {
      throw new Error("Generated fixture changed while reading.");
    }
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function readGeneratedObject(
  directory: string,
  file: GeneratedFile,
  signal: AbortSignal,
) {
  if (
    !/^(?:source\.mkv|master\.m3u8|video\.m3u8|captions\.m3u8|captions\.vtt|segment-00[012]\.ts)$/u.test(
      file.name,
    ) ||
    !Number.isSafeInteger(file.bytes) ||
    file.bytes < 1 ||
    file.bytes > 4 * 1024 * 1024
  ) {
    throw new Error("Invalid generated object.");
  }
  const bytes = await boundedFixtureFile(join(directory, file.name), file.bytes, signal);
  if (
    bytes.length !== file.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== file.sha256
  ) {
    throw new Error("Generated object checksum mismatch.");
  }
  return bytes;
}

export async function verifyGeneratedDirectory(
  directory: string,
  report: unknown,
  signal: AbortSignal,
) {
  const seed = generatedSeed(report, "playable");
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("Invalid generated fixture directory.");
  }
  const inventory: string[] = [];
  for await (const entry of await opendir(directory)) {
    signal.throwIfAborted();
    if (inventory.length >= 9) {
      throw new Error("Too many generated fixture files.");
    }
    inventory.push(entry.name);
  }
  if (
    JSON.stringify(inventory.sort()) !==
    JSON.stringify([...seed.files.map((file) => file.name), "report.json"].sort())
  ) {
    throw new Error("Unexpected generated fixture inventory.");
  }
  for (const file of seed.files) {
    const bytes = await readGeneratedObject(directory, file, signal);
    if (file.name.endsWith(".m3u8")) {
      const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (bytes.length > 4096 || !source.startsWith("#EXTM3U\n")) {
        throw new Error("Invalid generated playlist.");
      }
      const references = [...source.matchAll(/(?:^([^#\r\n][^\r\n]*)$|URI="([^"]*)")/gmu)].map(
        (match) => match[1] ?? match[2],
      );
      const expected =
        file.name === "master.m3u8"
          ? ["captions.m3u8", "video.m3u8"]
          : file.name === "video.m3u8"
            ? ["segment-000.ts", "segment-001.ts", "segment-002.ts"]
            : ["captions.vtt"];
      if (
        JSON.stringify(references) !== JSON.stringify(expected) ||
        /#EXT-X-(?:KEY|SESSION-KEY|MAP|SESSION-DATA)/u.test(source)
      ) {
        throw new Error("Generated playlist reference rejected.");
      }
    }
  }
  return seed;
}
