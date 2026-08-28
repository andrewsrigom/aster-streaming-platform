import { MediaError, record, type SourceProbe } from "./policy.js";

export const ARTWORK_RECIPE = "frame-jpeg-v1";
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export interface ArtworkFrame {
  readonly name: string;
  readonly purpose: "poster" | "thumbnail";
  readonly width: number;
  readonly height: number;
  readonly atSeconds: number;
}

export function artworkFrames(
  source: Pick<SourceProbe, "width" | "height" | "duration">,
): readonly ArtworkFrame[] {
  if (
    !Number.isInteger(source.width) ||
    source.width < 128 ||
    source.width > 1920 ||
    !Number.isInteger(source.height) ||
    source.height < 72 ||
    source.height > 1080 ||
    !Number.isFinite(source.duration) ||
    source.duration < 1 ||
    source.duration > 3600
  ) {
    throw new MediaError("UNSUPPORTED_MEDIA");
  }
  const frame = (
    name: string,
    purpose: ArtworkFrame["purpose"],
    width: number,
    fraction: number,
  ): ArtworkFrame => ({
    name,
    purpose,
    width,
    height: Math.max(1, Math.round((source.height * width) / source.width)),
    atSeconds: Math.floor(source.duration * fraction * 1000) / 1000,
  });
  return [
    ...[...new Set([320, 640].map((width) => Math.min(source.width, width)))].map((width) =>
      frame("poster-" + String(width) + ".jpg", "poster", width, 0.2),
    ),
    ...[0.1, 0.5, 0.85].map((fraction, index) =>
      frame(
        "thumbnail-0" + String(index + 1) + ".jpg",
        "thumbnail",
        Math.min(source.width, 160),
        fraction,
      ),
    ),
  ];
}

export function validateImageProbe(value: unknown, expected: ArtworkFrame): void {
  const streams = record(value)?.["streams"];
  const stream = Array.isArray(streams) && streams.length === 1 ? record(streams[0]) : undefined;
  if (
    !stream ||
    stream["codec_type"] !== "video" ||
    stream["codec_name"] !== "mjpeg" ||
    stream["width"] !== expected.width ||
    stream["height"] !== expected.height ||
    stream["nb_read_frames"] !== "1" ||
    stream["pix_fmt"] !== "yuvj420p"
  ) {
    throw new MediaError("INVALID_OUTPUT");
  }
}
