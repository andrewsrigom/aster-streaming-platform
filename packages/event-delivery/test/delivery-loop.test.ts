import assert from "node:assert/strict";
import test from "node:test";
import { createDeliveryLoop } from "../src/application/delivery-loop.js";
import type { RelayStep } from "../src/application/relay.js";

test("loop runs one step per completed delay, bounds exponential backoff and resets on recovery", async () => {
  const outcomes: RelayStep[] = [
    "unavailable",
    "uncertain",
    "invalid",
    "unavailable",
    "delivered",
    "empty",
    "busy",
  ];
  const delays: number[] = [],
    observed: RelayStep[] = [];
  const loop = createDeliveryLoop({
    step: () => Promise.resolve(outcomes.shift() ?? "stopped"),
    random: () => 1,
    delay: (ms) => {
      delays.push(ms);
      return Promise.resolve();
    },
    observe: (outcome) => {
      observed.push(outcome);
    },
  });
  loop.start();
  loop.start();
  for (let turn = 0; turn < 40 && observed.length < 7; turn++) {
    await Promise.resolve();
  }
  await loop.stop();
  assert.deepEqual(delays, [1250, 2250, 4250, 5000, 0, 1000, 1000]);
  assert.equal(observed.length, 7);
});
test("stop cancels the active step without releasing a second worker or logging success", async () => {
  let calls = 0,
    activeSignal: AbortSignal | undefined;
  const loop = createDeliveryLoop({
    step: (signal) =>
      new Promise((resolve) => {
        calls++;
        activeSignal = signal;
        signal.addEventListener(
          "abort",
          () => {
            resolve("delivered");
          },
          { once: true },
        );
      }),
    random: () => 0,
    delay: () => {
      assert.fail("No timer may follow cancellation.");
    },
    observe: () => {
      assert.fail("Cancelled work is not a completed step.");
    },
  });
  loop.start();
  loop.start();
  await loop.stop();
  loop.start();
  assert.equal(calls, 1);
  assert.equal(activeSignal?.aborted, true);
});
test("stopping a waiting timer settles promptly and prevents future ticks", async () => {
  let waiting: AbortSignal | undefined,
    calls = 0;
  const loop = createDeliveryLoop({
    step: () => {
      calls++;
      return Promise.resolve("empty");
    },
    random: () => 0,
    observe: () => {
      throw new Error("optional observation");
    },
    delay: (_ms, signal) =>
      new Promise((resolve) => {
        waiting = signal;
        signal.addEventListener(
          "abort",
          () => {
            resolve();
          },
          { once: true },
        );
      }),
  });
  loop.start();
  await Promise.resolve();
  assert.ok(waiting);
  await loop.stop();
  loop.start();
  assert.equal(calls, 1);
  assert.equal(waiting.aborted, true);
});
