import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, open, opendir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const names = [
  "captions.m3u8",
  "captions.vtt",
  "master.m3u8",
  "segment-000.ts",
  "segment-001.ts",
  "segment-002.ts",
  "source.mkv",
  "video.m3u8",
];
export const fixtureDigest = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function inventory(directory) {
  const entries = [];
  for await (const entry of await opendir(directory)) {
    assert.ok(entries.length < 9);
    entries.push(entry.name);
  }
  return entries.sort();
}

async function boundedFile(path, limit, signal) {
  signal.throwIfAborted();
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    assert.ok(stat.isFile() && stat.size > 0 && stat.size <= limit);
    const bytes = Buffer.alloc(limit + 1);
    const result = await handle.read(bytes, 0, bytes.length, 0);
    signal.throwIfAborted();
    assert.equal(result.bytesRead, stat.size);
    return bytes.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
}

export async function existingFixture(directory, generatorChecksum, signal) {
  let report;
  try {
    const stat = await lstat(directory);
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
    report = JSON.parse(await boundedFile(join(directory, "report.json"), 16384, signal));
  } catch (error) {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  const stat = await lstat(directory);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
  assert.equal(report.generatorChecksum, generatorChecksum);
  assert.equal(report.event, "generated_hls_verified");
  assert.equal(report.recipe, "aster-generated-hls-v1");
  assert.equal(report.publicationAuthority, false);
  assert.equal(report.repeatable, true);
  assert.deepEqual(report.files?.map((file) => file.name).sort(), names);
  assert.deepEqual(await inventory(directory), [...names, "report.json"].sort());
  let total = 0;
  for (const file of report.files) {
    assert.ok(Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= 4 * 1024 * 1024);
    const bytes = await boundedFile(join(directory, file.name), file.bytes, signal);
    assert.equal(bytes.length, file.bytes);
    assert.equal(fixtureDigest(bytes), file.sha256);
    total += file.bytes;
  }
  assert.ok(total <= 8 * 1024 * 1024);
  assert.equal(total, report.totalBytes);
  return report;
}

export async function exportFixture(source, directory, report, signal) {
  assert.deepEqual(report.files?.map((file) => file.name).sort(), names);
  await mkdir(directory, { recursive: true });
  const stat = await lstat(directory);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
  // Resume only byte-identical partial output; the completion report is written last.
  for (const file of report.files) {
    signal.throwIfAborted();
    assert.ok(Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= 4 * 1024 * 1024);
    const target = join(directory, file.name);
    try {
      await copyFile(join(source, file.name), target, constants.COPYFILE_EXCL);
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
    }
    const bytes = await boundedFile(target, file.bytes, signal);
    assert.equal(bytes.length, file.bytes);
    assert.equal(fixtureDigest(bytes), file.sha256);
  }
  assert.deepEqual(await inventory(directory), names);
  signal.throwIfAborted();
  await writeFile(join(directory, "report.json"), JSON.stringify(report), { flag: "wx", signal });
}
