import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  createQualityGateInvocation,
  QUALITY_GATE_TASKS,
  requestQualityGateProcessTreeTermination,
  runQualityGate,
  terminateQualityGateProcessTree,
  type QualityGateSignal,
  type QualityGateSignalSource,
} from "./run-quality-gate.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");

test("builds full and changed invocations from one canonical task list", () => {
  const full = createQualityGateInvocation([], "linux");
  assert.equal(full.executable, "pnpm");
  assert.equal(full.detached, true);
  assert.deepEqual(full.args, ["turbo", "run", ...QUALITY_GATE_TASKS]);
  assert.deepEqual(full.envOverrides, {});

  const changed = createQualityGateInvocation(["--changed", "--force"], "win32");
  assert.equal(changed.executable, "cmd.exe");
  assert.equal(changed.detached, false);
  assert.deepEqual(changed.args, [
    "/d",
    "/s",
    "/c",
    "pnpm.cmd",
    "turbo",
    "run",
    ...QUALITY_GATE_TASKS,
    "--affected",
    "--force",
  ]);
  assert.deepEqual(changed.envOverrides, { TURBO_SCM_BASE: "main", TURBO_SCM_HEAD: "HEAD" });
});

test("rejects unknown or repeated narrowing arguments", () => {
  assert.throws(() => createQualityGateInvocation(["--filter=@aster/config"]));
  assert.throws(() => createQualityGateInvocation(["--changed", "--changed"]));
  assert.throws(() => createQualityGateInvocation(["--force", "--force"]));
});

interface FakeQualityGateProcess {
  readonly pid: number;
  emitClose(code: number | null): void;
  emitError(error: Error): void;
  onClose(listener: (code: number | null) => void): void;
  onError(listener: (error: Error) => void): void;
}

function fakeQualityGateProcess(pid = 42): FakeQualityGateProcess {
  let closeListener: ((code: number | null) => void) | undefined;
  let errorListener: ((error: Error) => void) | undefined;
  return {
    pid,
    emitClose(code) {
      closeListener?.(code);
    },
    emitError(error) {
      errorListener?.(error);
    },
    onClose(listener) {
      closeListener = listener;
    },
    onError(listener) {
      errorListener = listener;
    },
  };
}

function fakeQualityGateSignalSource(): {
  readonly emit: (signal: QualityGateSignal) => void;
  readonly listenerCount: (signal: QualityGateSignal) => number;
  readonly source: QualityGateSignalSource;
} {
  const listeners: Record<QualityGateSignal, Set<() => void>> = {
    SIGINT: new Set(),
    SIGTERM: new Set(),
  };
  return {
    emit(signal) {
      for (const listener of [...listeners[signal]]) {
        listener();
      }
    },
    listenerCount(signal) {
      return listeners[signal].size;
    },
    source: {
      on(signal, listener) {
        listeners[signal].add(listener);
      },
      off(signal, listener) {
        listeners[signal].delete(listener);
      },
    },
  };
}

test("propagates the selected command status and sanitizes execution failure", async () => {
  const calls: Array<{ readonly args: readonly string[]; readonly env: NodeJS.ProcessEnv }> = [];
  const successfulChild = fakeQualityGateProcess();
  const statusPromise = runQualityGate(
    ["--changed"],
    (_executable, args, options) => {
      calls.push({ args, env: options.env ?? {} });
      queueMicrotask(() => {
        successfulChild.emitClose(7);
      });
      return successfulChild;
    },
    () => {
      assert.fail("successful spawn must not report a runner error");
    },
  );
  assert.equal(await statusPromise, 7);
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.ok(call);
  assert.equal(call.env["TURBO_SCM_BASE"], "main");
  assert.equal(call.env["TURBO_SCM_HEAD"], "HEAD");

  const errors: string[] = [];
  const failedChild = fakeQualityGateProcess();
  assert.equal(
    await runQualityGate(
      [],
      () => {
        queueMicrotask(() => {
          failedChild.emitError(new Error("secret canary"));
        });
        return failedChild;
      },
      (message) => {
        errors.push(message);
      },
    ),
    1,
  );
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.includes("secret canary"), false);
});

test("terminates the isolated process tree on timeout", async () => {
  const posixSignals: Array<{ readonly pid: number; readonly signal: NodeJS.Signals }> = [];
  assert.equal(
    terminateQualityGateProcessTree(42, "linux", (pid, signal) => {
      posixSignals.push({ pid, signal });
      return true;
    }),
    true,
  );
  assert.deepEqual(posixSignals, [{ pid: -42, signal: "SIGKILL" }]);

  const taskkillCalls: Array<{ readonly args: readonly string[]; readonly executable: string }> =
    [];
  assert.equal(
    terminateQualityGateProcessTree(
      84,
      "win32",
      () => {
        assert.fail("Windows termination must not use POSIX group signals");
      },
      (executable, args) => {
        taskkillCalls.push({ args, executable });
        return { status: 0 };
      },
    ),
    true,
  );
  assert.deepEqual(taskkillCalls, [
    { args: ["/pid", "84", "/t", "/f"], executable: "taskkill.exe" },
  ]);

  const timedOutChild = fakeQualityGateProcess(126);
  const errors: string[] = [];
  let terminatedPid: number | undefined;
  assert.equal(
    await runQualityGate(
      [],
      () => timedOutChild,
      (message) => {
        errors.push(message);
      },
      (pid) => {
        terminatedPid = pid;
        queueMicrotask(() => {
          timedOutChild.emitClose(null);
        });
        return true;
      },
      1,
    ),
    1,
  );
  assert.equal(terminatedPid, 126);
  assert.deepEqual(errors, [
    JSON.stringify({ check: "quality-gate", reason: "timeout", status: "error" }),
  ]);
});

