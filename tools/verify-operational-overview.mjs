import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

import { serviceBlock } from "./verify-optional-platform.mjs";

const GRAFANA_IMAGE =
  "docker.io/grafana/grafana:13.2.0@sha256:3fd54ae1214669f8355f065ec9f6445d5279a3d77095ab048ca045685272429b";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourcePaths = Object.freeze({
  compose: "infra/compose/observability.yml",
  dashboard: "infra/grafana/dashboards/operational-overview.json",
  dashboardProvider: "infra/grafana/provisioning/dashboards/provider.yml",
  datasource: "infra/grafana/provisioning/datasources/prometheus.yml",
  dockerfile: "infra/docker/grafana.Dockerfile",
  sloContract: "infra/observability/slo-contract.json",
});

const userImpactSliIds = Object.freeze([
  "supergraph",
  "catalog_title_read",
  "playback_start",
  "progress_write",
]);
const queries = Object.freeze([
  ...userImpactSliIds.map((sli) => `aster:sli:good:ratio_rate5m{sli="${sli}"}`),
  "aster:sli:population:rate5m",
  "sum by (aster_dependency, aster_operation, aster_outcome) (rate(aster_dependency_operation_outcomes_total[5m]))",
  "histogram_quantile(0.95, sum by (le, aster_dependency, aster_operation) (rate(aster_dependency_operation_duration_seconds_bucket[5m])))",
  "sum by (aster_dependency, aster_operation) (aster_dependency_operation_active)",
  "max(sum without (cpu_mode) (process_cpu_utilization_ratio))",
  "max(process_memory_usage_bytes)",
  "max(nodejs_eventloop_delay_p99_seconds)",
  "sum by (aster_postgresql_pool, aster_postgresql_pool_state, aster_postgresql_connection_state) (aster_postgresql_pool_connections)",
]);

function requireValues(source, values, violations, scope) {
  for (const value of values) {
    if (!source.includes(value)) {
      violations.push({
        rule: "operational-overview",
        detail: `${scope} missing: ${value.trim()}`,
      });
    }
  }
}

function rejectValues(source, values, violations, scope) {
  for (const value of values) {
    if (source.includes(value)) {
      violations.push({ rule: "operational-overview", detail: `${scope} prohibits: ${value}` });
    }
  }
}

export async function readOperationalOverviewSources(root = repositoryRoot) {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(sourcePaths).map(async ([name, path]) => [
        name,
        await readFile(resolve(root, path), "utf8"),
      ]),
    ),
  );
}

function validateDockerfile(source, violations) {
  const expected = `FROM ${GRAFANA_IMAGE}
COPY --chown=472:0 infra/grafana/provisioning /etc/grafana/provisioning
COPY --chown=472:0 infra/grafana/dashboards /etc/grafana/provisioning/dashboards-json
USER 472`;
  if (source.trim() !== expected) {
    violations.push({
      rule: "operational-overview",
      detail:
        "Grafana image must retain the reviewed pin, immutable provisioning and non-root user",
    });
  }
}

function validateCompose(source, violations) {
  const block = serviceBlock(source, "grafana");
  requireValues(
    block,
    [
      "    profiles: [observability, full]\n",
      "    build:\n      context: ../..\n      dockerfile: infra/docker/grafana.Dockerfile\n",
      "      com.aster.environment: local\n      com.aster.scope: platform\n",
      '      GF_AUTH_ANONYMOUS_DEVICE_LIMIT: "8"\n',
      '      GF_AUTH_ANONYMOUS_ENABLED: "true"\n',
      "      GF_AUTH_ANONYMOUS_ORG_NAME: Main Org.\n",
      "      GF_AUTH_ANONYMOUS_ORG_ROLE: Viewer\n",
      '      GF_AUTH_BASIC_ENABLED: "false"\n',
      '      GF_AUTH_DISABLE_LOGIN_FORM: "true"\n',
      "      GF_DASHBOARDS_MIN_REFRESH_INTERVAL: 15s\n",
      '      GF_DATAPROXY_TIMEOUT: "3"\n',
      '      GF_PLUGINS_PLUGIN_ADMIN_ENABLED: "false"\n',
      '      GF_PLUGINS_PREINSTALL_AUTO_UPDATE: "false"\n',
      '      GF_PLUGINS_PREINSTALL_DISABLED: "true"\n',
      '      GF_SECURITY_DISABLE_INITIAL_ADMIN_CREATION: "true"\n',
      "      GF_SERVER_ROOT_URL: http://127.0.0.1:3001\n",
      '      GF_SNAPSHOTS_EXTERNAL_ENABLED: "false"\n',
      '      - "127.0.0.1:3001:3000"\n',
      "    networks: [edge]\n",
      "      prometheus:\n        condition: service_healthy\n",
      "    read_only: true\n",
      "      - /var/lib/grafana:size=64m,uid=472,gid=0,mode=0750\n",
      "      - /tmp:size=8m,uid=472,gid=0,mode=0700\n",
      "    cap_drop: [ALL]\n",
      "    security_opt: [no-new-privileges:true]\n",
      "    cpus: 0.5\n",
      "    mem_limit: 384m\n",
      "    pids_limit: 128\n",
      '    restart: "no"\n',
      "    stop_grace_period: 5s\n",
      'http://127.0.0.1:3000/api/health"]\n',
      '        max-size: "5m"\n        max-file: "2"\n',
    ],
    violations,
    "Grafana service",
  );
  rejectValues(
    block,
    [
      "    image:",
      "    volumes:",
      "    command:",
      "    entrypoint:",
      "privileged:",
      "cap_add:",
      "network_mode:",
      "env_file:",
      "${",
      "GF_SECURITY_ADMIN",
      "GF_AUTH_PROXY",
      "GF_DATABASE_URL",
      "GF_INSTALL_PLUGINS",
      "[platform",
      ", platform",
    ],
    violations,
    "Grafana service",
  );
}

