import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateFixturePlaylist,
  validateFixtureProbe,
  CAPTIONS,
  CAPTION_PLAYLIST,
  masterPlaylist,
} from "./hls-contract.mjs";

const playlist =
  "#EXTM3U\n#EXT-X-VERSION:6\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-INDEPENDENT-SEGMENTS\n#EXTINF:2.000000,\nsegment-000.ts\n#EXTINF:2.000000,\nsegment-001.ts\n#EXTINF:2.000000,\nsegment-002.ts\n#EXT-X-ENDLIST\n";
test("generated HLS accepts exactly the complete finite local package", () => {
  assert.deepEqual(validateFixturePlaylist(playlist), [
    "segment-000.ts",
    "segment-001.ts",
    "segment-002.ts",
  ]);
  assert.ok(CAPTIONS.startsWith("WEBVTT\n"));
  assert.ok(CAPTION_PLAYLIST.includes("captions.vtt"));
  assert.ok(masterPlaylist(100000).includes('URI="captions.m3u8"'));
});
test("generated HLS refuses remote/traversing/missing/extra/encrypted/unbounded references and non-VOD output", () => {
  for (const name of [
    "../secret",
    "/etc/passwd",
    "https://host.invalid/a.ts",
    "segment-999.ts",
    "segment-000.ts?key=secret",
    "segment-000.ts\nextra.ts",
  ]) {
    assert.throws(() => validateFixturePlaylist(playlist.replace("segment-000.ts", name)));
  }
  for (const changed of [
    playlist.replace("#EXT-X-ENDLIST", ""),
    playlist.replace("2.000000", "200.000000"),
    playlist.replace("#EXT-X-PLAYLIST-TYPE:VOD", '#EXT-X-KEY:METHOD=AES-128,URI="key"'),
    "x".repeat(4097),
  ]) {
    assert.throws(() => validateFixturePlaylist(changed));
  }
});
test("technical probe rejects codec, dimensions, frame rate, audio and duration drift", () => {
  const video = {
    codec_type: "video",
    codec_name: "h264",
    width: 320,
    height: 180,
    avg_frame_rate: "24/1",
    pix_fmt: "yuv420p",
  };
  const audio = { codec_type: "audio", codec_name: "aac", channels: 1, sample_rate: "48000" };
  const good = { streams: [video, audio], format: { duration: "2.0" } };
  assert.equal(validateFixtureProbe(good).fps, 24);
  for (const changed of [
    { ...good, streams: [video] },
    { ...good, format: { duration: "NaN" } },
    { ...good, streams: [{ ...video, width: 1920 }, audio] },
    { ...good, streams: [{ ...video, codec_name: "hevc" }, audio] },
    { ...good, streams: [{ ...video, avg_frame_rate: "60/1" }, audio] },
    { ...good, streams: [video, { ...audio, channels: 2 }] },
  ]) {
    assert.throws(() => validateFixtureProbe(changed));
  }
});
