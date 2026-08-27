import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  ReferenceRuntimeConfigError,
  createReferenceRuntimeConfigDiagnostic,
  loadReferenceRuntimeConfig,
  type ReferenceRuntimeConfigSourceEntry,
} from "../src/index.js";

const DATABASE_CANARY = "database-canary-never-emit";
const REDIS_CANARY = "redis-canary-never-emit";

function validEnvironment(): Record<string, string> {
  return {
    ASTER_ENV: "local",
    ASTER_HTTP_HOST: "127.0.0.1",
    ASTER_HTTP_PORT: "3100",
    ASTER_SERVICE_NAME: "config-check",
    ASTER_STARTUP_DEADLINE_MS: "15000",
    DATABASE_URL: credentialUrl("postgresql:", "aster", DATABASE_CANARY, "postgres:5432/aster"),
    REDIS_URL: credentialUrl("redis:", "", REDIS_CANARY, "redis:6379/0"),
  };
}

function environmentEntries(
  environment: Readonly<Record<string, string | undefined>>,
): ReferenceRuntimeConfigSourceEntry[] {
  return Object.entries(environment);
}

function loadEnvironment(environment: Readonly<Record<string, string | undefined>>) {
  return loadReferenceRuntimeConfig(environmentEntries(environment));
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
  const stableSource = environmentEntries(environment);
  let sourceLengthReads = 0;
  const source = new Proxy(stableSource, {
    get(target, property): unknown {
      if (property === "length") {
        sourceLengthReads += 1;
        return sourceLengthReads === 1 ? target.length : 1_000;
      }
      return Reflect.get(target, property) as unknown;
    },
  });
  const configuration = loadReferenceRuntimeConfig(source);

  assert.equal(sourceLengthReads, 1);
  assert.equal(configuration.environment, "local");
  assert.equal(configuration.httpHost, "127.0.0.1");
  assert.equal(configuration.httpPort, 3_100);
  assert.equal(configuration.serviceName, "config-check");
  assert.equal(configuration.startupDeadlineMs, 15_000);
  assert.equal(digest(configuration.databaseUrl), digest(environment["DATABASE_URL"] ?? ""));
  assert.equal(digest(configuration.redisUrl), digest(environment["REDIS_URL"] ?? ""));
  assert.equal(Object.isFrozen(configuration), true);
});

test("reports non-secret values and only configured status for secrets", () => {
  const diagnostic = createReferenceRuntimeConfigDiagnostic(loadEnvironment(validEnvironment()));
  const serialized = JSON.stringify(diagnostic);

  assert.deepEqual(diagnostic.variables, [
    {
      name: "ASTER_ENV",
      classification: "non-secret",
      status: "configured",
      value: "local",
    },
    {
      name: "ASTER_HTTP_HOST",
      classification: "non-secret",
      status: "configured",
      value: "127.0.0.1",
    },
    {
      name: "ASTER_HTTP_PORT",
      classification: "non-secret",
      status: "configured",
      value: "3100",
    },
    {
      name: "ASTER_SERVICE_NAME",
      classification: "non-secret",
      status: "configured",
      value: "config-check",
    },
    {
      name: "ASTER_STARTUP_DEADLINE_MS",
      classification: "non-secret",
      status: "configured",
      value: "15000",
    },
    { name: "DATABASE_URL", classification: "secret", status: "configured" },
    { name: "REDIS_URL", classification: "secret", status: "configured" },
  ]);
  assertCanariesRedacted(serialized);
});

test("combines an optional separate password without changing legacy URI callers", () => {
  assert.equal(loadEnvironment(validEnvironment()).databasePasswordConfigured, false);
  const password = `${DATABASE_CANARY}:@/?#%42 +á`;
  const environment = {
    ...validEnvironment(),
    DATABASE_URL: "postgresql://aster@postgres:5432/aster?application_name=identity",
    ASTER_DATABASE_PASSWORD: password,
  };
  const configuration = loadEnvironment(environment);
  const url = new URL(configuration.databaseUrl);
  assert.equal(decodeURIComponent(url.password), password);
  assert.equal(url.username, "aster");
  assert.equal(url.hostname, "postgres");
  assert.equal(url.searchParams.get("application_name"), "identity");
  assert.equal(configuration.databasePasswordConfigured, true);
  assert.equal(environment.DATABASE_URL.includes(password), false);
  const diagnostic = createReferenceRuntimeConfigDiagnostic(configuration);
  assert.deepEqual(diagnostic.variables.at(-1), {
    name: "ASTER_DATABASE_PASSWORD",
    classification: "secret",
    status: "configured",
  });
  assertCanariesRedacted(diagnostic);
});

