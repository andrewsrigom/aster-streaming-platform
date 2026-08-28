export const RECIPE = "hls-avc-aac-v1";
export const MAX_SOURCE_BYTES = 256 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 512 * 1024 * 1024;
export const MAX_OBJECTS = 2048;

export class MediaError extends Error {
  constructor(
    readonly code:
      | "INVALID_SOURCE"
      | "INVALID_ARCHIVE"
      | "UNSUPPORTED_MEDIA"
      | "INVALID_OUTPUT"
      | "PROCESS_FAILED"
      | "PROCESS_TIMEOUT"
      | "CANCELLED"
      | "OUTPUT_LIMIT",
  ) {
    super(code);
    this.name = "MediaError";
  }
}

export interface SourceIdentity {
  readonly sha256: string;
  readonly bytes: number;
  readonly container: "zip" | "mp4";
}
export function sourceIdentity(input: unknown): SourceIdentity {
  const value = record(input);
  if (
    !value ||
    Object.keys(value).length !== 3 ||
    typeof value["sha256"] !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value["sha256"]) ||
    !integer(value["bytes"], 8, MAX_SOURCE_BYTES) ||
    (value["container"] !== "zip" && value["container"] !== "mp4")
  ) {
    throw new MediaError("INVALID_SOURCE");
  }
  return { sha256: value["sha256"], bytes: value["bytes"], container: value["container"] };
}
export function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}
export interface SourceProbe {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly frameRate: string;
  readonly duration: number;
  readonly channels: number;
  readonly sampleRate: number;
}
export function validateSourceProbe(input: unknown): SourceProbe {
  const value = record(input);
  const streams: unknown = value?.["streams"];
  const format = record(value?.["format"]);
  if (
    !Array.isArray(streams) ||
    streams.length !== 2 ||
    !format ||
    format["format_name"] !== "mov,mp4,m4a,3gp,3g2,mj2"
  ) {
    throw new MediaError("UNSUPPORTED_MEDIA");
  }
  const video = streams.map(record).find((s) => s?.["codec_type"] === "video");
  const audio = streams.map(record).find((s) => s?.["codec_type"] === "audio");
  const rate = typeof video?.["r_frame_rate"] === "string" ? video["r_frame_rate"].split("/") : [];
  const average =
    typeof video?.["avg_frame_rate"] === "string" ? video["avg_frame_rate"].split("/") : [];
  const fps = Number(rate[0]) / Number(rate[1]);
  const averageFps = Number(average[0]) / Number(average[1]);
  const duration = Number(format["duration"]);
  const start = Number(format["start_time"] ?? 0);
  const channels = audio?.["channels"];
  const sampleRate = Number(audio?.["sample_rate"]);
  const width = video?.["width"];
  const height = video?.["height"];
  if (
    !video ||
    !audio ||
    video["codec_name"] !== "h264" ||
    video["pix_fmt"] !== "yuv420p" ||
    !integer(width, 128, 1920) ||
    !integer(height, 72, 1080) ||
    !["1:1", undefined].includes(video["sample_aspect_ratio"] as string | undefined) ||
    record(video["tags"])?.["rotate"] !== undefined ||
    video["side_data_list"] !== undefined ||
    record(video["disposition"])?.["attached_pic"] !== 0 ||
    rate.length !== 2 ||
    !Number.isFinite(fps) ||
    fps < 1 ||
    fps > 60 ||
    average.length !== 2 ||
    !Number.isFinite(averageFps) ||
    Math.abs(averageFps - fps) > 0.1 ||
    !Number.isFinite(duration) ||
    duration < 1 ||
    duration > 3600 ||
    !Number.isFinite(start) ||
    Math.abs(start) > 0.1 ||
    audio["codec_name"] !== "aac" ||
    !integer(channels, 1, 2) ||
    ![32000, 44100, 48000].includes(sampleRate)
  ) {
    throw new MediaError("UNSUPPORTED_MEDIA");
  }
  return { width, height, fps, frameRate: rate.join("/"), duration, channels, sampleRate };
}
export function renditionLadder(source: SourceProbe) {
  const sourceHeight = Math.floor(source.height / 2) * 2;
  const heights = [...new Set([240, 360, 720].map((height) => Math.min(height, sourceHeight)))];
  return heights.map((height) => ({
    height,
    width: Math.floor((source.width * height) / source.height / 2) * 2,
    videoKbps: height <= 240 ? 350 : height <= 360 ? 650 : 1600,
  }));
}
