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

test("playable acceptance cannot omit its browser, replay or scoped cleanup", async () => {
  const source = await readFile(workflowPath, "utf8");
  for (const original of [
    "pnpm --filter @aster/web exec playwright test demo.spec.ts",
    "trap cleanup_playable EXIT",
    "playable_compose up --build --wait --wait-timeout 180 web",
    "personalized_compose down --volumes --timeout 10",
    "playable_compose logs --no-color --tail 1 playable-seed | grep '\"changed\":false'",
  ] as const) {
    assert.ok(source.includes(original));
    assert.ok(
      validateWorkflowPolicy(source.replace(original, "true")).some(({ detail }) =>
        detail.includes("playable"),
      ),
    );
  }
});

test("personalized playable acceptance cannot skip its story or leave initialization unproved", async () => {
  const source = await readFile(workflowPath, "utf8");
  for (const original of [
    'ASTER_ENGAGEMENT_DEMO: "true"',
    "pnpm --filter @aster/web exec playwright test engagement.spec.ts",
    "personalized_compose up --build --wait --wait-timeout 180 web identity engagement broker-init",
    "personalized_compose up --no-build --wait --wait-timeout 90 web identity engagement broker-init",
    'test "$(timeout 120s docker wait "$aster_topic_init")" = 0',
    'test -n "$aster_topic_init"',
    "--file infra/compose/events.yml",
    "personalized_compose logs --no-color --tail 1 playable-seed | grep '\"changed\":false'",
    "personalized_compose logs --no-color --tail 1 playable-generate | grep 'generated_hls_reused'",
  ] as const) {
    assert.ok(source.includes(original), original);
    assert.ok(
      validateWorkflowPolicy(source.replace(original, "true")).some(({ detail }) =>
        detail.includes("playable"),
      ),
      original,
    );
  }
});

