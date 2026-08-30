import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const BROKER_IMAGE =
  "docker.io/apache/kafka:4.3.1@sha256:77e3df9054047a88b520d0cc46e16696d3b22022e1d580aeccd2632df6532837";
export const STORAGE_IMAGE =
  "docker.io/versity/versitygw:v1.7.0@sha256:c4cbd9d9cb8dedbb055ac788dbd02635651b9b1cebac95b095b3217231aa87ad";

export function serviceBlock(source, name) {
  return source.match(new RegExp("^ {2}" + name + ":\\n(?:\\n| {4}[^\\n]*\\n)+", "mu"))?.[0] ?? "";
}

export function volumeBlock(name, authority = "durable-local") {
  return (
    "  " +
    name +
    ":\n    labels:\n      com.aster.authority: " +
    authority +
    "\n      com.aster.environment: local\n      com.aster.owner: platform\n"
  );
}

function requireValues(source, values, violations, scope) {
  for (const value of values) {
    if (!source.includes(value)) {
      violations.push({ rule: "optional-platform", detail: scope + " missing policy: " + value });
    }
  }
}

function rejectValues(source, values, violations, scope) {
  for (const value of values) {
    if (source.includes(value)) {
      violations.push({ rule: "optional-platform", detail: scope + " prohibits: " + value });
    }
  }
}

function validateIsolatedService(source, name, profile, cpu, memory, pids) {
  const violations = [];
  requireValues(
    source,
    [
      "    profiles: [" + profile + ", full]\n",
      "      com.aster.environment: local\n      com.aster.scope: platform\n",
      "    read_only: true\n",
      "    cap_drop: [ALL]\n",
      "    security_opt: [no-new-privileges:true]\n",
      "    cpus: " + cpu + "\n",
      "    mem_limit: " + memory + "\n",
      "    pids_limit: " + pids + "\n",
      '    restart: "no"\n',
      "    stop_grace_period: 5s\n",
      '        max-size: "5m"\n        max-file: "2"\n',
    ],
    violations,
    name,
  );
  rejectValues(
    source,
    ["privileged:", "cap_add:", "network_mode:", "env_file:", "type: bind", "$" + "{"],
    violations,
    name,
  );
  return violations;
}

export function validateIntegrationServices(source) {
  const violations = [];
  for (const [name, image, memory, pids, mount] of [
    ["broker", BROKER_IMAGE, "768m", 192, "broker-data:/var/lib/kafka/data"],
    ["storage", STORAGE_IMAGE, "384m", 96, "storage-data:/data"],
  ]) {
    const block = serviceBlock(source, name);
    violations.push(...validateIsolatedService(block, name, "integration", 1, memory, pids));
    requireValues(
      block,
      [
        "    image: " + image + "\n",
        "    networks: [platform]\n",
        "      - " + mount + "\n",
        "    healthcheck:\n",
      ],
      violations,
      name,
    );
    rejectValues(block, ["ports:", "build:", "depends_on:"], violations, name);
    requireValues(source, [volumeBlock(name + "-data")], violations, name);
  }
  requireValues(
    serviceBlock(source, "broker"),
    [
      "KAFKA_ADVERTISED_LISTENERS: INTERNAL://broker:19092\n",
      "KAFKA_HEAP_OPTS: -Xms128m -Xmx256m\n",
      'KAFKA_AUTO_CREATE_TOPICS_ENABLE: "false"\n',
      'KAFKA_QUEUED_MAX_REQUESTS: "16"\n',
      'KAFKA_LOG_RETENTION_HOURS: "1"\n',
      'KAFKA_LOG_RETENTION_BYTES: "16777216"\n',
      "        - /opt/kafka/bin/kafka-topics.sh\n",
    ],
    violations,
    "broker",
  );
  requireValues(
    serviceBlock(source, "storage"),
    [
      '      - --max-connections\n      - "64"\n',
      '      - --max-requests\n      - "16"\n',
      '      - --concurrency\n      - "1"\n',
      "http://127.0.0.1:9000/health",
    ],
    violations,
    "storage",
  );
  return violations;
}

export async function readObservabilitySources(root) {
  return Object.fromEntries(
    await Promise.all(
      ["observability.yml", "collector.integration.yml", "prometheus.local.yml"].map(
        async (name) => [name, await readFile(resolve(root, "infra/compose", name), "utf8")],
      ),
    ),
  );
}

