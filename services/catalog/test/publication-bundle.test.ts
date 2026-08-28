import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { AsterObjectStorageAdapter } from "@aster/object-storage-s3";
import {
  createPublicationBundle,
  validatePublicationPlaylists,
} from "../src/infrastructure/media/publication-bundle.js";
import { copyPublication } from "../src/infrastructure/media/copy-publication.js";
import { grantPublicationAccess } from "../src/infrastructure/media/publication-access.js";
import { publicationBundleFixture } from "./publication-fixture.js";

function store(objects: Map<string, Buffer>) {
  const writes: string[] = [];
  const adapter: Pick<AsterObjectStorageAdapter, "read" | "write"> = {
    async read(input, signal) {
      const bytes = objects.get(input.key);
      if (!bytes) {
        return { status: "not_found" };
      }
      await pipeline(Readable.from([bytes]), input.destination, { ...(signal ? { signal } : {}) });
      return { status: "completed" };
    },
    async write(input, signal) {
      assert.equal(input.ifAbsent, true);
      assert.equal(input.cacheControl, "public, max-age=31536000, immutable");
      assert.equal(
        input.contentType,
        input.key.endsWith(".m3u8")
          ? "application/vnd.apple.mpegurl"
          : input.key.endsWith(".ts")
            ? "video/mp2t"
            : input.key.endsWith(".jpg")
              ? "image/jpeg"
              : "application/json",
      );
      const chunks: Buffer[] = [];
      for await (const chunk of input.source) {
        signal?.throwIfAborted();
        assert.ok(Buffer.isBuffer(chunk));
        chunks.push(chunk);
      }
      if (objects.has(input.key)) {
        return { status: "already_exists" };
      }
      writes.push(input.key);
      objects.set(input.key, Buffer.concat(chunks));
      return { status: "completed" };
    },
  };
  return { adapter, writes, objects };
}
const approved = () => Promise.resolve();

test("public READ waits for complete integrity verification and retries an interrupted grant", async () => {
  const f = publicationBundleFixture();
  const published = store(new Map());
  await copyPublication(
    f.bundle,
    store(f.objects).adapter,
    published.adapter,
    approved,
    AbortSignal.timeout(3000),
  );
  let reads = 0;
  const read = published.adapter.read;
  published.adapter.read = (input, signal) => {
    reads++;
    return read(input, signal);
  };
  const grants = new Set<string>();
  let interrupt = true;
  const access = {
    reveal: <T>(
      prefix: string,
      signal: AbortSignal,
      confirm: (signal: AbortSignal) => Promise<T>,
    ) => {
      assert.ok(reads >= published.objects.size);
      assert.equal(prefix, f.bundle.prefix);
      if (interrupt) {
        return Promise.reject(new Error("interrupted grant"));
      }
      grants.add(prefix);
      return confirm(signal);
    },
  };
  await assert.rejects(
    grantPublicationAccess(
      f.bundle,
      published.adapter,
      access,
      approved,
      AbortSignal.timeout(3000),
      approved,
    ),
  );
  assert.equal(grants.size, 0);
  interrupt = false;
  reads = 0;
  await grantPublicationAccess(
    f.bundle,
    published.adapter,
    access,
    approved,
    AbortSignal.timeout(3000),
    approved,
  );
  assert.equal(grants.size, 1);
  await grantPublicationAccess(
    f.bundle,
    published.adapter,
    access,
    approved,
    AbortSignal.timeout(3000),
    approved,
  );
  assert.equal(grants.size, 1);
});

test("missing, corrupt, cancelled or revoked bundles gain no public access", async () => {
  for (const failure of ["missing", "corrupt", "cancelled", "revoked"] as const) {
    const f = publicationBundleFixture();
    const published = store(new Map());
    await copyPublication(
      f.bundle,
      store(f.objects).adapter,
      published.adapter,
      approved,
      AbortSignal.timeout(3000),
    );
    const master = f.bundle.prefix + "master.m3u8";
    if (failure === "missing") {
      published.objects.delete(master);
    }
    if (failure === "corrupt") {
      published.objects.set(master, Buffer.from("corrupt"));
    }
    let grants = 0;
    let checks = 0;
    const access = {
      reveal: <T>(
        _prefix: string,
        signal: AbortSignal,
        confirm: (signal: AbortSignal) => Promise<T>,
      ) => {
        grants++;
        return confirm(signal);
      },
    };
    await assert.rejects(
      grantPublicationAccess(
        f.bundle,
        published.adapter,
        access,
        () => {
          if (++checks > published.objects.size && failure === "revoked") {
            return Promise.reject(new Error("revoked"));
          }
          return approved();
        },
        failure === "cancelled" ? AbortSignal.abort() : AbortSignal.timeout(3000),
        approved,
      ),
    );
    assert.equal(grants, 0, failure);
  }
});

