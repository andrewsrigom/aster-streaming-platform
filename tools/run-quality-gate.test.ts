import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  createQualityGateInvocation,
  QUALITY_GATE_TASKS,
  runQualityGate,
} from "./run-quality-gate.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");

test("builds full and changed invocations from one canonical task list", () => {
  const full = createQualityGateInvocation([], "linux");
  assert.equal(full.executable, "pnpm");
  assert.deepEqual(full.args, ["turbo", "run", ...QUALITY_GATE_TASKS]);
  assert.deepEqual(full.envOverrides, {});

  const changed = createQualityGateInvocation(["--changed", "--force"], "win32");
  assert.equal(changed.executable, "pnpm.cmd");
  assert.deepEqual(changed.args, ["turbo", "run", ...QUALITY_GATE_TASKS, "--affected", "--force"]);
  assert.deepEqual(changed.envOverrides, { TURBO_SCM_BASE: "main", TURBO_SCM_HEAD: "HEAD" });
});

test("rejects unknown or repeated narrowing arguments", () => {
  assert.throws(() => createQualityGateInvocation(["--filter=@aster/config"]));
  assert.throws(() => createQualityGateInvocation(["--changed", "--changed"]));
  assert.throws(() => createQualityGateInvocation(["--force", "--force"]));
});

test("propagates the selected command status and sanitizes execution failure", () => {
  const calls: Array<{ readonly args: readonly string[]; readonly env: NodeJS.ProcessEnv }> = [];
  const status = runQualityGate(
    ["--changed"],
    (_executable, args, options) => {
      calls.push({ args, env: options.env ?? {} });
      return { status: 7 };
    },
    () => assert.fail("successful spawn must not report a runner error"),
  );
  assert.equal(status, 7);
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.ok(call);
  assert.equal(call.env["TURBO_SCM_BASE"], "main");
  assert.equal(call.env["TURBO_SCM_HEAD"], "HEAD");

  const errors: string[] = [];
  assert.equal(
    runQualityGate(
      [],
      () => ({ error: new Error("secret canary"), status: null }),
      (message) => {
        errors.push(message);
      },
    ),
    1,
  );
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.includes("secret canary"), false);
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
