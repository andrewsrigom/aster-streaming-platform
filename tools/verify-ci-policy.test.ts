import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  scanCiPolicy,
  validateDependabotPolicy,
  validateWorkflowPolicy,
} from "./verify-ci-policy.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const workflowPath = resolve(repositoryRoot, ".github", "workflows", "ci.yml");

test("the checked-in CI and Dependabot policy passes", async () => {
  assert.deepEqual(await scanCiPolicy(repositoryRoot), []);
});

test("rejects movable action tags", async () => {
  const source = await readFile(workflowPath, "utf8");
  const weakened = source.replace(
    "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
    "actions/checkout@v7",
  );
  assert.ok(validateWorkflowPolicy(weakened).some(({ rule }) => rule === "action-pin"));
});

test("rejects write permissions and secret context", async () => {
  const source = await readFile(workflowPath, "utf8");
  const weakened = source
    .replace("contents: read", "contents: write")
    .replace("BASE_SHA:", "TOKEN: ${{ secrets.CI_TOKEN }}\n          BASE_SHA:");
  assert.ok(validateWorkflowPolicy(weakened).some(({ rule }) => rule === "permissions"));
});

test("rejects duplicate feature pushes and missing cancellation", async () => {
  const source = await readFile(workflowPath, "utf8");
  const weakened = source
    .replace("branches: [main]", "branches: ['**']")
    .replace("cancel-in-progress: true", "cancel-in-progress: false");
  const rules = validateWorkflowPolicy(weakened).map(({ rule }) => rule);
  assert.ok(rules.includes("events"));
  assert.ok(rules.includes("concurrency"));
});

test("rejects a weakened or missing aggregate decision", async () => {
  const source = await readFile(workflowPath, "utf8");
  const weakened = source
    .replace("name: CI required", "name: Optional summary")
    .replace("if: always()", "if: success()")
    .replace("FULL_PATH: ${{ needs.classify.outputs.full }}", "FULL_PATH: false");
  assert.ok(validateWorkflowPolicy(weakened).some(({ rule }) => rule === "aggregate"));
});

test("rejects a missing public contribution check", async () => {
  const source = await readFile(workflowPath, "utf8");
  const weakened = source.replace(
    "node ./tools/verify-community-files.ts",
    "node ./tools/verify-documentation.ts",
  );
  assert.ok(validateWorkflowPolicy(weakened).some(({ rule }) => rule === "commands"));
});

test("requires both bounded weekly dependency ecosystems", () => {
  assert.deepEqual(
    validateDependabotPolicy(`version: 2
updates:
  - package-ecosystem: npm
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
  - package-ecosystem: github-actions
    schedule:
      interval: weekly
    open-pull-requests-limit: 3
`),
    [],
  );
  assert.ok(
    validateDependabotPolicy("version: 2\nupdates: []\n").some(({ rule }) => rule === "dependabot"),
  );
});
