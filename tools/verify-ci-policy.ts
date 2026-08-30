import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { reviewedLicensePurls } from "../apps/web/scripts/license-policy.ts";

const MAX_WORKFLOW_BYTES = 200_000;
const MAX_WORKFLOW_FILES = 20;
const ACTION_REFERENCE =
  /^\s*uses:\s*(?<action>[^@\s]+)@(?<reference>[^\s#]+)(?:\s+#\s*(?<version>\S+))?\s*$/gmu;
const EXPECTED_ACTIONS = new Map<string, { reference: string; version: string }>([
  ["actions/cache", { reference: "55cc8345863c7cc4c66a329aec7e433d2d1c52a9", version: "v6.1.0" }],
  [
    "actions/checkout",
    { reference: "3d3c42e5aac5ba805825da76410c181273ba90b1", version: "v7.0.1" },
  ],
  [
    "actions/dependency-review-action",
    { reference: "a1d282b36b6f3519aa1f3fc636f609c47dddb294", version: "v5.0.0" },
  ],
  [
    "actions/setup-node",
    { reference: "820762786026740c76f36085b0efc47a31fe5020", version: "v7.0.0" },
  ],
]);

const currentFile = fileURLToPath(import.meta.url);
const defaultRepositoryRoot = resolve(dirname(currentFile), "..");

export type CiPolicyRule =
  | "action-pin"
  | "aggregate"
  | "cache"
  | "commands"
  | "concurrency"
  | "credentials"
  | "dependabot"
  | "events"
  | "permissions"
  | "runner";

export interface CiPolicyViolation {
  detail: string;
  file: string;
  line: number;
  rule: CiPolicyRule;
}

function lineNumberAt(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

function addRequirement(
  violations: CiPolicyViolation[],
  file: string,
  source: string,
  rule: CiPolicyRule,
  pattern: RegExp,
  detail: string,
): void {
  if (!pattern.test(source)) {
    violations.push({ detail, file, line: 1, rule });
  }
}

export function validateWorkflowPolicy(
  source: string,
  file = ".github/workflows/ci.yml",
): CiPolicyViolation[] {
  const violations: CiPolicyViolation[] = [];
  if (Buffer.byteLength(source, "utf8") > MAX_WORKFLOW_BYTES) {
    return [
      { detail: `workflow exceeds ${MAX_WORKFLOW_BYTES} bytes`, file, line: 1, rule: "events" },
    ];
  }

  ACTION_REFERENCE.lastIndex = 0;
  const seenActions = new Map<string, number>();
  for (const match of source.matchAll(ACTION_REFERENCE)) {
    const action = match.groups?.["action"];
    const reference = match.groups?.["reference"];
    const version = match.groups?.["version"];
    if (!action || action.startsWith("./")) {
      continue;
    }
    const expected = EXPECTED_ACTIONS.get(action);
    if (!expected) {
      violations.push({
        detail: `action ${action} has no reviewed immutable policy entry`,
        file,
        line: lineNumberAt(source, match.index),
        rule: "action-pin",
      });
      continue;
    }
    seenActions.set(action, (seenActions.get(action) ?? 0) + 1);
    if (reference !== expected.reference || version !== expected.version) {
      violations.push({
        detail: `${action} must use reviewed ${expected.version} commit ${expected.reference}`,
        file,
        line: lineNumberAt(source, match.index),
        rule: "action-pin",
      });
    }
  }
  for (const action of EXPECTED_ACTIONS.keys()) {
    if (!seenActions.has(action)) {
      violations.push({
        detail: `required reviewed action is missing: ${action}`,
        file,
        line: 1,
        rule: "action-pin",
      });
    }
  }

  addRequirement(
    violations,
    file,
    source,
    "events",
    /^\s{2}pull_request:\s*$/mu,
    "pull_request trigger is required",
  );
  addRequirement(
    violations,
    file,
    source,
    "events",
    /^\s{2}push:\s*\n\s{4}branches:\s*\[main\]\s*$/mu,
    "push must target main only",
  );
  addRequirement(
    violations,
    file,
    source,
    "events",
    /^\s{2}workflow_dispatch:\s*$/mu,
    "manual dispatch is required",
  );
  if (/pull_request_target/u.test(source)) {
    violations.push({ detail: "pull_request_target is prohibited", file, line: 1, rule: "events" });
  }
  addRequirement(
    violations,
    file,
    source,
    "concurrency",
    /cancel-in-progress:\s*true/u,
    "superseded runs must be cancelled",
  );
  addRequirement(
    violations,
    file,
    source,
    "concurrency",
    /group:\s*ci-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}/u,
    "concurrency must group by pull request or ref",
  );
  addRequirement(
    violations,
    file,
    source,
    "permissions",
    /^permissions:\s*\n\s{2}contents:\s*read\s*$/mu,
    "workflow permissions must be contents: read",
  );
  if (/^\s+[\w-]+:\s*write\s*$/mu.test(source) || /\$\{\{\s*secrets\./u.test(source)) {
    violations.push({
      detail: "workflow must not receive write permission or repository secrets",
      file,
      line: 1,
      rule: "permissions",
    });
  }
  const checkoutCount = seenActions.get("actions/checkout") ?? 0;
  const credentialCount = source.match(/persist-credentials:\s*false/gu)?.length ?? 0;
  if (credentialCount !== checkoutCount) {
    violations.push({
      detail: "every checkout must disable persisted credentials",
      file,
      line: 1,
      rule: "credentials",
    });
  }
  if (/runs-on:\s*ubuntu-latest/u.test(source)) {
    violations.push({
      detail: "runner image must use the explicit ubuntu-24.04 label",
      file,
      line: 1,
      rule: "runner",
    });
  }
  addRequirement(
    violations,
    file,
    source,
    "runner",
    /runs-on:\s*ubuntu-24\.04/u,
    "ubuntu-24.04 runner is required",
  );
  addRequirement(
    violations,
    file,
    source,
    "cache",
    /uses:\s*actions\/cache@/u,
    "pnpm store cache is required",
  );
  addRequirement(
    violations,
    file,
    source,
    "cache",
    /hashFiles\('pnpm-lock\.yaml'\)/u,
    "cache key must include the lockfile hash",
  );
  addRequirement(
    violations,
    file,
    source,
    "cache",
    /package-manager-cache:\s*false/u,
    "implicit setup-node caching must be disabled",
  );
  for (const [pattern, detail] of [
    [/node \.\/tools\/verify-ai-state\.ts/u, "repository-memory check is required"],
    [/\.\/tools\/verify-ai-state\.test\.ts/u, "repository-memory policy tests are required"],
    [/node \.\/tools\/verify-documentation\.ts/u, "documentation check is required"],
    [/node \.\/tools\/verify-community-files\.ts/u, "community-file check is required"],
    [/\.\/tools\/verify-community-files\.test\.ts/u, "community-file policy tests are required"],
    [/node \.\/tools\/scan-secrets\.ts --all/u, "secret scan is required"],
    [/node \.\/tools\/verify-ci-policy\.ts/u, "CI policy check is required"],
    [/node \.\/tools\/verify-local-platform\.mjs/u, "local-platform policy check is required"],
    [/\.\/tools\/verify-local-platform\.test\.mjs/u, "local-platform policy tests are required"],
    [
      /\.\/tools\/verify-discovery-runtime\.test\.mjs/u,
      "Discovery runtime policy tests are required",
    ],
    [/\.\/tools\/reset-local-platform\.test\.mjs/u, "local-reset adverse tests are required"],
    [/pnpm install --frozen-lockfile/u, "frozen installation is required"],
    [/pnpm check:source/u, "non-duplicated source gate is required"],
    [
      /- name: Run source quality and tests\s+env:\s+ASTER_SCHEMA_BASE: \$\{\{ github\.event\.pull_request\.base\.sha \|\| github\.event\.before \|\| '' \}\}\s+run: \|\s+ASTER_SCHEMA_BASE="\$\(node \.\/tools\/resolve-schema-baseline\.ts\)"\s+export ASTER_SCHEMA_BASE\s+pnpm check:source/u,
      "schema compatibility must resolve a distinct event or manual baseline before the source gate",
    ],
    [
      /\.\/tools\/resolve-schema-baseline\.test\.ts/u,
      "schema compatibility baseline selection needs executable regression tests",
    ],
    [
      /quality:[\s\S]*?- name: Check out repository[\s\S]*?with:\s+fetch-depth: 0\s+persist-credentials: false/u,
      "schema compatibility requires complete checkout history",
    ],
    [
      /- name: Verify Docker context boundary\s+if: needs\.classify\.outputs\.platform == 'true'\s+timeout-minutes: 1\s+run: node \.\/tools\/verify-docker-context\.mjs\s*\n/u,
      "Docker context requires a bounded real canary probe for applicable platform changes",
    ],
    [
      /- name: Prove real platform integration\s+if: needs\.classify\.outputs\.platform == 'true'\s+timeout-minutes: 15\s+run: pnpm integration\s*\n/u,
      "real integration must run once with a deadline for applicable platform changes",
    ],
    [
      /- name: Prove Catalog runtime and generated publication\s+if: needs\.classify\.outputs\.platform == 'true'\s+timeout-minutes: 10\s+run: \|\s+pnpm catalog:media\s+pnpm catalog:demo/u,
      "Catalog changes require bounded generated-media and real Docker acceptance",
    ],
    [
      /- name: Prove Playback persistence and federated runtime\s+if: needs\.classify\.outputs\.platform == 'true'\s+timeout-minutes: 10\s+run: \|\s+pnpm playback:integration\s+pnpm playback:runtime/u,
      "Playback changes require bounded real persistence and federated runtime acceptance",
    ],
    [
      /- name: Prove Engagement persistence and federated progress\s+if: needs\.classify\.outputs\.platform == 'true'\s+timeout-minutes: 20\s+run: \|\s+pnpm engagement:integration\s+pnpm engagement:rate-limit-integration\s+pnpm engagement:runtime/u,
      "Engagement changes require bounded real persistence, Redis admission and owner-authorized progress acceptance",
    ],
    [
      /- name: Prove Discovery projection and federated search\s+if: needs\.classify\.outputs\.platform == 'true'\s+timeout-minutes: 15\s+run: \|\s+pnpm discovery:integration\s+pnpm discovery:runtime/u,
      "Discovery changes require bounded real projection and federated search acceptance",
    ],
    [
      /- name: Prove Docker-only playable demo\s+if: needs\.classify\.outputs\.platform == 'true'\s+timeout-minutes: 15/u,
      "playable demo requires a bounded affected-scope acceptance gate",
    ],
    [
      /playable_compose up --build --wait --wait-timeout 180 web/u,
      "playable demo must start from its Docker build",
    ],
    [
      /pnpm --filter @aster\/web exec playwright test demo\.spec\.ts/u,
      "playable demo requires the real browser journey",
    ],
    [/trap cleanup_playable EXIT/u, "playable demo must clean its unique CI project on exit"],
    [
      /personalized_compose down --volumes --timeout 10/u,
      "playable demo cleanup must include the personalized model and stay project-scoped",
    ],
    [
      /playable_compose logs --no-color --tail 1 playable-seed \| grep '"changed":false'/u,
      "playable seed replay must be idempotent",
    ],
    [
      /ASTER_PLAYABLE_DEMO: "true"\s+ASTER_ENGAGEMENT_DEMO: "true"/u,
      "playable browser journeys must be enabled, not silently skipped",
    ],
    [
      /personalized_compose\(\) \{\s+docker compose --project-name "\$aster_playable_project" --file infra\/compose\/compose\.yml --file infra\/compose\/playable\.yml --file infra\/compose\/events\.yml --profile runtime "\$@"\s+\}/u,
      "personalized playable startup and cleanup must use the same exact project and overlays",
    ],
    [
      /wait_playable_topics\(\) \{\s+aster_topic_init="\$\(personalized_compose ps --all --quiet broker-init\)"\s+test -n "\$aster_topic_init"\s+test "\$\(timeout 120s docker wait "\$aster_topic_init"\)" = 0\s+\}/u,
      "playable topic initialization must finish successfully within its deadline",
    ],
    [
      /personalized_compose up --build --wait --wait-timeout 180 web identity engagement broker-init\s+wait_playable_topics\s+pnpm --filter @aster\/web exec playwright test engagement\.spec\.ts\s+personalized_compose up --no-build --wait --wait-timeout 90 web identity engagement broker-init\s+wait_playable_topics\s+personalized_compose logs --no-color --tail 1 playable-seed \| grep '"changed":false'\s+personalized_compose logs --no-color --tail 1 playable-generate \| grep 'generated_hls_reused'/u,
      "personalized playable acceptance requires actual browser save/resume, initialization and replay",
    ],
    [/pnpm audit --audit-level=high/u, "high-severity registry audit is required"],
    [/^\s{4}name:\s*Local platform\s*$/mu, "local-platform job is required"],
    [
      /needs\.classify\.outputs\.platform == 'true'/u,
      "local-platform job must use the isolated path decision",
    ],
    [
      /COMPOSE_PROJECT_NAME:\s*aster-ci-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/u,
      "local-platform job must use a unique run-scoped Compose project",
    ],
    [
      /docker compose --file "\$COMPOSE_FILE" config --quiet/u,
      "local-platform job must validate the Compose model",
    ],
    [
      /docker compose --file "\$COMPOSE_FILE" pull/u,
      "local-platform job must pull immutable images",
    ],
    [
      /docker compose --file "\$COMPOSE_FILE" up\s+--wait --wait-timeout 120 platform-status/u,
      "local-platform job must run the bounded health-gated status target",
    ],
    [/SHOW server_version/u, "local-platform job must verify PostgreSQL"],
    [/redis_version:8\.10\.0/u, "local-platform job must verify Redis"],
    [/aster local platform initialized/u, "local-platform job must verify initialization"],
    [
      /- name: Remove only the CI Compose project\s+if: always\(\)\s+run: docker compose --file "\$COMPOSE_FILE" --file infra\/compose\/observability.yml --profile "\*" down --volumes --remove-orphans --timeout 10/u,
      "local-platform job must always remove only its unique Compose project",
    ],
    [
      /- name: Build and start the Docker-only full profile\s+timeout-minutes: 10\s+run: >-\s+docker compose --file "\$COMPOSE_FILE" --file infra\/compose\/observability.yml\s+--profile full up --build --wait --wait-timeout 120/u,
      "Docker-only full profile must build and start with a bounded deadline",
    ],
    [
      /- name: Verify local Identity product API\s+timeout-minutes: 1\s+run: >-\s+docker compose --file "\$COMPOSE_FILE" --file infra\/compose\/observability.yml\s+--profile full exec -T identity node --input-type=module - --compose-router < tools\/verify-local-identity.mjs/u,
      "packaged Identity product behavior must use the internal Router within a bounded deadline",
    ],
    [
      /- name: Verify packaged health and real telemetry\s+timeout-minutes: 2\s+run: \|/u,
      "Docker-only health and telemetry verification must have a bounded deadline",
    ],
    [
      /assert.equal\(process.getuid\(\), 1000\)/u,
      "Docker-only demo must verify the packaged non-root runtime",
    ],
    [/assert.deepEqual\(present, required\)/u, "Docker-only demo must require every metric family"],
    [
      /for \(const sli of \['supergraph', 'catalog_title_read'\]\)/u,
      "Docker-only demo must verify both live Router-backed SLI ratios",
    ],
    [
      /^\s*allow-licenses: *0BSD, Apache-2\.0, BSD-2-Clause, BSD-3-Clause, BlueOak-1\.0\.0, Elastic-2\.0, ISC, MIT, MITNFA *$/mu,
      "dependency review must enforce the reviewed license set",
    ],
  ] as const) {
    addRequirement(violations, file, source, "commands", pattern, detail);
  }
  if ((source.match(/^\s*allow-dependencies-licenses:/gmu) ?? []).length !== 1) {
    violations.push({
      detail: "dependency license exceptions must be declared exactly once",
      file,
      line: 1,
      rule: "commands",
    });
  }
  const exceptions = source
    .match(/^ {10}allow-dependencies-licenses: >-\n((?: {12}[^\n]+\n)+)/mu)?.[1]
    ?.split(",")
    .map((entry) => entry.trim());
  if (JSON.stringify(exceptions) !== JSON.stringify(reviewedLicensePurls)) {
    violations.push({
      detail: "dependency license exceptions must match the exact ADR-0019/0020 packages",
      file,
      line: 1,
      rule: "commands",
    });
  }
  if (/docker\s+(?:system|container|volume|network|image)\s+prune/u.test(source)) {
    violations.push({
      detail: "broad Docker prune commands are prohibited",
      file,
      line: 1,
      rule: "commands",
    });
  }
  addRequirement(
    violations,
    file,
    source,
    "aggregate",
    /^\s{4}name:\s*CI required\s*$/mu,
    "stable CI required job name is missing",
  );
  addRequirement(
    violations,
    file,
    source,
    "aggregate",
    /^\s{4}if:\s*always\(\)\s*$/mu,
    "aggregate job must always evaluate results",
  );
  addRequirement(
    violations,
    file,
    source,
    "aggregate",
    /needs:\s*\[classify, governance, quality, dependency-review, platform\]/u,
    "aggregate job must depend on every decision job",
  );
  for (const [pattern, detail] of [
    [
      /FULL_PATH:\s*\$\{\{ needs\.classify\.outputs\.full \}\}/u,
      "aggregate must receive the path decision",
    ],
    [
      /PLATFORM_PATH:\s*\$\{\{ needs\.classify\.outputs\.platform \}\}/u,
      "aggregate must receive the platform path decision",
    ],
    [/EVENT_NAME:\s*\$\{\{ github\.event_name \}\}/u, "aggregate must receive the event name"],
    [
      /IS_DRAFT:\s*\$\{\{ github\.event\.pull_request\.draft \|\| false \}\}/u,
      "aggregate must receive a safe draft default",
    ],
    [
      /\[\[ "\$FULL_PATH" != "true" && "\$FULL_PATH" != "false" \]\]/u,
      "aggregate must reject a missing or invalid path decision",
    ],
    [
      /"\$quality_expected" == "false" && "\$QUALITY_RESULT" != "skipped"/u,
      "aggregate must reject an unexpected quality result",
    ],
    [
      /"\$dependency_expected" == "false" && "\$DEPENDENCY_RESULT" != "skipped"/u,
      "aggregate must reject an unexpected dependency-review result",
    ],
    [
      /"\$platform_expected" == "false" && "\$PLATFORM_RESULT" != "skipped"/u,
      "aggregate must reject an unexpected local-platform result",
    ],
  ] as const) {
    addRequirement(violations, file, source, "aggregate", pattern, detail);
  }
  if (/continue-on-error:\s*true/u.test(source)) {
    violations.push({
      detail: "mandatory CI jobs cannot continue on error",
      file,
      line: 1,
      rule: "aggregate",
    });
  }
  return violations;
}

export function validateDependabotPolicy(
  source: string,
  file = ".github/dependabot.yml",
): CiPolicyViolation[] {
  const violations: CiPolicyViolation[] = [];
  for (const [pattern, detail] of [
    [/^version:\s*2\s*$/mu, "Dependabot configuration version must be 2"],
    [/package-ecosystem:\s*npm/u, "weekly npm updates are required"],
    [/package-ecosystem:\s*github-actions/u, "weekly GitHub Actions updates are required"],
    [/interval:\s*weekly/gu, "updates must use a low-noise weekly schedule"],
    [/open-pull-requests-limit:/u, "open pull requests must be bounded"],
  ] as const) {
    const matches = source.match(pattern)?.length ?? 0;
    const requiredMatches = pattern.global ? 2 : 1;
    if (matches < requiredMatches) {
      violations.push({ detail, file, line: 1, rule: "dependabot" });
    }
  }
  return violations;
}

export async function scanCiPolicy(
  repositoryRoot = defaultRepositoryRoot,
): Promise<CiPolicyViolation[]> {
  const workflowDirectory = resolve(repositoryRoot, ".github", "workflows");
  const entries = await readdir(workflowDirectory, { withFileTypes: true });
  const workflowFiles = entries
    .filter((entry) => entry.isFile() && /\.ya?ml$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (workflowFiles.length === 0 || workflowFiles.length > MAX_WORKFLOW_FILES) {
    throw new Error(`workflow file count must be between 1 and ${MAX_WORKFLOW_FILES}`);
  }
  const violations: CiPolicyViolation[] = [];
  for (const workflowFile of workflowFiles) {
    const path = resolve(workflowDirectory, workflowFile);
    const source = await readFile(path, "utf8");
    if (workflowFile === "ci.yml") {
      violations.push(...validateWorkflowPolicy(source));
    } else {
      ACTION_REFERENCE.lastIndex = 0;
      for (const match of source.matchAll(ACTION_REFERENCE)) {
        const reference = match.groups?.["reference"];
        if (reference && !/^[a-f\d]{40}$/u.test(reference)) {
          violations.push({
            detail: "all external actions must use a full commit SHA",
            file: `.github/workflows/${workflowFile}`,
            line: lineNumberAt(source, match.index),
            rule: "action-pin",
          });
        }
      }
    }
  }
  violations.push(
    ...validateDependabotPolicy(
      await readFile(resolve(repositoryRoot, ".github", "dependabot.yml"), "utf8"),
    ),
  );
  return violations.sort((left, right) =>
    `${left.file}:${String(left.line).padStart(8, "0")}:${left.rule}`.localeCompare(
      `${right.file}:${String(right.line).padStart(8, "0")}:${right.rule}`,
    ),
  );
}

export async function runCiPolicyCheck(repositoryRoot = defaultRepositoryRoot): Promise<number> {
  try {
    const violations = await scanCiPolicy(repositoryRoot);
    if (violations.length > 0) {
      console.error(JSON.stringify({ check: "ci-policy", status: "error", violations }, null, 2));
      return 1;
    }
    console.log(JSON.stringify({ check: "ci-policy", status: "ok", violations: 0 }));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({ check: "ci-policy", status: "error", errors: [message] }, null, 2),
    );
    return 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  process.exitCode = await runCiPolicyCheck();
}
