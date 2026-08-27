import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  ASTER_READINESS_MONITOR_INTERVAL_MAX_MS,
  ASTER_READINESS_MONITOR_INTERVAL_MIN_MS,
  ASTER_READINESS_MONITOR_PROBE_TIMEOUT_MAX_MS,
  AsterReadinessMonitorError,
  createAsterReadinessController,
  createAsterReadinessMonitor,
  createAsterServiceLifecycle,
  type AsterReadinessMonitorOptions,
  type AsterReadinessProbe,
} from "../src/index.js";
import { createAsterReadinessMonitorWithRuntime } from "../src/readiness-monitor.js";

interface ScheduledTask {
  readonly callback: () => void;
  canceled: boolean;
  readonly delayMs: number;
  fired: boolean;
}

class ControlledRuntime {
  readonly tasks: ScheduledTask[] = [];
  randomValue = 0.5;
  scheduleCalls = 0;
  throwOnScheduleCall: number | undefined;

  random(): number {
    return this.randomValue;
  }

  schedule(callback: () => void, delayMs: number): () => void {
    this.scheduleCalls += 1;
    if (this.scheduleCalls === this.throwOnScheduleCall) {
      throw new Error("private-scheduler-detail");
    }
    const task: ScheduledTask = { callback, canceled: false, delayMs, fired: false };
    this.tasks.push(task);
    return () => {
      task.canceled = true;
    };
  }

  activeTasks(): ScheduledTask[] {
    return this.tasks.filter((task) => !task.canceled && !task.fired);
  }

