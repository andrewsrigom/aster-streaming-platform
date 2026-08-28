import { catalogRecord } from "../../domain/values.js";
import { MediaProcessingError } from "./processing-error.js";

export function validateArtworkReport(
  report: Record<string, unknown>,
  names: readonly string[],
): void {
  const probe = report["probe"] as Record<string, unknown> | undefined;
  const width = probe?.["width"];
  const height = probe?.["height"];
  const duration = probe?.["duration"];
  if (
    typeof width !== "number" ||
    !Number.isInteger(width) ||
    width < 128 ||
    width > 1920 ||
    typeof height !== "number" ||
    !Number.isInteger(height) ||
    height < 72 ||
    height > 1080 ||
    typeof duration !== "number" ||
    !Number.isFinite(duration) ||
    duration < 1 ||
    duration > 3600
  ) {
    throw new MediaProcessingError("INVALID_OUTPUT", "Invalid artwork source geometry");
  }
  const frame = (name: string, purpose: string, size: number, fraction: number) => ({
    name,
    purpose,
    width: size,
    height: Math.max(1, Math.round((height * size) / width)),
    atSeconds: Math.floor(duration * fraction * 1000) / 1000,
  });
  const expected = [
    ...[...new Set([320, 640].map((size) => Math.min(width, size)))].map((size) =>
      frame("poster-" + String(size) + ".jpg", "poster", size, 0.2),
    ),
    ...[0.1, 0.5, 0.85].map((fraction, index) =>
      frame(
        "thumbnail-0" + String(index + 1) + ".jpg",
        "thumbnail",
        Math.min(width, 160),
        fraction,
      ),
    ),
  ];
  const frames = report["frames"];
  if (
    !Array.isArray(frames) ||
    frames.length !== expected.length ||
    JSON.stringify(names) !== JSON.stringify(expected.map((item) => item.name)) ||
    !expected.every((item, index) => {
      const actual = catalogRecord(frames[index], [
        "name",
        "purpose",
        "width",
        "height",
        "atSeconds",
      ]);
      return actual && Object.entries(item).every(([key, value]) => actual[key] === value);
    })
  ) {
    throw new MediaProcessingError("INVALID_OUTPUT", "Incomplete artwork variants");
  }
}
