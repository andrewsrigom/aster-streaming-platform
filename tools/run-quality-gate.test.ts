import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  createQualityGateInvocation,
  QUALITY_GATE_TASKS,
  runQualityGate,
  terminateQualityGateProcessTree,
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

test("keeps manifest commands and task-level affected inputs aligned", async () => {
  const manifest = JSON.parse(await readFile(resolve(repositoryRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const turbo = JSON.parse(await readFile(resolve(repositoryRoot, "turbo.json"), "utf8")) as {
    futureFlags: { affectedUsingTaskInputs: boolean };
    tasks: Record<string, { inputs?: string[] }>;
  };

  assert.equal(manifest.scripts["check"], "node ./tools/run-quality-gate.ts");
  assert.equal(manifest.scripts["check:changed"], "node ./tools/run-quality-gate.ts --changed");
  assert.ok(manifest.scripts["toolchain:test"]?.includes("./tools/run-quality-gate.test.ts"));
  assert.equal(turbo.futureFlags.affectedUsingTaskInputs, true);

  const lintInputs = turbo.tasks["//#lint"]?.inputs ?? [];
  for (const path of ["apps/**", "packages/**", "services/**", "workers/**"]) {
    assert.ok(lintInputs.includes(path));
  }
  assert.ok(turbo.tasks["//#format:check"]?.inputs?.includes("**/*.md"));
  assert.deepEqual(turbo.tasks["//#security:check"]?.inputs, ["**/*"]);
});