export function validateObservabilityProfile(sources) {
  const violations = [];
  if (
    Object.values(sources).some(
      (source) => Buffer.byteLength(source) > 16384 || /[\0\t\uFFFD]/u.test(source),
    )
  ) {
    return [{ rule: "optional-platform", detail: "malformed or oversized observability input" }];
  }
  const source = sources["observability.yml"] ?? "";
  for (const service of ["identity", "catalog", "playback", "engagement"]) {
    const block = serviceBlock(source, service);
    if (
      block.trim() !==
      `${service}:\n    environment:\n      ASTER_OTLP_METRICS_ENDPOINT: http://collector:4318/v1/metrics`
    ) {
      violations.push({
        rule: "optional-platform",
        detail: `telemetry must remain optional to ${service} readiness and startup`,
      });
    }
  }
  if (serviceBlock(source, "discovery").trim() !== "") {
    violations.push({
      rule: "optional-platform",
      detail: "the base observability overlay cannot define the opt-in Discovery service",
    });
  }
  for (const [name, memory] of [
    ["collector", "128m"],
    ["prometheus", "256m"],
  ]) {
    const block = serviceBlock(source, name);
    violations.push(...validateIsolatedService(block, name, "observability", 0.5, memory, 64));
    requireValues(
      block,
      [
        "    build:\n      context: ../..\n      dockerfile: infra/docker/" +
          name +
          ".Dockerfile\n",
      ],
      violations,
      name,
    );
    rejectValues(
      block.replace("      context: ../..\n", ""),
      ["image:", "entrypoint:", "./", "../"],
      violations,
      name + " overrides",
    );
  }
  requireValues(
    serviceBlock(source, "collector"),
    ["    networks: [platform]\n", "GOMEMLIMIT: 80MiB\n"],
    violations,
    "collector",
  );
  rejectValues(
    serviceBlock(source, "collector"),
    ["ports:", "volumes:", "command:"],
    violations,
    "collector",
  );
  requireValues(
    serviceBlock(source, "prometheus"),
    [
      '      - "127.0.0.1:9090:9090"\n',
      "    networks: [platform, edge]\n",
      "      - prometheus-data:/prometheus\n",
      "GOMEMLIMIT: 192MiB\n",
      "--storage.tsdb.retention.time=1h\n",
      "--storage.tsdb.retention.size=128MB\n",
      "--storage.tsdb.wal-segment-size=10MB\n",
      "--query.timeout=2s\n",
      "--query.max-concurrency=2\n",
      "--query.max-samples=10000\n",
      "--web.max-connections=16\n",
      'http://127.0.0.1:9090/-/ready"]\n',
    ],
    violations,
    "prometheus",
  );
  requireValues(
    source,
    [volumeBlock("prometheus-data", "disposable-local")],
    violations,
    "prometheus",
  );
  requireValues(
    serviceBlock(source, "platform-status"),
    [
      "      collector:\n        condition: service_started\n",
      "      prometheus:\n        condition: service_healthy\n",
      "--post-data='{}' http://collector:4318/v1/metrics",
      "wget -T 1 -q -O /dev/null http://prometheus:9090/-/ready",
      "      timeout: 4s\n",
    ],
    violations,
    "observability readiness",
  );
  requireValues(
    sources["collector.integration.yml"] ?? "",
    [
      "max_request_body_size: 1048576\n",
      "limit_mib: 96\n",
      "spike_limit_mib: 32\n",
      "metric_expiration: 1m\n",
      "without_scope_info: true\n",
      "resource_to_telemetry_conversion:\n      enabled: false\n",
      "      processors: [memory_limiter]\n",
      "      exporters: [prometheus]\n",
      "      processors: [memory_limiter, span/router_names, attributes/router_privacy]\n",
      "      exporters: [debug]\n",
      "      from_attributes: [otel.original_name]\n",
      "      - key: graphql.operation.name\n        action: delete\n",
      "      - key: graphql.document\n        action: delete\n",
      "      - key: otel.name\n        action: delete\n",
      "    sampling_initial: 10\n    sampling_thereafter: 100\n",
    ],
    violations,
    "collector config",
  );
  requireValues(
    sources["prometheus.local.yml"] ?? "",
    [
      "scrape_interval: 5s\n",
      "scrape_timeout: 2s\n",
      "targets: [collector:8889]",
      "body_size_limit: 1MB\n",
      "sample_limit: 2000\n",
      "label_limit: 16\n",
      "label_name_length_limit: 128\n",
      "label_value_length_limit: 256\n",
    ],
    violations,
    "scrape config",
  );
  rejectValues(source, ["type: bind", "env_file:", "$" + "{"], violations, "observability");
  return violations;
}
