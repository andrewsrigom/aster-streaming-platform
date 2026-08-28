import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, rmdir, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import test from "node:test";
import type { AsterObjectStorageAdapter } from "@aster/object-storage-s3";
import type { createCatalogAcquisitions } from "../src/application/acquire-media.js";
import { normalizeMediaRequest } from "../src/domain/media-request.js";
import { prepareDecoder } from "../src/infrastructure/media/prepare-decoder.js";
import { retainDecoderCandidate } from "../src/infrastructure/media/retain-candidate.js";
import { catalogTestId as id, catalogTestTime as now } from "./rights-fixture.js";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
async function fixture(work: (f: Awaited<ReturnType<typeof setup>>) => Promise<void>) {
  const f = await setup();
  try {
    await work(f);
  } finally {
    for (const name of await readdir(f.root)) {
      assert.ok(["candidate", "job"].includes(name));
      const directory = join(f.root, name);
      for (const file of await readdir(directory)) {
        await unlink(join(directory, file));
      }
      await rmdir(directory);
    }
    await rmdir(f.root);
  }
}
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "aster-decoder-handoff-"));
  const body = Buffer.from("opaque original source");
  const media = normalizeMediaRequest({
    input: {
      requestId: id(8),
      titleId: id(1),
      expectedVersion: 3,
      rightsRevision: 2,
      recipeVersion: "hls-avc-aac-v1",
      source: {
        url: "https://example.invalid/source.zip",
        bytes: body.length,
        etag: '"fixture"',
        sha256: null,
        container: "zip",
      },
    },
    actorId: id(3),
    correlationId: id(4),
    requestedAt: now,
    sourceFingerprint: "a".repeat(64),
  });
  assert.ok(media);
  const original = {
    key: "originals/sha256/" + hash(body),
    sha256: hash(body),
    bytes: body.length,
  };
  const objects = new Map([[original.key, body]]);
  let revoked = false;
  let checks = 0;
  let writes = 0;
  let failWrite = 0;
  const acquisitions: Pick<ReturnType<typeof createCatalogAcquisitions>, "original"> = {
    original: () => {
      checks++;
      return Promise.resolve(
        revoked
          ? { status: "rights_not_approved" }
          : { status: "completed", value: { media, original } },
      );
    },
  };
  const storage: Pick<AsterObjectStorageAdapter, "read" | "write"> = {
    read: async (input, signal) => {
      const stored = objects.get(input.key);
      if (!stored) {
        return { status: "not_found" };
      }
      await pipeline(Readable.from([stored]), input.destination, { signal });
      return { status: "completed" };
    },
    write: async (input) => {
      writes++;
      const chunks: Buffer[] = [];
      for await (const chunk of input.source) {
        assert.ok(chunk instanceof Buffer);
        chunks.push(chunk);
      }
      if (writes === failWrite) {
        return { status: "failed" };
      }
      const bytes = Buffer.concat(chunks);
      assert.equal(input.ifAbsent, true);
      assert.equal(bytes.length, input.contentLength);
      assert.equal(hash(bytes), input.checksumSha256);
      if (objects.has(input.key)) {
        return { status: "already_exists" };
      }
      objects.set(input.key, bytes);
      return { status: "completed" };
    },
  };
  const directory = join(root, "candidate");
  await mkdir(directory);
  const files = ["v240-0000.ts", "v240.m3u8", "master.m3u8"].map((name) => ({
    name,
    bytes: body.length,
    sha256: hash(body),
  }));
  for (const file of files) {
    await writeFile(join(directory, file.name), body, { flag: "wx" });
  }
  const report: Record<string, unknown> = {
    event: "media_candidate_validated",
    publicationAuthority: false,
    recipe: "hls-avc-aac-v1",
    identity: { sha256: hash(body), bytes: body.length, container: "zip" },
    processingKey: hash(hash(body) + "\0hls-avc-aac-v1"),
    manifestHash: hash(JSON.stringify(files)),
    files,
  };
  const saveReport = () => writeFile(join(directory, "report.json"), JSON.stringify(report));
  await saveReport();
  return {
    root,
    directory,
    body,
    objects,
    original,
    report,
    saveReport,
    acquisitions,
    storage,
    request: { credential: {}, correlationId: id(4), signal: AbortSignal.timeout(5000) },
    revoke: () => {
      revoked = true;
    },
    checks: () => checks,
    writes: () => writes,
    failAt: (value: number) => {
      failWrite = value;
    },
  };
}
test("prepares verified original and retains an immutable private candidate with report last", async () => {
  await fixture(async (f) => {
    const ready = await prepareDecoder(id(9), f.root, f.request, f.acquisitions, f.storage);
    assert.equal(ready.status, "completed");
    assert.equal(f.checks(), 2);
    assert.equal(f.writes(), 0);
    const stored = await retainDecoderCandidate(
      id(9),
      f.directory,
      f.request,
      f.acquisitions,
      f.storage,
    );
    assert.equal(stored.value.publicationAuthority, false);
    assert.equal(stored.value.files, 3);
    assert.equal([...f.objects.keys()].at(-1), stored.value.prefix + "report.json");
    assert.deepEqual(
      await retainDecoderCandidate(id(9), f.directory, f.request, f.acquisitions, f.storage),
      stored,
    );
    assert.equal(f.objects.size, 5);
    await assert.rejects(prepareDecoder(id(9), f.root, f.request, f.acquisitions, f.storage));
    assert.deepEqual(await readdir(join(f.root, "job")), ["identity.json", "original"]);
  });
});
test("refuses revoked authority before filesystem/storage side effects", async () => {
  await fixture(async (f) => {
    f.revoke();
    assert.equal(
      (await prepareDecoder(id(9), f.root, f.request, f.acquisitions, f.storage)).status,
      "rights_not_approved",
    );
    await assert.rejects(
      retainDecoderCandidate(id(9), f.directory, f.request, f.acquisitions, f.storage),
    );
    assert.equal(f.writes(), 0);
    assert.deepEqual(await readdir(f.root), ["candidate"]);
  });
});
test("cleans failed original handoff and never commits a report after partial upload", async () => {
  await fixture(async (f) => {
    f.objects.set(f.original.key, Buffer.alloc(f.original.bytes));
    await assert.rejects(prepareDecoder(id(9), f.root, f.request, f.acquisitions, f.storage));
    assert.deepEqual(await readdir(f.root), ["candidate"]);
    f.failAt(2);
    await assert.rejects(
      retainDecoderCandidate(id(9), f.directory, f.request, f.acquisitions, f.storage),
    );
    assert.equal(
      [...f.objects.keys()].some((key) => key.endsWith("/report.json")),
      false,
    );
  });
});
for (const field of [
  "processingKey",
  "manifestHash",
  "identity",
  "files",
  "publicationAuthority",
]) {
  test("rejects tampered candidate " + field, async () => {
    await fixture(async (f) => {
      f.report[field] =
        field === "files" ? [{ name: "../escape", bytes: 1, sha256: "a".repeat(64) }] : null;
      await f.saveReport();
      await assert.rejects(
        retainDecoderCandidate(id(9), f.directory, f.request, f.acquisitions, f.storage),
      );
      assert.equal(f.writes(), 0);
    });
  });
}
test("refuses symlinked candidate payload", async () => {
  await fixture(async (f) => {
    const file = join(f.directory, "v240-0000.ts");
    await unlink(file);
    await symlink(join(f.directory, "master.m3u8"), file);
    await assert.rejects(
      retainDecoderCandidate(id(9), f.directory, f.request, f.acquisitions, f.storage),
    );
    assert.equal(f.writes(), 0);
  });
});
