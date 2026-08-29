import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createIdempotencyAdmissionQueue } from "../src/application/idempotency-admission.js";

const key = (value: number) => createHash("sha256").update(String(value)).digest("hex");

test("idempotency admission serializes a key and removes cancelled waiters", async () => {
  const queue = createIdempotencyAdmissionQueue();
  const signal = new AbortController().signal;
  const first = await queue.acquire(key(1), signal);
  assert.equal(first.status, "acquired");
  const cancelled = new AbortController();
  const waiting = queue.acquire(key(1), cancelled.signal);
  assert.equal(queue.snapshot().waiters, 1);
  cancelled.abort();
  assert.deepEqual(await waiting, { status: "cancelled" });
  first.release();
  first.release();
  assert.equal(queue.snapshot().activeKeys, 0);
});

test("idempotency admission bounds active keys and waiters", async () => {
  const queue = createIdempotencyAdmissionQueue();
  const signal = new AbortController().signal;
  const permits = await Promise.all(
    Array.from({ length: 1_024 }, (_, index) => queue.acquire(key(index), signal)),
  );
  assert.deepEqual(await queue.acquire(key(1_024), signal), { status: "capacity" });
  const waiting = Array.from({ length: 31 }, () => queue.acquire(key(0), signal));
  assert.deepEqual(await queue.acquire(key(0), signal), { status: "capacity" });
  for (const admission of permits) {
    assert.equal(admission.status, "acquired");
    admission.release();
  }
  for (const pending of waiting) {
    const admission = await pending;
    assert.equal(admission.status, "acquired");
    admission.release();
  }
  assert.equal(queue.snapshot().activeKeys, 0);
});
