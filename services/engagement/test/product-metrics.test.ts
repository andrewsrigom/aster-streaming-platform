import assert from "node:assert/strict";
import test from "node:test";
import type { AsterProductMetricInput } from "@aster/telemetry";
import type { createProgressRecorder } from "../src/application/record-progress.js";
import { observeProgressRecorder } from "../src/infrastructure/product-metrics.js";

type ProgressRecorder = ReturnType<typeof createProgressRecorder>;
const request = {
  credential: "ignored",
  correlationId: "ignored",
  signal: new AbortController().signal,
};

test("records bounded progress outcomes without changing application behavior", async () => {
  const metrics: AsterProductMetricInput[] = [];
  const recorder: ProgressRecorder = {
    record: () => Promise.resolve({ status: "stale" }),
  };
  const readings = [10, 35];
  const observed = observeProgressRecorder(
    recorder,
    {
      recordProductOperation(input) {
        metrics.push(input);
        return { status: "recorded" };
      },
    },
    () => readings.shift() ?? 35,
  );

  assert.deepEqual(await observed.record({}, request), { status: "stale" });
  assert.deepEqual(metrics, [{ operation: "progress_write", outcome: "stale", durationMs: 25 }]);

  const completed = observeProgressRecorder(
    { record: () => Promise.resolve({ status: "completed", value: {} as never }) },
    {
      recordProductOperation() {
        throw new Error("telemetry");
      },
    },
  );
  assert.equal((await completed.record({}, request)).status, "completed");
});
