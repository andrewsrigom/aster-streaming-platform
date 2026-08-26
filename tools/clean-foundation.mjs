import { lstat, rm } from "node:fs/promises";
import { dirname, isAbsolute, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const FOUNDATION_GENERATED_PATHS = Object.freeze([".turbo", "node_modules"]);

const REPOSITORY_MARKERS = Object.freeze(["package.json", "pnpm-lock.yaml"]);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function validateCleanupArguments(arguments_) {
  if (arguments_.length > 0) {
    throw new Error("foundation cleanup does not accept path arguments");
  }
}

async function requireRegularMarker(root, marker) {
  let metadata;
  try {
    metadata = await lstat(resolve(root, marker));
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`foundation cleanup requires the repository marker ${marker}`, {
        cause: error,
      });
    }
    throw error;
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`foundation cleanup requires a regular repository marker ${marker}`);
  }
}

function allowedTarget(root, entry) {
  const target = resolve(root, entry);
  const relativeTarget = relative(root, target);
  if (
    !relativeTarget ||
    relativeTarget === ".." ||
    relativeTarget.startsWith(`..${sep}`) ||
    isAbsolute(relativeTarget) ||
    relativeTarget !== entry
  ) {
    throw new Error(`foundation cleanup rejected the generated path ${entry}`);
  }
  return target;
}

export async function cleanFoundation(root = repositoryRoot) {
  const resolvedRoot = resolve(root);
  if (resolvedRoot === parse(resolvedRoot).root) {
    throw new Error("foundation cleanup refuses a filesystem root");
  }
  for (const marker of REPOSITORY_MARKERS) {
    await requireRegularMarker(resolvedRoot, marker);
  }

  const removed = [];
  for (const entry of FOUNDATION_GENERATED_PATHS) {
    const target = allowedTarget(resolvedRoot, entry);
    try {
      await lstat(target);
    } catch (error) {
      if (error?.code === "ENOENT") {
        continue;
      }
      throw error;
    }
    await rm(target, { force: false, maxRetries: 3, recursive: true, retryDelay: 100 });
    removed.push(entry);
  }
  return { removed };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    validateCleanupArguments(process.argv.slice(2));
    const result = await cleanFoundation();
    console.log(
      JSON.stringify({
        check: "foundation-cleanup",
        status: "ok",
        removed: result.removed,
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        check: "foundation-cleanup",
        status: "error",
        error: error instanceof Error ? error.message : "unknown cleanup failure",
      }),
    );
    process.exitCode = 1;
  }
}
