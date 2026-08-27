import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { setTimeout, clearTimeout } from "node:timers";
import {
  CAPTIONS,
  CAPTION_PLAYLIST,
  masterPlaylist,
  validateFixturePlaylist,
  validateFixtureProbe,
} from "./hls-contract.mjs";

const execute = promisify(execFile);
const controller = new globalThis.AbortController();
const abort = () => controller.abort();
const timer = setTimeout(abort, 45000);
process.once("SIGTERM", abort);
process.once("SIGINT", abort);
const run = async (tool, args, cwd, signal = controller.signal) =>
  (
    await execute(tool, args, {
      cwd,
      signal,
      timeout: 10000,
      killSignal: "SIGKILL",
      maxBuffer: 65536,
      windowsHide: true,
    })
  ).stdout;
const hashFile = async (path) => {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path, {
    signal: controller.signal,
    highWaterMark: 65536,
  })) {
    digest.update(chunk);
  }
  return digest.digest("hex");
};
const probe = async (file, directory, source = false) => {
  const details = await lstat(join(directory, file));
  assert.ok(
    details.isFile() &&
      !details.isSymbolicLink() &&
      details.size > 0 &&
      details.size <= 4 * 1024 * 1024,
  );
  const technical = validateFixtureProbe(
    JSON.parse(
      await run(
        "ffprobe",
        [
          "-v",
          "error",
          "-protocol_whitelist",
          "file",
          "-show_entries",
          "stream=codec_type,codec_name,width,height,avg_frame_rate,pix_fmt,channels,sample_rate:format=duration",
          "-of",
          "json",
          file,
        ],
        directory,
      ),
    ),
    source,
  );
  if (!source) {
    const packets = JSON.parse(
      await run(
        "ffprobe",
        [
          "-v",
          "error",
          "-protocol_whitelist",
          "file",
          "-select_streams",
          "v:0",
          "-read_intervals",
          "%+#1",
          "-show_entries",
          "packet=flags",
          "-of",
          "json",
          file,
        ],
        directory,
      ),
    );
    assert.ok(packets.packets?.[0]?.flags?.includes("K"));
  }
  return technical;
};

