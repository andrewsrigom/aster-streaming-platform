import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import test from "node:test";
import { downloadMediaSource } from "../src/infrastructure/media/download-source.js";
import {
  approvedMediaUrl,
  MediaAcquisitionError,
  publicMediaAddress,
  type MediaSourceNetwork,
  type MediaSourceResponse,
} from "../src/infrastructure/media/source-network.js";

const url = "https://download.blender.org/peach/bigbuckbunny_movies/fixture.zip";
const content = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0]),
  Buffer.alloc(65536, 0x61),
]);
const source = { url, bytes: content.length, etag: '"fixture-v1"', sha256: null, container: "zip" };
function network(patch: Partial<MediaSourceResponse> = {}): MediaSourceNetwork {
  return {
    open(requested, etag, signal) {
      assert.equal(requested.href, url);
      assert.equal(etag, source.etag);
      assert.equal(signal.aborted, false);
      return Promise.resolve({
        status: 200,
        headers: {
          etag,
          "content-length": String(content.length),
          "content-type": "application/zip",
        },
        body: Readable.from([content.subarray(0, 3), content.subarray(3)]),
        ...patch,
      });
    },
  };
}
const signal = () => new AbortController().signal;
const ownedDirectories = async () =>
  (await readdir(tmpdir()))
    .filter((entry) => entry.startsWith(`aster-source-${process.pid}-`))
    .sort();

test("source destinations reject credentials, redirects and private/reserved addresses", () => {
  assert.equal(approvedMediaUrl(url).href, url);
  for (const address of [
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.1.2",
    "192.0.2.1",
    "192.168.0.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::ffff:127.0.0.1",
    "nonsense",
  ]) {
    assert.equal(publicMediaAddress(address), false, address);
  }
  assert.equal(publicMediaAddress("8.8.8.8"), true);
  assert.equal(publicMediaAddress("1.1.1.1"), true);
  for (const unsafe of [
    url.replace("https:", "http:"),
    url + "?token=secret",
    url + "#fragment",
    url.replace("download.", "user:password@download."),
    url.replace("download.blender.org", "127.0.0.1"),
    url.replace("download.blender.org", "download.blender.org.evil.invalid"),
    url.replace("/peach/", "/other/"),
  ]) {
    assert.throws(() => approvedMediaUrl(unsafe), { code: "UNSAFE_SOURCE" });
  }
});
test("download streams into a private owned file, hashes exact bytes and cleans idempotently", async () => {
  const before = await ownedDirectories();
  let progress = 0;
  const downloaded = await downloadMediaSource(source, signal(), {
    network: network(),
    onProgress: () => {
      progress++;
    },
  });
  try {
    assert.deepEqual(await readFile(downloaded.path), content);
    assert.equal((await stat(downloaded.path)).mode & 0o777, 0o600);
    assert.equal(downloaded.original.sha256, createHash("sha256").update(content).digest("hex"));
    assert.equal(downloaded.original.bytes, content.length);
    assert.ok(downloaded.elapsedMs >= 0 && downloaded.peakMemory.rss > 0);
    assert.equal(progress, 1);
  } finally {
    await downloaded.cleanup();
    await downloaded.cleanup();
  }
  assert.deepEqual(await ownedDirectories(), before);
});
test("changed, redirected, encoded, oversized and corrupted sources retain no file", async () => {
  const before = await ownedDirectories();
  const cases: Array<[Partial<MediaSourceResponse>, string]> = [
    [{ status: 302 }, "SOURCE_REJECTED"],
    [{ status: 412 }, "SOURCE_CHANGED"],
    [
      {
        headers: {
          etag: '"changed"',
          "content-length": String(content.length),
          "content-type": "application/zip",
        },
      },
      "SOURCE_CHANGED",
    ],
    [
      {
        headers: {
          etag: source.etag,
          "content-length": String(content.length),
          "content-type": "application/zip",
          "content-encoding": "gzip",
        },
      },
      "SOURCE_REJECTED",
    ],
    [{ body: Readable.from([Buffer.concat([content, Buffer.alloc(1)])]) }, "SOURCE_TOO_LARGE"],
    [{ body: Readable.from([content.subarray(0, 100)]) }, "SOURCE_CHANGED"],
    [{ body: Readable.from([Buffer.alloc(content.length)]) }, "SOURCE_REJECTED"],
  ];
  for (const [patch, code] of cases) {
    const transport = network(patch);
    await assert.rejects(downloadMediaSource(source, signal(), { network: transport }), { code });
    if (patch.body) {
      assert.equal(patch.body.destroyed, true);
    }
  }
  await assert.rejects(
    downloadMediaSource({ ...source, sha256: "0".repeat(64) }, signal(), { network: network() }),
    { code: "CHECKSUM_MISMATCH" },
  );
  assert.deepEqual(await ownedDirectories(), before);
});
test("stalls and cancellation destroy streams and release only owned temporary files", async () => {
  const before = await ownedDirectories();
  const stalled = new Readable({ read() {} });
  await assert.rejects(
    downloadMediaSource(source, signal(), { network: network({ body: stalled }), deadlineMs: 20 }),
    { code: "SOURCE_TIMEOUT" },
  );
  assert.equal(stalled.destroyed, true);
  const controller = new AbortController();
  const body = new Readable({
    read() {
      controller.abort();
    },
  });
  await assert.rejects(
    downloadMediaSource(source, controller.signal, { network: network({ body }) }),
    { code: "CANCELLED" },
  );
  assert.equal(body.destroyed, true);
  await assert.rejects(
    downloadMediaSource(source, signal(), {
      network: { open: () => Promise.reject(new Error("Untrusted upstream detail")) },
    }),
    (error: unknown) =>
      error instanceof MediaAcquisitionError &&
      error.code === "NETWORK_FAILURE" &&
      !error.message.includes("Untrusted"),
  );
  assert.deepEqual(await ownedDirectories(), before);
});
