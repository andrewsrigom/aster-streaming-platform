import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

import { readRuntimeImageSources, validateRuntimeImage } from "./verify-runtime-image.mjs";
import { validateCatalogRuntime } from "./verify-catalog-runtime.mjs";
import {
  readRouterSources,
  validateRouterRuntime,
  validateRouterSources,
} from "./verify-router-runtime.mjs";

import {
  readObservabilitySources,
  serviceBlock,
  volumeBlock,
  validateIntegrationServices,
  validateObservabilityProfile,
} from "./verify-optional-platform.mjs";

const MAX_COMPOSE_BYTES = 100_000;
const MAX_RESET_BYTES = 50_000;
const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const composePath = resolve(repositoryRoot, "infra", "compose", "compose.yml");
const resetPath = resolve(repositoryRoot, "tools", "reset-local-platform.sh");
const readmePath = resolve(repositoryRoot, "README.md");
const localDevelopmentPath = resolve(repositoryRoot, "docs", "operations", "LOCAL_DEVELOPMENT.md");

export const POSTGRES_IMAGE =
  "docker.io/library/postgres:18.6-alpine3.23@sha256:697c180dbf244d3ce4a8f4cbc0156cde840af055c1bf8b76aebe422a4822086f";
export const REDIS_IMAGE =
  "docker.io/library/redis:8.10.0-alpine@sha256:978f0e01593e65eed801f2402944efcd936d43b5027e4908a7897baf88ed6241";
export const LOCAL_RESET_COMMAND =
  "ASTER_ENVIRONMENT=local ./tools/reset-local-platform.sh --confirm DELETE-ASTER-LOCAL-DATA";

function occurrences(source, value) {
  return source.split(value).length - 1;
}

function validateRuntimeService(source) {
  const violations = [];
  for (const [rule, value] of [
    ["scope", "    profiles: [runtime, integration, observability, full]\n"],
    [
      "image",
      "    build:\n      context: ../..\n      dockerfile: infra/docker/identity.Dockerfile\n",
    ],
    ["scope", "      com.aster.environment: local\n      com.aster.scope: platform\n"],
    [
      "readiness",
      "    depends_on:\n      identity-init:\n        condition: service_completed_successfully\n",
    ],
    [
      "configuration",
      '      ASTER_ENV: local\n      ASTER_HTTP_HOST: 0.0.0.0\n      ASTER_HTTP_PORT: "3100"\n      ASTER_SERVICE_NAME: identity\n      ASTER_STARTUP_DEADLINE_MS: "15000"\n      DATABASE_URL: postgresql://aster_identity_local@postgres:5432/aster\n      ASTER_DATABASE_PASSWORD: aster-test-only\n      REDIS_URL: redis://redis:6379/0\n      ASTER_LOCAL_DEMO_ENABLED: "true"\n      ASTER_PUBLIC_ORIGIN: http://127.0.0.1:4000\n      ASTER_ROUTER_TRUST_ENABLED: "true"\n',
    ],
    [
      "network",
      "    volumes:\n      - identity-router-trust:/run/aster-router:ro\n    networks:\n      - platform\n",
    ],
    ["readiness", "      router-trust-init:\n        condition: service_completed_successfully\n"],
    [
      "security",
      '    user: "1000:1000"\n    read_only: true\n    cap_drop: [ALL]\n    security_opt:\n      - no-new-privileges:true\n',
    ],
    ["lifecycle", '    stop_grace_period: 15s\n    restart: "no"\n'],
    ["resources", '          cpus: "1.00"\n          memory: 384M\n          pids: 64\n'],
  ]) {
    if (!source.includes(value)) {
      violations.push({
        rule,
        detail: "Identity runtime must preserve its reviewed " + rule + " policy",
      });
    }
  }
  // The image owns the bounded readiness probe and direct Node entrypoint.
  for (const forbidden of [
    "entrypoint:",
    "command:",
    "healthcheck:",
    "ports:",
    "env_file:",
    "image:",
    "privileged:",
    "network_mode:",
    "cap_add:",
    "${",
  ]) {
    if (source.includes(forbidden)) {
      violations.push({
        rule: "security",
        detail: "Identity runtime cannot override " + forbidden,
      });
    }
  }
  if (source.match(/^ {6}- /gm)?.length !== 3) {
    violations.push({
      rule: "security",
      detail:
        "Identity permits only its own read-only trust mount, private network and no-new-privileges",
    });
  }
  return violations;
}