async function generate(directory) {
  await mkdir(directory);
  const common = ["-nostdin", "-hide_banner", "-v", "error", "-n"];
  await run(
    "ffmpeg",
    [
      ...common,
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=24:duration=6",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000:duration=6",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-t",
      "6",
      "-map_metadata",
      "-1",
      "-c:v",
      "ffv1",
      "-threads",
      "1",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "pcm_s16le",
      "-ac",
      "1",
      "-fflags",
      "+bitexact",
      "-flags:v",
      "+bitexact",
      "-flags:a",
      "+bitexact",
      "source.mkv",
    ],
    directory,
  );
  const original = await probe("source.mkv", directory, true);
  await run(
    "ffmpeg",
    [
      ...common,
      "-i",
      "source.mkv",
      "-map",
      "0:v:0",
      "-map",
      "0:a:0",
      "-map_metadata",
      "-1",
      "-t",
      "6",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "28",
      "-profile:v",
      "baseline",
      "-level:v",
      "3.0",
      "-threads",
      "1",
      "-pix_fmt",
      "yuv420p",
      "-g",
      "48",
      "-keyint_min",
      "48",
      "-sc_threshold",
      "0",
      "-bf",
      "0",
      "-c:a",
      "aac",
      "-b:a",
      "64k",
      "-ar",
      "48000",
      "-ac",
      "1",
      "-fflags",
      "+bitexact",
      "-flags:v",
      "+bitexact",
      "-flags:a",
      "+bitexact",
      "-f",
      "hls",
      "-hls_time",
      "2",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "independent_segments",
      "-start_number",
      "0",
      "-hls_segment_filename",
      "segment-%03d.ts",
      "video.m3u8",
    ],
    directory,
  );
  const segments = validateFixturePlaylist(await readFile(join(directory, "video.m3u8"), "utf8"));
  const technical = [];
  let bandwidth = 0;
  for (const segment of segments) {
    technical.push(await probe(segment, directory));
    const details = await lstat(join(directory, segment));
    bandwidth = Math.max(bandwidth, Math.ceil((details.size * 8) / 2));
  }
  const master = masterPlaylist(bandwidth + 1024);
  await writeFile(join(directory, "master.m3u8"), master, { flag: "wx" });
  await writeFile(join(directory, "captions.m3u8"), CAPTION_PLAYLIST, { flag: "wx" });
  await writeFile(join(directory, "captions.vtt"), CAPTIONS, { flag: "wx" });
  // Reference allowlisting precedes decoding; FFmpeg cannot follow arbitrary paths or URLs.
  await run(
    "ffmpeg",
    [
      ...common,
      "-xerror",
      "-protocol_whitelist",
      "file",
      "-i",
      "video.m3u8",
      "-map",
      "0:v:0",
      "-map",
      "0:a:0",
      "-f",
      "null",
      "-",
    ],
    directory,
  );
  const expected = [
    "source.mkv",
    "master.m3u8",
    "video.m3u8",
    "captions.m3u8",
    "captions.vtt",
    ...segments,
  ].sort();
  assert.deepEqual((await readdir(directory)).sort(), expected);
  const files = [];
  let totalBytes = 0;
  for (const name of expected) {
    const details = await lstat(join(directory, name));
    assert.ok(
      details.isFile() &&
        !details.isSymbolicLink() &&
        details.size > 0 &&
        details.size <= 4 * 1024 * 1024,
    );
    totalBytes += details.size;
    assert.ok(totalBytes <= 8 * 1024 * 1024);
    files.push({ name, bytes: details.size, sha256: await hashFile(join(directory, name)) });
  }
  return {
    recipe: "aster-generated-hls-v1",
    sourceChecksum: files.find((file) => file.name === "source.mkv").sha256,
    durationSeconds: 6,
    width: 320,
    height: 180,
    fps: 24,
    captionLanguage: "en",
    totalBytes,
    original,
    technical,
    files,
  };
}

try {
  assert.equal(process.env["ASTER_MEDIA_FIXTURE"], "local");
  assert.equal(process.argv.length, 2);
  const directory = await mkdtemp("/work/aster-hls-");
  const first = await generate(join(directory, "first"));
  const second = await generate(join(directory, "second"));
  assert.deepEqual(second, first);
  const sample = join(directory, "second", "segment-000.ts");
  await writeFile(sample, Buffer.alloc(188));
  await assert.rejects(probe("segment-000.ts", join(directory, "second")));
  await unlink(sample);
  await assert.rejects(probe("segment-000.ts", join(directory, "second")));
  await symlink(join(directory, "first", "segment-000.ts"), sample);
  await assert.rejects(probe("segment-000.ts", join(directory, "second")));
  await unlink(sample);
  await copyFile(join(directory, "first", "segment-000.ts"), sample);
  await assert.rejects(run("ffprobe", ["-version"], directory, globalThis.AbortSignal.abort()), {
    name: "AbortError",
  });
  const ffmpeg = (await run("ffmpeg", ["-version"], directory)).split("\n")[0];
  const packages = await run(
    "dpkg-query",
    ["-W", "-f=\u0024{Package}=\u0024{Version}\n", "ffmpeg", "libavcodec59", "libx264-164"],
    directory,
  );
  process.stdout.write(
    JSON.stringify({
      event: "generated_hls_verified",
      repeatable: true,
      adverseChecks: ["corrupt-segment", "missing-segment", "symlink", "cancelled-process"],
      independentSegments: true,
      ffmpeg,
      architecture: process.arch,
      packages: packages.trim().split("\n"),
      ...first,
    }) + "\n",
  );
} catch (error) {
  process.stderr.write(
    JSON.stringify({
      event: "generated_hls_failed",
      code: controller.signal.aborted ? "CANCELLED" : "INVALID_OUTPUT",
      diagnostic: error instanceof Error ? error.message.slice(0, 1024) : "Unknown failure",
    }) + "\n",
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  process.off("SIGTERM", abort);
  process.off("SIGINT", abort);
}
