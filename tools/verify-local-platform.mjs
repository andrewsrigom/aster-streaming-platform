import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

const MAX_COMPOSE_BYTES = 100_000;
const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const composePath = resolve(repositoryRoot, "infra", "compose", "compose.yml");

export const POSTGRES_IMAGE =
  "docker.io/library/postgres:18.6-alpine3.23@sha256:697c180dbf244d3ce4a8f4cbc0156cde840af055c1bf8b76aebe422a4822086f";
export const REDIS_IMAGE =
  "docker.io/library/redis:8.10.0-alpine@sha256:978f0e01593e65eed801f2402944efcd936d43b5027e4908a7897baf88ed6241";

function occurrences(source, value) {
  return source.split(value).length - 1;
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

  requireText("image", POSTGRES_IMAGE, "exact PostgreSQL image is missing");
  requireText("image", REDIS_IMAGE, "exact Redis image is missing");
  if (occurrences(source, "@sha256:") !== 2) {
    violations.push({ detail: "every distinct image must be immutable by digest", rule: "image" });
  }
  rejectText("image", ":latest", "floating latest image tags are prohibited");
  rejectText("image", "build:", "P01-R01 must use reviewed prebuilt images only");
  rejectText("configuration", "${", "environment-dependent Compose substitution is prohibited");

  rejectText("network", "ports:", "P01-R01 must not publish host ports");
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
  requireText(
    "lifecycle",
    "    stop_grace_period: 30s",
    "PostgreSQL needs a bounded graceful stop",
  );
  requireText("lifecycle", "    stop_grace_period: 10s", "Redis needs a bounded graceful stop");
  requireText("lifecycle", "    stop_grace_period: 5s", "status needs a bounded graceful stop");

  return violations;
}

export async function runLocalPlatformCheck(path = composePath) {
  try {
    const source = await readFile(path, "utf8");
    const violations = validateLocalPlatform(source);
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
