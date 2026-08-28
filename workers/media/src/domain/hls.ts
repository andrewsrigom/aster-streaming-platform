import { MediaError } from "./policy.js";

export function validatePlaylist(text: string, height: number, sourceDuration: number) {
  if (Buffer.byteLength(text) > 65536) {
    throw new MediaError("INVALID_OUTPUT");
  }
  const lines = text.trimEnd().split("\n");
  const target = Number(/^#EXT-X-TARGETDURATION:([1-6])$/u.exec(lines[2] ?? "")?.[1]);
  if (
    lines[0] !== "#EXTM3U" ||
    lines[1] !== "#EXT-X-VERSION:6" ||
    !Number.isInteger(target) ||
    lines[3] !== "#EXT-X-MEDIA-SEQUENCE:0" ||
    lines[4] !== "#EXT-X-PLAYLIST-TYPE:VOD" ||
    lines[5] !== "#EXT-X-INDEPENDENT-SEGMENTS" ||
    lines.at(-1) !== "#EXT-X-ENDLIST" ||
    (lines.length - 7) % 2 !== 0
  ) {
    throw new MediaError("INVALID_OUTPUT");
  }
  const count = (lines.length - 7) / 2;
  if (count < 1 || count > 601) {
    throw new MediaError("INVALID_OUTPUT");
  }
  const segments: { name: string; duration: number }[] = [];
  for (let index = 0; index < count; index++) {
    const match = /^#EXTINF:([0-9]+\.[0-9]{1,6}),$/u.exec(lines[6 + index * 2] ?? "");
    const duration = Number(match?.[1]);
    const name = "v" + String(height) + "-" + String(index).padStart(4, "0") + ".ts";
    if (
      !match ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 6.5 ||
      Math.round(duration) > target ||
      lines[7 + index * 2] !== name
    ) {
      throw new MediaError("INVALID_OUTPUT");
    }
    segments.push({ name, duration });
  }
  const duration = segments.reduce((sum, segment) => sum + segment.duration, 0);
  if (Math.abs(duration - sourceDuration) > 1) {
    throw new MediaError("INVALID_OUTPUT");
  }
  return { segments, duration };
}
