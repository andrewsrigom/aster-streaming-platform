import assert from "node:assert/strict";
import { access, mkdir, writeFile } from "node:fs/promises";
import { encodeArtwork } from "../../src/infrastructure/artwork.js";
import { probeSource } from "../../src/infrastructure/encode.js";
import { runProcess } from "../../src/infrastructure/process.js";

const signal = AbortSignal.timeout(60000);
await mkdir("/work/artwork");
await runProcess(
  "ffmpeg",
  [
    "-nostdin",
    "-v",
    "error",
    "-n",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=640x360:rate=24:duration=3",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=3",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    "-threads",
    "1",
    "-c:a",
    "aac",
    "-ac",
    "2",
    "/work/artwork/source.mp4",
  ],
  "/work",
  signal,
  10000,
);
const probe = await probeSource("/work/artwork/source.mp4", "/work", signal);
const first = await encodeArtwork("/work/artwork/source.mp4", "/work/artwork/first", probe, signal);
const second = await encodeArtwork(
  "/work/artwork/source.mp4",
  "/work/artwork/second",
  probe,
  signal,
);
assert.equal(first.recipe, "frame-jpeg-v1");
assert.equal(first.files.length, 5);
assert.deepEqual(first.files, second.files);
assert.equal(first.manifestHash, second.manifestHash);
const poster = first.frames[1];
assert.ok(poster);
assert.equal(poster.width, 640);
assert.equal(poster.height, 360);
await assert.rejects(
  encodeArtwork("/work/artwork/source.mp4", "/work/artwork/cancelled", probe, AbortSignal.abort()),
);
await assert.rejects(access("/work/artwork/cancelled"));
await writeFile("/work/artwork/invalid.mp4", "not video", { flag: "wx" });
await assert.rejects(
  encodeArtwork("/work/artwork/invalid.mp4", "/work/artwork/invalid", probe, signal),
);
await assert.rejects(access("/work/artwork/invalid/report.json"));
process.stdout.write(
  JSON.stringify({
    event: "media_artwork_integration",
    probe,
    ...first,
    deterministicImages: true,
    cancellationBeforeSideEffects: true,
    malformedSourceRefused: true,
    fixtureOnly: true,
  }) + "\n",
);
