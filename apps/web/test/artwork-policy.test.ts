import assert from "node:assert/strict";
import test from "node:test";
import config from "../next.config.ts";

test("image optimization accepts one public source and finite work, not a proxy", () => {
  const images = config.images;
  assert.ok(images);
  assert.deepEqual(images.localPatterns, [{ pathname: "/artwork/aster-v1.png", search: "" }]);
  assert.deepEqual(images.remotePatterns, []);
  assert.deepEqual(images.deviceSizes, [480, 768, 1280]);
  assert.deepEqual(images.imageSizes, [160, 320]);
  assert.deepEqual(images.qualities, [75]);
  assert.deepEqual(images.formats, ["image/webp"]);
  assert.equal(images.maximumResponseBody, 102400);
  assert.equal(images.maximumDiskCacheSize, 8388608);
  assert.equal(images.maximumRedirects, 0);
  assert.equal(images.dangerouslyAllowLocalIP, false);
  assert.equal(images.dangerouslyAllowSVG, false);
});