test("rejects conflicting password sources and missing explicit database user", () => {
  for (const databaseUrl of [
    validEnvironment()["DATABASE_URL"],
    "postgresql://aster@postgres/aster?password=",
    "postgresql://aster@postgres/aster?%70assword=ignored",
  ]) {
    const error = captureRuntimeConfigError(() =>
      loadEnvironment({
        ...validEnvironment(),
        DATABASE_URL: databaseUrl,
        ASTER_DATABASE_PASSWORD: DATABASE_CANARY,
      }),
    );
    assert.deepEqual(error.issues, [
      { variable: "ASTER_DATABASE_PASSWORD", classification: "secret", reason: "invalid" },
    ]);
    assertCanariesRedacted(error);
  }
  assert.deepEqual(
    captureRuntimeConfigError(() =>
      loadEnvironment({
        ...validEnvironment(),
        DATABASE_URL: "postgresql://postgres/aster",
        ASTER_DATABASE_PASSWORD: DATABASE_CANARY,
      }),
    ).issues,
    [{ variable: "DATABASE_URL", classification: "secret", reason: "invalid" }],
  );
});

test("bounds optional passwords including the encoded effective connection URL", () => {
  for (const [value, reason] of [
    [undefined, "missing"],
    ["", "empty"],
    ["   ", "empty"],
    ["invalid\npassword", "invalid"],
    ["x".repeat(2_049), "too_long"],
    ["%".repeat(700), "too_long"],
  ] as const) {
    const error = captureRuntimeConfigError(() =>
      loadEnvironment({
        ...validEnvironment(),
        DATABASE_URL: "postgresql://aster@postgres/aster",
        ASTER_DATABASE_PASSWORD: value,
      }),
    );
    assert.deepEqual(error.issues, [
      { variable: "ASTER_DATABASE_PASSWORD", classification: "secret", reason },
    ]);
    assertCanariesRedacted(error);
  }
});

test("fails closed for every missing variable with classified bounded issues", () => {
  const error = captureRuntimeConfigError(() => loadEnvironment({ PATH: "/usr/bin" }));

  assert.equal(error.code, "ASTER_CONFIGURATION_INVALID");
  assert.deepEqual(error.issues, [
    { variable: "ASTER_ENV", classification: "non-secret", reason: "missing" },
    { variable: "ASTER_HTTP_HOST", classification: "non-secret", reason: "missing" },
    { variable: "ASTER_HTTP_PORT", classification: "non-secret", reason: "missing" },
    { variable: "ASTER_SERVICE_NAME", classification: "non-secret", reason: "missing" },
    {
      variable: "ASTER_STARTUP_DEADLINE_MS",
      classification: "non-secret",
      reason: "missing",
    },
    { variable: "DATABASE_URL", classification: "secret", reason: "missing" },
    { variable: "REDIS_URL", classification: "secret", reason: "missing" },
  ]);

  const inheritedEnvironment: Record<string, string> = {};
  Object.setPrototypeOf(inheritedEnvironment, validEnvironment());
  const inheritedError = captureRuntimeConfigError(() => loadEnvironment(inheritedEnvironment));
  assert.deepEqual(inheritedError.issues, error.issues);
});

