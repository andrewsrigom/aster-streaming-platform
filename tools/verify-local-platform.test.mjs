import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { readRuntimeImageSources, validateRuntimeImage } from "./verify-runtime-image.mjs";

import {
  readObservabilitySources,
  validateObservabilityProfile,
  BROKER_IMAGE,
  STORAGE_IMAGE,
} from "./verify-optional-platform.mjs";

import {
  POSTGRES_IMAGE,
  REDIS_IMAGE,
  validateLocalReset,
  validateLocalPlatform,
  validatePublicPlatformCommands,
} from "./verify-local-platform.mjs";

const composePath = resolve(import.meta.dirname, "..", "infra", "compose", "compose.yml");
const resetPath = resolve(import.meta.dirname, "reset-local-platform.sh");
const readmePath = resolve(import.meta.dirname, "..", "README.md");
const localDevelopmentPath = resolve(
  import.meta.dirname,
  "..",
  "docs",
  "operations",
  "LOCAL_DEVELOPMENT.md",
);
const validSource = await readFile(composePath, "utf8");
const validReset = await readFile(resetPath, "utf8");
const readmeSource = await readFile(readmePath, "utf8");
const localDevelopmentSource = await readFile(localDevelopmentPath, "utf8");
const observability = await readObservabilitySources(resolve(import.meta.dirname, ".."));
const runtimeImage = await readRuntimeImageSources(resolve(import.meta.dirname, ".."));

test("Web demo rejects private credentials, mounts, public ports and unbounded runtime", () => {
  const file = "infra/compose/demo.yml";
  for (const [before, after] of [
    ["networks: [edge]", "networks: [edge, platform]"],
    ["127.0.0.1:3000:3000", "0.0.0.0:3000:3000"],
    ["http://router:4000/graphql", "http://router:4000/graphql\n      DATABASE_URL: private"],
    ["    tmpfs:", "    volumes: [private-trust:/run/trust]\n    tmpfs:"],
    ["memory: 512M", "memory: 0"],
    ["size=32m", "size=1g"],
    ["read_only: true", "read_only: false"],
    ["ASTER_CATALOG_UI_SEED_ENABLED", "UNREVIEWED_SEED_ENABLED"],
  ]) {
    assert.notEqual(runtimeImage[file].indexOf(before), -1);
    assert.ok(
      validateRuntimeImage({ ...runtimeImage, [file]: runtimeImage[file].replace(before, after) })
        .length > 0,
    );
  }
});

test("runtime image preserves the pinned non-root production packaging contract", () => {
  assert.deepEqual(validateRuntimeImage(runtimeImage), []);
});

test("runtime image rejects weakened pin, install, user, entrypoint, health and license policy", () => {
  const file = "infra/docker/identity.Dockerfile";
  for (const [before, after] of [
    ["@sha256:", "@changed:"],
    ["--frozen-lockfile", "--no-frozen-lockfile"],
    ["--prod deploy", "deploy"],
    ["USER node", "USER root"],
    ['ENTRYPOINT ["node"]', 'ENTRYPOINT ["sh"]'],
    ["AbortSignal.timeout(1000)", "undefined"],
    ["await r.body?.cancel()", "void r"],
    ["/workspace/LICENSE", "/workspace/README.md"],
  ]) {
    const changed = { ...runtimeImage, [file]: runtimeImage[file].replace(before, after) };
    assert.ok(validateRuntimeImage(changed).length > 0, before);
  }
});

test("runtime image refuses broader Docker context and source/test publication", () => {
  for (const changed of [
    { ...runtimeImage, ".dockerignore": `${runtimeImage[".dockerignore"]}!.env\n` },
    { ...runtimeImage, ".dockerignore": runtimeImage[".dockerignore"].replace("**/dist/**", "") },
    { ...runtimeImage, "services/identity/package.json": '{"files":["dist"]}' },
    { ...runtimeImage, "packages/runtime/package.json": "{" },
    { ...runtimeImage, ".dockerignore": "x".repeat(16_385) },
  ]) {
    assert.ok(validateRuntimeImage(changed).length > 0);
  }
});

test("the checked-in local platform policy passes", () => {
  assert.deepEqual(validateLocalPlatform(validSource), []);
  assert.deepEqual(validateLocalReset(validReset), []);
  assert.deepEqual(
    validatePublicPlatformCommands([
      { file: "README.md", source: readmeSource },
      { file: "docs/operations/LOCAL_DEVELOPMENT.md", source: localDevelopmentSource },
    ]),
    [],
  );
});

