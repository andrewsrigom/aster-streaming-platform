import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { serviceBlock, volumeBlock } from "./verify-optional-platform.mjs";

const MAX_OVERLAY_BYTES = 20_000;
const MAX_PROOF_BYTES = 4_096;

function serviceNames(source) {
  const services = source.split("\nvolumes:\n")[0] ?? "";
  return [...services.matchAll(/^ {2}([a-z-]+):$/gmu)].map((match) => match[1]).sort();
}

function requireValues(source, values, violations, scope) {
  for (const value of values) {
    if (!source.includes(value)) {
      violations.push({
        rule: "discovery-runtime",
        detail: scope + " is missing reviewed policy: " + value.trim(),
      });
    }
  }
}

function rejectValues(source, values, violations, scope) {
  for (const value of values) {
    if (source.includes(value)) {
      violations.push({
        rule: "discovery-runtime",
        detail: scope + " exceeds its reviewed boundary: " + value,
      });
    }
  }
}

export async function readDiscoveryRuntimeSources(root) {
  return Object.fromEntries(
    await Promise.all(
      ["compose.yml", "events.yml", "discovery.yml", "discovery-proof.yml"].map(async (name) => [
        name,
        await readFile(resolve(root, "infra", "compose", name), "utf8"),
      ]),
    ),
  );
}

