import assert from "node:assert/strict";
import test from "node:test";
import type { AsterOperationLimitMetricInput } from "@aster/telemetry";
import { createSearchConcurrencyLimiter } from "../src/transport/search-concurrency.js";

test("search concurrency admits two, queues one and rejects excess without leaking permits", async () => {
  const metrics: AsterOperationLimitMetricInput[] = [];
  const limiter = createSearchConcurrencyLimiter({
    recordMetric: (metric) => metrics.push(metric),
  });
  const signal = new AbortController().signal;
  const first = await limiter.acquire(signal);
  const second = await limiter.acquire(signal);
  assert.equal(first.status, "acquired");
  assert.equal(second.status, "acquired");
  const queued = limiter.acquire(signal);
  assert.equal(limiter.snapshot().waiting, 1);
  assert.deepEqual(await limiter.acquire(signal), { status: "rejected" });
  assert.equal(first.status, "acquired");
  first.release();
  const third = await queued;
  assert.equal(third.status, "acquired");
  second.release();
  third.release();
  assert.deepEqual(
    { active: limiter.snapshot().active, waiting: limiter.snapshot().waiting },
    { active: 0, waiting: 0 },
  );
  assert.deepEqual(
    metrics.map((metric) => metric.outcome),
    ["allowed", "allowed", "queued", "rejected", "allowed"],
  );
});

test("queued search has a finite wait and cancellation or close settles immediately", async () => {
  const limiter = createSearchConcurrencyLimiter();
  const signal = new AbortController().signal;
  const first = await limiter.acquire(signal);
  const second = await limiter.acquire(signal);
  assert.equal(first.status, "acquired");
  assert.equal(second.status, "acquired");
  const timed = await limiter.acquire(signal);
  assert.deepEqual(timed, { status: "rejected" });

  const cancelled = new AbortController();
  const pendingCancel = limiter.acquire(cancelled.signal);
  cancelled.abort();
  assert.deepEqual(await pendingCancel, { status: "cancelled" });

  const pendingClose = limiter.acquire(signal);
  limiter.close();
  assert.deepEqual(await pendingClose, { status: "closed" });
  assert.deepEqual(await limiter.acquire(signal), { status: "closed" });
  first.release();
  second.release();
  assert.equal(limiter.snapshot().active, 0);
});
