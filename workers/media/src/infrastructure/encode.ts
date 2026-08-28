import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import {
  MAX_OBJECTS,
  MAX_OUTPUT_BYTES,
  MediaError,
  RECIPE,
  renditionLadder,
  record,
  validateSourceProbe,
  type SourceProbe,
} from "../domain/policy.js";
import { validatePlaylist } from "../domain/hls.js";
import { fileDigest } from "./files.js";
import { runProcess } from "./process.js";

const inputOptions = [
  "-threads",
  "1",
  "-protocol_whitelist",
  "file",
  "-f",
  "mov",
  "-enable_drefs",
  "0",
  "-use_absolute_path",
  "0",
  "-probesize",
  "5000000",
  "-analyzeduration",
  "5000000",
];
const common = ["-nostdin", "-hide_banner", "-v", "error", "-n", "-xerror"];

export async function probeSource(
  path: string,
  cwd: string,
  signal: AbortSignal,
  observe?: (probe: unknown) => void,
): Promise<SourceProbe> {
  const json = await runProcess(
    "ffprobe",
    [
      "-v",
      "error",
      ...inputOptions,
      "-show_entries",
      "stream=codec_type,codec_name,width,height,avg_frame_rate,r_frame_rate,pix_fmt,channels,sample_rate,sample_aspect_ratio:stream_disposition=attached_pic:stream_tags=rotate:stream_side_data=rotation:format=format_name,duration,start_time",
      "-of",
      "json",
      path,
    ],
    cwd,
    signal,
    20000,
  );
  const parsed: unknown = JSON.parse(json);
  observe?.(parsed);
  return validateSourceProbe(parsed);
}