function validateProvisioning(sources, violations) {
  requireValues(
    sources.datasource ?? "",
    [
      "uid: aster-prometheus\n",
      "type: prometheus\n",
      "access: proxy\n",
      "url: http://prometheus:9090\n",
      "isDefault: true\n",
      "editable: false\n",
      "httpMethod: POST\n",
      "manageAlerts: false\n",
      "prometheusVersion: 3.14.0\n",
      "timeInterval: 5s\n",
    ],
    violations,
    "Prometheus data source",
  );
  rejectValues(
    sources.datasource ?? "",
    ["basicAuth", "password", "secureJsonData", "tlsAuth", "editable: true", "http://127.0.0.1"],
    violations,
    "Prometheus data source",
  );
  requireValues(
    sources.dashboardProvider ?? "",
    [
      "folderUid: aster\n",
      "type: file\n",
      "disableDeletion: true\n",
      "allowUiUpdates: false\n",
      "updateIntervalSeconds: 30\n",
      "path: /etc/grafana/provisioning/dashboards-json\n",
      "foldersFromFilesStructure: false\n",
    ],
    violations,
    "dashboard provider",
  );
}

function validateDashboard(source, sloContractSource, violations) {
  let dashboard;
  let sloContract;
  try {
    dashboard = JSON.parse(source);
    sloContract = JSON.parse(sloContractSource);
  } catch {
    violations.push({
      rule: "operational-overview",
      detail: "dashboard or SLO contract JSON is invalid",
    });
    return;
  }
  if (
    !Array.isArray(sloContract?.slis) ||
    JSON.stringify(sloContract.slis.map((sli) => sli?.id)) !== JSON.stringify(userImpactSliIds)
  ) {
    violations.push({
      rule: "operational-overview",
      detail: "user-impact panels must follow the released SLO contract IDs and order",
    });
  }
  if (
    dashboard === null ||
    Array.isArray(dashboard) ||
    typeof dashboard !== "object" ||
    dashboard.uid !== "aster-operational-overview" ||
    dashboard.title !== "Aster Operational Overview" ||
    dashboard.editable !== false ||
    dashboard.refresh !== "30s" ||
    dashboard.time?.from !== "now-30m" ||
    dashboard.time?.to !== "now" ||
    JSON.stringify(dashboard.templating) !== '{"list":[]}'
  ) {
    violations.push({
      rule: "operational-overview",
      detail: "dashboard identity, read-only state, time window or refresh policy changed",
    });
  }
  const panels = Array.isArray(dashboard?.panels) ? dashboard.panels : [];
  if (panels.length !== 15) {
    violations.push({
      rule: "operational-overview",
      detail: "dashboard must contain 15 bounded panels",
    });
    return;
  }
  const expectedStructure = [
    [1, "User impact", "row", 0, 0, 24, 1],
    [2, "Supergraph success ratio", "stat", 0, 1, 6, 5],
    [3, "Catalog read latency ratio", "stat", 6, 1, 6, 5],
    [4, "Playback session ratio", "stat", 12, 1, 6, 5],
    [5, "Progress write ratio", "stat", 18, 1, 6, 5],
    [6, "SLI measured population", "timeseries", 0, 6, 24, 7],
    [7, "Dependency health", "row", 0, 13, 24, 1],
    [8, "Dependency outcome rate", "timeseries", 0, 14, 8, 8],
    [9, "Dependency p95 latency", "timeseries", 8, 14, 8, 8],
    [10, "Active dependency operations", "timeseries", 16, 14, 8, 8],
    [11, "Runtime saturation", "row", 0, 22, 24, 1],
    [12, "Peak process CPU", "timeseries", 0, 23, 6, 7],
    [13, "Peak process memory", "timeseries", 6, 23, 6, 7],
    [14, "Peak event-loop p99", "timeseries", 12, 23, 6, 7],
    [15, "PostgreSQL pool state", "timeseries", 18, 23, 6, 7],
  ];
  const actualStructure = panels.map((panel) => [
    panel?.id,
    panel?.title,
    panel?.type,
    panel?.gridPos?.x,
    panel?.gridPos?.y,
    panel?.gridPos?.w,
    panel?.gridPos?.h,
  ]);
  if (JSON.stringify(actualStructure) !== JSON.stringify(expectedStructure)) {
    violations.push({
      rule: "operational-overview",
      detail: "dashboard panel identity, type, order or non-overlapping grid changed",
    });
  }
  const ids = panels.map((panel) => panel?.id);
  if (new Set(ids).size !== panels.length || ids.some((id) => !Number.isInteger(id))) {
    violations.push({
      rule: "operational-overview",
      detail: "dashboard panel IDs must be unique integers",
    });
  }
  const rows = panels.filter((panel) => panel?.type === "row");
  if (
    JSON.stringify(rows.map((panel) => panel.title)) !==
    JSON.stringify(["User impact", "Dependency health", "Runtime saturation"])
  ) {
    violations.push({
      rule: "operational-overview",
      detail: "dashboard must preserve the three ordered operational layers",
    });
  }
  const dataPanels = panels.filter((panel) => panel?.type !== "row");
  const expressions = [];
  for (const panel of dataPanels) {
    const targets = Array.isArray(panel?.targets) ? panel.targets : [];
    const grid = panel?.gridPos;
    const isCurrentSliStat = panel?.type === "stat" && panel?.id >= 2 && panel.id <= 5;
    if (
      typeof panel?.title !== "string" ||
      panel.title.length < 5 ||
      panel.title.length > 80 ||
      typeof panel?.description !== "string" ||
      panel.description.length > 240 ||
      !panel.description.includes("?") ||
      JSON.stringify(panel?.datasource) !== '{"type":"prometheus","uid":"aster-prometheus"}' ||
      targets.length !== 1 ||
      targets[0]?.editorMode !== "code" ||
      targets[0]?.range !== !isCurrentSliStat ||
      targets[0]?.instant !== isCurrentSliStat ||
      !Number.isInteger(grid?.x) ||
      !Number.isInteger(grid?.y) ||
      !Number.isInteger(grid?.w) ||
      !Number.isInteger(grid?.h) ||
      grid.x < 0 ||
      grid.w < 1 ||
      grid.x + grid.w > 24 ||
      grid.h < 1 ||
      grid.h > 8
    ) {
      violations.push({
        rule: "operational-overview",
        detail: `panel ${String(panel?.id)} violates bounded question, source, target or grid policy`,
      });
    }
    expressions.push(targets[0]?.expr);
  }
  if (JSON.stringify(expressions) !== JSON.stringify(queries)) {
    violations.push({
      rule: "operational-overview",
      detail: "dashboard PromQL must match the reviewed finite query set and order",
    });
  }
  rejectValues(
    source,
    [
      '"variables"',
      '"editable": true',
      '"sharedCrosshair"',
      "trace_id",
      "span_id",
      "graphql_document",
      "signed_url",
      "user_id",
      "profile_id",
      "email",
      "$__",
    ],
    violations,
    "dashboard",
  );
}

