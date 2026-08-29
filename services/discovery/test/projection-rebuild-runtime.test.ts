import assert from "node:assert/strict";
import test from "node:test";
import { createProjectionRebuildRuntime } from "../src/infrastructure/projection-rebuild-runtime.js";

const id = "00000000-0000-4000-8000-000000000090";

test("maintenance retries catch-up without a hot loop, reaches ready and owns stop", async () => {
  const calls: string[] = [];
  const releases = [Promise.withResolvers<undefined>(), Promise.withResolvers<undefined>()];
  let needed = true;
  let attempt = 0;
  let waitIndex = 0;
  const runtime = createProjectionRebuildRuntime({
    logger: { info: (entry) => (calls.push(`log:${entry.event}`), "written") },
    needsRebuild: () => Promise.resolve({ status: "completed", value: needed }),
    rebuild: () => {
      attempt++;
      if (attempt === 2) {
        needed = false;
      }
      return Promise.resolve({
        status: "completed",
        value:
          attempt === 1
            ? { status: "catchup_pending", generation: id, rowsApplied: 2 }
            : { status: "promoted", generation: id, rowsApplied: 2 },
      });
    },
    wait: async (milliseconds, signal) => {
      calls.push(`wait:${milliseconds}`);
      const gate = releases[waitIndex++];
      if (gate) {
        await Promise.race([
          gate.promise,
          new Promise<void>((resolve) => {
            signal.addEventListener(
              "abort",
              () => {
                resolve();
              },
              { once: true },
            );
          }),
        ]);
      }
    },
  });
  runtime.start();
  while (!calls.includes("wait:250")) {
    await Promise.resolve();
  }
  releases[0]?.resolve(undefined);
  while (runtime.snapshot().state !== "ready") {
    await Promise.resolve();
  }
  assert.equal(attempt, 2);
  assert.ok(calls.includes("wait:250"));
  await runtime.stop();
  assert.equal(runtime.snapshot().state, "stopped");
});

test("maintenance bounds unavailable backoff and stop cancels its wait", async () => {
  const waits: number[] = [];
  const runtime = createProjectionRebuildRuntime({
    logger: { info: () => "written" },
    needsRebuild: () => Promise.resolve({ status: "unavailable" }),
    rebuild: () => Promise.resolve({ status: "indeterminate" }),
    wait: (milliseconds, signal) =>
      new Promise<void>((resolve) => {
        waits.push(milliseconds);
        signal.addEventListener(
          "abort",
          () => {
            resolve();
          },
          { once: true },
        );
      }),
  });
  runtime.start();
  while (waits.length === 0) {
    await Promise.resolve();
  }
  assert.equal(waits[0], 1_000);
  await runtime.stop();
  assert.equal(runtime.snapshot().state, "stopped");
});
