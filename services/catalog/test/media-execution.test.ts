import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import test from "node:test";
import type { createCatalogAcquisitions } from "../src/application/acquire-media.js";
import { normalizeAcquisitionAttempt } from "../src/domain/media-acquisition.js";
import { normalizeMediaRequest } from "../src/domain/media-request.js";
import { downloadMediaSource } from "../src/infrastructure/media/download-source.js";
import { runMediaAcquisition } from "../src/infrastructure/media/run-acquisition.js";
import { catalogTestId as id, catalogTestTime as now } from "./rights-fixture.js";

function fixture(knownChecksum = false, reuseApproved = knownChecksum) {
  const bytes = Buffer.from([0x50, 0x4b, 3, 4, 20, 0, 0, 0, 1, 2, 3, 4]);
  const media = normalizeMediaRequest({
    input: {
      requestId: id(8),
      titleId: id(1),
      expectedVersion: 3,
      rightsRevision: 2,
      recipeVersion: "hls-avc-aac-v1",
      source: {
        url: "https://download.blender.org/peach/bigbuckbunny_movies/fixture.zip",
        bytes: bytes.length,
        etag: '"fixture"',
        sha256: knownChecksum ? createHash("sha256").update(bytes).digest("hex") : null,
        container: "zip",
      },
    },
    actorId: id(3),
    correlationId: id(4),
    requestedAt: now,
    sourceFingerprint: "a".repeat(64),
  });
  const attempt = normalizeAcquisitionAttempt({
    id: id(9),
    requestId: id(8),
    actorId: id(3),
    correlationId: id(4),
    number: 1,
    startedAt: now,
    expiresAt: now + 480,
    finishedAt: null,
    status: "RUNNING",
    original: null,
    failure: null,
  });
  assert.ok(media && attempt);
  let checks = 0;
  let revoked = false;
  let completed = 0;
  let failure: unknown;
  let path: string | undefined;
  const acquisitions: ReturnType<typeof createCatalogAcquisitions> = {
    original: () => Promise.resolve({ status: "not_found" }),
    claim: () => Promise.resolve({ status: "completed", value: attempt }),
    check: () => {
      checks++;
      return Promise.resolve(
        revoked
          ? { status: "rights_not_approved" }
          : { status: "completed", value: { media, reuseApproved } },
      );
    },
    complete: () => {
      completed++;
      return Promise.resolve({ status: "completed", value: attempt });
    },
    fail: (_id, code) => {
      failure = code;
      return Promise.resolve({ status: "completed", value: attempt });
    },
  };
  const download: typeof downloadMediaSource = async (source, signal) => {
    const result = await downloadMediaSource(source, signal, {
      network: {
        open: () =>
          Promise.resolve({
            status: 200,
            headers: {
              "content-type": "application/zip",
              "content-length": String(bytes.length),
              etag: '"fixture"',
            },
            body: Readable.from([bytes]),
          }),
      },
    });
    path = result.path;
    return result;
  };
  return {
    bytes,
    acquisitions,
    download,
    request: { credential: {}, signal: new AbortController().signal, correlationId: id(4) },
    checks: () => checks,
    completed: () => completed,
    failure: () => failure,
    path: () => path,
    revoke: () => {
      revoked = true;
    },
  };
}

test("executor verifies retained conflict bytes before completion and cleans its file", async () => {
  const f = fixture();
  let writes = 0;
  const result = await runMediaAcquisition(id(8), f.request, {
    acquisitions: f.acquisitions,
    download: f.download,
    prepareStorage: () => Promise.resolve(),
    storage: {
      async write(input) {
        writes++;
        assert.equal(input.ifAbsent, true);
        for await (const chunk of input.source) {
          assert.ok(Buffer.isBuffer(chunk));
        }
        return { status: "already_exists" };
      },
      async read(input) {
        await pipeline(Readable.from([f.bytes]), input.destination);
        return { status: "completed" };
      },
    },
  });
  assert.equal(result.status, "completed");
  assert.equal(f.completed(), 1);
  assert.equal(writes, 1);
  assert.equal(f.checks(), 3);
  const path = f.path();
  assert.ok(path);
  await assert.rejects(access(path));
});
test("executor rejects mismatching retained bytes without completing or deleting originals", async () => {
  const f = fixture();
  const result = await runMediaAcquisition(id(8), f.request, {
    acquisitions: f.acquisitions,
    download: f.download,
    prepareStorage: () => Promise.resolve(),
    storage: {
      async write(input) {
        for await (const chunk of input.source) {
          assert.ok(Buffer.isBuffer(chunk));
        }
        return { status: "already_exists" };
      },
      async read(input) {
        await pipeline(Readable.from([Buffer.alloc(f.bytes.length)]), input.destination);
        return { status: "completed" };
      },
    },
  });
  assert.equal(result.status, "failed");
  assert.equal(f.failure(), "STORAGE_FAILURE");
  assert.equal(f.completed(), 0);
  const path = f.path();
  assert.ok(path);
  await assert.rejects(access(path));
});
test("periodic rights revocation cancels a pending download and retains failure audit", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  let cancelled = false;
  const pending = runMediaAcquisition(id(8), f.request, {
    acquisitions: f.acquisitions,
    prepareStorage: () => Promise.resolve(),
    download: (_source, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            cancelled = true;
            reject(new Error("Cancelled download"));
          },
          { once: true },
        );
        started();
      }),
    storage: {
      write: () => {
        throw new Error("Must not upload");
      },
      read: () => {
        throw new Error("Must not read");
      },
    },
  });
  await ready;
  f.revoke();
  context.mock.timers.tick(5000);
  const result = await pending;
  assert.equal(result.status, "failed");
  assert.equal(cancelled, true);
  assert.equal(f.failure(), "RIGHTS_REVOKED");
  assert.equal(f.completed(), 0);
});