  fire(task: ScheduledTask): void {
    assert.equal(task.canceled, false);
    assert.equal(task.fired, false);
    task.fired = true;
    task.callback();
  }
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return {
    promise,
    resolve(value: T): void {
      resolve?.(value);
    },
  };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function firstActiveTask(runtime: ControlledRuntime): ScheduledTask {
  const task = runtime.activeTasks()[0];
  assert.ok(task);
  return task;
}

function runtimeOptions(
  probes: readonly AsterReadinessProbe[],
  overrides: Partial<AsterReadinessMonitorOptions> = {},
): AsterReadinessMonitorOptions {
  return {
    intervalMs: 1_000,
    probeTimeoutMs: 100,
    probes,
    readiness: {
      setCriticalDependencyState: () => "applied",
    },
    ...overrides,
  };
}

function captureMonitorError(input: unknown): AsterReadinessMonitorError {
  try {
    createAsterReadinessMonitor(input as AsterReadinessMonitorOptions);
  } catch (error) {
    assert.equal(error instanceof AsterReadinessMonitorError, true);
    return error as AsterReadinessMonitorError;
  }
  assert.fail("Expected readiness monitor initialization to fail");
}

function createReadyRuntime(dependencyCount: number) {
  const lifecycle = createAsterServiceLifecycle({
    forceClose: () => undefined,
    stopTraffic: () => Promise.resolve(),
  });
  const readiness = createAsterReadinessController({
    criticalDependencyCount: dependencyCount,
    lifecycle,
  });
  for (let index = 0; index < dependencyCount; index += 1) {
    readiness.setCriticalDependencyState(index, "ready");
  }
  lifecycle.markReady();
  return { lifecycle, readiness };
}

test("rejects unbounded, accessor-backed, sparse, and malformed monitor options", () => {
  const probe: AsterReadinessProbe = () => Promise.resolve("ready");
  assert.deepEqual(captureMonitorError(undefined).issues, [
    { option: "<options>", reason: "invalid" },
  ]);
  assert.deepEqual(captureMonitorError({}).issues, [{ option: "intervalMs", reason: "missing" }]);

  for (const intervalMs of [
    ASTER_READINESS_MONITOR_INTERVAL_MIN_MS - 1,
    ASTER_READINESS_MONITOR_INTERVAL_MAX_MS + 1,
    100.5,
  ]) {
    assert.deepEqual(captureMonitorError(runtimeOptions([probe], { intervalMs })).issues, [
      { option: "intervalMs", reason: "invalid" },
    ]);
  }
  for (const probeTimeoutMs of [0, 1_001, ASTER_READINESS_MONITOR_PROBE_TIMEOUT_MAX_MS + 1]) {
    assert.deepEqual(captureMonitorError(runtimeOptions([probe], { probeTimeoutMs })).issues, [
      { option: "probeTimeoutMs", reason: "invalid" },
    ]);
  }
  assert.deepEqual(captureMonitorError(runtimeOptions([])).issues, [
    { option: "probes", reason: "invalid" },
  ]);
  const sparse = Array<AsterReadinessProbe>(2);
  sparse[1] = probe;
  assert.deepEqual(captureMonitorError(runtimeOptions(sparse)).issues, [
    { option: "probes", reason: "invalid" },
  ]);
  let probeGetterReads = 0;
  const accessorProbes = [probe];
  Object.defineProperty(accessorProbes, "0", {
    enumerable: true,
    get(): AsterReadinessProbe {
      probeGetterReads += 1;
      return probe;
    },
  });
  assert.deepEqual(captureMonitorError(runtimeOptions(accessorProbes)).issues, [
    { option: "probes", reason: "invalid" },
  ]);
  assert.equal(probeGetterReads, 0);

  let proxyReads = 0;
  const proxiedProbes = new Proxy([probe], {
    get(): never {
      proxyReads += 1;
      throw new Error("array-values-must-not-be-read");
    },
  });
  createAsterReadinessMonitor(runtimeOptions(proxiedProbes));
  assert.equal(proxyReads, 0);

  let getterReads = 0;
  const readiness = {};
  Object.defineProperty(readiness, "setCriticalDependencyState", {
    enumerable: true,
    get(): () => string {
      getterReads += 1;
      return () => "applied";
    },
  });
  assert.deepEqual(
    captureMonitorError(
      runtimeOptions([probe], {
        readiness: readiness as unknown as AsterReadinessMonitorOptions["readiness"],
      }),
    ).issues,
    [{ option: "readiness", reason: "invalid" }],
  );
  assert.equal(getterReads, 0);
});

test("runs one sequential jittered cycle and publishes only stable outcomes", async () => {
  const runtime = new ControlledRuntime();
  const calls: number[] = [];
  const transitions: Array<readonly [number, string]> = [];
  const signals: AbortSignal[] = [];
  const probes: readonly AsterReadinessProbe[] = [
    (signal) => {
      calls.push(0);
      signals.push(signal);
      return Promise.resolve("ready");
    },
    (signal) => {
      calls.push(1);
      signals.push(signal);
      return Promise.resolve("unavailable");
    },
  ];
  const monitor = createAsterReadinessMonitorWithRuntime(
    runtimeOptions(probes, {
      readiness: {
        setCriticalDependencyState(index, state) {
          transitions.push([index, state]);
          return "applied";
        },
      },
    }),
    runtime,
  );

  assert.equal(monitor.start(), "started");
  assert.equal(monitor.start(), "unchanged");
  assert.equal(runtime.activeTasks().length, 1);
  assert.equal(runtime.activeTasks()[0]?.delayMs, 1_000);
  runtime.fire(firstActiveTask(runtime));
  await flushAsyncWork();

  assert.deepEqual(calls, [0, 1]);
  assert.equal(new Set(signals).size, 1);
  assert.deepEqual(transitions, [
    [0, "ready"],
    [1, "unavailable"],
  ]);
  assert.deepEqual(
    runtime.activeTasks().map((task) => task.delayMs),
    [1_000],
  );
  assert.equal(await monitor.stop(), "stopped");
  assert.equal(runtime.activeTasks().length, 0);
  assert.equal(await monitor.stop(), "unchanged");
  assert.equal(monitor.start(), "rejected");
});

test("never overlaps cycles and invokes each declared probe at most once per cycle", async () => {
  const runtime = new ControlledRuntime();
  const first = deferred<"ready">();
  const calls: number[] = [];
  const monitor = createAsterReadinessMonitorWithRuntime(
    runtimeOptions([
      () => {
        calls.push(0);
        return first.promise;
      },
      () => {
        calls.push(1);
        return Promise.resolve("ready");
      },
    ]),
    runtime,
  );

  monitor.start();
  runtime.fire(firstActiveTask(runtime));
  await flushAsyncWork();
  assert.deepEqual(calls, [0]);
  assert.deepEqual(
    runtime.activeTasks().map((task) => task.delayMs),
    [100],
  );
  assert.equal(monitor.start(), "unchanged");

  first.resolve("ready");
  await flushAsyncWork();
  assert.deepEqual(calls, [0, 1]);
  assert.deepEqual(
    runtime.activeTasks().map((task) => task.delayMs),
    [1_000],
  );
  await monitor.stop();
});

test("times out a cycle, fails remaining gates closed, and ignores late completion", async () => {
  const runtime = new ControlledRuntime();
  const late = deferred<"ready">();
  const { readiness } = createReadyRuntime(2);
  let secondProbeCalls = 0;
  const monitor = createAsterReadinessMonitorWithRuntime(
    runtimeOptions(
      [
        () => late.promise,
        () => {
          secondProbeCalls += 1;
          return Promise.resolve("ready");
        },
      ],
      { readiness },
    ),
    runtime,
  );

  monitor.start();
  runtime.fire(firstActiveTask(runtime));
  await flushAsyncWork();
  const deadlineTask = runtime.activeTasks().find((task) => task.delayMs === 100);
  assert.ok(deadlineTask);
  runtime.fire(deadlineTask);
  await flushAsyncWork();

  assert.equal(readiness.health().reason, "dependency_unavailable");
  assert.equal(secondProbeCalls, 0);
  late.resolve("ready");
  await flushAsyncWork();
  assert.equal(readiness.health().reason, "dependency_unavailable");
  await monitor.stop();
});

test("stop aborts an active cycle, waits for monitor ownership, and prevents late recovery", async () => {
  const runtime = new ControlledRuntime();
  const late = deferred<"unavailable">();
  const { readiness } = createReadyRuntime(1);
  let probeSignal: AbortSignal | undefined;
  const monitor = createAsterReadinessMonitorWithRuntime(
    runtimeOptions(
      [
        (signal) => {
          probeSignal = signal;
          return late.promise;
        },
      ],
      { readiness },
    ),
    runtime,
  );

  monitor.start();
  runtime.fire(firstActiveTask(runtime));
  await flushAsyncWork();
  assert.ok(probeSignal);
  assert.equal(probeSignal.aborted, false);
  assert.equal(await monitor.stop(), "stopped");
  assert.equal(probeSignal.aborted, true);
  assert.equal(runtime.activeTasks().length, 0);
  assert.equal(readiness.health().readiness, "ready");

  late.resolve("unavailable");
  await flushAsyncWork();
  assert.equal(readiness.health().readiness, "ready");
});

test("scheduler and random failures stop the monitor and fail readiness closed", async () => {
  const probe: AsterReadinessProbe = () => Promise.resolve("ready");

  const scheduleRuntime = new ControlledRuntime();
  scheduleRuntime.throwOnScheduleCall = 1;
  const scheduleReady = createReadyRuntime(1).readiness;
  const scheduleMonitor = createAsterReadinessMonitorWithRuntime(
    runtimeOptions([probe], { readiness: scheduleReady }),
    scheduleRuntime,
  );
  assert.equal(scheduleMonitor.start(), "rejected");
  assert.equal(scheduleReady.health().reason, "dependency_unavailable");

  const deadlineRuntime = new ControlledRuntime();
  deadlineRuntime.throwOnScheduleCall = 2;
  const deadlineReady = createReadyRuntime(1).readiness;
  const deadlineMonitor = createAsterReadinessMonitorWithRuntime(
    runtimeOptions([probe], { readiness: deadlineReady }),
    deadlineRuntime,
  );
  assert.equal(deadlineMonitor.start(), "started");
  deadlineRuntime.fire(firstActiveTask(deadlineRuntime));
  await flushAsyncWork();
  assert.equal(deadlineReady.health().reason, "dependency_unavailable");
  assert.equal(deadlineRuntime.activeTasks().length, 0);
  assert.equal(await deadlineMonitor.stop(), "unchanged");

  const randomRuntime = new ControlledRuntime();
  randomRuntime.randomValue = Number.NaN;
  const randomReady = createReadyRuntime(1).readiness;
  const randomMonitor = createAsterReadinessMonitorWithRuntime(
    runtimeOptions([probe], { readiness: randomReady }),
    randomRuntime,
  );
  assert.equal(randomMonitor.start(), "rejected");
  assert.equal(randomReady.health().reason, "dependency_unavailable");

  const synchronousReady = createReadyRuntime(1).readiness;
  const synchronousMonitor = createAsterReadinessMonitorWithRuntime(
    runtimeOptions([probe], { readiness: synchronousReady }),
    {
      random: () => 0.5,
      schedule(callback) {
        callback();
        return () => undefined;
      },
    },
  );
  assert.equal(synchronousMonitor.start(), "rejected");
  await flushAsyncWork();
  assert.equal(synchronousReady.health().reason, "dependency_unavailable");
});

test("maps thrown and malformed probe outcomes to unavailable without skipping later probes", async () => {
  const runtime = new ControlledRuntime();
  const transitions: Array<readonly [number, string]> = [];
  let laterCalls = 0;
  const monitor = createAsterReadinessMonitorWithRuntime(
    runtimeOptions(
      [
        () => Promise.reject(new Error("private-probe-detail")),
        () => Promise.resolve("malformed" as "ready"),
        () => {
          laterCalls += 1;
          return Promise.resolve("ready");
        },
      ],
      {
        readiness: {
          setCriticalDependencyState(index, state) {
            transitions.push([index, state]);
            return "applied";
          },
        },
      },
    ),
    runtime,
  );

  monitor.start();
  runtime.fire(firstActiveTask(runtime));
  await flushAsyncWork();
  assert.deepEqual(transitions, [
    [0, "unavailable"],
    [1, "unavailable"],
    [2, "ready"],
  ]);
  assert.equal(laterCalls, 1);
  assert.doesNotMatch(JSON.stringify(transitions), /private-probe-detail/u);
  await monitor.stop();
});

test("the default monitor timer does not keep a process alive", { timeout: 5_000 }, async () => {
  const fixture = fileURLToPath(
    new URL("./fixtures/readiness-monitor-unref-fixture.js", import.meta.url),
  );
  const child = spawn(process.execPath, [fixture], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const forceKill = setTimeout(() => {
    child.kill("SIGKILL");
  }, 2_000);
  const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        resolve({ code, signal });
      });
    },
  );
  clearTimeout(forceKill);

  assert.deepEqual(exit, { code: 0, signal: null });
  assert.equal(stdout, "STARTED\n");
  assert.equal(stderr, "");
});

test("monitor declarations contain only repository-owned runtime contracts", async () => {
  const declaration = await readFile(
    new URL("../src/readiness-monitor.d.ts", import.meta.url),
    "utf8",
  );
  const publicContract = declaration.toLowerCase();
  for (const prohibited of ["express", "fastify", "kafkajs", "pg", "pino", "redis", "@aws-sdk"]) {
    assert.equal(publicContract.includes(prohibited), false, prohibited);
  }
});