test("rejects unsafe listener and startup budget values", () => {
  const environment = validEnvironment();
  environment["ASTER_HTTP_HOST"] = "localhost";
  environment["ASTER_HTTP_PORT"] = "0";
  environment["ASTER_STARTUP_DEADLINE_MS"] = "300001";

  const error = captureRuntimeConfigError(() => loadEnvironment(environment));

  assert.deepEqual(error.issues, [
    { variable: "ASTER_HTTP_HOST", classification: "non-secret", reason: "invalid" },
    { variable: "ASTER_HTTP_PORT", classification: "non-secret", reason: "invalid" },
    {
      variable: "ASTER_STARTUP_DEADLINE_MS",
      classification: "non-secret",
      reason: "invalid",
    },
  ]);

  const container = validEnvironment();
  container["ASTER_HTTP_HOST"] = "0.0.0.0";
  container["ASTER_HTTP_PORT"] = "65535";
  container["ASTER_STARTUP_DEADLINE_MS"] = "5000";
  const configuration = loadEnvironment(container);
  assert.equal(configuration.httpHost, "0.0.0.0");
  assert.equal(configuration.httpPort, 65_535);
  assert.equal(configuration.startupDeadlineMs, 5_000);

  for (const value of ["01024", "1024.5", "+1024", " 1024", "1023", "65536"]) {
    const invalid = { ...validEnvironment(), ASTER_HTTP_PORT: value };
    assert.deepEqual(captureRuntimeConfigError(() => loadEnvironment(invalid)).issues, [
      { variable: "ASTER_HTTP_PORT", classification: "non-secret", reason: "invalid" },
    ]);
  }
  for (const value of ["4999", "300001", "1e4", "15000.0"]) {
    const invalid = { ...validEnvironment(), ASTER_STARTUP_DEADLINE_MS: value };
    assert.deepEqual(captureRuntimeConfigError(() => loadEnvironment(invalid)).issues, [
      {
        variable: "ASTER_STARTUP_DEADLINE_MS",
        classification: "non-secret",
        reason: "invalid",
      },
    ]);
  }
});

test("classifies empty and malformed values without returning their contents", () => {
  const environment = validEnvironment();
  environment["ASTER_ENV"] = " ";
  environment["DATABASE_URL"] = `https://${DATABASE_CANARY}.invalid/aster`;
  environment["REDIS_URL"] = `not-a-url-${REDIS_CANARY}`;

  const error = captureRuntimeConfigError(() => loadEnvironment(environment));

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

  const error = captureRuntimeConfigError(() => loadEnvironment(environment));

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

  const error = captureRuntimeConfigError(() => loadEnvironment(environment));

  assert.deepEqual(error.issues, [
    { variable: "ASTER_ENV", classification: "non-secret", reason: "invalid" },
    { variable: "ASTER_SERVICE_NAME", classification: "non-secret", reason: "invalid" },
    { variable: "REDIS_URL", classification: "secret", reason: "invalid" },
  ]);
  assertCanariesRedacted(error);
});

test("rejects URL control characters before the platform parser can normalize them", () => {
  const environment = validEnvironment();
  environment["DATABASE_URL"] = "postgresql://post\ngres:5432/aster";
  environment["REDIS_URL"] = "redis://red\tis:6379/0";

  const error = captureRuntimeConfigError(() => loadEnvironment(environment));

  assert.deepEqual(error.issues, [
    { variable: "DATABASE_URL", classification: "secret", reason: "invalid" },
    { variable: "REDIS_URL", classification: "secret", reason: "invalid" },
  ]);
  assert.equal(JSON.stringify(error).includes("\\n"), false);
  assert.equal(JSON.stringify(error).includes("\\t"), false);
});

test("rejects owned-prefix typos while ignoring unrelated host variables", () => {
  const environment = {
    ...validEnvironment(),
    ASTER_ENVIROMENT: "local",
    HOME: "/synthetic/home",
    PATH: "/usr/bin",
  };

  const error = captureRuntimeConfigError(() => loadEnvironment(environment));

  assert.deepEqual(error.issues, [
    { variable: "ASTER_ENVIROMENT", classification: "unknown", reason: "unexpected" },
  ]);

  const duplicateKnownSource = [
    ...environmentEntries(validEnvironment()),
    ["ASTER_ENV", "production"] as const,
  ];
  const duplicateKnownError = captureRuntimeConfigError(() =>
    loadReferenceRuntimeConfig(duplicateKnownSource),
  );
  assert.deepEqual(duplicateKnownError.issues, [
    { variable: "ASTER_ENV", classification: "non-secret", reason: "invalid" },
  ]);

  const oversizedNameSource = [
    ...environmentEntries(validEnvironment()),
    [`ASTER_${"X".repeat(10_000)}`, "ignored"] as const,
  ];
  const oversizedNameError = captureRuntimeConfigError(() =>
    loadReferenceRuntimeConfig(oversizedNameSource),
  );
  assert.deepEqual(oversizedNameError.issues, [
    { variable: "<unexpected-variable>", classification: "unknown", reason: "unexpected" },
  ]);
});

