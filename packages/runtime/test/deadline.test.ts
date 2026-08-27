import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ASTER_DEADLINE_MAX_MS,
  ASTER_DEADLINE_MIN_MS,
  AsterDeadlineError,
  createAsterDeadline,
} from "../src/index.js";
import { createAsterDeadlineWithSchedulerForTest } from "../src/deadline.js";

class ControlledScheduler {
  canceled = false;
  delayMs: number | undefined;
  nowMs = 1_000;
  private callback: (() => void) | undefined;

  now(): number {
    return this.nowMs;
  }

  schedule(callback: () => void, delayMs: number): () => void {
    this.callback = callback;
    this.delayMs = delayMs;
    return () => {
      this.canceled = true;
      this.callback = undefined;
    };
  }

  advanceBy(milliseconds: number): void {
    this.nowMs += milliseconds;
  }

  fire(): void {
    const callback = this.callback;
    this.callback = undefined;
    callback?.();
  }
}

function captureDeadlineError(run: () => unknown): AsterDeadlineError {
  try {
    run();
  } catch (error) {
    assert.equal(error instanceof AsterDeadlineError, true);
    return error as AsterDeadlineError;
  }
  assert.fail("Expected AsterDeadlineError.");
}

test("expires at one finite monotonic budget and cancels its timer", () => {
  const scheduler = new ControlledScheduler();
  const deadline = createAsterDeadlineWithSchedulerForTest({ timeoutMs: 250 }, scheduler);

  assert.equal(Object.isFrozen(deadline), true);
  assert.equal(scheduler.delayMs, 250);
  assert.equal(deadline.remainingMs(), 250);
  assert.equal(deadline.signal.aborted, false);

  scheduler.advanceBy(249.2);
  assert.equal(deadline.remainingMs(), 1);
  scheduler.fire();

  assert.equal(deadline.signal.aborted, true);
  assert.equal(deadline.remainingMs(), 0);
  assert.equal(scheduler.canceled, true);
  assert.equal(deadline.dispose(), "unchanged");
});

test("remaining budget never increases when a scheduler clock regresses", () => {
  const scheduler = new ControlledScheduler();
  const deadline = createAsterDeadlineWithSchedulerForTest({ timeoutMs: 100 }, scheduler);

  scheduler.advanceBy(40);
  assert.equal(deadline.remainingMs(), 60);
  scheduler.advanceBy(-30);
  assert.equal(deadline.remainingMs(), 60);
  scheduler.advanceBy(130);
  assert.equal(deadline.remainingMs(), 0);
  assert.equal(deadline.signal.aborted, true);
});

test("propagates parent cancellation without copying its reason", () => {
  const scheduler = new ControlledScheduler();
  const parent = new AbortController();
  const deadline = createAsterDeadlineWithSchedulerForTest(
    { parentSignal: parent.signal, timeoutMs: 100 },
    scheduler,
  );

  parent.abort(new Error("parent-secret-never-copy"));

  assert.equal(deadline.signal.aborted, true);
  assert.equal(scheduler.canceled, true);
  assert.equal(deadline.remainingMs(), 0);
  assert.doesNotMatch(String(deadline.signal.reason), /parent-secret-never-copy/u);
});

test("an already-aborted parent creates no timer", () => {
  const scheduler = new ControlledScheduler();
  const parent = new AbortController();
  parent.abort(new Error("already-aborted-private-canary"));

  const deadline = createAsterDeadlineWithSchedulerForTest(
    { parentSignal: parent.signal, timeoutMs: 100 },
    scheduler,
  );

  assert.equal(deadline.signal.aborted, true);
  assert.equal(deadline.remainingMs(), 0);
  assert.equal(scheduler.delayMs, undefined);
  assert.doesNotMatch(String(deadline.signal.reason), /private-canary/u);
});

test("uses built-in AbortSignal operations instead of caller-owned accessors", () => {
  const scheduler = new ControlledScheduler();
  const parent = new AbortController();
  let reads = 0;
  Object.defineProperties(parent.signal, {
    aborted: {
      get(): boolean {
        reads += 1;
        return false;
      },
    },
    addEventListener: {
      get(): never {
        reads += 1;
        throw new Error("signal-method-private-canary");
      },
    },
    removeEventListener: {
      get(): never {
        reads += 1;
        throw new Error("signal-method-private-canary");
      },
    },
  });

  const deadline = createAsterDeadlineWithSchedulerForTest(
    { parentSignal: parent.signal, timeoutMs: 100 },
    scheduler,
  );
  parent.abort(new Error("parent-private-canary"));

  assert.equal(reads, 0);
  assert.equal(deadline.signal.aborted, true);
  assert.equal(scheduler.canceled, true);
  assert.doesNotMatch(String(deadline.signal.reason), /private-canary/u);
});

test("disposal is idempotent, clears resources, and does not abort completed work", () => {
  const scheduler = new ControlledScheduler();
  const parent = new AbortController();
  const deadline = createAsterDeadlineWithSchedulerForTest(
    { parentSignal: parent.signal, timeoutMs: 100 },
    scheduler,
  );

  assert.equal(deadline.dispose(), "disposed");
  assert.equal(deadline.dispose(), "unchanged");
  assert.equal(deadline.signal.aborted, false);
  assert.equal(deadline.remainingMs(), 0);
  assert.equal(scheduler.canceled, true);

  parent.abort();
  scheduler.fire();
  assert.equal(deadline.signal.aborted, false);
});