test("rejects weakened reset confirmation and hosted-target controls", () => {
  const noConfirmation = validReset.replaceAll("DELETE-ASTER-LOCAL-DATA", "delete-data");
  const remoteEndpoint = validReset.replace("unix://* | npipe://*", "*");
  const noHostedUrlRefusal = validReset.replaceAll("DATABASE_URL", "LOCAL_DATABASE_NAME");
  assert.ok(validateLocalReset(noConfirmation).some(({ rule }) => rule === "confirmation"));
  assert.ok(validateLocalReset(remoteEndpoint).some(({ rule }) => rule === "hosted"));
  assert.ok(validateLocalReset(noHostedUrlRefusal).some(({ rule }) => rule === "hosted"));
});

test("rejects a redirectable or broad reset", () => {
  const redirectable = validReset.replace("PROJECT_NAME=aster", "PROJECT_NAME=$1");
  const noPrefixOwnership = validReset.replaceAll("name=^${PROJECT_NAME}[-_]", "name=aster");
  const noLegacyCompatibility = validReset.replace("'local|platform' | '|'", "'local|platform'");
  const broadCleanup = validReset.replace(
    "compose_local down --volumes",
    "docker system prune --all --force",
  );
  assert.ok(validateLocalReset(redirectable).some(({ rule }) => rule === "scope"));
  assert.ok(validateLocalReset(noPrefixOwnership).some(({ rule }) => rule === "scope"));
  assert.ok(validateLocalReset(noLegacyCompatibility).some(({ rule }) => rule === "compatibility"));
  assert.ok(
    validateLocalReset(broadCleanup).some(
      ({ rule }) => rule === "deletion" || rule === "destructive-scope",
    ),
  );
});

test("rejects public commands vulnerable to a project-name environment override", () => {
  const weakened = readmeSource.replaceAll("docker compose --project-name aster", "docker compose");
  assert.ok(
    validatePublicPlatformCommands([{ file: "README.md", source: weakened }]).some(
      ({ rule }) => rule === "scope",
    ),
  );
});

test("rejects floating or environment-substituted images", () => {
  const floating = validSource.replace(POSTGRES_IMAGE, "postgres:latest");
  const substituted = validSource.replace(REDIS_IMAGE, "${REDIS_IMAGE}");
  assert.ok(validateLocalPlatform(floating).some(({ rule }) => rule === "image"));
  assert.ok(validateLocalPlatform(substituted).some(({ rule }) => rule === "configuration"));
});

test("rejects host exposure and elevated containers", () => {
  const exposed = `${validSource}\n    ports:\n      - 5432:5432\n`;
  const privileged = validSource.replace(
    "    image: *redis-image",
    "    image: *redis-image\n    privileged: true",
  );
  assert.ok(validateLocalPlatform(exposed).some(({ rule }) => rule === "network"));
  assert.ok(validateLocalPlatform(privileged).some(({ rule }) => rule === "security"));
});

test("rejects incorrect PostgreSQL persistence and durable Redis claims", () => {
  const wrongPostgresMount = validSource.replace(
    "postgres-data:/var/lib/postgresql",
    "postgres-data:/var/lib/postgresql/data",
  );
  const durableRedis = validSource.replace('      - "no"', '      - "yes"');
  assert.ok(validateLocalPlatform(wrongPostgresMount).some(({ rule }) => rule === "persistence"));
  assert.ok(validateLocalPlatform(durableRedis).some(({ rule }) => rule === "cache"));
});

test("rejects weakened readiness and one-shot ordering", () => {
  const noCompletionGate = validSource.replace(
    "      identity-init:\n        condition: service_completed_successfully",
    "      identity-init:\n        condition: service_started",
  );
  const missingHealth = validSource.replace(
    "    healthcheck:\n      test: [CMD-SHELL, pg_isready",
    "    x-healthcheck:\n      test: [CMD-SHELL, pg_isready",
  );
  assert.ok(validateLocalPlatform(noCompletionGate).some(({ rule }) => rule === "readiness"));
  assert.ok(validateLocalPlatform(missingHealth).some(({ rule }) => rule === "readiness"));
});

test("rejects missing resource and lifecycle bounds", () => {
  const noPids = validSource.replace("          pids: 128", "          x-pids: 128");
  const noGrace = validSource.replace("    stop_grace_period: 30s", "    x-stop_grace_period: 30s");
  assert.ok(validateLocalPlatform(noPids).some(({ rule }) => rule === "resources"));
  assert.ok(validateLocalPlatform(noGrace).some(({ rule }) => rule === "lifecycle"));
});