test("bounds oversized values and excessive owned variables before schema parsing", () => {
  const oversized = validEnvironment();
  oversized["ASTER_SERVICE_NAME"] = " ".repeat(2_100);
  oversized["DATABASE_URL"] = `postgresql://${"x".repeat(2_100)}`;
  const oversizedError = captureRuntimeConfigError(() => loadEnvironment(oversized));
  assert.deepEqual(oversizedError.issues, [
    { variable: "ASTER_SERVICE_NAME", classification: "non-secret", reason: "too_long" },
    { variable: "DATABASE_URL", classification: "secret", reason: "too_long" },
  ]);

  const excessive = environmentEntries(validEnvironment());
  for (let index = 0; index < 20; index += 1) {
    excessive.push([`ASTER_UNKNOWN_${index}`, `value-${index}`]);
  }
  let trailingOwnedEntryReads = 0;
  Object.defineProperty(excessive, 17, {
    configurable: true,
    get() {
      trailingOwnedEntryReads += 1;
      throw new Error("owned-entry-after-limit-must-not-be-read");
    },
  });
  const excessiveError = captureRuntimeConfigError(() => loadReferenceRuntimeConfig(excessive));
  assert.equal(trailingOwnedEntryReads, 0);
  assert.equal(excessiveError.issues.length, 8);
  assert.deepEqual(excessiveError.issues.at(-1), {
    variable: "<owned-variables>",
    classification: "unknown",
    reason: "too_many",
  });

  const totalScanSource = environmentEntries(validEnvironment());
  totalScanSource.length = 1_000;
  let firstEntryReads = 0;
  Object.defineProperty(totalScanSource, 0, {
    configurable: true,
    get() {
      firstEntryReads += 1;
      throw new Error("source-entry-must-not-be-read-before-length-refusal");
    },
  });
  const totalScanError = captureRuntimeConfigError(() =>
    loadReferenceRuntimeConfig(totalScanSource),
  );
  assert.equal(firstEntryReads, 0);
  assert.deepEqual(totalScanError.issues, [
    { variable: "<environment-variables>", classification: "unknown", reason: "too_many" },
  ]);
});

test("sanitizes unexpected source failures without preserving their cause", () => {
  const sourceFailureCanary = "source-failure-canary-never-emit";
  const unexpectedSource = new Proxy(environmentEntries(validEnvironment()), {
    getOwnPropertyDescriptor() {
      throw new Error(sourceFailureCanary);
    },
  });

  const unexpectedError = captureRuntimeConfigError(() =>
    loadReferenceRuntimeConfig(unexpectedSource),
  );

  assert.deepEqual(unexpectedError.issues, [
    { variable: "<owned-variables>", classification: "unknown", reason: "internal" },
  ]);
  assert.equal(unexpectedError.message.includes(sourceFailureCanary), false);
  assert.equal((unexpectedError.stack ?? "").includes(sourceFailureCanary), false);
  assert.equal(JSON.stringify(unexpectedError).includes(sourceFailureCanary), false);
  assert.equal("cause" in unexpectedError, false);

  const forgedSource = new Proxy(environmentEntries(validEnvironment()), {
    getOwnPropertyDescriptor() {
      throw new ReferenceRuntimeConfigError([
        {
          variable: sourceFailureCanary,
          classification: "secret",
          reason: "unexpected",
        },
      ]);
    },
  });
  const forgedError = captureRuntimeConfigError(() => loadReferenceRuntimeConfig(forgedSource));

  assert.deepEqual(forgedError.issues, [
    { variable: "<owned-variables>", classification: "unknown", reason: "internal" },
  ]);
  assert.equal(JSON.stringify(forgedError).includes(sourceFailureCanary), false);
  assert.equal("cause" in forgedError, false);
});
