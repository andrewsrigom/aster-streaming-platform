import { spawn, spawnSync, type SpawnOptions, type SpawnSyncOptions } from "node:child_process";
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

interface QualityGateProcess {
  readonly pid: number | undefined;
  onClose(listener: (code: number | null) => void): void;
  onError(listener: (error: Error) => void): void;
}

type StartQualityGate = (
  executable: string,
  args: readonly string[],
  options: SpawnOptions,
) => QualityGateProcess;

type TerminateQualityGate = (pid: number | undefined) => boolean;

interface TaskkillResult {
  readonly error?: Error;
  readonly status: number | null;
}

type RunTaskkill = (
  executable: string,
  args: readonly string[],
  options: SpawnSyncOptions,
) => TaskkillResult;

function startQualityGate(
  executable: string,
  args: readonly string[],
  options: SpawnOptions,
): QualityGateProcess {
  const child = spawn(executable, args, options);
  return {
    pid: child.pid,
    onClose(listener) {
      child.once("close", listener);
    },
    onError(listener) {
      child.once("error", listener);
    },
  };
}

export function terminateQualityGateProcessTree(
  pid: number | undefined,
  platform = process.platform,
  killGroup: (pid: number, signal: NodeJS.Signals) => boolean = (groupPid, signal) =>
    process.kill(groupPid, signal),
  runTaskkill: RunTaskkill = (executable, args, options) => spawnSync(executable, args, options),
): boolean {
  if (!pid || !Number.isSafeInteger(pid) || pid <= 0) {
    return false;
  }
  if (platform === "win32") {
    const result = runTaskkill("taskkill.exe", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
      timeout: 10_000,
      windowsHide: true,
    } satisfies SpawnSyncOptions);
    return !result.error && result.status === 0;
  }
  try {
    return killGroup(-pid, "SIGKILL");
  } catch {
    return false;
  }
}

export interface QualityGateInvocation {
  readonly args: readonly string[];
  readonly changed: boolean;
  readonly detached: boolean;
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
    detached: !windows,
    envOverrides: changed
      ? Object.freeze({ TURBO_SCM_BASE: "main", TURBO_SCM_HEAD: "HEAD" })
      : Object.freeze({}),
    executable: windows ? "cmd.exe" : "pnpm",
  });
}

export async function runQualityGate(
  input = process.argv.slice(2),
  start: StartQualityGate = startQualityGate,
  reportError: (message: string) => void = console.error,
  terminate: TerminateQualityGate = (pid) => terminateQualityGateProcessTree(pid),
  timeoutMs = QUALITY_GATE_TIMEOUT_MS,
): Promise<number> {
  let invocation: QualityGateInvocation;
  try {
    invocation = createQualityGateInvocation(input);
  } catch {
    reportError(
      JSON.stringify({ check: "quality-gate", reason: "invalid_arguments", status: "error" }),
    );
    return 2;
  }

  let child: QualityGateProcess;
  try {
    child = start(invocation.executable, invocation.args, {
      cwd: repositoryRoot,
      detached: invocation.detached,
      env: { ...process.env, ...invocation.envOverrides },
      stdio: "inherit",
      windowsHide: true,
    });
  } catch {
    reportError(
      JSON.stringify({ check: "quality-gate", reason: "execution_failed", status: "error" }),
    );
    return 1;
  }

  return await new Promise<number>((resolveStatus) => {
    let fallback: NodeJS.Timeout | undefined;
    let settled = false;
    let timedOut = false;
    const finish = (status: number, reason?: "execution_failed" | "timeout") => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (fallback) {
        clearTimeout(fallback);
      }
      if (reason) {
        reportError(JSON.stringify({ check: "quality-gate", reason, status: "error" }));
      }
      resolveStatus(status);
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      if (!terminate(child.pid)) {
        finish(1, "execution_failed");
        return;
      }
      fallback = setTimeout(() => {
        finish(1, "timeout");
      }, 5_000);
    }, timeoutMs);

    child.onError(() => {
      finish(1, "execution_failed");
    });
    child.onClose((code) => {
      if (timedOut) {
        finish(1, "timeout");
        return;
      }
      if (code === null) {
        finish(1, "execution_failed");
        return;
      }
      finish(code);
    });
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  process.exitCode = await runQualityGate();
}
