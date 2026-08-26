import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { POSTGRES_IMAGE, REDIS_IMAGE, validateLocalPlatform } from "./verify-local-platform.mjs";

const composePath = resolve(import.meta.dirname, "..", "infra", "compose", "compose.yml");
const validSource = await readFile(composePath, "utf8");

test("the checked-in local platform policy passes", () => {
  assert.deepEqual(validateLocalPlatform(validSource), []);
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
    "        condition: service_completed_successfully",
    "        condition: service_started",
  );
  const missingHealth = validSource.replace("    healthcheck:", "    x-healthcheck:");
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
