import { spawnSync } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MAX_CHANGED_FILES = 5_000;
const MAX_GIT_OUTPUT_BYTES = 2_000_000;
const MAX_PATH_BYTES = 4_096;
const MAX_OUTPUT_PATH_BYTES = 4_096;
const GIT_OBJECT = /^[a-f\d]{40}$/u;
const ZERO_OBJECT = /^0{40}$/u;
const DOCUMENTATION_PREFIXES = [".ai/", "docs/", "evidence/", "skills/"] as const;
const PLATFORM_PREFIXES = [
  "apps/web/",
  "infra/compose/",
  "infra/docker/",
  "infra/grafana/",
  "infra/observability/",
  "infra/router/",
  "services/identity/",
  "services/catalog/",
  "services/playback/",
  "services/engagement/",
  "services/discovery/",
  "tools/media/",
  "packages/runtime/",
  "packages/config/",
  "packages/http-express/",
  "packages/telemetry/",
  "packages/postgres/",
  "packages/redis/",
  "packages/broker-kafka/",
  "packages/object-storage-s3/",
] as const;
const PLATFORM_FILES = new Set([
  ".github/workflows/ci.yml",
  ".dockerignore",
  ".node-version",
  ".nvmrc",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "tsconfig.base.json",
  "tools/classify-ci-change.ts",
  "tools/classify-ci-change.test.ts",
  "tools/reset-local-platform.sh",
  "tools/reset-local-platform.test.mjs",
  "tools/verify-local-platform.mjs",
  "tools/verify-local-platform.test.mjs",
  "tools/verify-runtime-image.mjs",
  "tools/verify-slo-contract.mjs",
  "tools/verify-slo-contract.test.mjs",
  "tools/verify-docker-context.mjs",
  "tools/verify-catalog-runtime.mjs",
  "tools/verify-catalog-runtime.test.mjs",
  "tools/verify-router-runtime.mjs",
  "tools/verify-router-runtime.test.mjs",
  "tools/verify-local-router.mjs",
  "tools/verify-router-lifecycle.mjs",
  "tools/verify-router-observability.mjs",
  "tools/verify-local-catalog.mjs",
  "tools/run-catalog-integration.mjs",
  "tools/run-playback-integration.mjs",
  "tools/run-engagement-integration.mjs",
  "tools/run-engagement-runtime.mjs",
  "tools/run-discovery-integration.mjs",
  "tools/run-discovery-runtime.mjs",
  "tools/verify-engagement-runtime.mjs",
  "tools/verify-engagement-runtime.test.mjs",
  "tools/run-playback-runtime.mjs",
  "tools/verify-playback-runtime.mjs",
  "tools/verify-playback-runtime.test.mjs",
  "tools/run-media-fixture.mjs",
  "tools/verify-optional-platform.mjs",
  "tools/verify-diagnostics-profile.mjs",
  "tools/verify-diagnostics-profile.test.mjs",
  "tools/run-diagnostic-exercises.mjs",
  "tools/run-diagnostic-exercises.test.mjs",
]);
const DIAGNOSTIC_PREFIXES = [
  "services/catalog/",
  "packages/http-express/",
  "packages/runtime/",
  "packages/telemetry/",
  "packages/postgres/",
  "packages/redis/",
  "infra/router/",
  "infra/grafana/",
] as const;
const DIAGNOSTIC_FILES = new Set([
  ".github/workflows/ci.yml",
  ".dockerignore",
  "package.json",
  "pnpm-lock.yaml",
  "turbo.json",
  "tools/classify-ci-change.ts",
  "tools/classify-ci-change.test.ts",
  "infra/compose/compose.yml",
  "infra/compose/observability.yml",
  "infra/compose/prometheus.local.yml",
  "infra/compose/collector.diagnostics.yml",
  "infra/compose/diagnostics.yml",
  "infra/compose/diagnostics-proof.yml",
  "infra/docker/catalog.Dockerfile",
  "infra/docker/prometheus.Dockerfile",
  "infra/docker/router.Dockerfile",
  "infra/docker/collector.diagnostics.Dockerfile",
  "infra/docker/grafana.diagnostics.Dockerfile",
  "infra/docker/tempo.Dockerfile",
  "infra/observability/tempo.yml",
  "infra/observability/slo-rules.yml",
  "tools/verify-diagnostics-profile.mjs",
  "tools/verify-diagnostics-profile.test.mjs",
  "tools/run-diagnostic-exercises.mjs",
  "tools/run-diagnostic-exercises.test.mjs",
]);
const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const GIT_DIFF_FILTER = "ACMRD";

