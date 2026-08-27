import assert from "node:assert/strict";

export const CAPTIONS =
  "WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:126000\n\n00:00:00.000 --> 00:00:06.000\nGenerated test pattern and a steady tone.\n";
export const CAPTION_PLAYLIST =
  "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:6.000000,\ncaptions.vtt\n#EXT-X-ENDLIST\n";
export const masterPlaylist = (bandwidth) =>
  "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n" +
  '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="captions",NAME="English",LANGUAGE="en",AUTOSELECT=YES,DEFAULT=YES,URI="captions.m3u8"\n' +
  "#EXT-X-STREAM-INF:BANDWIDTH=" +
  String(bandwidth) +
  ',RESOLUTION=320x180,FRAME-RATE=24.000,SUBTITLES="captions"\nvideo.m3u8\n';

export function validateFixturePlaylist(source) {
  assert.equal(typeof source, "string");
  assert.ok(Buffer.byteLength(source) <= 4096);
  const lines = source.trimEnd().split("\n");
  const prefix = [
    "#EXTM3U",
    "#EXT-X-VERSION:6",
    "#EXT-X-TARGETDURATION:2",
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXT-X-PLAYLIST-TYPE:VOD",
    "#EXT-X-INDEPENDENT-SEGMENTS",
  ];
  assert.deepEqual(lines.slice(0, 6), prefix);
  assert.equal(lines.length, 13);
  const segments = [];
  for (let index = 0; index < 3; index++) {
    assert.equal(lines[6 + index * 2], "#EXTINF:2.000000,");
    const name = "segment-" + String(index).padStart(3, "0") + ".ts";
    assert.equal(lines[7 + index * 2], name);
    segments.push(name);
  }
  assert.equal(lines[12], "#EXT-X-ENDLIST");
  return segments;
}

export function validateFixtureProbe(probe, source = false) {
  assert.ok(probe && typeof probe === "object");
  assert.equal(probe.streams?.length, 2);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  assert.equal(video?.codec_name, source ? "ffv1" : "h264");
  assert.equal(video?.width, 320);
  assert.equal(video?.height, 180);
  assert.equal(video?.avg_frame_rate, "24/1");
  assert.equal(video?.pix_fmt, "yuv420p");
  assert.equal(audio?.codec_name, source ? "pcm_s16le" : "aac");
  assert.equal(audio?.channels, 1);
  assert.equal(audio?.sample_rate, "48000");
  const duration = Number(probe.format?.duration);
  assert.ok(
    Number.isFinite(duration) &&
      duration >= (source ? 5.9 : 1.9) &&
      duration <= (source ? 6.1 : 2.2),
  );
  return {
    duration,
    video: video.codec_name,
    audio: audio.codec_name,
    width: 320,
    height: 180,
    fps: 24,
  };
}
