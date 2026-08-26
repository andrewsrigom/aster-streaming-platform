import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const TOOLCHAIN_POLICY = Object.freeze({
  nodeVersion: "24.19.0",
  pnpmVersion: "11.24.0",
  packageManager:
    "pnpm@11.24.0+sha512.bd27e345e976dcb0be0b7a1228217b049a817e21b1f355c90dbe7dc46671895a8bc1e6d06c24554505ea93ea0b45f489a27ec1bfbc8de6a9659fca0f16fa0000",
});

const MAX_VERSION_LENGTH = 32;
const MAX_USER_AGENT_LENGTH = 1_024;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parseStableVersion(input, label = "version") {
  if (typeof input !== "string") {
    throw new TypeError(`${label} must be a string`);
  }

  const value = input.trim();
  if (value.length === 0 || value.length > MAX_VERSION_LENGTH) {
    throw new Error(`${label} has an invalid length`);
  }

  const match = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) {
    throw new Error(`${label} must be a stable semantic version`);
  }

  const parts = match.slice(1).map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => !Number.isSafeInteger(part))) {
    throw new Error(`${label} contains an unsafe numeric component`);
  }

  return {
    major: parts[0],
    minor: parts[1],
    patch: parts[2],
    normalized: parts.join("."),
  };
}

export function pnpmVersionFromUserAgent(userAgent) {
  if (typeof userAgent !== "string" || userAgent.length > MAX_USER_AGENT_LENGTH) {
    throw new Error("pnpm user agent is missing or invalid");
  }

  const pnpmEntry = userAgent
    .trim()
    .split(/\s+/u)
    .find((entry) => entry.startsWith("pnpm/"));

  if (!pnpmEntry) {
    throw new Error("the active package manager is not pnpm");
  }

  return parseStableVersion(pnpmEntry.slice("pnpm/".length), "pnpm version").normalized;
}

export function validatePinValues({ packageJson, nvmrc, nodeVersionFile }) {
  const errors = [];
  const expected = TOOLCHAIN_POLICY;

  if (packageJson.private !== true) {
    errors.push("package.json must keep the repository private from package publication");
  }
  if (packageJson.engines?.node !== expected.nodeVersion) {
    errors.push(`package.json engines.node must equal ${expected.nodeVersion}`);
  }
  if (packageJson.engines?.pnpm !== expected.pnpmVersion) {
    errors.push(`package.json engines.pnpm must equal ${expected.pnpmVersion}`);
  }
  if (packageJson.packageManager !== expected.packageManager) {
    errors.push("package.json packageManager must equal the integrity-pinned pnpm policy");
  }
  if (nvmrc.trim() !== expected.nodeVersion) {
    errors.push(`.nvmrc must equal ${expected.nodeVersion}`);
  }
  if (nodeVersionFile.trim() !== expected.nodeVersion) {
    errors.push(`.node-version must equal ${expected.nodeVersion}`);
  }

  return errors;
}

export function validateRepositoryPins(root = repositoryRoot) {
  try {
    const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    const nvmrc = readFileSync(resolve(root, ".nvmrc"), "utf8");
    const nodeVersionFile = readFileSync(resolve(root, ".node-version"), "utf8");
    return validatePinValues({ packageJson, nvmrc, nodeVersionFile });
  } catch (error) {
    return [`unable to read repository toolchain pins: ${error.message}`];
  }
}

export function validateActiveVersions({ nodeVersion, pnpmVersion }) {
  const errors = [];
  let normalizedNodeVersion;
  let normalizedPnpmVersion;

  try {
    normalizedNodeVersion = parseStableVersion(nodeVersion, "Node.js version").normalized;
  } catch (error) {
    errors.push(error.message);
  }

  try {
    normalizedPnpmVersion = parseStableVersion(pnpmVersion, "pnpm version").normalized;
  } catch (error) {
    errors.push(error.message);
  }

  if (normalizedNodeVersion && normalizedNodeVersion !== TOOLCHAIN_POLICY.nodeVersion) {
    errors.push(
      `Node.js ${normalizedNodeVersion} is unsupported; expected ${TOOLCHAIN_POLICY.nodeVersion}`,
    );
  }
  if (normalizedPnpmVersion && normalizedPnpmVersion !== TOOLCHAIN_POLICY.pnpmVersion) {
    errors.push(`pnpm ${normalizedPnpmVersion} is unsupported; expected ${TOOLCHAIN_POLICY.pnpmVersion}`);
  }

  return errors;
}

export function resolveActivePnpmVersion({
  userAgent = process.env.npm_config_user_agent,
  platform = process.platform,
  cwd = repositoryRoot,
  spawn = spawnSync,
} = {}) {
  if (userAgent) {
    try {
      return pnpmVersionFromUserAgent(userAgent);
    } catch (error) {
      if (userAgent.includes("pnpm/")) {
        throw error;
      }
    }
  }

  const executable = platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawn(executable, ["--version"], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      COREPACK_ENABLE_NETWORK: "0",
      COREPACK_ENABLE_STRICT: "1",
    },
    timeout: 10_000,
    windowsHide: true,
  });

  if (result.error) {
    throw new Error(`unable to execute pnpm: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "unknown pnpm failure").trim();
    throw new Error(`pnpm --version failed: ${detail}`);
  }

  return parseStableVersion(result.stdout, "pnpm version").normalized;
}

export function runToolchainCheck({ root = repositoryRoot } = {}) {
  const errors = validateRepositoryPins(root);
  let pnpmVersion;

  try {
    pnpmVersion = resolveActivePnpmVersion({ cwd: root });
  } catch (error) {
    errors.push(error.message);
  }

  if (pnpmVersion) {
    errors.push(
      ...validateActiveVersions({
        nodeVersion: process.versions.node,
        pnpmVersion,
      }),
    );
  }

  if (errors.length > 0) {
    console.error(
      JSON.stringify(
        {
          check: "toolchain",
          status: "error",
          errors,
        },
        null,
        2,
      ),
    );
    return 1;
  }

  console.log(
    JSON.stringify({
      check: "toolchain",
      status: "ok",
      node: TOOLCHAIN_POLICY.nodeVersion,
      pnpm: TOOLCHAIN_POLICY.pnpmVersion,
    }),
  );
  return 0;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = runToolchainCheck();
}
