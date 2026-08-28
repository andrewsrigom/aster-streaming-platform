import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeProcessingAttempt,
  normalizeProcessingCandidate,
  PROCESSING_LEASE_SECONDS,
  processingKeyInput,
  retryableProcessing,
} from "../src/domain/media-processing.js";
import { catalogTestId as id, catalogTestTime as now } from "./rights-fixture.js";
import { hash } from "./workflow-fixture.js";

const key = hash(processingKeyInput("a".repeat(64)));
const candidate = {
  prefix: "candidates/" + key + "/" + "b".repeat(64) + "/",
  reportChecksum: "c".repeat(64),
  files: 203,
  bytes: 95000000,
  publicationAuthority: false,
};
const running = {
  id: id(1),
  acquisitionId: id(2),
  requestId: id(3),
  actorId: id(4),
  correlationId: id(5),
  processingKey: key,
  sourceChecksum: "a".repeat(64),
  recipeVersion: "hls-avc-aac-v1",
  number: 1,
  requestedAt: now - 1,
  startedAt: now,
  expiresAt: now + PROCESSING_LEASE_SECONDS,
  finishedAt: null,
  status: "RUNNING",
  failure: null,
  candidate: null,
};
test("processing records retain bounded identity, queue time and private candidate", () => {
  assert.deepEqual(normalizeProcessingAttempt(running), running);
  assert.ok(
    normalizeProcessingAttempt({ ...running, status: "SUCCEEDED", finishedAt: now + 1, candidate }),
  );
  assert.ok(
    normalizeProcessingAttempt({
      ...running,
      status: "FAILED",
      failure: "LEASE_EXPIRED",
      finishedAt: running.expiresAt,
    }),
  );
  for (const patch of [
    { id: "bad" },
    { number: 4 },
    { number: 0 },
    { number: 1.5 },
    { requestedAt: now + 1 },
    { expiresAt: running.expiresAt + 1 },
    { recipeVersion: "arbitrary" },
    { status: "SUCCEEDED", candidate, finishedAt: running.expiresAt },
    { status: "SUCCEEDED", candidate: null, finishedAt: now + 1 },
    { candidate },
    { failure: "CANCELLED" },
    { finishedAt: now },
    { caller: true },
    { status: "FAILED", failure: "arbitrary", finishedAt: now + 1 },
  ]) {
    assert.equal(normalizeProcessingAttempt({ ...running, ...patch }), undefined);
  }
});
test("only transient processing outcomes permit bounded retry", () => {
  assert.equal(retryableProcessing("STORAGE_FAILURE"), true);
  assert.equal(retryableProcessing("CONTROL_UNAVAILABLE"), true);
  assert.equal(retryableProcessing("CANCELLED"), true);
  assert.equal(retryableProcessing("LEASE_EXPIRED"), true);
  assert.equal(retryableProcessing("INVALID_OUTPUT"), false);
  assert.equal(retryableProcessing("RIGHTS_REVOKED"), false);
  assert.equal(retryableProcessing("INTERNAL_FAILURE"), false);
  assert.equal(retryableProcessing(null), false);
});
test("candidate references cannot grant authority, escape the prefix or exceed bounds", () => {
  assert.deepEqual(normalizeProcessingCandidate(candidate, key), candidate);
  for (const patch of [
    { prefix: "../../master.m3u8" },
    { prefix: candidate.prefix.replace(key, "d".repeat(64)) },
    { reportChecksum: null },
    { publicationAuthority: true },
    { files: 2049 },
    { bytes: 0 },
    { bytes: 512 * 1024 * 1024 + 1 },
    { approved: true },
  ]) {
    assert.equal(normalizeProcessingCandidate({ ...candidate, ...patch }, key), undefined);
  }
});
