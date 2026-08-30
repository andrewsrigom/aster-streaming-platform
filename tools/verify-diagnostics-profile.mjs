import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

import { serviceBlock } from "./verify-optional-platform.mjs";

export const TEMPO_IMAGE =
  "docker.io/grafana/tempo:3.0.0@sha256:78439f7f7cf3c97122846c13a832e060c6c7ef67dcc814dccf0a5f3f78393a93";
export const DIAGNOSTIC_PROJECT =
  /^aster-p12-diagnostics-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourcePaths = Object.freeze({
  compose: "infra/compose/diagnostics.yml",
  proof: "infra/compose/diagnostics-proof.yml",
  collector: "infra/compose/collector.diagnostics.yml",
  tempo: "infra/observability/tempo.yml",
  datasource: "infra/grafana/diagnostics/tempo.yml",
  tempoDockerfile: "infra/docker/tempo.Dockerfile",
  collectorDockerfile: "infra/docker/collector.diagnostics.Dockerfile",
  grafanaDockerfile: "infra/docker/grafana.diagnostics.Dockerfile",
  runner: "tools/run-diagnostic-exercises.mjs",
});

function requireValues(source, values, violations, scope) {
  for (const value of values) {
    if (!source.includes(value)) {
      violations.push({ rule: "diagnostics-profile", detail: `${scope} missing: ${value.trim()}` });
    }
  }
}

function rejectValues(source, values, violations, scope) {
  for (const value of values) {
    if (source.includes(value)) {
      violations.push({ rule: "diagnostics-profile", detail: `${scope} prohibits: ${value}` });
    }
  }
}

export function validateDiagnosticProjectName(value) {
  return typeof value === "string" && DIAGNOSTIC_PROJECT.test(value);
}

export async function readDiagnosticsSources(root = repositoryRoot) {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(sourcePaths).map(async ([name, path]) => [
        name,
        await readFile(resolve(root, path), "utf8"),
      ]),
    ),
  );
}

function validateImages(sources, violations) {
  const expectedTempo = `FROM ${TEMPO_IMAGE}\nCOPY --chown=10001:10001 infra/observability/tempo.yml /etc/aster/tempo.yml\nUSER 10001:10001`;
  const expectedCollector =
    'FROM docker.io/otel/opentelemetry-collector:0.159.0@sha256:7725a7a10c87d8853208bdd4bb3439ad3c0d7b32b4292b9300ac07c8daba14a2\nCOPY infra/compose/collector.diagnostics.yml /etc/aster/collector.yml\nCMD ["--config=/etc/aster/collector.yml"]';
  const expectedGrafana =
    "FROM docker.io/grafana/grafana:13.2.0@sha256:3fd54ae1214669f8355f065ec9f6445d5279a3d77095ab048ca045685272429b\nCOPY --chown=472:0 infra/grafana/provisioning /etc/grafana/provisioning\nCOPY --chown=472:0 infra/grafana/dashboards /etc/grafana/provisioning/dashboards-json\nCOPY --chown=472:0 infra/grafana/diagnostics/tempo.yml /etc/grafana/provisioning/datasources/tempo.yml\nUSER 472";
  for (const [name, expected] of [
    ["tempoDockerfile", expectedTempo],
    ["collectorDockerfile", expectedCollector],
    ["grafanaDockerfile", expectedGrafana],
  ]) {
    if ((sources[name] ?? "").trim() !== expected) {
      violations.push({
        rule: "diagnostics-profile",
        detail: `${name} must retain the reviewed digest, configuration and non-root user`,
      });
    }
  }
}