test("rejects missing, non-finite, fractional, and out-of-range timeouts", () => {
  const values = [
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    0,
    1.5,
    ASTER_DEADLINE_MIN_MS - 1,
    ASTER_DEADLINE_MAX_MS + 1,
  ];

  for (const timeoutMs of values) {
    const error = captureDeadlineError(() => {
      createAsterDeadline(
        (timeoutMs === undefined ? {} : { timeoutMs }) as { readonly timeoutMs: number },
      );
    });
    assert.deepEqual(error.issues, [
      {
        option: "timeoutMs",
        reason: timeoutMs === undefined ? "missing" : "invalid",
      },
    ]);
    assert.equal("cause" in error, false);
  }
});

test("rejects hostile option shapes without invoking accessors or reflecting values", () => {
  let reads = 0;
  const accessorOptions = {};
  Object.defineProperty(accessorOptions, "timeoutMs", {
    enumerable: true,
    get(): number {
      reads += 1;
      return 100;
    },
  });
  const throwingProxy = new Proxy(
    {},
    {
      ownKeys(): never {
        throw new Error("proxy-secret-never-reflect");
      },
    },
  );

  for (const input of [
    undefined,
    null,
    [],
    { timeoutMs: 100, unknown: "secret-never-reflect" },
    Object.assign(Object.create({ inherited: true }) as object, { timeoutMs: 100 }),
    accessorOptions,
    throwingProxy,
  ]) {
    const error = captureDeadlineError(() => {
      createAsterDeadline(input as { readonly timeoutMs: number });
    });
    assert.equal(error.issues.length, 1);
    assert.equal(error.issues[0]?.option, "<options>");
    assert.equal(JSON.stringify(error).includes("secret-never-reflect"), false);
    assert.equal("cause" in error, false);
  }
  assert.equal(reads, 0);
});

test("accepts only a real optional AbortSignal", () => {
  for (const parentSignal of [null, {}, { aborted: false }, new EventTarget()]) {
    const error = captureDeadlineError(() => {
      createAsterDeadline({ parentSignal: parentSignal as AbortSignal, timeoutMs: 100 });
    });
    assert.deepEqual(error.issues, [{ option: "parentSignal", reason: "invalid" }]);
  }
});

test("fails closed with a cause-free runtime issue when scheduling fails", () => {
  const error = captureDeadlineError(() => {
    createAsterDeadlineWithSchedulerForTest(
      { timeoutMs: 100 },
      {
        now: () => 0,
        schedule(): never {
          throw new Error("scheduler-secret-never-reflect");
        },
      },
    );
  });

  assert.deepEqual(error.issues, [{ option: "<runtime>", reason: "internal" }]);
  assert.equal(JSON.stringify(error).includes("scheduler-secret-never-reflect"), false);
  assert.equal("cause" in error, false);
});

test("cleans a timer even when an injected scheduler expires synchronously", () => {
  let cancellationCalls = 0;
  const deadline = createAsterDeadlineWithSchedulerForTest(
    { timeoutMs: 100 },
    {
      now: () => 0,
      schedule(callback): () => void {
        callback();
        return () => {
          cancellationCalls += 1;
        };
      },
    },
  );

  assert.equal(deadline.signal.aborted, true);
  assert.equal(deadline.remainingMs(), 0);
  assert.equal(cancellationCalls, 1);
});

test("rejects an invalid scheduler cancellation without reflecting it", () => {
  const error = captureDeadlineError(() => {
    createAsterDeadlineWithSchedulerForTest(
      { timeoutMs: 100 },
      {
        now: () => 0,
        schedule: (() => "scheduler-private-canary") as unknown as (
          callback: () => void,
          delayMs: number,
        ) => () => void,
      },
    );
  });

  assert.deepEqual(error.issues, [{ option: "<runtime>", reason: "internal" }]);
  assert.equal(JSON.stringify(error).includes("scheduler-private-canary"), false);
  assert.equal("cause" in error, false);
});

test("a runtime clock failure after creation aborts and returns zero remaining budget", () => {
  let reads = 0;
  const scheduler = new ControlledScheduler();
  const deadline = createAsterDeadlineWithSchedulerForTest(
    { timeoutMs: 100 },
    {
      now(): number {
        reads += 1;
        if (reads > 1) {
          throw new Error("clock-secret-never-reflect");
        }
        return scheduler.now();
      },
      schedule: scheduler.schedule.bind(scheduler),
    },
  );

  assert.equal(deadline.remainingMs(), 0);
  assert.equal(deadline.signal.aborted, true);
  assert.equal(scheduler.canceled, true);
});

test("the default scheduler expires a real deadline", async () => {
  const deadline = createAsterDeadline({ timeoutMs: 10 });
  await new Promise<void>((resolve) => {
    deadline.signal.addEventListener(
      "abort",
      () => {
        resolve();
      },
      { once: true },
    );
  });

  assert.equal(deadline.signal.aborted, true);
  assert.equal(deadline.remainingMs(), 0);
});

test("the default deadline timer does not keep a process alive", { timeout: 5_000 }, async () => {
  const fixture = fileURLToPath(new URL("./fixtures/deadline-unref-fixture.js", import.meta.url));
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
  assert.equal(stdout, "CREATED\n");
  assert.equal(stderr, "");
});

test("deadline declarations contain only repository-owned and Node.js platform contracts", async () => {
  const declaration = await readFile(new URL("../src/deadline.d.ts", import.meta.url), "utf8");
  const publicContract = declaration.toLowerCase();

  for (const prohibited of [
    "apollo",
    "express",
    "fastify",
    "kafkajs",
    "pg",
    "pino",
    "redis",
    "@aws-sdk",
  ]) {
    assert.equal(publicContract.includes(prohibited), false, prohibited);
  }
});
