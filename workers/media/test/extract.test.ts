import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rmdir, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { extractOriginal } from "../src/infrastructure/extract.js";
import { zipFixture } from "./zip-fixture.js";

const media = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from("ftypisom"),
  Buffer.from("bounded-test-payload"),
]);
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
async function fixture(body: Buffer, work: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "aster-extract-"));
  await writeFile(join(root, "original"), body, { flag: "wx" });
  try {
    await work(root);
  } finally {
    for (const name of await readdir(root)) {
      assert.ok(["original", "source.mp4", "link"].includes(name));
      await unlink(join(root, name));
    }
    await rmdir(root);
  }
}
for (const method of [0, 8]) {
  test(
    "extracts one MP4 with size, CRC and separate SHA-256; method " + String(method),
    async () => {
      const archive = zipFixture([{ name: "film/source.m4v", body: media, method }]);
      await fixture(archive, async (root) => {
        const result = await extractOriginal(
          join(root, "original"),
          join(root, "source.mp4"),
          { sha256: hash(archive), bytes: archive.length, container: "zip" },
          AbortSignal.timeout(2000),
        );
        assert.deepEqual(result, {
          bytes: media.length,
          sha256: hash(media),
          archiveEntry: "film/source.m4v",
        });
        assert.deepEqual(await readFile(join(root, "source.mp4")), media);
      });
    },
  );
}
const invalid = [
  { name: "../escape.mp4", body: media },
  { name: "/escape.mp4", body: media },
  { name: "C:\\escape.mp4", body: media },
  { name: "source.mp4", body: media, mode: 0xa1ff },
  { name: "source.mp4", body: media, flags: 1 },
  { name: "source.mp4", body: media, method: 12 },
  { name: "source.mp4", body: media, size: 300 * 1024 * 1024 },
  { name: "source.mp4", body: media, size: media.length + 1 },
  { name: "source.mp4", body: media, crc: 0 },
  { name: "source.mp4", body: Buffer.from("this is not a media file") },
  { name: "source.mp4", body: Buffer.alloc(1024 * 1024), method: 8 },
  { name: "payload.exe", body: media },
];
for (const [index, entry] of invalid.entries()) {
  test("rejects unsafe/archive payload " + String(index) + " without retained output", async () => {
    const archive = zipFixture([entry]);
    await fixture(archive, async (root) => {
      await assert.rejects(
        extractOriginal(
          join(root, "original"),
          join(root, "source.mp4"),
          { sha256: hash(archive), bytes: archive.length, container: "zip" },
          AbortSignal.timeout(2000),
        ),
      );
      assert.deepEqual(await readdir(root), ["original"]);
    });
  });
}
for (const count of [0, 2, 33]) {
  test("rejects ambiguous or excessive archive count " + String(count), async () => {
    const archive = zipFixture(
      Array.from({ length: count }, (_, i) => ({ name: "film" + String(i) + ".mp4", body: media })),
    );
    await fixture(archive, async (root) => {
      await assert.rejects(
        extractOriginal(
          join(root, "original"),
          join(root, "source.mp4"),
          { sha256: hash(archive), bytes: archive.length, container: "zip" },
          AbortSignal.timeout(2000),
        ),
      );
      assert.deepEqual(await readdir(root), ["original"]);
    });
  });
}
test("rejects checksum mismatch, symlink, cancellation and overwrite; supports direct MP4", async () => {
  await fixture(media, async (root) => {
    const identity = { sha256: hash(media), bytes: media.length, container: "mp4" };
    const source = join(root, "original");
    const target = join(root, "source.mp4");
    await assert.rejects(
      extractOriginal(
        source,
        target,
        { ...identity, sha256: "0".repeat(64) },
        AbortSignal.timeout(2000),
      ),
    );
    await assert.rejects(extractOriginal(source, target, identity, AbortSignal.abort()));
    await symlink(source, join(root, "link"));
    await assert.rejects(
      extractOriginal(join(root, "link"), target, identity, AbortSignal.timeout(2000)),
    );
    await extractOriginal(source, target, identity, AbortSignal.timeout(2000));
    await assert.rejects(extractOriginal(source, target, identity, AbortSignal.timeout(2000)));
    assert.deepEqual(await readFile(target), media);
  });
});