export function validateOperationalOverview(sources) {
  const violations = [];
  const limits = {
    compose: 32_768,
    dashboard: 32_768,
    dashboardProvider: 4_096,
    datasource: 4_096,
    dockerfile: 4_096,
    sloContract: 32_768,
  };
  for (const [name, limit] of Object.entries(limits)) {
    const source = sources[name] ?? "";
    if (Buffer.byteLength(source) > limit || /[\0\t\uFFFD]/u.test(source)) {
      violations.push({
        rule: "operational-overview",
        detail: `${name} input is missing, malformed or exceeds ${limit} bytes`,
      });
    }
  }
  if (violations.length > 0) {
    return violations;
  }
  validateDockerfile(sources.dockerfile, violations);
  validateCompose(sources.compose, violations);
  validateProvisioning(sources, violations);
  validateDashboard(sources.dashboard, sources.sloContract, violations);
  return violations;
}

async function runOperationalOverviewCheck(root = repositoryRoot) {
  try {
    const violations = validateOperationalOverview(await readOperationalOverviewSources(root));
    if (violations.length > 0) {
      console.error(
        JSON.stringify({ check: "operational-overview", status: "error", violations }, null, 2),
      );
      return 1;
    }
    console.log(JSON.stringify({ check: "operational-overview", status: "ok", panels: 15 }));
    return 0;
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          check: "operational-overview",
          status: "error",
          errors: [error instanceof Error ? error.message : String(error)],
        },
        null,
        2,
      ),
    );
    return 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  process.exitCode = await runOperationalOverviewCheck();
}
