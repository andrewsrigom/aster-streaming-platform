import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const DATABASE_CANARY = "spawn-database-canary-never-emit";
const REDIS_CANARY = "spawn-redis-canary-never-emit";
const testDirectory = dirname(fileURLToPath(import.meta.url));
const executable = resolve(testDirectory, "../src/check-runtime-config.js");

function runDiagnostic(environment: Record<string, string>) {
  return spawnSync(process.execPath, [executable], {
    encoding: "utf8",
    env: environment,
    timeout: 10_000,
    windowsHide: true,
  });
}

function validEnvironment(): Record<string, string> {
  return {
    ASTER_ENV: "integration",
    ASTER_HTTP_HOST: "127.0.0.1",
    ASTER_HTTP_PORT: "3100",
    ASTER_SERVICE_NAME: "config-check",
    ASTER_STARTUP_DEADLINE_MS: "15000",
    DATABASE_URL: credentialUrl("postgresql:", "aster", DATABASE_CANARY, "postgres:5432/aster"),
    REDIS_URL: credentialUrl("redis:", "", REDIS_CANARY, "redis:6379/0"),
  };
}

function credentialUrl(
  protocol: string,
  username: string,
  secret: string,
  location: string,
): string {
  return [protocol, "//", username, ":", secret, "@", location].join("");
}

function assertCanariesRedacted(value: string): void {
  assert.equal(value.includes(DATABASE_CANARY), false);
  assert.equal(value.includes(REDIS_CANARY), false);
}

test("process-start diagnostic exits zero and redacts configured secrets", () => {
  const environment = validEnvironment();
  for (let index = 0; index < 300; index += 1) {
    environment[`HOST_UNRELATED_${index}`] = `value-${index}`;
  }
  const result = runDiagnostic(environment);

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  const diagnostic = JSON.parse(result.stdout) as {
    event: string;
    status: string;
    variables: unknown[];
  };
  assert.equal(diagnostic.event, "aster.configuration.valid");
  assert.equal(diagnostic.status, "ok");
  assert.equal(diagnostic.variables.length, 7);
  assertCanariesRedacted(result.stdout);
});

test("process-start diagnostic exits one with bounded safe issues", () => {
  const environment = validEnvironment();
  environment["DATABASE_URL"] = `https://${DATABASE_CANARY}.invalid/database`;
  environment["REDIS_URL"] = `invalid-${REDIS_CANARY}`;
  const result = runDiagnostic(environment);

  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  const diagnostic = JSON.parse(result.stderr) as {
    code: string;
    event: string;
    issues: unknown[];
    status: string;
  };
  assert.equal(diagnostic.event, "aster.configuration.invalid");
  assert.equal(diagnostic.status, "error");
  assert.equal(diagnostic.code, "ASTER_CONFIGURATION_INVALID");
  assert.deepEqual(diagnostic.issues, [
    { variable: "DATABASE_URL", classification: "secret", reason: "invalid" },
    { variable: "REDIS_URL", classification: "secret", reason: "invalid" },
  ]);
  assertCanariesRedacted(result.stderr);
});
