import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import test from "node:test";
import { reuseOriginal } from "../src/infrastructure/media/reuse-original.js";

const zip = Buffer.from([0x50, 0x4b, 3, 4, 20, 0, 0, 0, 1, 2, 3, 4]);
const source = (bytes = zip, container = "zip") => ({
  url: "https://download.blender.org/peach/bigbuckbunny_movies/fixture.zip",
  bytes: bytes.length,
  etag: '"fixture"',
  sha256: createHash("sha256").update(bytes).digest("hex"),
  container,
});
const signal = () => new AbortController().signal;

test("original reuse accepts exact ZIP and MP4 streams and only explicit absence", async () => {
  for (const [bytes, container] of [
    [zip, "zip"],
    [Buffer.from("0000ftyp0000"), "mp4"],
  ] as const) {
    const input = source(bytes, container);
    const result = await reuseOriginal(
      input,
      {
        async read({ destination }, active) {
          await pipeline(
            Readable.from([...bytes].map((value) => Buffer.from([value]))),
            destination,
            { signal: active },
          );
          return { status: "completed" };
        },
      },
      signal(),
    );
    assert.deepEqual(result, {
      sha256: input.sha256,
      bytes: bytes.length,
      key: "originals/sha256/" + input.sha256,
    });
  }
  assert.equal(
    await reuseOriginal(
      source(),
      { read: () => Promise.resolve({ status: "not_found" }) },
      signal(),
    ),
    undefined,
  );
  assert.equal(
    await reuseOriginal(
      { ...source(), sha256: null },
      {
        read: () => {
          throw new Error("No checksum lookup");
        },
      },
      signal(),
    ),
    undefined,
  );
});

test("short, long, changed, malformed and interrupted originals fail closed", async () => {
  for (const bytes of [
    zip.subarray(0, 7),
    Buffer.concat([zip, zip]),
    Buffer.alloc(zip.length),
    Buffer.from([...zip.subarray(0, 11), 5]),
  ]) {
    await assert.rejects(
      reuseOriginal(
        source(),
        {
          async read({ destination }, active) {
            await pipeline(Readable.from([bytes]), destination, { signal: active });
            return { status: "completed" };
          },
        },
        signal(),
      ),
      { code: "STORAGE_FAILURE" },
    );
  }
  for (const status of ["failed", "unavailable", "timed_out", "aborted"] as const) {
    await assert.rejects(
      reuseOriginal(source(), { read: () => Promise.resolve({ status }) }, signal()),
      { code: "STORAGE_FAILURE" },
    );
  }
  await assert.rejects(
    reuseOriginal(
      source(Buffer.alloc(12)),
      {
        async read({ destination }) {
          await pipeline(Readable.from([Buffer.alloc(12)]), destination);
          return { status: "completed" };
        },
      },
      signal(),
    ),
    { code: "STORAGE_FAILURE" },
  );
  await assert.rejects(
    reuseOriginal(
      source(),
      {
        async read({ destination }) {
          await pipeline(Readable.from([zip.subarray(0, 1)]), destination);
          return { status: "not_found" };
        },
      },
      signal(),
    ),
    { code: "STORAGE_FAILURE" },
  );
});

test("reuse propagates cancellation to a stalled storage read and rejects unsafe identity", async () => {
  const controller = new AbortController();
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const body = new Readable({ read() {} });
  const pending = reuseOriginal(
    source(),
    {
      async read({ destination }, active) {
        started();
        await pipeline(body, destination, { signal: active });
        return { status: "completed" };
      },
    },
    controller.signal,
  );
  await ready;
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(body.destroyed, true);
  for (const input of [
    { ...source(), bytes: 0 },
    { ...source(), sha256: "x" },
    { ...source(), url: "https://127.0.0.1/file" },
  ]) {
    await assert.rejects(
      reuseOriginal(
        input,
        {
          read: () => {
            throw new Error("Must not read");
          },
        },
        signal(),
      ),
    );
  }
});