export function validateDiscoveryRuntime(sources) {
  const violations = [];
  const base = sources["compose.yml"] ?? "";
  const events = sources["events.yml"] ?? "";
  const overlay = sources["discovery.yml"] ?? "";
  const proof = sources["discovery-proof.yml"] ?? "";
  if (
    Buffer.byteLength(overlay, "utf8") > MAX_OVERLAY_BYTES ||
    Buffer.byteLength(proof, "utf8") > MAX_PROOF_BYTES ||
    [overlay, proof].some((source) => /[\0\t\uFFFD]/u.test(source))
  ) {
    return [
      { rule: "discovery-runtime", detail: "Discovery Compose input is malformed or oversized" },
    ];
  }
  if (
    JSON.stringify(serviceNames(overlay)) !==
    JSON.stringify(["catalog", "discovery", "discovery-init"])
  ) {
    violations.push({
      rule: "discovery-runtime",
      detail: "Discovery activation must modify only its owner and Catalog",
    });
  }
  rejectValues(
    overlay,
    ["ports:", "privileged:", "cap_add:", "network_mode:", "env_file:", "type: bind", "${"],
    violations,
    "Discovery overlay",
  );

  const catalog = serviceBlock(overlay, "catalog");
  requireValues(
    catalog,
    [
      '      ASTER_CATALOG_DISCOVERY_READ_ENABLED: "true"\n',
      "      ASTER_CATALOG_DISCOVERY_READER_DATABASE_URL: postgresql://aster_catalog_discovery_reader_local@postgres:5432/aster\n",
      "      ASTER_CATALOG_DISCOVERY_READER_DATABASE_PASSWORD: aster-test-only\n",
      "      - discovery-catalog-trust:/run/aster-discovery-catalog:ro\n",
    ],
    violations,
    "Catalog Discovery reader",
  );
  rejectValues(
    catalog,
    ["depends_on:", "ports:", "ASTER_CATALOG_ADMIN", "ASTER_CATALOG_OPERATOR"],
    violations,
    "Catalog Discovery reader",
  );
  if (catalog.match(/^ {6}- /gmu)?.length !== 1) {
    violations.push({
      rule: "discovery-runtime",
      detail: "Catalog Discovery reader permits only its purpose-separated trust mount",
    });
  }

  for (const name of ["discovery", "discovery-init"]) {
    const runtime = name === "discovery";
    const block = serviceBlock(overlay, name);
    requireValues(
      block,
      [
        "    profiles: [runtime, integration, observability, full]\n",
        "    build:\n      context: ../..\n      dockerfile: infra/docker/discovery.Dockerfile\n",
        "      com.aster.environment: local\n      com.aster.scope: platform\n",
        "      ASTER_ENVIRONMENT: local\n",
        "    networks: [platform]\n",
        '    user: "1000:1000"\n    read_only: true\n    cap_drop: [ALL]\n    security_opt: [no-new-privileges:true]\n',
        '    stop_grace_period: 15s\n    restart: "no"\n',
        ...(runtime
          ? [
              "    depends_on:\n      discovery-init:\n        condition: service_completed_successfully\n      router-trust-init:\n        condition: service_completed_successfully\n      catalog:\n        condition: service_healthy\n      broker-init:\n        condition: service_completed_successfully\n",
              '      ASTER_DISCOVERY_LOCAL_ENABLED: "true"\n      ASTER_DISCOVERY_HTTP_HOST: 0.0.0.0\n      ASTER_DISCOVERY_HTTP_PORT: "3500"\n',
              "      ASTER_DISCOVERY_DATABASE_URL: postgresql://aster_discovery_local@postgres:5432/aster\n      ASTER_DISCOVERY_DATABASE_PASSWORD: aster-test-only\n",
              "      ASTER_DISCOVERY_PROJECTOR_DATABASE_URL: postgresql://aster_discovery_projector_local@postgres:5432/aster\n      ASTER_DISCOVERY_PROJECTOR_DATABASE_PASSWORD: aster-test-only\n",
              '      ASTER_DISCOVERY_CACHE_ENABLED: "true"\n      REDIS_URL: redis://redis:6379/0\n',
              '      ASTER_ROUTER_TRUST_ENABLED: "true"\n      ASTER_EVENTS_ENABLED: "true"\n',
              "    volumes:\n      - discovery-router-trust:/run/aster-router:ro\n      - discovery-catalog-trust:/run/aster-discovery-catalog:ro\n",
              '          cpus: "1.00"\n          memory: 384M\n          pids: 64\n',
            ]
          : [
              "    depends_on:\n      postgres:\n        condition: service_healthy\n",
              '      ASTER_DISCOVERY_MIGRATION_ENABLED: "true"\n      ASTER_DISCOVERY_ADMIN_DATABASE_URL: postgresql://aster@postgres:5432/aster\n      ASTER_DISCOVERY_ADMIN_DATABASE_PASSWORD: aster-test-only\n',
              '    command: ["./dist/src/migrate-local.js"]\n',
              "    healthcheck:\n      disable: true\n",
              '          cpus: "0.25"\n          memory: 128M\n          pids: 32\n',
            ]),
      ],
      violations,
      name,
    );
    rejectValues(
      block,
      [
        "ports:",
        "entrypoint:",
        "image:",
        "env_file:",
        "privileged:",
        "network_mode:",
        "cap_add:",
        "${",
        "identity",
        "playback",
        "engagement",
        ...(runtime
          ? ["command:", "healthcheck:", "ASTER_DISCOVERY_ADMIN", "ASTER_DISCOVERY_MIGRATION"]
          : ["volumes:", "ASTER_DISCOVERY_PROJECTOR", "redis"]),
      ],
      violations,
      name,
    );
    if (runtime && block.match(/^ {6}- /gmu)?.length !== 2) {
      violations.push({
        rule: "discovery-runtime",
        detail: "Discovery permits only Router and Catalog trust mounts",
      });
    }
  }

  for (const name of ["discovery-router-trust", "discovery-catalog-trust"]) {
    if (!base.includes(volumeBlock(name, "disposable-local"))) {
      violations.push({
        rule: "discovery-runtime",
        detail: name + " requires disposable local ownership in the base model",
      });
    }
  }
  if (
    !events.includes('  catalog:\n    environment:\n      ASTER_EVENTS_ENABLED: "true"\n') ||
    !events.includes("aster.catalog.publication.v1")
  ) {
    violations.push({
      rule: "discovery-runtime",
      detail: "Discovery requires the reviewed Catalog event activation and topic",
    });
  }

  const exactProof = `# Disposable search/runtime proof. No retained account or media data is used.
services:
  postgres:
    volumes: !reset []
    tmpfs:
      - /var/lib/postgresql:rw,size=256m
  router:
    ports: !override ["127.0.0.1::4000"]
`;
  if (proof !== exactProof) {
    violations.push({
      rule: "discovery-runtime",
      detail:
        "Discovery proof must use only disposable PostgreSQL and a random loopback Router port",
    });
  }
  return violations;
}