test("rejects unsafe or unbounded Compose text", () => {
  assert.ok(validateLocalPlatform(`${validSource}\t`).some(({ rule }) => rule === "bounds"));
  assert.ok(validateLocalPlatform("x".repeat(100_001)).some(({ rule }) => rule === "bounds"));
});

test("runtime profile rejects broad ports, entrypoint overrides and weakened isolation", () => {
  for (const [before, after] of [
    ["[runtime, integration, observability, full]", "[full]"],
    ["127.0.0.1:4000:4000", "0.0.0.0:4000:4000"],
    ['user: "1000:1000"', 'user: "0:0"'],
    ["cap_drop: [ALL]", "cap_add: [SYS_ADMIN]"],
    ["stop_grace_period: 15s", "stop_grace_period: 1s"],
    ["memory: 384M", "memory: 4G"],
    ["dockerfile: infra/docker/identity.Dockerfile", "dockerfile: unreviewed.Dockerfile"],
    [
      "    profiles: [runtime, integration, observability, full]",
      '    profiles: [runtime, integration, observability, full]\n    entrypoint: ["sh"]',
    ],
    ["ASTER_DATABASE_PASSWORD: aster-test-only", "DATABASE_PASSWORD: aster-test-only"],
  ]) {
    assert.ok(validateLocalPlatform(validSource.replace(before, after)).length > 0, before);
  }
});

test("local Identity initialization stays finite, isolated and separate from the runtime login", () => {
  for (const [before, after] of [
    ["postgresql://aster_identity_local@postgres", "postgresql://aster@postgres"],
    ['command: ["./dist/src/migrate-local.js"]', 'command: ["./dist/src/main.js"]'],
    ["networks: [platform]\n    user:", "networks: [platform, edge]\n    user:"],
    ['ASTER_LOCAL_DEMO_ENABLED: "true"', 'ASTER_LOCAL_DEMO_ENABLED: "false"'],
  ]) {
    assert.ok(validateLocalPlatform(validSource.replace(before, after)).length > 0, before);
  }
});

test("optional telemetry retains bounded collection without becoming an Identity dependency", () => {
  assert.deepEqual(validateObservabilityProfile(observability), []);
  for (const [file, before, after] of [
    ["observability.yml", "ASTER_OTLP_METRICS_ENDPOINT:", "UNREVIEWED_ENDPOINT:"],
    ["observability.yml", "127.0.0.1:9090:9090", "0.0.0.0:9090:9090"],
    ["observability.yml", "mem_limit: 128m", "mem_limit: 4g"],
    ["observability.yml", "retention.time=1h", "retention.time=30d"],
    ["observability.yml", "condition: service_healthy", "condition: service_started"],
    ["observability.yml", "--post-data=", "--data="],
    ["collector.integration.yml", "enabled: false", "enabled: true"],
    ["collector.integration.yml", "limit_mib: 96", "limit_mib: 0"],
    [
      "collector.integration.yml",
      "span/router_names, attributes/router_privacy",
      "span/router_names",
    ],
    ["collector.integration.yml", "key: graphql.document", "key: ignored"],
    ["prometheus.local.yml", "sample_limit: 2000", "sample_limit: 0"],
    ["prometheus.local.yml", "label_limit: 16", "label_limit: 0"],
  ]) {
    const changed = { ...observability, [file]: observability[file].replace(before, after) };
    assert.ok(validateObservabilityProfile(changed).length > 0, before);
  }
});

test("optional broker and storage must stay private, pinned and resource-bounded", () => {
  for (const [before, after] of [
    [BROKER_IMAGE, "kafka:latest"],
    [STORAGE_IMAGE, "versitygw:latest"],
    ["profiles: [integration, full]", "profiles: [full]"],
    ["mem_limit: 768m", "mem_limit: 8g"],
    ["INTERNAL://broker:19092", "PUBLIC://broker:19092"],
    ["    networks: [platform]", "    networks: [platform]\n    ports: [9000:9000]"],
    ["broker-data:/var/lib/kafka/data", "foreign-data:/var/lib/kafka/data"],
  ]) {
    assert.ok(validateLocalPlatform(validSource.replace(before, after)).length > 0, before);
  }
});

test("telemetry images refuse mutable tags and added runtime instructions", () => {
  for (const file of ["infra/docker/collector.Dockerfile", "infra/docker/prometheus.Dockerfile"]) {
    for (const source of [
      runtimeImage[file].replace("@sha256:", "@changed:"),
      runtimeImage[file] + "\nUSER root\n",
    ]) {
      assert.ok(validateRuntimeImage({ ...runtimeImage, [file]: source }).length > 0, file);
    }
  }
});