export function validateLocalPlatform(source) {
  const violations = [];
  const requireText = (rule, value, detail) => {
    if (!source.includes(value)) {
      violations.push({ detail, rule });
    }
  };
  const rejectText = (rule, value, detail) => {
    if (source.includes(value)) {
      violations.push({ detail, rule });
    }
  };

  if (Buffer.byteLength(source, "utf8") > MAX_COMPOSE_BYTES) {
    return [{ detail: `Compose file exceeds ${MAX_COMPOSE_BYTES} bytes`, rule: "bounds" }];
  }
  if (source.includes("\0") || source.includes("\uFFFD") || source.includes("\t")) {
    violations.push({
      detail: "Compose file contains malformed or tab-delimited text",
      rule: "bounds",
    });
  }
  if (!source.startsWith("name: aster\n")) {
    violations.push({ detail: "Compose project must use the stable aster name", rule: "scope" });
  }

  violations.push(...validateIntegrationServices(source));
  violations.push(...validateCatalogRuntime(source));
  violations.push(...validateRouterRuntime(source));
  for (const name of ["catalog", "catalog-init", "router", "router-trust-init"]) {
    source = source.replace(serviceBlock(source, name), "");
  }
  for (const owner of ["identity", "catalog"]) {
    source = source.replace(volumeBlock(owner + "-router-trust", "disposable-local"), "");
  }
  for (const name of ["broker", "storage"]) {
    source = source
      .replace(serviceBlock(source, name), "")
      .replace(volumeBlock(name + "-data"), "");
  }
  const runtime = source.match(/^ {2}identity:\n(?:\n| {4}[^\n]*\n)+/mu)?.[0];
  if (!runtime) {
    violations.push({ rule: "scope", detail: "reviewed Identity runtime profile is missing" });
  } else {
    violations.push(...validateRuntimeService(runtime));
    source = source.replace(runtime, "");
  }
  const edgeNetwork =
    "  edge:\n    labels:\n      com.aster.environment: local\n      com.aster.scope: platform\n";
  requireText("network", edgeNetwork, "loopback-facing application network ownership is missing");
  source = source.replace(edgeNetwork, "");

  const initializer = serviceBlock(source, "identity-init");
  for (const required of [
    "    profiles: [runtime, integration, observability, full]\n",
    "    build:\n      context: ../..\n      dockerfile: infra/docker/identity.Dockerfile\n",
    "      com.aster.environment: local\n      com.aster.scope: platform\n",
    "    depends_on:\n      platform-init:\n        condition: service_completed_successfully\n",
    "      DATABASE_URL: postgresql://aster@postgres:5432/aster\n",
    '      ASTER_LOCAL_DEMO_ENABLED: "true"\n      ASTER_PUBLIC_ORIGIN: http://127.0.0.1:3100\n',
    '    command: ["./dist/src/migrate-local.js"]\n',
    '    networks: [platform]\n    user: "1000:1000"\n    read_only: true\n    cap_drop: [ALL]\n',
    "    security_opt: [no-new-privileges:true]\n",
    '    healthcheck:\n      disable: true\n    stop_grace_period: 5s\n    restart: "no"\n',
    '          cpus: "0.25"\n          memory: 128M\n          pids: 32\n',
  ]) {
    if (!initializer.includes(required)) {
      violations.push({
        rule: "identity-init",
        detail: "finite local migration initializer contract is missing",
      });
    }
  }
  for (const forbidden of [
    "ports:",
    "volumes:",
    "env_file:",
    "entrypoint:",
    "privileged:",
    "network_mode:",
    "cap_add:",
    "${",
  ]) {
    if (initializer.includes(forbidden)) {
      violations.push({
        rule: "identity-init",
        detail: "migration initializer exceeds its local boundary",
      });
    }
  }
  source = source.replace(initializer, "");

  requireText(
    "resources",
    'x-local-logging: &local-logging\n  driver: json-file\n  options:\n    max-size: "5m"\n    max-file: "2"\n',
    "bounded local log rotation is required",
  );
  if (occurrences(source, "    logging: *local-logging") !== 4) {
    violations.push({ rule: "resources", detail: "core services must use bounded log rotation" });
  }
  requireText("image", POSTGRES_IMAGE, "exact PostgreSQL image is missing");
  requireText("image", REDIS_IMAGE, "exact Redis image is missing");
  if (occurrences(source, "@sha256:") !== 2) {
    violations.push({ detail: "every distinct image must be immutable by digest", rule: "image" });
  }
  rejectText("image", ":latest", "floating latest image tags are prohibited");
  rejectText("image", "build:", "only the reviewed Identity runtime may build an image");
  rejectText("configuration", "${", "environment-dependent Compose substitution is prohibited");

  rejectText("network", "ports:", "core dependencies must not publish host ports");
  rejectText("network", "network_mode: host", "host networking is prohibited");
  rejectText("security", "privileged: true", "privileged containers are prohibited");
  rejectText("security", "type: bind", "host bind mounts are prohibited");
  requireText("network", "    internal: true", "platform network must be internal");

  requireText(
    "persistence",
    "      - postgres-data:/var/lib/postgresql\n",
    "PostgreSQL 18 must mount the official persistent parent path",
  );
  requireText(
    "persistence",
    "PGDATA: /var/lib/postgresql/18/docker",
    "PostgreSQL 18 must use its version-specific data directory",
  );
  requireText("cache", '      - --appendonly\n      - "no"', "Redis must not claim AOF durability");
  requireText(
    "cache",
    "      - --maxmemory-policy\n      - allkeys-lfu",
    "Redis needs a bounded eviction policy",
  );
  if (occurrences(source, "      - no-new-privileges:true") !== 4) {
    violations.push({
      detail: "every service must disable privilege escalation",
      rule: "security",
    });
  }
  if (occurrences(source, "      com.aster.environment: local") !== 6) {
    violations.push({
      detail: "every service and the platform network need the local-environment label",
      rule: "scope",
    });
  }
  if (occurrences(source, "      com.aster.scope: platform") !== 5) {
    violations.push({
      detail: "every service and the platform network need the platform-scope label",
      rule: "scope",
    });
  }

  if (occurrences(source, "        condition: service_healthy") < 4) {
    violations.push({
      detail: "initializer and status must wait for dependency health",
      rule: "readiness",
    });
  }
  requireText(
    "readiness",
    "        condition: service_completed_successfully",
    "status must wait for successful one-shot initialization",
  );
  if (occurrences(source, "    healthcheck:") !== 3) {
    violations.push({
      detail: "every long-running service needs a health check",
      rule: "readiness",
    });
  }
  requireText("readiness", 'restart: "no"', "initializer must remain a one-shot service");
  if (
    occurrences(source, "          cpus:") !== 4 ||
    occurrences(source, "          memory:") !== 4 ||
    occurrences(source, "          pids:") !== 4
  ) {
    violations.push({
      detail: "every service needs CPU, memory, and PID limits",
      rule: "resources",
    });
  }
  if (occurrences(source, "    read_only: true") !== 2) {
    violations.push({
      detail: "initializer and status filesystems must be read-only",
      rule: "security",
    });
  }
  if (occurrences(source, "      - /var/lib/postgresql:size=1m,mode=1777") !== 2) {
    violations.push({
      rule: "persistence",
      detail: "helper containers must not create inherited anonymous database volumes",
    });
  }
  requireText(
    "lifecycle",
    "    stop_grace_period: 30s",
    "PostgreSQL needs a bounded graceful stop",
  );
  requireText("lifecycle", "    stop_grace_period: 10s", "Redis needs a bounded graceful stop");
  requireText("lifecycle", "    stop_grace_period: 5s", "status needs a bounded graceful stop");
  requireText(
    "scope",
    "use docker compose --project-name aster --file infra/compose/compose.yml ps --all for status",
    "status diagnostics must pin the public Aster project name",
  );

  return violations;
}

