import { createHash } from "node:crypto";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import {
  ARTWORK_RECIPE,
  MAX_IMAGE_BYTES,
  artworkFrames,
  validateImageProbe,
} from "../domain/artwork.js";
import { MediaError, type SourceProbe } from "../domain/policy.js";
import { fileDigest } from "./files.js";
import { sourceInputOptions } from "./encode.js";
import { runProcess } from "./process.js";

export async function encodeArtwork(
  source: string,
  output: string,
  probe: SourceProbe,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const frames = artworkFrames(probe);
  await mkdir(output, { mode: 0o700 });
  const started = performance.now();
  const files: { name: string; bytes: number; sha256: string }[] = [];
  for (const frame of frames) {
    await runProcess(
      "ffmpeg",
      [
        "-nostdin",
        "-hide_banner",
        "-v",
        "error",
        "-n",
        "-xerror",
        ...sourceInputOptions,
        "-ss",
        frame.atSeconds.toFixed(3),
        "-i",
        source,
        "-map",
        "0:v:0",
        "-an",
        "-sn",
        "-dn",
        "-map_metadata",
        "-1",
        "-map_chapters",
        "-1",
        "-filter_threads",
        "1",
        "-vf",
        "scale=" + String(frame.width) + ":" + String(frame.height) + ",setsar=1",
        "-frames:v",
        "1",
        "-c:v",
        "mjpeg",
        "-pix_fmt",
        "yuvj420p",
        "-q:v",
        "3",
        "-threads",
        "1",
        "-f",
        "image2",
        "-update",
        "1",
        frame.name,
      ],
      output,
      signal,
      20000,
    );
    const file = await fileDigest(join(output, frame.name), MAX_IMAGE_BYTES, signal);
    const technical: unknown = JSON.parse(
      await runProcess(
        "ffprobe",
        [
          "-v",
          "error",
          "-threads",
          "1",
          "-protocol_whitelist",
          "file",
          "-count_frames",
          "-show_entries",
          "stream=codec_type,codec_name,width,height,pix_fmt,nb_read_frames",
          "-of",
          "json",
          frame.name,
        ],
        output,
        signal,
        5000,
      ),
    );
    validateImageProbe(technical, frame);
    await runProcess(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-xerror",
        "-threads",
        "1",
        "-protocol_whitelist",
        "file",
        "-i",
        frame.name,
        "-map",
        "0:v:0",
        "-threads",
        "1",
        "-f",
        "null",
        "-",
      ],
      output,
      signal,
      5000,
    );
    files.push({ name: frame.name, ...file });
  }
  if (
    JSON.stringify((await readdir(output)).sort()) !==
    JSON.stringify(files.map((file) => file.name).sort())
  ) {
    throw new MediaError("INVALID_OUTPUT");
  }
  return {
    recipe: ARTWORK_RECIPE,
    frames,
    files,
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    manifestHash: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
    encodingElapsedMs: performance.now() - started,
  };
}
