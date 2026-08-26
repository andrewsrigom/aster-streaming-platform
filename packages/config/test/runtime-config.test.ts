import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  ReferenceRuntimeConfigError,
  createReferenceRuntimeConfigDiagnostic,
  loadReferenceRuntimeConfig,
} from "../src/index.js";

const DATABASE_CANARY = "database-canary-never-emit";
const REDIS_CANARY = "redis-canary-never-emit";

function validEnvironment(): Record<string, string> {
  return {
    ASTER_ENV: "local",
    ASTER_SERVICE_NAME: "config-check",
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

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function captureRuntimeConfigError(action: () => unknown): ReferenceRuntimeConfigError {
  try {
    action();
  } catch (error) {
    assert.equal(error instanceof ReferenceRuntimeConfigError, true);
    return error as ReferenceRuntimeConfigError;
  }
  assert.fail("Expected runtime configuration validation to fail");
}

function assertCanariesRedacted(value: unknown): void {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  assert.equal(serialized.includes(DATABASE_CANARY), false);
  assert.equal(serialized.includes(REDIS_CANARY), false);
}

test("loads and freezes a valid typed runtime configuration", () => {
  const environment = validEnvironment();
  const configuration = loadReferenceRuntimeConfig(environment);

  assert.equal(configuration.environment, "local");
  assert.equal(configuration.serviceName, "config-check");
  assert.equal(digest(configuration.databaseUrl), digest(environment["DATABASE_URL"] ?? ""));
  assert.equal(digest(configuration.redisUrl), digest(environment["REDIS_URL"] ?? ""));
  assert.equal(Object.isFrozen(configuration), true);
});

test("reports non-secret values and only configured status for secrets", () => {
  const diagnostic = createReferenceRuntimeConfigDiagnostic(
    loadReferenceRuntimeConfig(validEnvironment()),
  );
  const serialized = JSON.stringify(diagnostic);

  assert.deepEqual(diagnostic.variables, [
    {
      name: "ASTER_ENV",
      classification: "non-secret",
      status: "configured",
      value: "local",
    },
    {
      name: "ASTER_SERVICE_NAME",
      classification: "non-secret",
      status: "configured",
      value: "config-check",
    },
    { name: "DATABASE_URL", classification: "secret", status: "configured" },
    { name: "REDIS_URL", classification: "secret", status: "configured" },
  ]);
  assertCanariesRedacted(serialized);
});

test("fails closed for every missing variable with classified bounded issues", () => {
  const error = captureRuntimeConfigError(() => loadReferenceRuntimeConfig({ PATH: "/usr/bin" }));

  assert.equal(error.code, "ASTER_CONFIGURATION_INVALID");
  assert.deepEqual(error.issues, [
    { variable: "ASTER_ENV", classification: "non-secret", reason: "missing" },
    { variable: "ASTER_SERVICE_NAME", classification: "non-secret", reason: "missing" },
    { variable: "DATABASE_URL", classification: "secret", reason: "missing" },
    { variable: "REDIS_URL", classification: "secret", reason: "missing" },
  ]);
});

test("classifies empty and malformed values without returning their contents", () => {
  const environment = validEnvironment();
  environment["ASTER_ENV"] = " ";
  environment["DATABASE_URL"] = `https://${DATABASE_CANARY}.invalid/aster`;
  environment["REDIS_URL"] = `not-a-url-${REDIS_CANARY}`;

  const error = captureRuntimeConfigError(() => loadReferenceRuntimeConfig(environment));

  assert.deepEqual(error.issues, [
    { variable: "ASTER_ENV", classification: "non-secret", reason: "empty" },
  ]);
  assertCanariesRedacted(error);
  assertCanariesRedacted(error.message);
  assertCanariesRedacted(error.stack ?? "");
});

test("rejects malformed values after preflight without exposing secret canaries", () => {
  const environment = validEnvironment();
  environment["DATABASE_URL"] = `https://${DATABASE_CANARY}.invalid/aster`;
  environment["REDIS_URL"] = `not-a-url-${REDIS_CANARY}`;

  const error = captureRuntimeConfigError(() => loadReferenceRuntimeConfig(environment));

  assert.deepEqual(error.issues, [
    { variable: "DATABASE_URL", classification: "secret", reason: "invalid" },
    { variable: "REDIS_URL", classification: "secret", reason: "invalid" },
  ]);
  assertCanariesRedacted(error);
});

test("rejects ambiguous non-secret values and URL whitespace", () => {
  const environment = validEnvironment();
  environment["ASTER_ENV"] = "development";
  environment["ASTER_SERVICE_NAME"] = "Config_Check";
  environment["REDIS_URL"] = ` redis://:${REDIS_CANARY}@redis:6379/0`;

  const error = captureRuntimeConfigError(() => loadReferenceRuntimeConfig(environment));

  assert.deepEqual(error.issues, [
    { variable: "ASTER_ENV", classification: "non-secret", reason: "invalid" },
    { variable: "ASTER_SERVICE_NAME", classification: "non-secret", reason: "invalid" },
    { variable: "REDIS_URL", classification: "secret", reason: "invalid" },
  ]);
  assertCanariesRedacted(error);
});

test("rejects owned-prefix typos while ignoring unrelated host variables", () => {
  const environment = {
    ...validEnvironment(),
    ASTER_ENVIROMENT: "local",
    HOME: "/synthetic/home",
    PATH: "/usr/bin",
  };

  const error = captureRuntimeConfigError(() => loadReferenceRuntimeConfig(environment));

  assert.deepEqual(error.issues, [
    { variable: "ASTER_ENVIROMENT", classification: "unknown", reason: "unexpected" },
  ]);
});

test("bounds oversized values and excessive owned variables before schema parsing", () => {
  const oversized = validEnvironment();
  oversized["DATABASE_URL"] = `postgresql://${"x".repeat(2_100)}`;
  const oversizedError = captureRuntimeConfigError(() => loadReferenceRuntimeConfig(oversized));
  assert.deepEqual(oversizedError.issues, [
    { variable: "DATABASE_URL", classification: "secret", reason: "too_long" },
  ]);

  const excessive = validEnvironment();
  for (let index = 0; index < 20; index += 1) {
    excessive[`ASTER_UNKNOWN_${index}`] = `value-${index}`;
  }
  const excessiveError = captureRuntimeConfigError(() => loadReferenceRuntimeConfig(excessive));
  assert.equal(excessiveError.issues.length, 8);
  assert.deepEqual(excessiveError.issues.at(-1), {
    variable: "<owned-variables>",
    classification: "unknown",
    reason: "too_many",
  });
});
