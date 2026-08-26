import assert from "node:assert/strict";
import test from "node:test";

import {
  TOOLCHAIN_POLICY,
  parseStableVersion,
  pnpmVersionFromUserAgent,
  validateActiveVersions,
  validatePinValues,
  validateRepositoryPins,
} from "./verify-toolchain.mjs";

test("normalizes stable Node.js and pnpm versions", () => {
  assert.equal(parseStableVersion("v24.19.0", "Node.js version").normalized, "24.19.0");
  assert.equal(parseStableVersion("11.24.0", "pnpm version").normalized, "11.24.0");
});

test("rejects prerelease, coerced, and unbounded version input", () => {
  for (const invalid of ["24.19", "24.19.0-rc.1", "024.19.0", "24.19.0 extra", "9".repeat(40)]) {
    assert.throws(() => parseStableVersion(invalid));
  }
});

test("reads pnpm only from a bounded pnpm user-agent entry", () => {
  assert.equal(
    pnpmVersionFromUserAgent("pnpm/11.24.0 npm/? node/v24.19.0 linux x64"),
    "11.24.0",
  );
  assert.throws(() => pnpmVersionFromUserAgent("yarn/4.15.0 npm/? node/v24.19.0 linux x64"));
});

test("accepts the canonical duplicated pins", () => {
  assert.deepEqual(
    validatePinValues({
      packageJson: {
        private: true,
        engines: {
          node: TOOLCHAIN_POLICY.nodeVersion,
          pnpm: TOOLCHAIN_POLICY.pnpmVersion,
        },
        packageManager: TOOLCHAIN_POLICY.packageManager,
      },
      nvmrc: `${TOOLCHAIN_POLICY.nodeVersion}\n`,
      nodeVersionFile: `${TOOLCHAIN_POLICY.nodeVersion}\n`,
    }),
    [],
  );
});

test("reports every pin drift instead of stopping at the first mismatch", () => {
  const errors = validatePinValues({
    packageJson: {
      private: false,
      engines: { node: "22.0.0", pnpm: "10.0.0" },
      packageManager: "pnpm@10.0.0",
    },
    nvmrc: "22.0.0",
    nodeVersionFile: "22.0.0",
  });

  assert.equal(errors.length, 6);
});

test("rejects unsupported active versions", () => {
  assert.deepEqual(
    validateActiveVersions({ nodeVersion: "24.19.0", pnpmVersion: "11.24.0" }),
    [],
  );
  assert.equal(
    validateActiveVersions({ nodeVersion: "22.23.2", pnpmVersion: "10.34.5" }).length,
    2,
  );
});

test("the checked-in repository pins agree", () => {
  assert.deepEqual(validateRepositoryPins(), []);
});
