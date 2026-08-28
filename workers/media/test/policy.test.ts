import assert from "node:assert/strict";
import { test } from "node:test";
import { renditionLadder, sourceIdentity, validateSourceProbe } from "../src/domain/policy.js";
import { validatePlaylist } from "../src/domain/hls.js";

function probe() {
  return {
    streams: [
      {
        codec_type: "video",
        codec_name: "h264",
        width: 640,
        height: 360,
        avg_frame_rate: "24/1",
        r_frame_rate: "24/1",
        pix_fmt: "yuv420p",
        sample_aspect_ratio: "1:1",
        disposition: { attached_pic: 0 },
      },
      { codec_type: "audio", codec_name: "aac", channels: 2, sample_rate: "48000" },
    ],
    format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "600", start_time: "0" },
  };
}
test("selects conservative no-upscale renditions and validates source identity", () => {
  const source = validateSourceProbe(probe());
  assert.deepEqual(renditionLadder(source), [
    { height: 240, width: 426, videoKbps: 350 },
    { height: 360, width: 640, videoKbps: 650 },
  ]);
  assert.deepEqual(renditionLadder({ ...source, width: 320, height: 180 }), [
    { height: 180, width: 320, videoKbps: 350 },
  ]);
  const cropped = probe();
  Object.assign(cropped.streams[0] ?? {}, { height: 359, avg_frame_rate: "1717920/71579" });
  assert.deepEqual(renditionLadder(validateSourceProbe(cropped)), [
    { height: 240, width: 426, videoKbps: 350 },
    { height: 358, width: 638, videoKbps: 650 },
  ]);
  for (const value of [
    null,
    {},
    { sha256: "x", bytes: 12, container: "zip" },
    { sha256: "a".repeat(64), bytes: 2 ** 30, container: "zip" },
  ]) {
    assert.throws(() => sourceIdentity(value));
  }
});
test("rejects unexpected tracks, codecs, rotation, dimensions, timestamps and durations", () => {
  for (const patch of [
    { width: 8192 },
    { height: 1081 },
    { codec_name: "hevc" },
    { pix_fmt: "yuv420p10le" },
    { avg_frame_rate: "1/0" },
    { avg_frame_rate: "120/1" },
    { side_data_list: [{ rotation: 90 }] },
    { tags: { rotate: "90" } },
    { sample_aspect_ratio: "4:3" },
    { disposition: { attached_pic: 1 } },
  ]) {
    const input = probe();
    input.streams[0] = { ...input.streams[0], ...patch } as (typeof input.streams)[0];
    assert.throws(() => validateSourceProbe(input));
  }
  for (const patch of [
    { duration: "NaN" },
    { duration: "3601" },
    { start_time: "NaN" },
    { start_time: "10" },
  ]) {
    const input = probe();
    Object.assign(input.format, patch);
    assert.throws(() => validateSourceProbe(input));
  }
  const input = probe();
  const audio = input.streams[1];
  assert.ok(audio);
  input.streams.push(audio);
  assert.throws(() => validateSourceProbe(input));
});
const playlist =
  "#EXTM3U\n#EXT-X-VERSION:6\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n" +
  "#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-INDEPENDENT-SEGMENTS\n#EXTINF:6.000000,\nv240-0000.ts\n#EXT-X-ENDLIST\n";
test("HLS reference grammar rejects paths, external URLs, extra directives and missing timeline", () => {
  assert.equal(validatePlaylist(playlist, 240, 6).segments.length, 1);
  assert.equal(
    validatePlaylist(
      playlist.replace("TARGETDURATION:6", "TARGETDURATION:2").replace("6.000000", "2.000000"),
      240,
      2,
    ).duration,
    2,
  );
  for (const text of [
    playlist.replace("v240-0000.ts", "../source.mp4"),
    playlist.replace("v240-0000.ts", "https://example.com/segment.ts"),
    playlist.replace("v240-0000.ts", "v240-0001.ts"),
    playlist.replace("#EXT-X-ENDLIST", '#EXT-X-KEY:METHOD=AES-128,URI="key"'),
    playlist.replace("#EXTINF:6.000000,", "#EXTINF:NaN,"),
    playlist + "#UNKNOWN",
  ]) {
    assert.throws(() => validatePlaylist(text, 240, 6));
  }
  assert.throws(() => validatePlaylist(playlist, 240, 600));
});
