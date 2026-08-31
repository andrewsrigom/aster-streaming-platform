import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { AsterReadinessMonitorOptions } from "@aster/runtime";

import {
  createAsterIdentityRuntimeWithMonitor,
  type AsterIdentityDependencyPort,
  type AsterIdentityRuntimeOptions,
} from "../src/reference-runtime.js";

function deferred<T>() {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

async function withTestDeadline<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error("Test deadline exceeded."));
    }, 2_000);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function harness(overrides: Partial<AsterIdentityRuntimeOptions> = {}, failMonitorStart = false) {
  const events: string[] = [];
  const observedSignals: AbortSignal[] = [];
  const states = { postgresql: "ready", redis: "ready" } as {
    postgresql: "ready" | "unavailable";
    redis: "ready" | "unavailable";
  };
  const dependency = (name: "postgresql" | "redis"): AsterIdentityDependencyPort => ({
    connect(signal) {
      events.push(`${name}.connect`);
      observedSignals.push(signal);
      return Promise.resolve(states[name]);
    },
    probe(signal) {
      events.push(`${name}.probe`);
      observedSignals.push(signal);
      return Promise.resolve(states[name]);
    },
    close() {
      events.push(`${name}.close`);
      return Promise.resolve();
    },
  });
  let monitorOptions: AsterReadinessMonitorOptions | undefined;
  const runtime = createAsterIdentityRuntimeWithMonitor(
    {
      startupDeadlineMs: 1_000,
      shutdownDeadlineMs: 1_000,
      postgresql: dependency("postgresql"),
      redis: dependency("redis"),
      http: {
        listen(signal) {
          events.push("http.listen");
          observedSignals.push(signal);
          return Promise.resolve();
        },
        stopTraffic() {
          events.push("http.stop");
          return Promise.resolve();
        },
      },
      telemetry: {
        flush() {
          events.push("telemetry.flush");
          return Promise.resolve();
        },
        close() {
          events.push("telemetry.close");
          return Promise.resolve();
        },
      },
      forceClose() {
        events.push("force.close");
      },
      ...overrides,
    },
    (options) => {
      monitorOptions = options;
      return {
        start() {
          events.push("monitor.start");
          if (failMonitorStart) {
            throw new Error("private-monitor-cause");
          }
          return "started";
        },
        stop() {
          events.push("monitor.stop");
          return Promise.resolve("stopped");
        },
      };
    },
  );
  return {
    runtime,
    events,
    states,
    observedSignals,
    runRecoveryCycle: async (): Promise<void> => {
      assert.ok(monitorOptions);
      const controller = new AbortController();
      for (const [index, probe] of monitorOptions.probes.entries()) {
        const outcome = await probe(controller.signal);
        monitorOptions.readiness.setCriticalDependencyState(index, outcome);
      }
    },
  };
}

test("starts once under one propagated deadline and drains work before ordered closure", async () => {
  const { runtime, events, observedSignals } = harness();
  assert.equal(runtime.health().readiness, "not_ready");
  assert.equal(runtime.tryBeginWork(), undefined);
  const starting = runtime.start();
  assert.equal(runtime.start(), starting);
  assert.deepEqual(await starting, { status: "started", readiness: "ready" });
  assert.equal(events[0], "http.listen");
  assert.equal(events.filter((event) => event.endsWith(".connect")).length, 1);
  assert.equal(events.filter((event) => event.endsWith(".probe")).length, 1);
  assert.equal(events.includes("redis.connect"), false);
  assert.equal(
    observedSignals.every((signal) => signal === observedSignals[0]),
    true,
  );

  const work = runtime.tryBeginWork();
  assert.ok(work);
  const shutdown = runtime.shutdown();
  assert.equal(runtime.shutdown(), shutdown);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(runtime.health().reason, "draining");
  assert.equal(runtime.tryBeginWork(), undefined);
  assert.equal(events.includes("postgresql.close"), false);
  work.complete();
  assert.equal((await shutdown).outcome, "completed");
  assert.deepEqual(events.slice(-6), [
    "http.stop",
    "monitor.stop",
    "telemetry.flush",
    "postgresql.close",
    "redis.close",
    "telemetry.close",
  ]);
  assert.equal(runtime.health().reason, "stopped");
});

test("uses PostgreSQL as the sole readiness dependency while Redis remains optional", async () => {
  const { runtime, events, states, runRecoveryCycle } = harness();
  states.postgresql = "unavailable";
  assert.deepEqual(await runtime.start(), { status: "started", readiness: "not_ready" });
  assert.deepEqual(runtime.health(), {
    liveness: "live",
    phase: "ready",
    readiness: "not_ready",
    reason: "dependency_unavailable",
  });
  assert.equal(events.includes("postgresql.probe"), false);
  assert.equal(runtime.tryBeginWork(), undefined);

  states.postgresql = "ready";
  await runRecoveryCycle();
  assert.equal(runtime.health().readiness, "ready");
  states.redis = "unavailable";
  await runRecoveryCycle();
  assert.equal(runtime.health().readiness, "ready");
  assert.equal(events.includes("redis.connect"), false);
  assert.equal(events.includes("redis.probe"), false);
  states.redis = "ready";
  await runRecoveryCycle();
  assert.equal(runtime.health().phase, "ready");
  assert.equal(runtime.health().readiness, "ready");
  await runtime.shutdown();
});