export async function encodeHls(
  source: string,
  output: string,
  probe: SourceProbe,
  signal: AbortSignal,
  onRendition: (height: number) => void = () => undefined,
) {
  await mkdir(output, { mode: 0o700 });
  const files: { name: string; bytes: number; sha256: string }[] = [];
  const renditions = [];
  let totalBytes = 0;
  const started = performance.now();
  const addFile = async (name: string) => {
    if (files.length >= MAX_OBJECTS) {
      throw new MediaError("OUTPUT_LIMIT");
    }
    const file = await fileDigest(join(output, name), 16 * 1024 * 1024, signal);
    totalBytes += file.bytes;
    if (totalBytes > MAX_OUTPUT_BYTES) {
      throw new MediaError("OUTPUT_LIMIT");
    }
    files.push({ name, ...file });
    return file;
  };
  for (const rendition of renditionLadder(probe)) {
    signal.throwIfAborted();
    const playlist = "v" + String(rendition.height) + ".m3u8";
    await runProcess(
      "ffmpeg",
      [
        ...common,
        ...inputOptions,
        "-i",
        source,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0",
        "-map_metadata",
        "-1",
        "-map_chapters",
        "-1",
        "-filter_threads",
        "1",
        "-vf",
        "scale=" + String(rendition.width) + ":" + String(rendition.height) + ",setsar=1",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-profile:v",
        "high",
        "-level:v",
        "4.2",
        "-pix_fmt",
        "yuv420p",
        "-threads",
        "1",
        "-b:v",
        String(rendition.videoKbps) + "k",
        "-maxrate",
        String(rendition.videoKbps) + "k",
        "-bufsize",
        String(rendition.videoKbps * 2) + "k",
        "-g",
        String(Math.ceil(probe.fps * 6)),
        "-keyint_min",
        String(Math.ceil(probe.fps * 6)),
        "-sc_threshold",
        "0",
        "-force_key_frames",
        "expr:gte(t,n_forced*6)",
        "-r",
        probe.frameRate,
        "-fps_mode",
        "cfr",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-ar",
        "48000",
        "-ac",
        String(probe.channels),
        "-f",
        "hls",
        "-hls_time",
        "6",
        "-hls_playlist_type",
        "vod",
        "-hls_flags",
        "independent_segments",
        "-start_number",
        "0",
        "-hls_segment_filename",
        "v" + String(rendition.height) + "-%04d.ts",
        playlist,
      ],
      output,
      signal,
      600000,
    );
    const details = await lstat(join(output, playlist));
    if (!details.isFile() || details.size > 65536) {
      throw new MediaError("INVALID_OUTPUT");
    }
    const parsed = validatePlaylist(
      await readFile(join(output, playlist), "utf8"),
      rendition.height,
      probe.duration,
    );
    let bandwidth = 0;
    let renditionBytes = 0;
    for (const segment of parsed.segments) {
      const file = await addFile(segment.name);
      renditionBytes += file.bytes;
      bandwidth = Math.max(bandwidth, Math.ceil((file.bytes * 8) / segment.duration));
    }
    await addFile(playlist);
    const technical = record(
      JSON.parse(
        await runProcess(
          "ffprobe",
          [
            "-v",
            "error",
            "-protocol_whitelist",
            "file",
            "-show_entries",
            "stream=codec_type,codec_name,profile,level,width,height,avg_frame_rate,channels,sample_rate:format=duration",
            "-of",
            "json",
            playlist,
          ],
          output,
          signal,
          20000,
        ),
      ) as unknown,
    );
    const streams = technical?.["streams"];
    if (!Array.isArray(streams) || streams.length !== 2) {
      throw new MediaError("INVALID_OUTPUT");
    }
    const video = streams.map(record).find((stream) => stream?.["codec_type"] === "video");
    const audio = streams.map(record).find((stream) => stream?.["codec_type"] === "audio");
    const rate =
      typeof video?.["avg_frame_rate"] === "string" ? video["avg_frame_rate"].split("/") : [];
    const measuredFps = Number(rate[0]) / Number(rate[1]);
    const measuredDuration = Number(record(technical?.["format"])?.["duration"]);
    if (
      video?.["codec_name"] !== "h264" ||
      video["profile"] !== "High" ||
      video["level"] !== 42 ||
      video["width"] !== rendition.width ||
      video["height"] !== rendition.height ||
      !Number.isFinite(measuredFps) ||
      Math.abs(measuredFps - probe.fps) > 0.001 ||
      audio?.["codec_name"] !== "aac" ||
      audio["channels"] !== probe.channels ||
      audio["sample_rate"] !== "48000" ||
      !Number.isFinite(measuredDuration) ||
      Math.abs(measuredDuration - probe.duration) > 1
    ) {
      throw new MediaError("INVALID_OUTPUT");
    }
    const samples = new Set([
      0,
      Math.floor(parsed.segments.length / 2),
      parsed.segments.length - 1,
    ]);
    for (const sample of samples) {
      const segment = parsed.segments[sample];
      if (!segment) {
        throw new MediaError("INVALID_OUTPUT");
      }
      const packet = record(
        JSON.parse(
          await runProcess(
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
              segment.name,
            ],
            output,
            signal,
            10000,
          ),
        ) as unknown,
      );
      const packets = packet?.["packets"];
      const flags = Array.isArray(packets) ? record(packets[0])?.["flags"] : undefined;
      if (typeof flags !== "string" || !flags.includes("K")) {
        throw new MediaError("INVALID_OUTPUT");
      }
    }
    // Only validated local references may reach the HLS demuxer.
    await runProcess(
      "ffmpeg",
      [
        ...common,
        "-threads",
        "1",
        "-protocol_whitelist",
        "file",
        "-i",
        playlist,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0",
        "-threads",
        "1",
        "-f",
        "null",
        "-",
      ],
      output,
      signal,
      120000,
    );
    renditions.push({
      ...rendition,
      fps: probe.fps,
      duration: parsed.duration,
      bandwidth,
      averageBandwidth: Math.ceil((renditionBytes * 8) / parsed.duration),
      channels: probe.channels,
      playlist,
      segmentCount: parsed.segments.length,
    });
    onRendition(rendition.height);
  }
  const master =
    "#EXTM3U\n#EXT-X-VERSION:6\n#EXT-X-INDEPENDENT-SEGMENTS\n" +
    renditions
      .map(
        (r) =>
          "#EXT-X-STREAM-INF:BANDWIDTH=" +
          String(r.bandwidth) +
          ",AVERAGE-BANDWIDTH=" +
          String(r.averageBandwidth) +
          ",RESOLUTION=" +
          String(r.width) +
          "x" +
          String(r.height) +
          ",FRAME-RATE=" +
          r.fps.toFixed(3) +
          ',CODECS="avc1.64002a,mp4a.40.2"\n' +
          r.playlist +
          "\n",
      )
      .join("");
  await writeFile(join(output, "master.m3u8"), master, { flag: "wx", mode: 0o600 });
  await addFile("master.m3u8");
  if (
    JSON.stringify((await readdir(output)).sort()) !==
    JSON.stringify(files.map((file) => file.name).sort())
  ) {
    throw new MediaError("INVALID_OUTPUT");
  }
  const manifestHash = createHash("sha256").update(JSON.stringify(files)).digest("hex");
  return {
    recipe: RECIPE,
    renditions,
    files,
    totalBytes,
    manifestHash,
    encodingElapsedMs: performance.now() - started,
  };
}