function validateCompose(source, proof, violations) {
  const tempo = serviceBlock(source, "tempo");
  requireValues(
    tempo,
    [
      "    profiles: [full]\n",
      "      dockerfile: infra/docker/tempo.Dockerfile\n",
      "      com.aster.authority: disposable-local\n",
      "      com.aster.scope: diagnostics\n",
      '    command: ["-target=all", "-config.file=/etc/aster/tempo.yml"]\n',
      "      GOMEMLIMIT: 320MiB\n",
      "    networks: [diagnostics-ingest, diagnostics-query]\n",
      '    user: "10001:10001"\n',
      "    read_only: true\n",
      "      - /var/tempo:size=128m,uid=10001,gid=10001,mode=0700\n",
      "      - /tmp:size=8m,uid=10001,gid=10001,mode=0700\n",
      "    cap_drop: [ALL]\n",
      "    security_opt: [no-new-privileges:true]\n",
      "    cpus: 0.5\n",
      "    mem_limit: 384m\n",
      "    pids_limit: 128\n",
      '    restart: "no"\n',
      "    stop_grace_period: 5s\n",
      '        max-size: "5m"\n        max-file: "2"\n',
    ],
    violations,
    "Tempo service",
  );
  rejectValues(
    tempo,
    [
      "    image:",
      "    ports:",
      "    volumes:",
      "privileged:",
      "cap_add:",
      "network_mode:",
      "env_file:",
      "${",
      "platform",
      "edge",
    ],
    violations,
    "Tempo service",
  );
  for (const [name, dockerfile, networks] of [
    [
      "collector",
      "infra/docker/collector.diagnostics.Dockerfile",
      "    networks: !override [platform, diagnostics-ingest]\n",
    ],
    [
      "grafana",
      "infra/docker/grafana.diagnostics.Dockerfile",
      "    networks: !override [edge, diagnostics-query]\n",
    ],
  ]) {
    const block = serviceBlock(source, name);
    requireValues(
      block,
      [
        `      dockerfile: ${dockerfile}\n`,
        networks,
        "      tempo:\n        condition: service_started\n",
      ],
      violations,
      `${name} diagnostic override`,
    );
  }
  requireValues(
    source,
    [
      "  diagnostics-ingest:\n    internal: true\n",
      "      com.aster.scope: diagnostics-ingest\n",
      "  diagnostics-query:\n    internal: true\n",
      "      com.aster.scope: diagnostics-query\n",
    ],
    violations,
    "diagnostic networks",
  );
  requireValues(
    proof,
    [
      "    volumes: !reset []\n",
      "      - /var/lib/postgresql:rw,size=256m\n",
      '    ports: !override ["127.0.0.1::4000"]\n',
      '    ports: !override ["127.0.0.1::9090"]\n',
      '    ports: !override ["127.0.0.1::3000"]\n',
    ],
    violations,
    "disposable proof",
  );
  rejectValues(
    proof,
    ["0.0.0.0", "127.0.0.1::3200", "postgres-data:", "prometheus-data:", "type: bind", "${"],
    violations,
    "disposable proof",
  );
  rejectValues(serviceBlock(proof, "tempo"), ["ports:"], violations, "Tempo proof override");
}

function validateTempo(source, violations) {
  requireValues(
    source,
    [
      "stream_over_http_enabled: true\n",
      "multitenancy_enabled: false\n",
      "  http_listen_address: 0.0.0.0\n",
      "  grpc_listen_address: 127.0.0.1\n",
      "  http_server_read_timeout: 3s\n",
      "  http_server_write_timeout: 3s\n",
      "  http_server_idle_timeout: 10s\n",
      "max_request_body_size: 1048576\n",
      "    backend: local\n",
      "      path: /var/tempo/wal\n",
      "      path: /var/tempo/blocks\n",
      "  max_retries: 0\n",
      "  max_outstanding_per_tenant: 64\n",
      "  max_query_expression_size_bytes: 4096\n",
      "    concurrent_jobs: 2\n",
      "    default_result_limit: 20\n",
      "    max_result_limit: 20\n",
      "  max_concurrent_queries: 2\n",
      "    query_timeout: 2s\n",
      "      rate_limit_bytes: 1048576\n",
      "      burst_size_bytes: 1048576\n",
      "      max_traces_per_user: 256\n",
      "      max_bytes_per_trace: 262144\n",
      "      block_retention: 1h\n",
      "  reporting_enabled: false\n",
    ],
    violations,
    "Tempo configuration",
  );
  if (source.split("    query_timeout: 2s\n").length !== 3) {
    violations.push({
      rule: "diagnostics-profile",
      detail: "both Tempo trace-by-ID and search queries require a two-second timeout",
    });
  }
  rejectValues(
    source,
    [
      "s3:",
      "gcs:",
      "azure:",
      "kafka:",
      "reporting_enabled: true",
      "block_retention: 0",
      "max_retries: 1",
    ],
    violations,
    "Tempo configuration",
  );
}

function validateCollector(source, violations) {
  requireValues(
    source,
    [
      "        max_request_body_size: 1048576\n",
      "    limit_mib: 96\n",
      "    spike_limit_mib: 32\n",
      "      - key: graphql.operation.name\n        action: delete\n",
      "      - key: graphql.document\n        action: delete\n",
      "      - key: otel.name\n        action: delete\n",
      "  otlphttp/tempo:\n    endpoint: http://tempo:4318\n",
      "    timeout: 1s\n",
      "      initial_interval: 100ms\n",
      "      max_interval: 500ms\n",
      "      max_elapsed_time: 2s\n",
      "      num_consumers: 1\n",
      "      queue_size: 128\n",
      "      processors: [memory_limiter, span/router_names, attributes/router_privacy]\n",
      "      exporters: [debug, otlphttp/tempo]\n",
      "      exporters: [prometheus]\n",
    ],
    violations,
    "Collector diagnostic configuration",
  );
  rejectValues(
    source,
    [
      "retry_on_failure:\n      enabled: false",
      "sending_queue:\n      enabled: false",
      "queue_size: 0",
      "max_elapsed_time: 0s",
      "graphql.document\n        action: insert",
    ],
    violations,
    "Collector diagnostic configuration",
  );
}

