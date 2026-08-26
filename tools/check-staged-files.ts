import { spawnSync } from "node:child_process";
import { extname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const FORMATTED_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".json",
  ".jsonc",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);
const LINTED_EXTENSIONS = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const MAX_STAGED_FILES = 500;
const MAX_PATH_BYTES = 4_096;
const MAX_GIT_OUTPUT_BYTES = 1_000_000;

const currentFile = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export interface StagedCommand {
  args: string[];
  label: "format" | "lint";
}

export function parseNulSeparatedPaths(output: string): string[] {
  if (Buffer.byteLength(output, "utf8") > MAX_GIT_OUTPUT_BYTES) {
    throw new Error(`staged path output exceeds ${MAX_GIT_OUTPUT_BYTES} bytes`);
  }
  if (output.length === 0) {
    return [];
  }
  if (!output.endsWith("\0")) {
    throw new Error("staged path output is not NUL terminated");
  }
  return output.slice(0, -1).split("\0");
}

function validatePath(path: string): void {
  if (
    path.length === 0 ||
    path.includes("\0") ||
    path.includes("\uFFFD") ||
    Buffer.byteLength(path, "utf8") > MAX_PATH_BYTES
  ) {
    throw new Error("staged path is empty, malformed, or too long");
  }
  if (
    isAbsolute(path) ||
    path === ".." ||
    path.startsWith("../") ||
    path.includes("/../") ||
    path.includes("\\")
  ) {
    throw new Error(`staged path must remain repository-relative: ${path}`);
  }
}

export function commandsForStagedPaths(paths: string[]): StagedCommand[] {
  if (paths.length > MAX_STAGED_FILES) {
    throw new Error(`staged file count exceeds ${MAX_STAGED_FILES}`);
  }
  const uniquePaths = [...new Set(paths)];
  for (const path of uniquePaths) {
    validatePath(path);
  }

  const formatted = uniquePaths.filter((path) => FORMATTED_EXTENSIONS.has(extname(path)));
  const linted = uniquePaths.filter((path) => LINTED_EXTENSIONS.has(extname(path)));
  const commands: StagedCommand[] = [];
  if (formatted.length > 0) {
    commands.push({ args: ["exec", "prettier", "--check", "--", ...formatted], label: "format" });
  }
  if (linted.length > 0) {
    commands.push({ args: ["exec", "eslint", "--", ...linted], label: "lint" });
  }
  return commands;
}

function stagedPaths(): string[] {
  const result = spawnSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    timeout: 10_000,
    windowsHide: true,
  });
  if (result.error) {
    throw new Error(`unable to inspect staged paths: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "unknown git failure").trim();
    throw new Error(`git staged-path query failed: ${detail}`);
  }
  return parseNulSeparatedPaths(result.stdout);
}

export function runStagedCheck(): number {
  try {
    const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    for (const command of commandsForStagedPaths(stagedPaths())) {
      const result = spawnSync(executable, command.args, {
        cwd: repositoryRoot,
        env: { ...process.env, COREPACK_ENABLE_NETWORK: "0", COREPACK_ENABLE_STRICT: "1" },
        stdio: "inherit",
        timeout: 30_000,
        windowsHide: true,
      });
      if (result.error) {
        throw new Error(`${command.label} check could not start: ${result.error.message}`);
      }
      if (result.status !== 0) {
        return result.status ?? 1;
      }
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`staged-file check failed: ${message}`);
    return 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === pathToFileURL(currentFile).href) {
  process.exitCode = runStagedCheck();
}