export function validateLocalReset(source) {
  const violations = [];
  const requireText = (rule, value, detail) => {
    if (!source.includes(value)) {
      violations.push({ detail, rule });
    }
  };
  const rejectText = (rule, value, detail) => {
    if (source.includes(value)) {
      violations.push({ detail, rule });
    }
  };

  if (Buffer.byteLength(source, "utf8") > MAX_RESET_BYTES) {
    return [{ detail: `reset script exceeds ${MAX_RESET_BYTES} bytes`, rule: "bounds" }];
  }
  if (source.includes("\0") || source.includes("\uFFFD") || source.includes("\t")) {
    violations.push({
      detail: "reset script contains malformed or tab-delimited text",
      rule: "bounds",
    });
  }
  if (!source.startsWith("#!/bin/sh\n\nset -eu\n")) {
    violations.push({ detail: "reset must use strict POSIX shell execution", rule: "runtime" });
  }

  requireText("confirmation", "ASTER_ENVIRONMENT=local", "local environment marker is missing");
  requireText(
    "confirmation",
    "DELETE-ASTER-LOCAL-DATA",
    "exact destructive confirmation is missing",
  );
  requireText("confirmation", 'if [ "$#" -ne 2 ]', "reset must reject extra arguments");
  requireText("hosted", "GITHUB_ACTIONS", "hosted CI refusal is missing");
  requireText("hosted", "DATABASE_URL", "hosted database URL refusal is missing");
  requireText("hosted", "REDIS_URL", "hosted Redis URL refusal is missing");
  requireText("hosted", "DOCKER_HOST", "Docker endpoint override refusal is missing");
  requireText("hosted", "DOCKER_CONTEXT", "Docker context override refusal is missing");
  requireText("hosted", "unix://* | npipe://*", "local-socket endpoint allowlist is missing");

  requireText("scope", "PROJECT_NAME=aster", "fixed Aster project is missing");
  requireText(
    "scope",
    "compose_file=$repository_root/infra/compose/compose.yml",
    "fixed repository Compose file is missing",
  );
  requireText(
    "scope",
    'docker --context "$context_name"',
    "the inspected Docker context must be pinned for mutations",
  );
  requireText(
    "scope",
    'compose --project-name "$PROJECT_NAME" --file "$compose_file"',
    "Compose mutations must pin the project and file",
  );
  requireText(
    "scope",
    "name=^/${PROJECT_NAME}[-_]",
    "Aster-prefixed containers must be checked before label-filtered discovery",
  );
  if (occurrences(source, "name=^${PROJECT_NAME}[-_]") !== 2) {
    violations.push({
      detail: "Aster-prefixed networks and volumes must be checked before label-filtered discovery",
      rule: "scope",
    });
  }
  requireText(
    "compatibility",
    "'local|platform' | '|'",
    "reset must accept only the complete current or released P01-R01 service-label pair",
  );
  for (const label of [
    "com.docker.compose.project",
    "com.docker.compose.service",
    "com.docker.compose.project.config_files",
    "com.docker.compose.network",
    "com.docker.compose.volume",
    "com.aster.environment",
    "com.aster.scope",
    "com.aster.authority",
    "com.aster.owner",
  ]) {
    requireText("labels", label, `reset does not verify ${label}`);
  }
  requireText(
    "deletion",
    "compose_local down --volumes",
    "scoped named-volume teardown is missing",
  );
  requireText("scope", "--profile '*'", "reset must inspect and remove every reviewed profile");
  requireText("scope", "require_owned_attachments", "shared-resource ownership guard is missing");
  requireText("scope", ".Mounts", "container mount ownership guard is missing");
  requireText("scope", ".NetworkSettings.Networks", "container network ownership guard is missing");
  requireText("postcondition", "remaining_container_count", "container postcondition is missing");
  requireText("postcondition", "remaining_network_count", "network postcondition is missing");
  requireText("postcondition", "remaining_volume_count", "volume postcondition is missing");

  for (const prohibited of [
    "docker system prune",
    "docker container prune",
    "docker network prune",
    "docker volume prune",
    "docker image prune",
    "--remove-orphans",
    "--rmi",
  ]) {
    rejectText(
      "destructive-scope",
      prohibited,
      `broad or image cleanup is prohibited: ${prohibited}`,
    );
  }

  return violations;
}

