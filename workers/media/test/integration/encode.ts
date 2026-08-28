import assert from "node:assert/strict";
import { mkdir, readFile, unlink } from "node:fs/promises";
import { encodeHls, probeSource } from "../../src/infrastructure/encode.js";
import { runProcess } from "../../src/infrastructure/process.js";
import { fileDigest } from "../../src/infrastructure/files.js";

const signal = AbortSignal.timeout(90000);
await mkdir("/work/fixture");
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
    "testsrc2=size=640x360:rate=24:duration=13",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=13",
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
    "/work/fixture/source.mp4",
  ],
  "/work",
  signal,
  20000,
);
const probe = await probeSource("/work/fixture/source.mp4", "/work", signal);
assert.equal(probe.width, 640);
assert.equal(probe.height, 360);
assert.equal(probe.fps, 24);
const output = await encodeHls("/work/fixture/source.mp4", "/work/fixture/output", probe, signal);
assert.equal(output.renditions.length, 2);
assert.deepEqual(
  output.renditions.map((r) => r.height),
  [240, 360],
);
assert.ok(output.renditions.every((r) => r.segmentCount === 3 && Math.abs(r.duration - 13) < 0.1));
const master = await readFile("/work/fixture/output/master.m3u8", "utf8");
assert.ok(master.includes('CODECS="avc1.64002a,mp4a.40.2"'));
await unlink("/work/fixture/output/v240-0000.ts");
// FFmpeg may skip a missing segment even with -xerror; object validation is mandatory.
await assert.rejects(fileDigest("/work/fixture/output/v240-0000.ts", 16 * 1024 * 1024, signal));
process.stdout.write(
  JSON.stringify({
    event: "media_encode_integration",
    probe,
    ...output,
    missingSegmentRejected: true,
    fixtureOnly: true,
  }) + "\n",
);
