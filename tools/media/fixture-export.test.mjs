import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { existingFixture, exportFixture, fixtureDigest } from "./fixture-export.mjs";

const signal = () => new globalThis.AbortController().signal;
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "aster-fixture-export-"));
  t.after(() => rm(root, { recursive: true }));
  const source = join(root, "source");
  await mkdir(source);
  const files = [];
  for (const name of [
    "captions.m3u8",
    "captions.vtt",
    "master.m3u8",
    "segment-000.ts",
    "segment-001.ts",
    "segment-002.ts",
    "source.mkv",
    "video.m3u8",
  ]) {
    const bytes = Buffer.from(name);
    await writeFile(join(source, name), bytes);
    files.push({ name, bytes: bytes.length, sha256: fixtureDigest(bytes) });
  }
  const report = {
    event: "generated_hls_verified",
    recipe: "aster-generated-hls-v1",
    generatorChecksum: "a".repeat(64),
    publicationAuthority: false,
    repeatable: true,
    files,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  };
  return { root, source, output: join(root, "output"), report };
}

test("verified export completes last and reuses only identical complete bytes", async (t) => {
  const f = await fixture(t);
  assert.equal(await existingFixture(f.output, f.report.generatorChecksum, signal()), undefined);
  await exportFixture(f.source, f.output, f.report, signal());
  assert.deepEqual(await existingFixture(f.output, f.report.generatorChecksum, signal()), f.report);
  await assert.rejects(existingFixture(f.output, "b".repeat(64), signal()));
  await assert.rejects(
    existingFixture(f.output, f.report.generatorChecksum, globalThis.AbortSignal.abort()),
  );
  await writeFile(join(f.output, "segment-000.ts"), "corrupt");
  await assert.rejects(existingFixture(f.output, f.report.generatorChecksum, signal()));
});

test("partial export resumes matching children but never overwrites a conflict or symlink", async (t) => {
  const f = await fixture(t);
  await mkdir(f.output);
  await writeFile(join(f.output, "captions.m3u8"), "conflict");
  await assert.rejects(exportFixture(f.source, f.output, f.report, signal()));
  await assert.rejects(readFile(join(f.output, "report.json")), { code: "ENOENT" });
  assert.equal(await readFile(join(f.output, "captions.m3u8"), "utf8"), "conflict");
  await unlink(join(f.output, "captions.m3u8"));
  await symlink(join(f.source, "captions.m3u8"), join(f.output, "captions.m3u8"));
  await assert.rejects(exportFixture(f.source, f.output, f.report, signal()));
  await unlink(join(f.output, "captions.m3u8"));
  await exportFixture(f.source, f.output, f.report, signal());
  await unlink(join(f.output, "segment-001.ts"));
  await assert.rejects(existingFixture(f.output, f.report.generatorChecksum, signal()));
});
