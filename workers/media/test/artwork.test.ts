import assert from "node:assert/strict";
import { test } from "node:test";
import { artworkFrames, validateImageProbe } from "../src/domain/artwork.js";

test("artwork preserves odd source dimensions, caps size and uses bounded deterministic timestamps", () => {
  const frames = artworkFrames({ width: 640, height: 359, duration: 596.461667 });
  assert.deepEqual(frames.slice(0, 2), [
    { name: "poster-320.jpg", purpose: "poster", width: 320, height: 180, atSeconds: 119.292 },
    { name: "poster-640.jpg", purpose: "poster", width: 640, height: 359, atSeconds: 119.292 },
  ]);
  assert.deepEqual(
    frames.slice(2).map((frame) => frame.atSeconds),
    [59.646, 298.23, 506.992],
  );
  for (const width of [128, 320, 400, 640, 1920]) {
    const source = { width, height: 1080, duration: 1 };
    const planned = artworkFrames(source);
    assert.ok(planned.length >= 4 && planned.length <= 5);
    assert.equal(new Set(planned.map((frame) => frame.name)).size, planned.length);
    assert.ok(
      planned.every(
        (frame) => frame.width <= width && frame.height <= source.height && frame.atSeconds < 1,
      ),
    );
  }
});

test("artwork refuses unsupported sizes/timelines and incorrectly decoded images", () => {
  const source = { width: 640, height: 359, duration: 20 };
  for (const patch of [
    { width: NaN },
    { width: 127 },
    { height: 1081 },
    { duration: Infinity },
    { duration: 0 },
    { duration: 3601 },
  ]) {
    assert.throws(() => artworkFrames({ ...source, ...patch }));
  }
  const frame = artworkFrames(source)[0];
  assert.ok(frame);
  const stream = {
    codec_type: "video",
    codec_name: "mjpeg",
    width: frame.width,
    height: frame.height,
    pix_fmt: "yuvj420p",
    nb_read_frames: "1",
  };
  validateImageProbe({ streams: [stream] }, frame);
  for (const patch of [
    { width: 99999 },
    { height: 0 },
    { codec_name: "png" },
    { nb_read_frames: "2" },
    { pix_fmt: "yuv420p" },
  ]) {
    assert.throws(() => {
      validateImageProbe({ streams: [{ ...stream, ...patch }] }, frame);
    });
  }
  for (const value of [null, {}, { streams: [] }, { streams: [stream, stream] }]) {
    assert.throws(() => {
      validateImageProbe(value, frame);
    });
  }
});