test("current approved checksum reuses original without download, upload or temporary file", async () => {
  const f = fixture(true);
  const result = await runMediaAcquisition(id(8), f.request, {
    acquisitions: f.acquisitions,
    prepareStorage: () => Promise.resolve(),
    download: () => {
      throw new Error("Reuse must not download");
    },
    storage: {
      write: () => {
        throw new Error("Reuse must not write");
      },
      async read(input, signal) {
        assert.equal(
          input.key,
          "originals/sha256/" + createHash("sha256").update(f.bytes).digest("hex"),
        );
        await pipeline(
          Readable.from([f.bytes.subarray(0, 3), f.bytes.subarray(3)]),
          input.destination,
          { signal },
        );
        return { status: "completed" };
      },
    },
  });
  assert.equal(result.status, "completed");
  assert.ok("evidence" in result);
  assert.deepEqual(result.evidence, { reused: true });
  assert.equal(f.completed(), 1);
  assert.equal(f.checks(), 3);
  assert.equal(f.path(), undefined);
});

test("reuse detects rights revoked during the read and never completes", async () => {
  const f = fixture(true);
  const result = await runMediaAcquisition(id(8), f.request, {
    acquisitions: f.acquisitions,
    prepareStorage: () => Promise.resolve(),
    download: () => {
      throw new Error("Must not download");
    },
    storage: {
      write: () => {
        throw new Error("Must not write");
      },
      async read(input) {
        await pipeline(Readable.from([f.bytes]), input.destination);
        f.revoke();
        return { status: "completed" };
      },
    },
  });
  assert.equal(result.status, "failed");
  assert.equal(f.failure(), "RIGHTS_REVOKED");
  assert.equal(f.completed(), 0);
});

test("missing checksum-addressed original follows the normal verified download path", async () => {
  const f = fixture(true);
  let reads = 0;
  let writes = 0;
  const result = await runMediaAcquisition(id(8), f.request, {
    acquisitions: f.acquisitions,
    prepareStorage: () => Promise.resolve(),
    download: f.download,
    storage: {
      async write(input) {
        writes++;
        for await (const chunk of input.source) {
          assert.ok(Buffer.isBuffer(chunk));
        }
        return { status: "completed" };
      },
      async read(input) {
        if (reads++ === 0) {
          return { status: "not_found" };
        }
        await pipeline(Readable.from([f.bytes]), input.destination);
        return { status: "completed" };
      },
    },
  });
  assert.equal(result.status, "completed");
  assert.ok("evidence" in result);
  assert.equal(result.evidence.reused, false);
  assert.equal(writes, 1);
  assert.equal(reads, 2);
  const path = f.path();
  assert.ok(path);
  await assert.rejects(access(path));
});

test("corrupt reuse is audited without fallback download or overwrite", async () => {
  const f = fixture(true);
  const result = await runMediaAcquisition(id(8), f.request, {
    acquisitions: f.acquisitions,
    prepareStorage: () => Promise.resolve(),
    download: () => {
      throw new Error("Must not download");
    },
    storage: {
      write: () => {
        throw new Error("Must not overwrite");
      },
      async read(input) {
        await pipeline(Readable.from([Buffer.alloc(f.bytes.length)]), input.destination);
        return { status: "completed" };
      },
    },
  });
  assert.equal(result.status, "failed");
  assert.equal(f.failure(), "STORAGE_FAILURE");
  assert.equal(f.completed(), 0);
});

test("request checksum alone cannot authorize reuse of a different retained source", async () => {
  const f = fixture(true, false);
  let downloaded = false;
  let reads = 0;
  const result = await runMediaAcquisition(id(8), f.request, {
    acquisitions: f.acquisitions,
    prepareStorage: () => Promise.resolve(),
    async download(source, signal, options) {
      downloaded = true;
      return f.download(source, signal, options);
    },
    storage: {
      async write(input) {
        assert.equal(downloaded, true);
        for await (const chunk of input.source) {
          assert.ok(Buffer.isBuffer(chunk));
        }
        return { status: "completed" };
      },
      async read(input) {
        assert.equal(
          downloaded,
          true,
          "Unapproved checksum must not look up storage before source GET",
        );
        reads++;
        await pipeline(Readable.from([f.bytes]), input.destination);
        return { status: "completed" };
      },
    },
  });
  assert.equal(result.status, "completed");
  assert.equal(reads, 1);
  assert.ok("evidence" in result);
  assert.equal(result.evidence.reused, false);
});