test("bundle is stable through review, but binds source, reports and both modification notices", () => {
  const f = publicationBundleFixture();
  const rebuild = (rights = f.rights, metadata = f.metadata, hls = f.hlsBytes) =>
    createPublicationBundle(f.identity, hls, f.artworkBytes, rights, metadata);
  assert.equal(
    rebuild({ ...f.rights, reviewedAt: (f.rights.reviewedAt ?? 0) + 1, revision: 4 }).bundleHash,
    f.bundle.bundleHash,
  );
  assert.notEqual(
    rebuild({ ...f.rights, modificationNotice: "Other transform" }).bundleHash,
    f.bundle.bundleHash,
  );
  assert.notEqual(
    rebuild(f.rights, {
      ...f.metadata,
      artwork: {
        ...f.metadata.artwork,
        rights: { ...f.metadata.artwork.rights, modificationNotice: "Other crop" },
      },
    }).bundleHash,
    f.bundle.bundleHash,
  );
  assert.throws(() => rebuild({ ...f.rights, sourceChecksum: "b".repeat(64) }));
  assert.throws(() => rebuild(f.rights, { ...f.metadata, runtimeSeconds: 12 }));
  assert.throws(() => rebuild(f.rights, { ...f.metadata, accessibility: ["CAPTIONS"] }));
});
test("playlist verification rejects external URIs, encryption, missing and unreferenced objects", () => {
  const f = publicationBundleFixture();
  const playlists = new Map(
    [...f.hlsFiles]
      .filter(([key]) => key.endsWith(".m3u8"))
      .map(([key, bytes]) => [key, bytes.toString()]),
  );
  validatePublicationPlaylists(f.bundle, playlists);
  for (const replacement of [
    "https://example.invalid/segment.ts",
    "../v240-0000.ts",
    "#EXT-X-KEY:METHOD=AES-128",
  ]) {
    assert.throws(() => {
      validatePublicationPlaylists(
        f.bundle,
        new Map(
          [...playlists].map(([key, text]) => [key, text.replace("v240-0000.ts", replacement)]),
        ),
      );
    });
  }
  assert.throws(() => {
    validatePublicationPlaylists(
      { ...f.bundle, hls: { ...f.bundle.hls, files: f.bundle.hls.files.slice(1) } },
      playlists,
    );
  });
});
test("copy verifies children before master, preserves attribution, and repeats without new writes", async () => {
  const f = publicationBundleFixture();
  const privateStore = store(f.objects);
  const published = store(new Map());
  let checks = 0;
  const current = () => {
    checks++;
    return Promise.resolve();
  };
  const result = await copyPublication(
    f.bundle,
    privateStore.adapter,
    published.adapter,
    current,
    AbortSignal.timeout(3000),
  );
  assert.equal(result.files, 9);
  assert.equal(published.writes.at(-1), f.bundle.prefix + "master.m3u8");
  assert.deepEqual(
    published.objects.get(f.bundle.prefix + "attribution.json"),
    f.bundle.attribution,
  );
  assert.ok(checks > result.files);
  await copyPublication(
    f.bundle,
    privateStore.adapter,
    published.adapter,
    current,
    AbortSignal.timeout(3000),
  );
  assert.equal(published.writes.length, 9);
});
test("missing, corrupted and failed reads never copy master and clean only the owned temporary output", async () => {
  const before = (await readdir(tmpdir())).filter((name) => name.startsWith("aster-publication-"));
  for (const failure of ["missing", "corrupt", "throw"] as const) {
    const f = publicationBundleFixture();
    const key = f.bundle.hls.prefix + "v240-0000.ts";
    if (failure === "missing") {
      f.objects.delete(key);
    }
    if (failure === "corrupt") {
      f.objects.set(key, Buffer.from("corrupt"));
    }
    const input = store(f.objects);
    const published = store(new Map());
    const read = input.adapter.read;
    if (failure === "throw") {
      input.adapter.read = (input, signal) =>
        input.key === key ? Promise.reject(new Error("lost connection")) : read(input, signal);
    }
    await assert.rejects(
      copyPublication(
        f.bundle,
        input.adapter,
        published.adapter,
        approved,
        AbortSignal.timeout(1000),
      ),
    );
    assert.equal(published.objects.has(f.bundle.prefix + "master.m3u8"), false);
  }
  assert.deepEqual(
    (await readdir(tmpdir())).filter((name) => name.startsWith("aster-publication-")),
    before,
  );
});
test("revocation and cancellation stop before further upload; partial prefix replays without overwrites", async () => {
  const f = publicationBundleFixture();
  const published = store(new Map());
  let checks = 0;
  await assert.rejects(
    copyPublication(
      f.bundle,
      store(f.objects).adapter,
      published.adapter,
      () => {
        if (++checks === 5) {
          return Promise.reject(new Error("rights revoked"));
        }
        return approved();
      },
      AbortSignal.timeout(3000),
    ),
  );
  assert.equal(published.objects.has(f.bundle.prefix + "master.m3u8"), false);
  const prior = [...published.objects];
  await copyPublication(
    f.bundle,
    store(f.objects).adapter,
    published.adapter,
    approved,
    AbortSignal.timeout(3000),
  );
  for (const [key, value] of prior) {
    assert.strictEqual(published.objects.get(key), value);
  }
  await assert.rejects(
    copyPublication(
      f.bundle,
      store(f.objects).adapter,
      published.adapter,
      approved,
      AbortSignal.abort(),
    ),
  );
});
test("existing public bytes are never trusted or overwritten on an immutable-key conflict", async () => {
  const f = publicationBundleFixture();
  const key = f.bundle.prefix + "v240-0000.ts";
  const published = store(new Map([[key, Buffer.from("wrong")]]));
  await assert.rejects(
    copyPublication(
      f.bundle,
      store(f.objects).adapter,
      published.adapter,
      approved,
      AbortSignal.timeout(3000),
    ),
  );
  assert.equal(published.objects.get(key)?.toString(), "wrong");
  assert.equal(published.objects.has(f.bundle.prefix + "master.m3u8"), false);
});
