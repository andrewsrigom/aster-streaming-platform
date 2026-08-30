import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, rmdir, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import test from "node:test";
import type { AsterObjectStorageAdapter } from "@aster/object-storage-s3";
import { ASTER_METRIC_CATALOG, createAsterTelemetry } from "@aster/telemetry";
import type { createCatalogAcquisitions } from "../src/application/acquire-media.js";
import type { createCatalogProcessing } from "../src/application/process-media.js";
import {
  ARTWORK_RECIPE_VERSION,
  normalizeProcessingAttempt,
} from "../src/domain/media-processing.js";
import { normalizeMediaRequest } from "../src/domain/media-request.js";
import { prepareDecoder } from "../src/infrastructure/media/prepare-decoder.js";
import { retainDecoderCandidate } from "../src/infrastructure/media/retain-candidate.js";
import { reuseDecoderCandidate } from "../src/infrastructure/media/reuse-candidate.js";
import { runMediaProcessing } from "../src/infrastructure/media/run-processing.js";
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
    media,
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

test("retains and reuses a separate complete artwork candidate without overwriting HLS", async () => {
  await fixture(async (f) => {
    const hls = await retainDecoderCandidate(
      id(9),
      f.directory,
      f.request,
      f.acquisitions,
      f.storage,
    );
    for (const name of await readdir(f.directory)) {
      await unlink(join(f.directory, name));
    }
    const frames = [
      { name: "poster-320.jpg", purpose: "poster", width: 320, height: 180, atSeconds: 2 },
      { name: "poster-640.jpg", purpose: "poster", width: 640, height: 360, atSeconds: 2 },
      ...[1, 5, 8.5].map((atSeconds, index) => ({
        name: "thumbnail-0" + String(index + 1) + ".jpg",
        purpose: "thumbnail",
        width: 160,
        height: 90,
        atSeconds,
      })),
    ];
    const files = frames.map(({ name }) => ({ name, bytes: f.body.length, sha256: hash(f.body) }));
    Object.assign(f.report, {
      recipe: ARTWORK_RECIPE_VERSION,
      processingKey: hash(f.original.sha256 + "\0" + ARTWORK_RECIPE_VERSION),
      probe: { width: 640, height: 360, duration: 10 },
      frames,
      files,
      manifestHash: hash(JSON.stringify(files)),
    });
    for (const file of files) {
      await writeFile(join(f.directory, file.name), f.body, { flag: "wx" });
    }
    await f.saveReport();
    const artwork = await retainDecoderCandidate(
      id(9),
      f.directory,
      f.request,
      f.acquisitions,
      f.storage,
      ARTWORK_RECIPE_VERSION,
    );
    assert.notEqual(artwork.value.prefix, hls.value.prefix);
    const writes = f.writes();
    const selector = {
      manifestHash: String(f.report["manifestHash"]),
      reportChecksum: artwork.value.reportChecksum,
    };
    assert.deepEqual(
      await reuseDecoderCandidate(
        id(9),
        selector,
        f.request,
        f.acquisitions,
        f.storage,
        ARTWORK_RECIPE_VERSION,
      ),
      artwork.value,
    );
    assert.equal(f.writes(), writes);
    assert.ok(f.objects.has(hls.value.prefix + "report.json"));
    await assert.rejects(
      reuseDecoderCandidate(id(9), selector, f.request, f.acquisitions, f.storage),
    );
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

test("adopts an existing candidate and replays without encoding, uploads or filesystem preparation", async () => {
  await fixture(async (f) => {
    const telemetry = createAsterTelemetry({
      serviceName: "catalog-media-worker-test",
      serviceVersion: "1.0.0",
      environment: "test",
      maxActiveSpans: 8,
    });
    const stored = await retainDecoderCandidate(
      id(9),
      f.directory,
      f.request,
      f.acquisitions,
      f.storage,
    );
    const selector = {
      manifestHash: stored.value.prefix.split("/")[2] ?? "",
      reportChecksum: stored.value.reportChecksum,
    };
    const initial = normalizeProcessingAttempt({
      id: id(10),
      acquisitionId: id(9),
      requestId: f.media.input.requestId,
      actorId: id(3),
      correlationId: id(4),
      processingKey: f.report["processingKey"],
      sourceChecksum: f.original.sha256,
      recipeVersion: "hls-avc-aac-v1",
      number: 1,
      requestedAt: now,
      startedAt: now,
      expiresAt: now + 1800,
      finishedAt: null,
      status: "RUNNING",
      failure: null,
      candidate: null,
    });
    assert.ok(initial);
    let attempt = initial;
    let completions = 0;
    const processing: ReturnType<typeof createCatalogProcessing> = {
      claim: () => Promise.resolve({ status: "completed", value: attempt }),
      check: () => f.acquisitions.original(id(9), f.request),
      complete: (_id, value) => {
        completions++;
        const result = normalizeProcessingAttempt({
          ...attempt,
          status: "SUCCEEDED",
          finishedAt: now + 1,
          candidate: value,
        });
        assert.ok(result);
        attempt = result;
        return Promise.resolve({ status: "completed", value: attempt });
      },
      fail: () => {
        throw new Error("Unexpected failure");
      },
    };
    const writes = f.writes();
    const ports = {
      processing,
      acquisitions: f.acquisitions,
      storage: f.storage,
      telemetry,
      onReady: () => {
        throw new Error("Must not start the decoder");
      },
    };
    const adopted = await runMediaProcessing(id(9), f.request, { ...ports, selector });
    assert.equal(adopted.status, "completed");
    assert.equal(adopted.value.reused, true);
    assert.deepEqual(adopted.value.attempt.candidate, stored.value);
    const replay = await runMediaProcessing(id(9), f.request, ports);
    assert.deepEqual(replay, adopted);
    const conflict = await runMediaProcessing(id(9), f.request, {
      ...ports,
      selector: { ...selector, reportChecksum: "0".repeat(64) },
    });
    assert.equal(conflict.status, "unavailable");
    assert.equal(completions, 1);
    assert.equal(f.writes(), writes);
    assert.deepEqual(await readdir(f.root), ["candidate"]);
    const traces = await telemetry.collectTraces();
    assert.equal(traces.status, "collected");
    const workerSpans = traces.traces.filter(
      (span) => span.attributes["aster.dependency"] === "media_worker",
    );
    assert.equal(workerSpans.length, 3);
    assert.deepEqual(
      workerSpans.map((span) => span.status),
      ["ok", "ok", "error"],
    );
    assert.ok(workerSpans.every((span) => span.attributes["aster.operation"] === "process"));
    assert.doesNotMatch(JSON.stringify(workerSpans), new RegExp(id(9), "u"));
    const metrics = await telemetry.collect();
    assert.equal(metrics.status, "collected");
    const productOutcomes = metrics.metrics.find(
      (metric) => metric.name === ASTER_METRIC_CATALOG.productOperationOutcomes.name,
    );
    assert.ok(productOutcomes);
    assert.deepEqual(
      productOutcomes.points
        .map((point) => [
          point.attributes["aster.product.operation"],
          point.attributes["aster.outcome"],
          point.value,
        ])
        .sort(),
      [
        ["media_processing", "completed", 2],
        ["media_processing", "unavailable", 1],
      ],
    );
    await telemetry.shutdown();
  });
});
test("processing cancellation retains a classified failure with a separate bounded audit signal", async () => {
  await fixture(async (f) => {
    const stored = await retainDecoderCandidate(
      id(9),
      f.directory,
      f.request,
      f.acquisitions,
      f.storage,
    );
    const initial = normalizeProcessingAttempt({
      id: id(10),
      acquisitionId: id(9),
      requestId: f.media.input.requestId,
      actorId: id(3),
      correlationId: id(4),
      processingKey: f.report["processingKey"],
      sourceChecksum: f.original.sha256,
      recipeVersion: "hls-avc-aac-v1",
      number: 1,
      requestedAt: now,
      startedAt: now,
      expiresAt: now + 1800,
      finishedAt: null,
      status: "RUNNING",
      failure: null,
      candidate: null,
    });
    assert.ok(initial);
    const controller = new AbortController();
    let failures = 0;
    const processing: ReturnType<typeof createCatalogProcessing> = {
      claim: () => {
        controller.abort();
        return Promise.resolve({ status: "completed", value: initial });
      },
      check: () => {
        throw new Error("No read after cancellation");
      },
      complete: () => {
        throw new Error("No completion after cancellation");
      },
      fail: (attemptId, failure, request) => {
        assert.equal(attemptId, initial.id);
        assert.equal(failure, "CANCELLED");
        assert.equal(request.signal.aborted, false);
        failures++;
        return Promise.resolve({
          status: "completed",
          value: {
            ...initial,
            status: "FAILED",
            finishedAt: now,
            failure: "CANCELLED",
          },
        });
      },
    };
    const result = await runMediaProcessing(
      id(9),
      { ...f.request, signal: controller.signal },
      {
        processing,
        acquisitions: f.acquisitions,
        storage: f.storage,
        selector: {
          manifestHash: stored.value.prefix.split("/")[2] ?? "",
          reportChecksum: stored.value.reportChecksum,
        },
        onReady: () => {
          throw new Error("No decoder after cancellation");
        },
      },
    );
    assert.equal(result.status, "cancelled");
    assert.equal(failures, 1);
  });
});
for (const failure of ["missing", "changed", "oversized-report", "revoked", "selector"] as const) {
  test("refuses retained candidate reuse: " + failure, async () => {
    await fixture(async (f) => {
      const stored = await retainDecoderCandidate(
        id(9),
        f.directory,
        f.request,
        f.acquisitions,
        f.storage,
      );
      const selector = {
        manifestHash: stored.value.prefix.split("/")[2] ?? "",
        reportChecksum: stored.value.reportChecksum,
      };
      if (failure === "missing") {
        f.objects.delete(stored.value.prefix + "v240-0000.ts");
      }
      if (failure === "changed") {
        f.objects.set(stored.value.prefix + "v240-0000.ts", Buffer.alloc(f.body.length));
      }
      if (failure === "oversized-report") {
        f.objects.set(stored.value.prefix + "report.json", Buffer.alloc(512 * 1024 + 1));
      }
      if (failure === "revoked") {
        f.revoke();
      }
      if (failure === "selector") {
        selector.manifestHash = "../escape";
      }
      const writes = f.writes();
      await assert.rejects(
        reuseDecoderCandidate(id(9), selector, f.request, f.acquisitions, f.storage),
      );
      assert.equal(f.writes(), writes);
    });
  });
}
