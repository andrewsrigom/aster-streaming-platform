import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ASTER_SHUTDOWN_DEADLINE_MAX_MS,
  AsterLifecycleError,
  createAsterServiceLifecycle,
  type AsterLogEntry,
  type AsterLogWriteResult,
  type AsterServiceLifecycle,
  type AsterServiceLifecycleOptions,
} from "../src/index.js";
import { createAsterServiceLifecycleWithScheduler } from "../src/service-lifecycle.js";

const noopHook = (): Promise<void> => Promise.resolve();
const noopForceClose = (): void => undefined;

function options(
  overrides: Partial<AsterServiceLifecycleOptions> = {},
): AsterServiceLifecycleOptions {
  return {
    forceClose: noopForceClose,
    stopTraffic: noopHook,
    ...overrides,
  };
}

function captureLifecycleError(input: unknown): AsterLifecycleError {
  try {
    createAsterServiceLifecycle(input as AsterServiceLifecycleOptions);
  } catch (error) {
    assert.equal(error instanceof AsterLifecycleError, true);
    return error as AsterLifecycleError;
  }
  assert.fail("Expected lifecycle initialization to fail");
}

class ControlledScheduler {
  callback: (() => void) | undefined;
  canceled = false;
  delayMs: number | undefined;

  schedule(callback: () => void, delayMs: number): () => void {
    this.callback = callback;
    this.delayMs = delayMs;
    return () => {
      this.canceled = true;
    };
  }

  fire(): void {
    assert.ok(this.callback);
    this.callback();
  }
}

test("rejects missing, unknown, accessor, and unbounded lifecycle options", () => {
  assert.deepEqual(captureLifecycleError(undefined).issues, [
    { option: "<options>", reason: "invalid" },
  ]);
  assert.deepEqual(captureLifecycleError({ forceClose: noopForceClose }).issues, [
    { option: "stopTraffic", reason: "missing" },
  ]);
  assert.deepEqual(captureLifecycleError({ stopTraffic: noopHook }).issues, [
    { option: "forceClose", reason: "missing" },
  ]);

  const unknown = captureLifecycleError({
    ...options(),
    unexpectedSecret: "must-not-be-reflected",
  });
  assert.deepEqual(unknown.issues, [{ option: "<options>", reason: "invalid" }]);
  assert.doesNotMatch(JSON.stringify(unknown), /must-not-be-reflected/u);

  let getterReads = 0;
  const accessorOptions = { forceClose: noopForceClose };
  Object.defineProperty(accessorOptions, "stopTraffic", {
    enumerable: true,
    get(): () => Promise<void> {
      getterReads += 1;
      return noopHook;
    },
  });
  assert.deepEqual(captureLifecycleError(accessorOptions).issues, [
    { option: "<options>", reason: "invalid" },
  ]);
  assert.equal(getterReads, 0);

  for (const shutdownDeadlineMs of [99, ASTER_SHUTDOWN_DEADLINE_MAX_MS + 1, Number.NaN, 100.5]) {
    assert.deepEqual(captureLifecycleError(options({ shutdownDeadlineMs })).issues, [
      { option: "shutdownDeadlineMs", reason: "invalid" },
    ]);
  }
});

test("publishes frozen health snapshots and enforces monotonic startup transitions", async () => {
  const readyLifecycle = createAsterServiceLifecycle(options());
  const starting = readyLifecycle.health();
  assert.deepEqual(starting, {
    liveness: "live",
    phase: "starting",
    readiness: "not_ready",
    reason: "starting",
  });
  assert.equal(Object.isFrozen(starting), true);
  assert.equal(readyLifecycle.markReady(), "applied");
  assert.equal(readyLifecycle.markReady(), "unchanged");
  assert.equal(readyLifecycle.markStartupFailed(), "rejected");
  assert.deepEqual(readyLifecycle.health(), {
    liveness: "live",
    phase: "ready",
    readiness: "ready",
    reason: "ready",
  });
  await readyLifecycle.shutdown();
  assert.equal(readyLifecycle.markReady(), "rejected");

  const failedLifecycle = createAsterServiceLifecycle(options());
  assert.equal(failedLifecycle.markStartupFailed(), "applied");
  assert.equal(failedLifecycle.markStartupFailed(), "unchanged");
  assert.equal(failedLifecycle.markReady(), "rejected");
  assert.deepEqual(failedLifecycle.health(), {
    liveness: "not_live",
    phase: "failed",
    readiness: "not_ready",
    reason: "startup_failed",
  });
  await failedLifecycle.shutdown();
});