export function validatePublicPlatformCommands(documents) {
  const violations = [];
  const requiredCommands = [
    "docker compose --project-name aster --file infra/compose/compose.yml --profile runtime up --build --wait --wait-timeout 120",
    'docker compose --project-name aster --file infra/compose/compose.yml --file infra/compose/observability.yml --file infra/compose/demo.yml --profile "*" down',
    "docker compose --project-name aster --file infra/compose/compose.yml --file infra/compose/demo.yml --profile runtime up --build --wait --wait-timeout 120",
    "docker compose --project-name aster --file infra/compose/compose.yml --file infra/compose/observability.yml --profile full up --build --wait --wait-timeout 120",
    "docker compose --project-name aster --file infra/compose/compose.yml up --wait --wait-timeout 120 platform-status",
    "docker compose --project-name aster --file infra/compose/compose.yml ps --all",
    "docker compose --project-name aster --file infra/compose/compose.yml logs --no-color platform-init platform-status",
    "docker compose --project-name aster --file infra/compose/compose.yml down",
    LOCAL_RESET_COMMAND,
  ];
  for (const { file, source } of documents) {
    if (source.includes("docker compose --file infra/compose/compose.yml")) {
      violations.push({
        detail: `${file} contains a public command vulnerable to COMPOSE_PROJECT_NAME override`,
        rule: "scope",
      });
    }
    for (const command of requiredCommands) {
      if (!source.includes(command)) {
        violations.push({ detail: `${file} is missing scoped command: ${command}`, rule: "scope" });
      }
    }
  }
  return violations;
}

