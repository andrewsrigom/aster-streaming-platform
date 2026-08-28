import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { verifyGeneratedDirectory } from "../src/infrastructure/fixtures/playable-files.js";

async function fixture(
  t: TestContext,
  master = '#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,URI="captions.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=100000\nvideo.m3u8\n',
) {
  const directory = await mkdtemp(join(tmpdir(), "aster-playable-files-"));
  t.after(() => rm(directory, { recursive: true }));
  const contents = {
    "source.mkv": "source",
    "master.m3u8": master,
    "video.m3u8": "#EXTM3U\nsegment-000.ts\nsegment-001.ts\nsegment-002.ts\n",
    "captions.m3u8": "#EXTM3U\ncaptions.vtt\n",
    "captions.vtt": "WEBVTT\n",
    "segment-000.ts": "0",
    "segment-001.ts": "1",
    "segment-002.ts": "2",
  };
  const files = [];
  for (const [name, content] of Object.entries(contents)) {
    await writeFile(join(directory, name), content);
    files.push({
      name,
      bytes: Buffer.byteLength(content),
      sha256: createHash("sha256").update(content).digest("hex"),
    });
  }
  const report = {
    event: "generated_hls_verified",
    recipe: "aster-generated-hls-v1",
    repeatable: true,
    independentSegments: true,
    durationSeconds: 6,
    width: 320,
    height: 180,
    fps: 24,
    captionLanguage: "en",
    publicationAuthority: false,
    generatorChecksum: "a".repeat(64),
    sourceChecksum: files[0]?.sha256,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
  };
  await writeFile(join(directory, "report.json"), JSON.stringify(report));
  return { directory, report };
}

test("playable file verification checks every immutable byte, cancellation and finite inventory", async (t) => {
  const f = await fixture(t);
  const signal = new AbortController().signal;
  const seed = await verifyGeneratedDirectory(f.directory, f.report, signal);
  assert.equal(seed.files.length, 8);
  await assert.rejects(verifyGeneratedDirectory(f.directory, f.report, AbortSignal.abort()));
  await writeFile(join(f.directory, "segment-001.ts"), "bad");
  await assert.rejects(verifyGeneratedDirectory(f.directory, f.report, signal));
  await unlink(join(f.directory, "segment-001.ts"));
  await assert.rejects(verifyGeneratedDirectory(f.directory, f.report, signal));
  await symlink(join(f.directory, "segment-002.ts"), join(f.directory, "segment-001.ts"));
  await assert.rejects(verifyGeneratedDirectory(f.directory, f.report, signal));
  await mkdir(join(f.directory, "unexpected"));
  await assert.rejects(verifyGeneratedDirectory(f.directory, f.report, signal));
});

test("matching checksums do not authorize remote, traversing, encrypted or extra playlist references", async (t) => {
  for (const master of [
    '#EXTM3U\n#EXT-X-MEDIA:URI="https://untrusted.invalid/captions.m3u8"\nvideo.m3u8\n',
    '#EXTM3U\n#EXT-X-MEDIA:URI="captions.m3u8"\n../video.m3u8\n',
    '#EXTM3U\n#EXT-X-MEDIA:URI="captions.m3u8"\nvideo.m3u8\n#EXT-X-KEY:METHOD=AES-128\n',
    '#EXTM3U\n#EXT-X-MEDIA:URI="captions.m3u8"\nvideo.m3u8\nother.ts\n',
  ]) {
    const f = await fixture(t, master);
    await assert.rejects(
      verifyGeneratedDirectory(f.directory, f.report, new AbortController().signal),
    );
  }
});