test("accepts work only while ready and completes each lease once", async () => {
  const lifecycle = createAsterServiceLifecycle(options());
  assert.equal(lifecycle.tryBeginWork(), undefined);
  lifecycle.markReady();
  const lease = lifecycle.tryBeginWork();
  assert.ok(lease);
  assert.equal(lease.complete(), "completed");
  assert.equal(lease.complete(), "already_completed");
  await lifecycle.shutdown();
  assert.equal(lifecycle.tryBeginWork(), undefined);
});

test("fails readiness, stops traffic, drains work, and closes hooks in fixed order", async () => {
  const events: string[] = [];
  const signals: AbortSignal[] = [];
  const lifecycle: AsterServiceLifecycle = createAsterServiceLifecycle(
    options({
      closeDependencies: (signal) => {
        events.push("close_dependencies");
        signals.push(signal);
        return Promise.resolve();
      },
      flushTelemetry: (signal) => {
        events.push("flush_telemetry");
        signals.push(signal);
        return Promise.resolve();
      },
      stopConsumers: (signal) => {
        events.push("stop_consumers");
        signals.push(signal);
        return Promise.resolve();
      },
      stopTraffic: (signal) => {
        events.push("stop_traffic");
        signals.push(signal);
        assert.equal(lifecycle.health().readiness, "not_ready");
        return Promise.resolve();
      },
    }),
  );
  lifecycle.markReady();
  const lease = lifecycle.tryBeginWork();
  assert.ok(lease);

  const firstShutdown = lifecycle.shutdown("sigterm");
  const repeatedShutdown = lifecycle.shutdown("sigint");
  assert.equal(repeatedShutdown, firstShutdown);
  assert.deepEqual(lifecycle.health(), {
    liveness: "live",
    phase: "draining",
    readiness: "not_ready",
    reason: "draining",
  });

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["stop_traffic"]);
  assert.equal(lease.complete(), "completed");

  const result = await firstShutdown;
  assert.deepEqual(events, [
    "stop_traffic",
    "stop_consumers",
    "flush_telemetry",
    "close_dependencies",
  ]);
  assert.equal(new Set(signals).size, 1);
  assert.deepEqual(result, {
    failedStages: [],
    outcome: "completed",
    trigger: "sigterm",
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.failedStages), true);
  assert.deepEqual(lifecycle.health(), {
    liveness: "not_live",
    phase: "stopped",
    readiness: "not_ready",
    reason: "stopped",
  });
});

test("records bounded hook failures and continues the remaining shutdown stages", async () => {
  const events: string[] = [];
  const lifecycle = createAsterServiceLifecycle(
    options({
      closeDependencies: () => {
        events.push("close_dependencies");
        return Promise.resolve();
      },
      stopConsumers: () => {
        events.push("stop_consumers");
        return Promise.resolve();
      },
      stopTraffic: () => {
        events.push("stop_traffic");
        return Promise.reject(new Error("sensitive-dependency-detail"));
      },
    }),
  );

  const result = await lifecycle.shutdown(
    "not-a-trigger" as Parameters<AsterServiceLifecycle["shutdown"]>[0],
  );
  assert.deepEqual(events, ["stop_traffic", "stop_consumers", "close_dependencies"]);
  assert.deepEqual(result, {
    failedStages: ["stop_traffic"],
    outcome: "degraded",
    trigger: "manual",
  });
  assert.doesNotMatch(JSON.stringify(result), /sensitive-dependency-detail/u);
});

test("forces a hung shutdown at the bounded deadline with one abort signal", async () => {
  const scheduler = new ControlledScheduler();
  let forceCloseCalls = 0;
  let shutdownSignal: AbortSignal | undefined;
  const lifecycle = createAsterServiceLifecycleWithScheduler(
    options({
      forceClose: () => {
        forceCloseCalls += 1;
      },
      shutdownDeadlineMs: 100,
      stopTraffic: async (signal) => {
        shutdownSignal = signal;
        await new Promise<void>(() => undefined);
      },
    }),
    scheduler,
  );

  const shutdown = lifecycle.shutdown("sigint");
  await Promise.resolve();
  assert.equal(scheduler.delayMs, 100);
  assert.equal(shutdownSignal?.aborted, false);
  scheduler.fire();

  const result = await shutdown;
  assert.equal(shutdownSignal.aborted, true);
  assert.equal(forceCloseCalls, 1);
  assert.equal(scheduler.canceled, true);
  assert.deepEqual(result, {
    failedStages: [],
    forceReason: "deadline",
    outcome: "forced",
    trigger: "sigint",
  });
});