export interface ChangeClassification {
  changedFiles: number;
  diagnostics: boolean;
  full: boolean;
  platform: boolean;
  reason: "docs-only" | "empty-diff" | "executable-change" | "fallback";
}

function validateChangedPath(path: string): void {
  if (
    !path ||
    path.includes("\0") ||
    path.includes("\uFFFD") ||
    path.includes("\\") ||
    isAbsolute(path) ||
    path === ".." ||
    path.startsWith("../") ||
    path.includes("/../") ||
    Buffer.byteLength(path, "utf8") > MAX_PATH_BYTES
  ) {
    throw new Error("Git returned an unsafe or malformed changed path");
  }
}

function isDocumentationOnlyPath(path: string): boolean {
  return (
    path.toLocaleLowerCase("en-US").endsWith(".md") ||
    DOCUMENTATION_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

function isPlatformPath(path: string): boolean {
  return PLATFORM_FILES.has(path) || PLATFORM_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function isDiagnosticPath(path: string): boolean {
  return (
    DIAGNOSTIC_FILES.has(path) || DIAGNOSTIC_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

export function classifyChangedPaths(paths: string[]): ChangeClassification {
  if (paths.length > MAX_CHANGED_FILES) {
    throw new Error(`changed file count exceeds ${MAX_CHANGED_FILES}`);
  }
  const uniquePaths = [...new Set(paths)];
  for (const path of uniquePaths) {
    validateChangedPath(path);
  }
  if (uniquePaths.length === 0) {
    return {
      changedFiles: 0,
      diagnostics: true,
      full: true,
      platform: true,
      reason: "empty-diff",
    };
  }
  if (uniquePaths.every(isDocumentationOnlyPath)) {
    return {
      changedFiles: uniquePaths.length,
      diagnostics: false,
      full: false,
      platform: false,
      reason: "docs-only",
    };
  }
  return {
    changedFiles: uniquePaths.length,
    diagnostics: uniquePaths.some(isDiagnosticPath),
    full: true,
    platform: uniquePaths.some(isPlatformPath),
    reason: "executable-change",
  };
}

export function parseChangedPaths(output: string): string[] {
  if (Buffer.byteLength(output, "utf8") > MAX_GIT_OUTPUT_BYTES) {
    throw new Error(`Git diff output exceeds ${MAX_GIT_OUTPUT_BYTES} bytes`);
  }
  if (!output) {
    return [];
  }
  if (!output.endsWith("\0")) {
    throw new Error("Git diff output is not NUL terminated");
  }
  return output.slice(0, -1).split("\0");
}

function changedPaths(base: string, head: string): string[] | undefined {
  if (!GIT_OBJECT.test(base) || ZERO_OBJECT.test(base) || !GIT_OBJECT.test(head)) {
    return undefined;
  }
  const result = spawnSync(
    "git",
    ["diff", "--name-only", `--diff-filter=${GIT_DIFF_FILTER}`, "-z", base, head, "--"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
      timeout: 15_000,
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0) {
    return undefined;
  }
  return parseChangedPaths(result.stdout);
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function writeGitHubOutputs(classification: ChangeClassification): Promise<void> {
  const outputPath = process.env["GITHUB_OUTPUT"];
  if (!outputPath) {
    return;
  }
  if (outputPath.includes("\0") || Buffer.byteLength(outputPath, "utf8") > MAX_OUTPUT_PATH_BYTES) {
    throw new Error("GITHUB_OUTPUT path is malformed or too long");
  }
  await appendFile(
    outputPath,
    `full=${classification.full ? "true" : "false"}\nplatform=${classification.platform ? "true" : "false"}\ndiagnostics=${classification.diagnostics ? "true" : "false"}\nclassification=${classification.reason}\n`,
    { encoding: "utf8", flag: "a" },
  );
}

export async function runChangeClassification(base: string, head: string): Promise<number> {
  try {
    const paths = changedPaths(base, head);
    const classification = paths
      ? classifyChangedPaths(paths)
      : ({
          changedFiles: 0,
          diagnostics: true,
          full: true,
          platform: true,
          reason: "fallback",
        } as const);
    await writeGitHubOutputs(classification);
    console.log(JSON.stringify({ check: "ci-change", status: "ok", ...classification }));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallback = {
      changedFiles: 0,
      diagnostics: true,
      full: true,
      platform: true,
      reason: "fallback",
    } as const;
    try {
      await writeGitHubOutputs(fallback);
    } catch {
      // The primary bounded error remains the actionable result.
    }
    console.error(
      JSON.stringify({ check: "ci-change", status: "error", errors: [message], ...fallback }),
    );
    return 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  process.exitCode = await runChangeClassification(
    argumentValue("--base") ?? "",
    argumentValue("--head") ?? "",
  );
}