test("requests graceful process-tree termination before the force fallback", () => {
  const posixSignals: Array<{ readonly pid: number; readonly signal: NodeJS.Signals }> = [];
  assert.equal(
    requestQualityGateProcessTreeTermination(42, "SIGTERM", "linux", (pid, signal) => {
      posixSignals.push({ pid, signal });
      return true;
    }),
    true,
  );
  assert.deepEqual(posixSignals, [{ pid: -42, signal: "SIGTERM" }]);

  const taskkillCalls: Array<{ readonly args: readonly string[]; readonly executable: string }> =
    [];
  assert.equal(
    requestQualityGateProcessTreeTermination(
      84,
      "SIGINT",
      "win32",
      () => {
        assert.fail("Windows termination must not use POSIX group signals");
      },
      (executable, args) => {
        taskkillCalls.push({ args, executable });
        return { status: 0 };
      },
    ),
    true,
  );
  assert.deepEqual(taskkillCalls, [{ args: ["/pid", "84", "/t"], executable: "taskkill.exe" }]);
});

test("terminates the isolated process tree when the wrapper receives a signal", async () => {
  for (const [signal, expectedStatus] of [
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ] as const) {
    const child = fakeQualityGateProcess(252);
    const signals = fakeQualityGateSignalSource();
    const errors: string[] = [];
    const gracefulRequests: Array<{
      readonly pid: number | undefined;
      readonly signal: QualityGateSignal;
    }> = [];
    const statusPromise = runQualityGate(
      [],
      () => child,
      (message) => {
        errors.push(message);
      },
      (pid) => {
        assert.fail(`graceful close must not force process ${String(pid)}`);
      },
      60_000,
      signals.source,
      (pid, requestedSignal) => {
        gracefulRequests.push({ pid, signal: requestedSignal });
        queueMicrotask(() => {
          child.emitClose(null);
        });
        return true;
      },
    );

    assert.equal(signals.listenerCount(signal), 1);
    signals.emit(signal);

    assert.equal(await statusPromise, expectedStatus);
    assert.deepEqual(gracefulRequests, [{ pid: 252, signal }]);
    assert.deepEqual(errors, [
      JSON.stringify({ check: "quality-gate", reason: "interrupted", status: "error" }),
    ]);
    assert.equal(signals.listenerCount("SIGINT"), 0);
    assert.equal(signals.listenerCount("SIGTERM"), 0);
  }
});

test("force-kills an interrupted gate only after its graceful window", async () => {
  const child = fakeQualityGateProcess(504);
  const signals = fakeQualityGateSignalSource();
  const calls: string[] = [];
  const statusPromise = runQualityGate(
    [],
    () => child,
    () => {},
    (pid) => {
      calls.push(`force:${String(pid)}`);
      queueMicrotask(() => {
        child.emitClose(null);
      });
      return true;
    },
    60_000,
    signals.source,
    (pid, signal) => {
      calls.push(`graceful:${String(pid)}:${signal}`);
      return true;
    },
    1,
  );

  signals.emit("SIGTERM");

  assert.equal(await statusPromise, 143);
  assert.deepEqual(calls, ["graceful:504:SIGTERM", "force:504"]);
});

test("keeps manifest commands and task-level affected inputs aligned", async () => {
  const manifest = JSON.parse(await readFile(resolve(repositoryRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const turbo = JSON.parse(await readFile(resolve(repositoryRoot, "turbo.json"), "utf8")) as {
    futureFlags: { affectedUsingTaskInputs: boolean };
    tasks: Record<string, { dependsOn?: string[]; inputs?: string[] }>;
  };

  assert.equal(manifest.scripts["check"], "node ./tools/run-quality-gate.ts");
  assert.equal(manifest.scripts["check:changed"], "node ./tools/run-quality-gate.ts --changed");
  assert.equal(
    manifest.scripts["lint"],
    "turbo run build --filter=@aster/telemetry && pnpm lint:workspace",
  );
  assert.equal(manifest.scripts["lint:workspace"], "eslint .");
  assert.ok(manifest.scripts["toolchain:test"]?.includes("./tools/run-quality-gate.test.ts"));
  assert.equal(turbo.futureFlags.affectedUsingTaskInputs, true);

  const lintTask = turbo.tasks["//#lint:workspace"];
  assert.ok(lintTask);
  assert.deepEqual(lintTask.dependsOn, ["@aster/telemetry#build"]);
  assert.deepEqual(turbo.tasks["typecheck"]?.dependsOn, ["^build", "^typecheck"]);
  const lintInputs = lintTask.inputs ?? [];
  for (const path of ["apps/**", "packages/**", "services/**", "workers/**"]) {
    assert.ok(lintInputs.includes(path));
  }
  assert.ok(turbo.tasks["//#format:check"]?.inputs?.includes("**/*.md"));
  assert.deepEqual(turbo.tasks["//#docs:check"]?.inputs, ["**/*"]);
  assert.deepEqual(turbo.tasks["//#community:check"]?.inputs, ["**/*"]);
  assert.deepEqual(turbo.tasks["//#security:check"]?.inputs, ["**/*"]);
});