test("schema compatibility cannot compare only against the candidate or a shallow checkout", async () => {
  const source = await readFile(workflowPath, "utf8");
  for (const changed of [
    source.replace(
      "ASTER_SCHEMA_BASE: ${{ github.event.pull_request.base.sha || github.event.before || '' }}",
      "ASTER_SCHEMA_BASE: ${{ github.sha }}",
    ),
    source.replace(
      "ASTER_SCHEMA_BASE: ${{ github.event.pull_request.base.sha || github.event.before || '' }}",
      "ASTER_SCHEMA_BASE: ${{ github.event.pull_request.base.sha || github.event.before || github.sha }}",
    ),
    source.replace('ASTER_SCHEMA_BASE="$(node ./tools/resolve-schema-baseline.ts)"', "true"),
    source.replace("export ASTER_SCHEMA_BASE", "true"),
    source.replace("./tools/resolve-schema-baseline.test.ts", "./tools/unreviewed.test.ts"),
    source.replaceAll("fetch-depth: 0", "fetch-depth: 1"),
  ]) {
    assert.notEqual(changed, source);
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

test("Playback persistence and federated runtime checks cannot be omitted or suppressed", async () => {
  const source = await readFile(workflowPath, "utf8");
  for (const changed of [
    source.replace("pnpm playback:integration", "true"),
    source.replace("pnpm playback:runtime", "true"),
    source.replace(
      "Prove Playback persistence and federated runtime\n        if: needs.classify.outputs.platform == 'true'",
      "Prove Playback persistence and federated runtime\n        if: false",
    ),
    source.replaceAll("timeout-minutes: 10\n", "timeout-minutes: 90\n"),
  ]) {
    assert.notEqual(changed, source);
    assert.ok(validateWorkflowPolicy(changed).some(({ detail }) => detail.startsWith("Playback")));
  }
});

test("Engagement persistence and private-owner runtime checks cannot be suppressed", async () => {
  const source = await readFile(workflowPath, "utf8");
  for (const changed of [
    source.replace("pnpm engagement:integration", "true"),
    source.replace("pnpm engagement:runtime", "true"),
    source.replace(
      "timeout-minutes: 20\n        run: |\n          pnpm engagement:integration",
      "timeout-minutes: 90\n        run: |\n          pnpm engagement:integration",
    ),
    source.replace(
      "Prove Engagement persistence and federated progress\n        if: needs.classify.outputs.platform == 'true'",
      "Prove Engagement persistence and federated progress\n        if: false",
    ),
  ]) {
    assert.notEqual(changed, source);
    assert.ok(
      validateWorkflowPolicy(changed).some(({ detail }) => detail.startsWith("Engagement")),
    );
  }
});

test("Discovery projection and federated search checks cannot be suppressed", async () => {
  const source = await readFile(workflowPath, "utf8");
  for (const changed of [
    source.replace("pnpm discovery:integration", "true"),
    source.replace("pnpm discovery:runtime", "true"),
    source.replace(
      "timeout-minutes: 15\n        run: |\n          pnpm discovery:integration",
      "timeout-minutes: 90\n        run: |\n          pnpm discovery:integration",
    ),
    source.replace(
      "Prove Discovery projection and federated search\n        if: needs.classify.outputs.platform == 'true'",
      "Prove Discovery projection and federated search\n        if: false",
    ),
  ]) {
    assert.notEqual(changed, source);
    assert.ok(validateWorkflowPolicy(changed).some(({ detail }) => detail.startsWith("Discovery")));
  }
});

test("Docker context probe cannot be omitted, skipped or left unbounded", async () => {
  const source = await readFile(workflowPath, "utf8");
  for (const changed of [
    source.replace("run: node ./tools/verify-docker-context.mjs", "run: true"),
    source.replace(
      "Verify Docker context boundary\n        if: needs.classify.outputs.platform == 'true'",
      "Verify Docker context boundary\n        if: false",
    ),
    source.replaceAll("timeout-minutes: 1\n", "timeout-minutes: 90\n"),
  ]) {
    assert.notEqual(changed, source);
    assert.ok(
      validateWorkflowPolicy(changed).some(({ detail }) => detail.includes("Docker context")),
    );
  }
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

test("diagnostic failure exercises cannot be omitted, broadened or run for every change", async () => {
  const source = await readFile(workflowPath, "utf8");
  for (const changed of [
    source.replace("run: node ./tools/run-diagnostic-exercises.mjs", "run: true"),
    source.replace(
      "Diagnose three injected failures from telemetry\n        if: needs.classify.outputs.diagnostics == 'true'",
      "Diagnose three injected failures from telemetry\n        if: false",
    ),
    source.replace(
      "timeout-minutes: 15\n        run: node ./tools/run-diagnostic-exercises.mjs",
      "timeout-minutes: 90\n        run: node ./tools/run-diagnostic-exercises.mjs",
    ),
    source.replace(
      '--profile "*" down --volumes --remove-orphans --timeout 10',
      '--profile "*" down --remove-orphans --timeout 10',
    ),
    source.replace("diagnostics: ${{ steps.change.outputs.diagnostics }}", "diagnostics: true"),
  ]) {
    assert.notEqual(changed, source);
    assert.ok(
      validateWorkflowPolicy(changed).some(({ detail }) =>
        detail.toLowerCase().includes("diagnostic"),
      ),
    );
  }
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

test("docs-only CI cannot bypass capability-index validation", async () => {
  const source = await readFile(workflowPath, "utf8");
  for (const requiredCommand of [
    "node ./tools/verify-capability-index.ts",
    "./tools/verify-capability-index.test.ts",
  ] as const) {
    assert.ok(source.includes(requiredCommand), requiredCommand);
    const requiredInvocation = requiredCommand.startsWith("node ")
      ? requiredCommand
      : `node --test ${requiredCommand}`;
    const movedOutsideGovernance = source
      .replace(requiredCommand, "true")
      .replace("  quality:\n", `  quality:\n    # ${requiredCommand}\n`);
    const movedIntoSkippedIntermediateJob = source
      .replace(requiredCommand, "true")
      .replace(
        "  quality:\n",
        `  skipped-doc-check:\n    if: false\n    runs-on: ubuntu-24.04\n    steps:\n      - run: ${requiredCommand}\n\n  quality:\n`,
      );
    const retainedOnlyAsGovernanceComment = source.replace(
      requiredCommand,
      `true # ${requiredCommand}`,
    );
    const retainedOnlyAsGovernanceEnvironment = source
      .replace(requiredCommand, "true")
      .replace(
        "      - name: Validate repository memory\n",
        `      - name: Retain unused command text\n        env:\n          UNUSED_COMMAND: ${requiredCommand}\n        run: true\n      - name: Validate repository memory\n`,
      );
    const retainedOnlyInSuppressedGovernanceStep = source
      .replace(requiredCommand, "true")
      .replace(
        "      - name: Validate repository memory\n",
        `      - name: Suppressed capability command\n        if: false\n        run: ${requiredInvocation}\n      - name: Validate repository memory\n`,
      );
    const retainedOnlyInConditionalGovernanceStep = source
      .replace(requiredCommand, "true")
      .replace(
        "      - name: Validate repository memory\n",
        `      - name: Conditional capability command\n        if: github.event_name == 'push'\n        run: ${requiredInvocation}\n      - name: Validate repository memory\n`,
      );
    const retainedOnlyInNonBlockingGovernanceStep = source
      .replace(requiredCommand, "true")
      .replace(
        "      - name: Validate repository memory\n",
        `      - name: Non-blocking capability command\n        continue-on-error: true\n        run: ${requiredInvocation}\n      - name: Validate repository memory\n`,
      );
    const retainedOnlyInConditionalGovernanceJob = source.replace(
      "  governance:\n",
      "  governance:\n    if: github.event_name == 'push'\n",
    );
    const retainedOnlyAsPrintedText = source.replace(requiredCommand, `echo '${requiredCommand}'`);
    for (const weakened of [
      movedOutsideGovernance,
      movedIntoSkippedIntermediateJob,
      retainedOnlyAsGovernanceComment,
      retainedOnlyAsGovernanceEnvironment,
      retainedOnlyInSuppressedGovernanceStep,
      retainedOnlyInConditionalGovernanceStep,
      retainedOnlyInNonBlockingGovernanceStep,
      retainedOnlyInConditionalGovernanceJob,
      retainedOnlyAsPrintedText,
    ]) {
      assert.ok(
        validateWorkflowPolicy(weakened).some(
          ({ detail, rule }) => rule === "commands" && detail.includes("capability-index"),
        ),
        requiredCommand,
      );
    }
  }
});

test("rejects missing or unbounded Docker-only build and metric verification", async () => {
  const source = await readFile(workflowPath, "utf8");
  for (const [before, after] of [
    ["--profile full up --build", "--profile full up"],
    ["< tools/verify-local-identity.mjs", "< tools/unreviewed-demo.mjs"],
    ["timeout-minutes: 10", "timeout-minutes: 60"],
    ["assert.equal(process.getuid(), 1000)", "assert.ok(true)"],
    ["assert.deepEqual(present, required)", "assert.ok(present)"],
    ["'supergraph', 'catalog_title_read'", "'supergraph'"],
    [
      "timeout-minutes: 2\n        run: |\n          grafana_health=",
      "timeout-minutes: 20\n        run: |\n          grafana_health=",
    ],
    [
      "--profile full logs --no-color --tail 120 grafana prometheus router",
      "--profile full logs grafana prometheus",
    ],
    ["api/datasources/uid/aster-prometheus/health", "api/datasources/uid/unreviewed/health"],
    [
      `grep -Eq '"database"[[:space:]]*:[[:space:]]*"ok"' <<< "$grafana_health"`,
      `grep -Fq '"database":"ok"' <<< "$grafana_health"`,
    ],
    [
      "api/datasources/proxy/uid/aster-prometheus/api/v1/query",
      "api/datasources/proxy/uid/unreviewed/api/v1/query",
    ],
    [
      "ratio_rate5m%7Bsli%3D%22playback_start%22%7D",
      "ratio_rate5m%7Bsli%3D%22playback_session%22%7D",
    ],
    ["api/dashboards/uid/aster-operational-overview", "api/dashboards/uid/unreviewed"],
    ["slo-alerts.yml", "missing-alerts.yml"],
    ["slo-alerts.test.yml", "missing-alerts.test.yml"],
    ["for attempt in {1..20}; do", "while true; do"],
    ["fi\n            sleep 3\n          done", "fi\n            sleep 300\n          done"],
    ["rules.every(({ health }) => health === 'ok')", "rules.length > 0"],
    ["done\n          prometheus_rules=$(curl", "done\n          stale_rules=$(curl"],
    ["assert.equal(rules.length, 35)", "assert.ok(rules.length > 0)"],
    ["assert.match(threeDayRatio.query", "assert.ok(threeDayRatio.query"],
    ["AsterCriticalJourneySloRapidBurn", "UnreviewedRapidBurn"],
    ["AsterCriticalJourneySloSustainedBurn", "UnreviewedSustainedBurn"],
    ["assert.equal(alertRules.length, 7)", "assert.ok(alertRules.length > 0)"],
    ["assert.equal(rule.health, 'ok')", "assert.ok(rule.health)"],
    ["assert.equal(rule.keepFiringFor, 0)", "assert.ok(rule.keepFiringFor >= 0)"],
    ["api/v1/alerts", "api/v1/targets"],
    ["assert.equal(payload.data.alerts.length, 0)", "assert.ok(payload.data.alerts)"],
    ["--profile full stop --timeout 5 grafana", "--profile full stop grafana"],
    [
      `test "$(docker inspect --format '{{.State.Health.Status}}' "$platform_status_id")" = healthy`,
      `test "$(docker inspect --format '{{.State.Health.Status}}' "$platform_status_id")" = running`,
    ],
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

test("the packaged product journey cannot use container loopback or bypass Router", async () => {
  const source = await readFile(workflowPath, "utf8");
  for (const replacement of ["", " - --direct-subgraph"]) {
    const changed = source.replace(" - --compose-router", replacement);
    assert.notEqual(changed, source);
    assert.ok(
      validateWorkflowPolicy(changed).some(({ detail }) => detail.includes("internal Router")),
    );
  }
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
  ] as const) {
    assert.ok(validateWorkflowPolicy(changed).some(({ rule }) => rule === "commands"));
  }
});

test("Web tooling cannot broaden the package-specific license exceptions", async () => {
  const source = await readFile(workflowPath, "utf8");
  for (const changed of [
    source.replace("pkg:npm/%40axe-core/playwright, pkg:npm/axe-core", "pkg:npm/axe-core"),
    source.replace(
      "pkg:npm/%40axe-core/playwright, pkg:npm/axe-core",
      "pkg:npm/%40axe-core/playwright, pkg:npm/axe-core, pkg:npm/unreviewed",
    ),
    source.replace("allow-dependencies-licenses:", "unreviewed-exceptions:"),
    source.replace(
      "vulnerability-check: true",
      "allow-dependencies-licenses: pkg:npm/unreviewed\n          vulnerability-check: true",
    ),
    source.replace(", MIT, MITNFA", ", MIT, MITNFA, MPL-2.0"),
  ]) {
    assert.notEqual(changed, source);
    assert.ok(validateWorkflowPolicy(changed).some(({ rule }) => rule === "commands"));
  }
});

test("GraphQL demand and trusted-operation proofs cannot be omitted or weakened", async () => {
  const source = await readFile(workflowPath, "utf8");
  for (const [before, after] of [
    ["node ./tools/verify-graphql-demand-controls.mjs", "true"],
    ["node ./tools/verify-trusted-operations.mjs", "true"],
    ["--metrics < tools/verify-trusted-operations.mjs", "--metrics < tools/unreviewed.mjs"],
    ["--no-deps --force-recreate --wait --wait-timeout 60 router", "router"],
    ["--file infra/compose/graphql-security-proof.yml", ""],
  ] as const) {
    const weakened = source.replaceAll(before, after);
    assert.notEqual(weakened, source);
    assert.ok(
      validateWorkflowPolicy(weakened).some(({ detail }) =>
        /graphql demand|trusted-operation/u.test(detail.toLowerCase()),
      ),
    );
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
