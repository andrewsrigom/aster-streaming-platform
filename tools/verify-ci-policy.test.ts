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

test("schema compatibility cannot compare only against the candidate or a shallow checkout", async () => {
  const source = await readFile(workflowPath, "utf8");
  for (const changed of [
    source.replace(
      "ASTER_SCHEMA_BASE: ${{ github.event.pull_request.base.sha || github.event.before || github.sha }}",
      "ASTER_SCHEMA_BASE: ${{ github.sha }}",
    ),
    source.replaceAll("fetch-depth: 0", "fetch-depth: 1"),
  ]) {
    assert.ok(
      validateWorkflowPolicy(changed).some(({ detail }) => detail.includes("schema compatibility")),
    );
  }
});

test("rejects removal, suppression or unbounded real integration", async () => {
  const source = await readFile(workflowPath, "utf8");
  for (const weakened of [
    source.replace("run: pnpm integration", "run: pnpm identity:check"),
    source.replace("timeout-minutes: 15", "timeout-minutes: 90"),
    source.replace(
      "Prove real platform integration\n        if: needs.classify.outputs.platform == 'true'",
      "Prove real platform integration\n        if: false",
    ),
  ]) {
    assert.ok(
      validateWorkflowPolicy(weakened).some(({ detail }) => detail.includes("real integration")),
    );
  }
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
    .replace("FULL_PATH: ${{ needs.classify.outputs.full }}", "FULL_PATH: false")
    .replace("PLATFORM_PATH: ${{ needs.classify.outputs.platform }}", "PLATFORM_PATH: false");
  assert.ok(validateWorkflowPolicy(weakened).some(({ rule }) => rule === "aggregate"));
});

test("rejects a missing local-platform decision path", async () => {
  const source = await readFile(workflowPath, "utf8");
  const weakened = source
    .replace("node ./tools/verify-local-platform.mjs", "node ./tools/verify-ci-policy.ts")
    .replace("./tools/verify-local-platform.test.mjs", "./tools/verify-ci-policy.test.ts")
    .replace("PLATFORM_PATH: ${{ needs.classify.outputs.platform }}", "PLATFORM_PATH: false");
  assert.ok(
    validateWorkflowPolicy(weakened).some(
      ({ rule }) => rule === "commands" || rule === "aggregate",
    ),
  );
});

test("rejects weakened local-platform execution or broad Docker cleanup", async () => {
  const source = await readFile(workflowPath, "utf8");
  const weakened = source
    .replace("--wait --wait-timeout 120 platform-status", "platform-status")
    .replace(
      'docker compose --file "$COMPOSE_FILE" --file infra/compose/observability.yml --profile "*" down --volumes --remove-orphans --timeout 10',
      "docker system prune --all --force",
    );
  assert.ok(validateWorkflowPolicy(weakened).some(({ rule }) => rule === "commands"));
});

test("rejects a missing public contribution check", async () => {
  const source = await readFile(workflowPath, "utf8");
  const weakened = source.replace(
    "node ./tools/verify-community-files.ts",
    "node ./tools/verify-documentation.ts",
  );
  assert.ok(validateWorkflowPolicy(weakened).some(({ rule }) => rule === "commands"));
});

test("rejects missing or unbounded Docker-only build and metric verification", async () => {
  const source = await readFile(workflowPath, "utf8");
  for (const [before, after] of [
    ["--profile full up --build", "--profile full up"],
    ["< tools/verify-local-identity.mjs", "< tools/unreviewed-demo.mjs"],
    ["timeout-minutes: 10", "timeout-minutes: 60"],
    ["assert.equal(process.getuid(), 1000)", "assert.ok(true)"],
    ["assert.deepEqual(present, required)", "assert.ok(present)"],
    ['--profile "*" down --volumes', "down --volumes"],
  ] as const) {
    assert.ok(
      validateWorkflowPolicy(source.replace(before, after)).some(({ rule }) => rule === "commands"),
      before,
    );
  }
});

test("rejects a missing repository-memory check", async () => {
  const source = await readFile(workflowPath, "utf8");
  const weakened = source
    .replace("node ./tools/verify-ai-state.ts", "node ./tools/verify-documentation.ts")
    .replace("./tools/verify-ai-state.test.ts", "./tools/verify-documentation.test.ts");
  assert.ok(validateWorkflowPolicy(weakened).some(({ rule }) => rule === "commands"));
});

test("rejects removal of the reviewed MITNFA license", async () => {
  const source = await readFile(workflowPath, "utf8");
  const weakened = source.replace(", MIT, MITNFA", ", MIT");
  assert.ok(validateWorkflowPolicy(weakened).some(({ rule }) => rule === "commands"));
});

test("rejects removal or expansion of the owner-approved Federation license set", async () => {
  const source = await readFile(workflowPath, "utf8");
  for (const changed of [
    source.replace(", Elastic-2.0", ""),
    source.replace("0BSD, ", ""),
    source.replace(", MIT, MITNFA", ", MIT, MITNFA, GPL-3.0-only"),
  ]) {
    assert.ok(validateWorkflowPolicy(changed).some(({ rule }) => rule === "commands"));
  }
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