test("bounds a startup dependency that ignores cancellation and ignores late completion", async () => {
  const pending = deferred<"ready">();
  let signal: AbortSignal | undefined;
  let probes = 0;
  const { runtime } = harness({
    startupDeadlineMs: 10,
    postgresql: {
      connect(received) {
        signal = received;
        return pending.promise;
      },
      probe() {
        probes += 1;
        return Promise.resolve("ready");
      },
      close: () => Promise.resolve(),
    },
  });
  assert.deepEqual(await withTestDeadline(runtime.start()), {
    status: "started",
    readiness: "not_ready",
  });
  assert.equal(signal?.aborted, true);
  pending.resolve("ready");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(probes, 0);
  assert.equal(runtime.health().reason, "dependency_unavailable");
  await runtime.shutdown();
});

test("shutdown cancels startup and prevents a late ready transition or monitor start", async () => {
  const entered = deferred<AbortSignal>();
  const pending = deferred<"ready">();
  const { runtime, events } = harness({
    postgresql: {
      connect(signal) {
        entered.resolve(signal);
        return pending.promise;
      },
      probe: () => Promise.resolve("ready"),
      close: () => Promise.resolve(),
    },
  });
  const starting = runtime.start();
  const signal = await withTestDeadline(entered.promise);
  await runtime.shutdown();
  assert.equal(signal.aborted, true);
  assert.deepEqual(await starting, { status: "stopped" });
  pending.resolve("ready");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(events.includes("monitor.start"), false);
  assert.equal(runtime.health().reason, "stopped");
});

test("listener failure closes the constructed owners and returns no raw cause", async () => {
  const canary = "listener-private-cause";
  const { runtime, events } = harness({
    http: {
      listen: () => Promise.reject(new Error(canary)),
      stopTraffic: () => Promise.resolve(),
    },
  });
  const result = await runtime.start();
  assert.deepEqual(result, { status: "failed" });
  assert.equal(JSON.stringify(result).includes(canary), false);
  assert.equal(events.includes("postgresql.connect"), false);
  assert.equal(events.includes("postgresql.close"), true);
  assert.equal(events.includes("redis.close"), true);
  assert.equal(events.includes("telemetry.close"), true);
  assert.equal(runtime.health().liveness, "not_live");
});

test("attempts every closure and reaches explicit force ownership on failure", async () => {
  const { runtime, events } = harness({
    postgresql: {
      connect: () => Promise.resolve("ready"),
      probe: () => Promise.resolve("ready"),
      close: () => Promise.reject(new Error("private-close-cause")),
    },
  });
  await runtime.start();
  const result = await runtime.shutdown();
  assert.equal(result.outcome, "forced");
  assert.equal(result.forceReason, "stage_failure");
  assert.equal(events.includes("redis.close"), true);
  assert.equal(events.includes("telemetry.close"), true);
  assert.equal(events.includes("force.close"), true);
  assert.equal(JSON.stringify(result).includes("private-close-cause"), false);
});

test("fails readiness closed when the recovery monitor cannot start", async () => {
  const { runtime } = harness({}, true);
  assert.deepEqual(await runtime.start(), { status: "started", readiness: "not_ready" });
  assert.equal(runtime.health().reason, "dependency_unavailable");
  assert.equal(runtime.tryBeginWork(), undefined);
  await runtime.shutdown();
});

test("binds one process signal owner and removes it after manual shutdown", async () => {
  const beforeSigint = process.listenerCount("SIGINT");
  const beforeSigterm = process.listenerCount("SIGTERM");
  const { runtime } = harness();
  const binding = runtime.bindProcessSignals();
  try {
    assert.equal(runtime.bindProcessSignals(), binding);
    assert.equal(process.listenerCount("SIGINT"), beforeSigint + 1);
    assert.equal(process.listenerCount("SIGTERM"), beforeSigterm + 1);
    await runtime.start();
    await runtime.shutdown();
    assert.equal(process.listenerCount("SIGINT"), beforeSigint);
    assert.equal(process.listenerCount("SIGTERM"), beforeSigterm);
  } finally {
    binding.dispose();
    await runtime.shutdown();
  }
});

test("keeps framework and vendor types out of the reference runtime declarations", async () => {
  const declaration = await readFile(
    new URL("../src/reference-runtime.d.ts", import.meta.url),
    "utf8",
  );
  for (const forbidden of ["express", "node:http", "pg", "@redis/", "@opentelemetry/"]) {
    assert.equal(declaration.includes(`from "${forbidden}`), false);
  }
});