export async function runLocalPlatformCheck(path = composePath) {
  try {
    const [source, reset, readme, localDevelopment, runtimeImage, observability, router] =
      await Promise.all([
        readFile(path, "utf8"),
        readFile(resetPath, "utf8"),
        readFile(readmePath, "utf8"),
        readFile(localDevelopmentPath, "utf8"),
        readRuntimeImageSources(repositoryRoot),
        readObservabilitySources(repositoryRoot),
        readRouterSources(repositoryRoot),
      ]);
    const violations = [
      ...validateLocalPlatform(source),
      ...validateLocalReset(reset),
      ...validateRuntimeImage(runtimeImage),
      ...validateObservabilityProfile(observability),
      ...validateRouterSources(router),
      ...validatePublicPlatformCommands([
        { file: "README.md", source: readme },
        { file: "docs/operations/LOCAL_DEVELOPMENT.md", source: localDevelopment },
      ]),
    ];
    if (violations.length > 0) {
      console.error(
        JSON.stringify({ check: "local-platform", status: "error", violations }, null, 2),
      );
      return 1;
    }
    console.log(JSON.stringify({ check: "local-platform", status: "ok", violations: 0 }));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({ check: "local-platform", status: "error", errors: [message] }, null, 2),
    );
    return 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  process.exitCode = await runLocalPlatformCheck();
}
