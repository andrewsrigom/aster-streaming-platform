import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { setImmediate as nextTurn } from "node:timers/promises";

import {
  ChecksumMode,
  CreateBucketCommand,
  DeleteBucketCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";

import { createAsterObjectStorageAdapter } from "@aster/object-storage-s3";
import { createAsterTelemetry } from "@aster/telemetry";

import { eventually } from "./docker-fixture.js";
import { change } from "./worker-control.js";

const port = Number(process.argv[3]);
assert.ok(Number.isSafeInteger(port) && port >= 1024 && port <= 65535);
const endpoint = `http://127.0.0.1:${port}`;
const bucket = "aster-fixtures";
const prefix = "aster-fixtures/p01-r09/";
const credentials = { accessKeyId: "aster-test-access", secretAccessKey: "aster-test-only" };
const mib = 1024 * 1024;
const chunkBytes = 64 * 1024;
const telemetry = createAsterTelemetry({
  serviceName: "integration-storage",
  serviceVersion: "0.0.0",
  environment: "test",
  export: { mode: "none" },
});
const options = {
  endpoint,
  region: "us-east-1",
  bucket,
  ...credentials,
  telemetry,
  maxInFlightOperations: 1,
  maxObjectBytes: 16 * mib,
  operationTimeoutMs: 1_500,
  connectionTimeoutMs: 500,
  closeTimeoutMs: 2_000,
  uploadQueueSize: 1,
  uploadPartSizeBytes: 5 * mib,
  fixtureKeyPrefix: prefix,
};
const storage = createAsterObjectStorageAdapter(options);
// Administrative inspection stays in this test: production code receives only the Aster adapter.
const inspector = new S3Client({
  endpoint,
  region: options.region,
  credentials,
  forcePathStyle: true,
  maxAttempts: 1,
  requestHandler: new NodeHttpHandler({ connectionTimeout: 500, requestTimeout: 2_000 }),
});
const request = () => ({ abortSignal: AbortSignal.timeout(2_000) });

function output(event: string, details: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({ event, ...details })}\n`);
}

function syntheticSource(length: number, holdAfter = length): Readable {
  let sent = 0;
  return new Readable({
    highWaterMark: chunkBytes,
    read() {
      if (sent === length) {
        this.push(null);
      } else if (sent < holdAfter) {
        const chunk = Buffer.alloc(Math.min(chunkBytes, length - sent, holdAfter - sent), 0x61);
        sent += chunk.length;
        this.push(chunk);
      }
    },
  });
}

function digest(length: number): Buffer {
  const hash = createHash("sha256");
  const chunk = Buffer.alloc(chunkBytes, 0x61);
  for (let offset = 0; offset < length; offset += chunk.length) {
    hash.update(chunk.subarray(0, Math.min(chunk.length, length - offset)));
  }
  return hash.digest();
}

async function activeUploads() {
  const result = await inspector.send(
    new ListMultipartUploadsCommand({ Bucket: bucket, Prefix: prefix, MaxUploads: 4 }),
    request(),
  );
  assert.notEqual(result.IsTruncated, true, "Unexpected multipart inventory");
  return result.Uploads ?? [];
}

async function roundTrip(length: number): Promise<void> {
  const key = `${prefix}round-trip-${length}`;
  const source = syntheticSource(length);
  assert.deepEqual(await storage.write({ key, source, contentLength: length }), {
    status: "completed",
  });
  assert.equal(source.destroyed, true);
  assert.deepEqual(await storage.head({ key }), { status: "completed" });
  const head = await inspector.send(
    new HeadObjectCommand({ Bucket: bucket, Key: key, ChecksumMode: ChecksumMode.ENABLED }),
    request(),
  );
  assert.equal(head.ContentLength, length);
  const checksum =
    length > 5 * mib
      ? `${createHash("sha256")
          .update(digest(5 * mib))
          .update(digest(length - 5 * mib))
          .digest("base64")}-2`
      : digest(length).toString("base64");
  assert.equal(head.ChecksumSHA256, checksum, "Stored S3 checksum differs from sent bytes");
  let received = 0;
  const hash = createHash("sha256");
  const destination = new Writable({
    highWaterMark: chunkBytes,
    write(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      hash.update(chunk);
      // Delay each acknowledgement one event-loop turn to exercise real read backpressure.
      setImmediate(callback);
    },
  });
  assert.deepEqual(await storage.read({ key, destination }), { status: "completed" });
  assert.equal(destination.writableFinished, true);
  assert.equal(received, length);
  assert.deepEqual(hash.digest(), digest(length));
  assert.equal((await storage.deleteFixture({ key })).status, "completed");
  assert.deepEqual(await storage.head({ key }), { status: "not_found" });
  output("storage_round_trip", { bytes: length, checksum: "sha256", outcome: "passed" });
}

async function multipartAbort(): Promise<void> {
  const key = `${prefix}interrupted`;
  const source = syntheticSource(12 * mib, 6 * mib);
  const controller = new AbortController();
  // Longer than fault probes so inspection, rather than the deadline, initiates this abort.
  const uploader = createAsterObjectStorageAdapter({ ...options, operationTimeoutMs: 15_000 });
  try {
    const pending = uploader.write({ key, source, contentLength: 12 * mib }, controller.signal);
    await eventually("multipart part acknowledged by storage", async () => {
      const upload = (await activeUploads()).find((entry) => entry.Key === key);
      if (!upload?.UploadId) {
        return false;
      }
      const parts = await inspector.send(
        new ListPartsCommand({ Bucket: bucket, Key: key, UploadId: upload.UploadId, MaxParts: 3 }),
        request(),
      );
      return parts.Parts?.some((part) => part.Size === 5 * mib) === true;
    });
    const started = performance.now();
    controller.abort();
    assert.deepEqual(await pending, { status: "aborted" });
    assert.ok(performance.now() - started < 1_000);
    assert.equal(source.destroyed, true);
    assert.equal(uploader.snapshot().inFlightOperations, 0);
    await eventually(
      "multipart abort removes acknowledged parts",
      async () => (await activeUploads()).length === 0,
    );
    assert.equal((await storage.head({ key })).status, "not_found");
    output("storage_multipart_abort", { acknowledgedPartBytes: 5 * mib, remainingUploads: 0 });
  } finally {
    controller.abort();
    assert.equal((await uploader.close()).status, "completed");
  }
}

async function failuresAndRecovery(): Promise<void> {
  const key = `${prefix}survives-restart`;
  assert.equal(
    (await storage.write({ key, source: syntheticSource(mib), contentLength: mib })).status,
    "completed",
  );
  await change("storage", "stop");
  assert.equal((await storage.probe()).status, "unavailable");
  await change("storage", "start");
  assert.equal((await storage.probe()).status, "completed");
  assert.equal((await storage.head({ key })).status, "completed");

  await change("storage", "pause");
  const timed = performance.now();
  assert.equal((await storage.probe()).status, "timed_out");
  assert.ok(performance.now() - timed < 2_500);
  await change("storage", "unpause");
  assert.equal((await storage.probe()).status, "completed");

  await change("storage", "pause");
  const controller = new AbortController();
  const pending = storage.probe(controller.signal);
  await nextTurn();
  assert.equal(storage.snapshot().inFlightOperations, 1);
  assert.deepEqual(await storage.probe(), { status: "rejected", reason: "capacity_exceeded" });
  controller.abort();
  assert.deepEqual(await pending, { status: "aborted" });
  await change("storage", "unpause");
  assert.equal((await storage.probe()).status, "completed");

  const readController = new AbortController();
  const destination = new Writable({
    write(_chunk, _encoding, callback) {
      readController.abort();
      callback();
    },
  });
  assert.deepEqual(await storage.read({ key, destination }, readController.signal), {
    status: "aborted",
  });
  assert.equal(destination.destroyed, true);
  const bounded = createAsterObjectStorageAdapter({ ...options, maxObjectBytes: 1 });
  try {
    const rejectedDestination = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
    assert.deepEqual(await bounded.read({ key, destination: rejectedDestination }), {
      status: "rejected",
      reason: "object_too_large",
    });
    assert.equal(rejectedDestination.destroyed, true);
  } finally {
    assert.equal((await bounded.close()).status, "completed");
  }
  assert.equal((await storage.deleteFixture({ key })).status, "completed");
  output("storage_fault_recovery", {
    restart: "passed",
    timeout: "passed",
    cancellation: "passed",
  });
}

async function main(): Promise<void> {
  try {
    assert.equal((await storage.probe()).status, "unavailable", "Missing bucket must not be ready");
    await inspector.send(new CreateBucketCommand({ Bucket: bucket }), request());
    assert.equal((await storage.probe()).status, "completed");
    const unauthorized = createAsterObjectStorageAdapter({
      ...options,
      secretAccessKey: "incorrect-test-only",
    });
    try {
      assert.equal((await unauthorized.probe()).status, "unavailable");
    } finally {
      assert.equal((await unauthorized.close()).status, "completed");
    }
    for (const length of [0, 256 * 1024, 7 * mib + 17]) {
      await roundTrip(length);
    }
    await multipartAbort();
    await failuresAndRecovery();
    assert.deepEqual(await storage.deleteFixture({ key: "outside-fixture" }), {
      status: "rejected",
      reason: "unsafe_fixture_target",
    });
    assert.equal((await activeUploads()).length, 0);
    const objects = await inspector.send(
      new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 8 }),
      request(),
    );
    assert.notEqual(objects.IsTruncated, true);
    assert.equal(objects.Contents?.length ?? 0, 0);
    await inspector.send(new DeleteBucketCommand({ Bucket: bucket }), request());
    output("storage_fixture_empty", { objects: 0, multipartUploads: 0, buckets: 0 });
  } finally {
    const started = performance.now();
    assert.equal((await storage.close()).status, "completed");
    assert.equal((await storage.close()).status, "already_completed");
    assert.deepEqual(storage.snapshot(), { state: "closed", inFlightOperations: 0 });
    inspector.destroy();
    assert.equal((await telemetry.shutdown()).status, "completed");
    output("storage_handles_closed", { durationMs: Math.round(performance.now() - started) });
  }
}

await main().catch((error: unknown) => {
  if (error instanceof assert.AssertionError) {
    output("assertion_failed", {
      message: error.message.slice(0, 2_048),
      stack: error.stack
        ?.split("\n")
        .filter((line) => line.includes("storage-worker.js"))
        .slice(0, 2),
    });
  } else {
    // Inspector errors may include request metadata; never print vendor errors or causes.
    output("storage_scenario_failed", { name: error instanceof Error ? error.name : "unknown" });
  }
  throw new Error("Storage integration scenario failed.");
});
process.disconnect();
process.once("beforeExit", () => {
  output("natural_exit", { mode: "storage" });
});