test("a repeated signal forces the shared shutdown promise exactly once", async () => {
  const scheduler = new ControlledScheduler();
  let forceCloseCalls = 0;
  const lifecycle = createAsterServiceLifecycleWithScheduler(
    options({
      forceClose: () => {
        forceCloseCalls += 1;
      },
      shutdownDeadlineMs: 100,
      stopTraffic: async () => {
        await new Promise<void>(() => undefined);
      },
    }),
    scheduler,
  );

  const shutdown = lifecycle.shutdown("sigterm");
  assert.equal(lifecycle.forceShutdown("repeated_signal"), shutdown);
  assert.equal(lifecycle.forceShutdown("repeated_signal"), shutdown);
  assert.equal(forceCloseCalls, 1);
  assert.deepEqual(await shutdown, {
    failedStages: [],
    forceReason: "repeated_signal",
    outcome: "forced",
    trigger: "sigterm",
  });
});

test("a throwing force-close path remains bounded and cause-free", async () => {
  const scheduler = new ControlledScheduler();
  const lifecycle = createAsterServiceLifecycleWithScheduler(
    options({
      forceClose: () => {
        throw new Error("force-close-private-canary");
      },
      shutdownDeadlineMs: 100,
      stopTraffic: async () => {
        await new Promise<void>(() => undefined);
      },
    }),
    scheduler,
  );

  const shutdown = lifecycle.shutdown();
  scheduler.fire();
  const result = await shutdown;
  assert.deepEqual(result, {
    failedStages: ["force_close"],
    forceReason: "deadline",
    outcome: "forced",
    trigger: "manual",
  });
  assert.doesNotMatch(JSON.stringify(result), /force-close-private-canary/u);
});

test("emits stable lifecycle events without reflecting hook errors", async () => {
  const entries: AsterLogEntry[] = [];
  const record = (entry: AsterLogEntry): AsterLogWriteResult => {
    entries.push(entry);
    return "written";
  };
  const lifecycle = createAsterServiceLifecycle(
    options({
      logger: { info: record, warn: record },
      stopTraffic: () => Promise.reject(new Error("private-network-and-token-canary")),
    }),
  );

  lifecycle.markReady();
  await lifecycle.shutdown("sigterm");
  assert.deepEqual(
    entries.map((entry) => entry.event),
    [
      "aster.lifecycle.ready",
      "aster.lifecycle.shutdown_started",
      "aster.lifecycle.stage_failed",
      "aster.lifecycle.shutdown_completed",
    ],
  );
  assert.doesNotMatch(JSON.stringify(entries), /private-network-and-token-canary/u);
});

test("a throwing lifecycle logger cannot change shutdown behavior", async () => {
  const throwFromSink = (): never => {
    throw new Error("unavailable-log-sink");
  };
  const lifecycle = createAsterServiceLifecycle(
    options({ logger: { info: throwFromSink, warn: throwFromSink } }),
  );

  lifecycle.markReady();
  assert.deepEqual(await lifecycle.shutdown(), {
    failedStages: [],
    outcome: "completed",
    trigger: "manual",
  });
});

test("keeps framework and infrastructure clients out of lifecycle declarations", async () => {
  const declarations = await Promise.all(
    ["service-lifecycle", "node-http-lifecycle", "process-signals"].map((module) =>
      readFile(new URL(`../src/${module}.d.ts`, import.meta.url), "utf8"),
    ),
  );
  const publicContract = declarations.join("\n").toLowerCase();
  for (const prohibited of [
    "apollo",
    "express",
    "fastify",
    "kafkajs",
    "pg",
    "pino",
    "redis",
    "telemetry sdk",
  ]) {
    assert.equal(publicContract.includes(prohibited), false, prohibited);
  }
});
