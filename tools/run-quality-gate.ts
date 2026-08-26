import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const QUALITY_GATE_TIMEOUT_MS = 15 * 60 * 1_000;
const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const QUALITY_GATE_TASKS = Object.freeze([
  "build",
  "test",
  "toolchain:check",
  "toolchain:test",
  "typecheck",
  "lint",
  "format:check",
  "unused:check",
  "architecture:check",
  "architecture:test",
  "platform:check",
  "platform:test",
  "docs:check",
  "docs:test",
  "ai:check",
  "ai:test",
  "community:check",
  "community:test",
  "security:check",
  "security:test",
  "ci:check",
  "ci:test",
  "staged:test",
  "commit:test",
] as const);

interface SpawnResult {
  readonly error?: Error;
  readonly status: number | null;
}

type SpawnQualityGate = (
  executable: string,
  args: readonly string[],
  options: SpawnSyncOptions,
) => SpawnResult;

export interface QualityGateInvocation {
  readonly args: readonly string[];
  readonly changed: boolean;
  readonly envOverrides: Readonly<Record<string, string>>;
  readonly executable: "cmd.exe" | "pnpm";
}

export function createQualityGateInvocation(
  input: readonly string[],
  platform = process.platform,
): QualityGateInvocation {
  let changed = false;
  let force = false;
  for (const argument of input) {
    if (argument === "--changed" && !changed) {
      changed = true;
      continue;
    }
    if (argument === "--force" && !force) {
      force = true;
      continue;
    }
    throw new Error("quality gate accepts only one --changed and one --force flag");
  }

  const turboArgs = ["turbo", "run", ...QUALITY_GATE_TASKS];
  if (changed) {
    turboArgs.push("--affected");
  }
  if (force) {
    turboArgs.push("--force");
  }

  const windows = platform === "win32";
  const args = windows ? ["/d", "/s", "/c", "pnpm.cmd", ...turboArgs] : turboArgs;

  return Object.freeze({
    args: Object.freeze(args),
    changed,
    envOverrides: changed
      ? Object.freeze({ TURBO_SCM_BASE: "main", TURBO_SCM_HEAD: "HEAD" })
      : Object.freeze({}),
    executable: windows ? "cmd.exe" : "pnpm",
  });
}

export function runQualityGate(
  input = process.argv.slice(2),
  spawn: SpawnQualityGate = spawnSync,
  reportError: (message: string) => void = console.error,
): number {
  let invocation: QualityGateInvocation;
  try {
    invocation = createQualityGateInvocation(input);
  } catch {
    reportError(
      JSON.stringify({ check: "quality-gate", reason: "invalid_arguments", status: "error" }),
    );
    return 2;
  }

  const result = spawn(invocation.executable, invocation.args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...invocation.envOverrides },
    stdio: "inherit",
    timeout: QUALITY_GATE_TIMEOUT_MS,
    windowsHide: true,
  });
  if (result.error || result.status === null) {
    reportError(
      JSON.stringify({ check: "quality-gate", reason: "execution_failed", status: "error" }),
    );
    return 1;
  }
  return result.status;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  process.exitCode = runQualityGate();
}