function validateDatasource(source, violations) {
  requireValues(
    source,
    [
      "uid: aster-tempo\n",
      "type: tempo\n",
      "access: proxy\n",
      "url: http://tempo:3200\n",
      "isDefault: false\n",
      "editable: false\n",
      "datasourceUid: aster-prometheus\n",
      "spanStartTimeShift: -1m\n",
      "spanEndTimeShift: 1m\n",
      "aster_dependency_operation_outcomes_total[5m]",
    ],
    violations,
    "Tempo data source",
  );
  rejectValues(
    source,
    ["basicAuth", "secureJsonData", "editable: true", "http://127.0.0.1", "${"],
    violations,
    "Tempo data source",
  );
}

function validateRunner(source, violations) {
  requireValues(
    source,
    [
      'const project = "aster-p12-diagnostics-" + randomUUID();\n',
      "const RUN_BUDGET_MS = 12 * 60 * 1000;\n",
      '"infra/compose/diagnostics-proof.yml",\n',
      'const SCENARIOS = Object.freeze(["catalog", "postgres", "redis"]);\n',
      "const nativeAbortSignal = globalThis.AbortSignal;\n",
      "const NativeAbortController = globalThis.AbortController;\n",
      'process.once("SIGINT", interrupt);\n',
      'process.once("SIGTERM", interrupt);\n',
      'process.removeListener("SIGINT", interrupt);\n',
      'process.removeListener("SIGTERM", interrupt);\n',
      "nativeAbortSignal.any([deadlineSignal, runSignal])",
      "runDeadline = Date.now() + RUN_BUDGET_MS;\n",
      "runDeadline = Number.POSITIVE_INFINITY;\n",
      "assert.ok(validateDiagnosticProjectName(project));\n",
      'compose(["stop", "--timeout", "5", service]',
      'compose(["start", service]',
      'compose(["pause", service]',
      'compose(["unpause", service]',
      'compose(["down", "--volumes", "--remove-orphans", "--timeout", "10"]',
      'signal: operationSignal(timeout),\n    killSignal: "SIGKILL",',
      '["info", "--format", "{{json .ServerVersion}}"]',
      "SET application_name = 'aster-p12-diagnostic-lock'; BEGIN; LOCK TABLE catalog.public_candidates IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(30); COMMIT;",
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'aster-p12-diagnostic-lock';",
      "label=com.docker.compose.project=${project}",
      "aster:sli:good:ratio_rate5m{sli=",
      "/api/datasources/proxy/uid/aster-tempo/api/search?",
      "diagnosticTraceQuery(traceId, scenario)",
      "| select(",
      "diagnosticTraceReady(response, traceId, scenario)",
      '"timeout|cancelled|unavailable|error"',
      "const search = await tempoSearch(ports.grafana, traceId, scenario);\n    const facts = traceSearchFacts(search, traceId);",
      "traceSearchFacts(search, traceId)",
      'fact.status === "error"',
      '"aster.dependency"',
      '"aster.outcome"',
      '"aster.catalog.cache_readiness_changed"',
      "/api/datasources/uid/aster-tempo/health",
      'response.value?.status === "OK"',
      "const escapedCanary = JSON.stringify(canary).slice(1, -1);",
    ],
    violations,
    "diagnostic runner",
  );
  rejectValues(
    source,
    [
      "process.argv[2]",
      "docker system prune",
      "wsl --shutdown",
      "COMPOSE_PROJECT_NAME",
      "--profile=*",
      'hostPort("tempo", 3200)',
      "ports.tempo",
      "127.0.0.1:3200",
    ],
    violations,
    "diagnostic runner",
  );
}

export function validateDiagnosticsProfile(sources) {
  if (
    Object.values(sources).some(
      (source) =>
        typeof source !== "string" ||
        Buffer.byteLength(source) > 65_536 ||
        /[\0\t\uFFFD]/u.test(source),
    )
  ) {
    return [{ rule: "diagnostics-profile", detail: "malformed or oversized diagnostic input" }];
  }
  const violations = [];
  validateImages(sources, violations);
  validateCompose(sources.compose ?? "", sources.proof ?? "", violations);
  validateTempo(sources.tempo ?? "", violations);
  validateCollector(sources.collector ?? "", violations);
  validateDatasource(sources.datasource ?? "", violations);
  validateRunner(sources.runner ?? "", violations);
  return violations;
}

export async function runDiagnosticsProfileCheck() {
  const violations = validateDiagnosticsProfile(await readDiagnosticsSources());
  if (violations.length > 0) {
    process.stderr.write(
      JSON.stringify({ check: "diagnostics-profile", status: "error", violations }) + "\n",
    );
    return 1;
  }
  process.stdout.write(
    JSON.stringify({
      check: "diagnostics-profile",
      status: "ok",
      sources: Object.keys(sourcePaths).length,
    }) + "\n",
  );
  return 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  process.exitCode = await runDiagnosticsProfileCheck();
}
