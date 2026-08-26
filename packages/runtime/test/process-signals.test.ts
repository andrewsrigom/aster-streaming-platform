import assert from "node:assert/strict";
import test from "node:test";

import {
  AsterProcessSignalBindingError,
  createAsterServiceLifecycle,
  type AsterProcessSignal,
} from "../src/index.js";
import { bindAsterProcessSignalsToTargetForTest } from "../src/process-signals.js";

class FakeSignalTarget {
  exitCode: number | string | undefined;
  readonly listeners = new Map<AsterProcessSignal, Set<() => void>>();

  off(signal: AsterProcessSignal, listener: () => void): void {
    this.listeners.get(signal)?.delete(listener);
  }

  on(signal: AsterProcessSignal, listener: () => void): void {
    let listeners = this.listeners.get(signal);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(signal, listeners);
    }
    listeners.add(listener);
  }

  emit(signal: AsterProcessSignal): void {
    for (const listener of [...(this.listeners.get(signal) ?? [])]) {
      listener();
    }
  }

  listenerCount(signal: AsterProcessSignal): number {
    return this.listeners.get(signal)?.size ?? 0;
  }
}

test("the first process signal starts shutdown and disposes both handlers", async () => {
  const target = new FakeSignalTarget();
  const lifecycle = createAsterServiceLifecycle({
    forceClose: () => undefined,
    stopTraffic: () => Promise.resolve(),
  });
  const binding = bindAsterProcessSignalsToTargetForTest(lifecycle, target);
  assert.equal(target.listenerCount("SIGINT"), 1);
  assert.equal(target.listenerCount("SIGTERM"), 1);

  target.emit("SIGTERM");
  assert.equal(target.exitCode, 143);
  const completion = binding.completion();
  assert.ok(completion);
  assert.deepEqual(await completion, {
    failedStages: [],
    outcome: "completed",
    trigger: "sigterm",
  });
  assert.equal(target.listenerCount("SIGINT"), 0);
  assert.equal(target.listenerCount("SIGTERM"), 0);
  assert.equal(binding.dispose(), "unchanged");
});

test("a repeated process signal forces one active graceful shutdown", async () => {
  const target = new FakeSignalTarget();
  let forceCloseCalls = 0;
  const lifecycle = createAsterServiceLifecycle({
    forceClose: () => {
      forceCloseCalls += 1;
    },
    stopTraffic: async () => {
      await new Promise<void>(() => undefined);
    },
  });
  const binding = bindAsterProcessSignalsToTargetForTest(lifecycle, target);

  target.emit("SIGINT");
  target.emit("SIGTERM");
  target.emit("SIGTERM");
  assert.equal(target.exitCode, 130);
  assert.equal(forceCloseCalls, 1);
  assert.deepEqual(await binding.completion(), {
    failedStages: [],
    forceReason: "repeated_signal",
    outcome: "forced",
    trigger: "sigint",
  });
});

test("one target cannot have competing signal owners and disposal releases it", () => {
  const target = new FakeSignalTarget();
  const firstLifecycle = createAsterServiceLifecycle({
    forceClose: () => undefined,
    stopTraffic: () => Promise.resolve(),
  });
  const secondLifecycle = createAsterServiceLifecycle({
    forceClose: () => undefined,
    stopTraffic: () => Promise.resolve(),
  });
  const firstBinding = bindAsterProcessSignalsToTargetForTest(firstLifecycle, target);

  assert.throws(
    () => bindAsterProcessSignalsToTargetForTest(secondLifecycle, target),
    (error: unknown) => {
      assert.equal(error instanceof AsterProcessSignalBindingError, true);
      assert.deepEqual((error as AsterProcessSignalBindingError).issues, [
        { reason: "already_bound" },
      ]);
      return true;
    },
  );
  assert.equal(firstBinding.dispose(), "disposed");
  const secondBinding = bindAsterProcessSignalsToTargetForTest(secondLifecycle, target);
  assert.equal(secondBinding.dispose(), "disposed");
});
