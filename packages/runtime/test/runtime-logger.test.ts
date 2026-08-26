import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  AsterLoggingError,
  REDACTED_LOG_VALUE,
  createAsterLogger,
  type AsterLogDestination,
  type AsterLogEntry,
  type AsterLoggerOptions,
  type AsterTraceContext,
} from "../src/index.js";

const TRACE_ID = "0123456789abcdef0123456789abcdef";
const SPAN_ID = "0123456789abcdef";

class MemoryDestination implements AsterLogDestination {
  readonly chunks: string[] = [];

  write(line: string): void {
    this.chunks.push(line);
  }

  serialized(): string {
    return this.chunks.join("");
  }

  records(): Array<Record<string, unknown>> {
    return this.serialized()
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  }
}

function loggerOptions(
  destination: AsterLogDestination,
  overrides: Partial<AsterLoggerOptions> = {},
): AsterLoggerOptions {
  return {
    service: "runtime-test",
    environment: "local",
    version: "1.2.3-test",
    destination,
    ...overrides,
  };
}

function captureLoggingError(action: () => unknown): AsterLoggingError {
  try {
    action();
  } catch (error) {
    assert.equal(error instanceof AsterLoggingError, true);
    return error as AsterLoggingError;
  }
  assert.fail("Expected runtime logger initialization to fail");
}

test("emits one bounded JSON line with stable service context", () => {
  const destination = new MemoryDestination();
  const logger = createAsterLogger(loggerOptions(destination));

  assert.equal(
    logger.info({
      event: "aster.runtime.started",
      operation: "runtime.startup",
      outcome: "ok",
      requestId: "request_01",
      eventId: "event_01",
      durationMs: 12.5,
      properties: [
        ["dependency", "none"],
        ["attempt", 1],
        ["ready", true],
        ["optional", null],
      ],
    }),
    "written",
  );

  const [record] = destination.records();
  assert.ok(record);
  assert.equal(record["level"], "info");
  assert.match(String(record["time"]), /^\d{4}-\d{2}-\d{2}T/u);
  assert.equal(record["service"], "runtime-test");
  assert.equal(record["environment"], "local");
  assert.equal(record["version"], "1.2.3-test");
  assert.equal(record["event"], "aster.runtime.started");
  assert.equal(record["operation"], "runtime.startup");
  assert.equal(record["outcome"], "ok");
  assert.equal(record["requestId"], "request_01");
  assert.equal(record["eventId"], "event_01");
  assert.equal(record["durationMs"], 12.5);
  assert.deepEqual(record["attributes"], {
    dependency: "none",
    attempt: 1,
    ready: true,
    optional: null,
  });
  assert.equal(destination.chunks.length, 1);
  assert.equal(destination.chunks[0]?.endsWith("\n"), true);
});

test("filters disabled levels before reading caller-controlled entries", () => {
  const destination = new MemoryDestination();
  const logger = createAsterLogger(loggerOptions(destination, { level: "info" }));
  let eventReads = 0;
  const entry = Object.create(null) as AsterLogEntry;
  Object.defineProperty(entry, "event", {
    get(): string {
      eventReads += 1;
      return "aster.filtered.event";
    },
  });

  assert.equal(logger.debug(entry), "filtered");
  assert.equal(eventReads, 0);
  assert.equal(destination.serialized(), "");
  assert.equal(logger.isLevelEnabled("debug"), false);
  assert.equal(logger.isLevelEnabled("error"), true);
});

test("reads valid OpenTelemetry-compatible context across an async boundary", async () => {
  const destination = new MemoryDestination();
  const context = new AsyncLocalStorage<AsterTraceContext>();
  const logger = createAsterLogger(
    loggerOptions(destination, { traceContextProvider: () => context.getStore() }),
  );

  await context.run({ traceId: TRACE_ID, spanId: SPAN_ID, traceFlags: 1 }, async () => {
    await Promise.resolve();
    assert.equal(logger.info({ event: "aster.async.correlated" }), "written");
  });
  assert.equal(logger.info({ event: "aster.async.uncorrelated" }), "written");

  const [correlated, uncorrelated] = destination.records();
  assert.ok(correlated);
  assert.ok(uncorrelated);
  assert.equal(correlated["traceId"], TRACE_ID);
  assert.equal(correlated["spanId"], SPAN_ID);
  assert.equal(correlated["traceFlags"], 1);
  assert.equal("traceId" in uncorrelated, false);
  assert.equal("spanId" in uncorrelated, false);
});

test("omits forged or throwing trace context without failing the event", () => {
  const invalidDestination = new MemoryDestination();
  const invalidLogger = createAsterLogger(
    loggerOptions(invalidDestination, {
      traceContextProvider: () => ({ traceId: "0".repeat(32), spanId: "f".repeat(16) }),
    }),
  );
  const throwingDestination = new MemoryDestination();
  const throwingLogger = createAsterLogger(
    loggerOptions(throwingDestination, {
      traceContextProvider: () => {
        throw new Error("trace-provider-secret-never-emit");
      },
    }),
  );

  assert.equal(invalidLogger.info({ event: "aster.trace.invalid" }), "written");
  assert.equal(throwingLogger.info({ event: "aster.trace.failed" }), "written");
  for (const output of [invalidDestination.serialized(), throwingDestination.serialized()]) {
    assert.equal(output.includes("trace-provider-secret-never-emit"), false);
    const [record] = output
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as object);
    assert.ok(record);
    assert.equal("traceId" in record, false);
    assert.equal("spanId" in record, false);
  }
});

test("redacts representative sensitive properties before serialization", () => {
  const destination = new MemoryDestination();
  const logger = createAsterLogger(loggerOptions(destination));
  const canaries = [
    "authorization-secret-never-emit",
    "password-secret-never-emit",
    "database-secret-never-emit",
    "signed-url-secret-never-emit",
    "api-key-secret-never-emit",
    "access-token-secret-never-emit",
    "session-secret-never-emit",
  ];

  assert.equal(
    logger.warn({
      event: "aster.redaction.checked",
      properties: [
        ["Authorization", canaries[0] ?? ""],
        ["password", canaries[1] ?? ""],
        ["database_url", canaries[2] ?? ""],
        ["signedUrl", canaries[3] ?? ""],
        ["apiKey", canaries[4] ?? ""],
        ["accessToken", canaries[5] ?? ""],
        ["sessionId", canaries[6] ?? ""],
        ["cache_result", "hit"],
      ],
    }),
    "written",
  );

  const serialized = destination.serialized();
  for (const canary of canaries) {
    assert.equal(serialized.includes(canary), false);
  }
  const [record] = destination.records();
  assert.ok(record);
  assert.deepEqual(record["attributes"], {
    authorization: REDACTED_LOG_VALUE,
    password: REDACTED_LOG_VALUE,
    database_url: REDACTED_LOG_VALUE,
    signedurl: REDACTED_LOG_VALUE,
    apikey: REDACTED_LOG_VALUE,
    accesstoken: REDACTED_LOG_VALUE,
    sessionid: REDACTED_LOG_VALUE,
    cache_result: "hit",
  });
});

test("ignores caller fields that collide with logger-owned top-level context", () => {
  const destination = new MemoryDestination();
  const logger = createAsterLogger(
    loggerOptions(destination, {
      traceContextProvider: () => ({ traceId: TRACE_ID, spanId: SPAN_ID }),
    }),
  );
  const entry = {
    event: "aster.collision.checked",
    service: "forged-service",
    environment: "production",
    version: "forged",
    level: "fatal",
    time: "forged",
    traceId: "f".repeat(32),
    authorization: "top-level-secret-never-emit",
  } as unknown as AsterLogEntry;

  assert.equal(logger.info(entry), "written");
  const [record] = destination.records();
  assert.ok(record);
  assert.equal(record["service"], "runtime-test");
  assert.equal(record["environment"], "local");
  assert.equal(record["version"], "1.2.3-test");
  assert.equal(record["level"], "info");
  assert.equal(record["traceId"], TRACE_ID);
  assert.equal(destination.serialized().includes("top-level-secret-never-emit"), false);
  assert.equal(destination.serialized().includes("forged-service"), false);
});

test("serializes a bounded sanitized error chain without messages or stacks", () => {
  const destination = new MemoryDestination();
  const logger = createAsterLogger(loggerOptions(destination));
  let cause: Error | undefined;
  const canaries: string[] = [];
  for (let index = 5; index >= 0; index -= 1) {
    const canary = `error-message-secret-${index}-never-emit`;
    canaries.push(canary);
    const next = new TypeError(canary, cause ? { cause } : undefined);
    Object.defineProperty(next, "code", { value: `UPSTREAM_${index}` });
    cause = next;
  }

  assert.equal(
    logger.error({
      event: "aster.error.recorded",
      outcome: "error",
      errorCategory: "dependency.failed",
      error: cause,
    }),
    "written",
  );

  const serialized = destination.serialized();
  for (const canary of canaries) {
    assert.equal(serialized.includes(canary), false);
  }
  assert.equal(serialized.includes("stack"), false);
  assert.equal(serialized.includes("message"), false);
  const [record] = destination.records();
  assert.ok(record);
  assert.equal(record["errorCategory"], "dependency.failed");
  assert.deepEqual(record["error"], {
    chain: [
      { type: "TypeError", code: "UPSTREAM_0" },
      { type: "TypeError", code: "UPSTREAM_1" },
      { type: "TypeError", code: "UPSTREAM_2" },
      { type: "TypeError", code: "UPSTREAM_3" },
    ],
    truncated: true,
  });
});

test("does not invoke error name or cause accessors while sanitizing", () => {
  const destination = new MemoryDestination();
  const logger = createAsterLogger(loggerOptions(destination));
  const error = new TypeError("hostile-error-secret-never-emit");
  let nameReads = 0;
  let causeReads = 0;
  Object.defineProperty(error, "name", {
    get(): string {
      nameReads += 1;
      return "ForgedSecretType";
    },
  });
  Object.defineProperty(error, "cause", {
    get(): Error {
      causeReads += 1;
      return new Error("hostile-cause-secret-never-emit");
    },
  });

  assert.equal(
    logger.error({
      event: "aster.error.accessor_checked",
      errorCategory: "dependency.failed",
      error,
    }),
    "written",
  );
  assert.equal(nameReads, 0);
  assert.equal(causeReads, 0);
  assert.equal(destination.serialized().includes("secret-never-emit"), false);
  assert.deepEqual(destination.records()[0]?.["error"], {
    chain: [{ type: "TypeError" }],
  });
});

test("replaces hostile and excessive records with one safe invalid-record event", () => {
  const destination = new MemoryDestination();
  const logger = createAsterLogger(loggerOptions(destination));
  let eventGetterReads = 0;
  const hostile = Object.create(null) as AsterLogEntry;
  Object.defineProperty(hostile, "event", {
    get(): string {
      eventGetterReads += 1;
      throw new Error("entry-getter-secret-never-emit");
    },
  });
  const excessive = new Array(33) as unknown as readonly [string, string][];
  let excessiveEntryReads = 0;
  Object.defineProperty(excessive, "0", {
    get(): readonly [string, string] {
      excessiveEntryReads += 1;
      return ["secret", "excessive-secret-never-emit"];
    },
  });

  assert.equal(logger.info(hostile), "written");
  assert.equal(
    logger.info({ event: "aster.properties.excessive", properties: excessive }),
    "written",
  );
  assert.equal(eventGetterReads, 0);
  assert.equal(excessiveEntryReads, 0);
  assert.equal(destination.serialized().includes("secret-never-emit"), false);
  assert.deepEqual(
    destination.records().map((record) => ({
      event: record["event"],
      outcome: record["outcome"],
      errorCategory: record["errorCategory"],
    })),
    [
      {
        event: "aster.logging.invalid",
        outcome: "error",
        errorCategory: "logging.invalid_record",
      },
      {
        event: "aster.logging.invalid",
        outcome: "error",
        errorCategory: "logging.invalid_record",
      },
    ],
  );
});

test("does not invoke accessor-backed property entries", () => {
  const destination = new MemoryDestination();
  const logger = createAsterLogger(loggerOptions(destination));
  const properties = new Array(1) as unknown as readonly [string, string][];
  let propertyReads = 0;
  Object.defineProperty(properties, "0", {
    get(): readonly [string, string] {
      propertyReads += 1;
      return ["token", "accessor-secret-never-emit"];
    },
  });

  assert.equal(logger.info({ event: "aster.properties.accessor", properties }), "written");
  assert.equal(propertyReads, 0);
  assert.equal(destination.serialized().includes("accessor-secret-never-emit"), false);
  assert.equal(destination.records()[0]?.["event"], "aster.logging.invalid");
});

test("returns failed instead of propagating a synchronous destination failure", () => {
  let writes = 0;
  const logger = createAsterLogger(
    loggerOptions({
      write(): never {
        writes += 1;
        throw new Error("destination-secret-never-emit");
      },
    }),
  );

  assert.equal(logger.info({ event: "aster.destination.failed" }), "failed");
  assert.equal(writes, 1);
});

test("fails logger initialization with cause-free bounded diagnostics", () => {
  const invalidService = captureLoggingError(() =>
    createAsterLogger({
      service: "service-secret-never-emit!",
      environment: "local",
      version: "1.0.0",
    }),
  );
  assert.deepEqual(invalidService.issues, [{ option: "service", reason: "invalid" }]);

  const hostileOptions = new Proxy(
    {},
    {
      getOwnPropertyDescriptor(): never {
        throw new Error("options-secret-never-emit");
      },
    },
  ) as AsterLoggerOptions;
  const internal = captureLoggingError(() => createAsterLogger(hostileOptions));
  assert.deepEqual(internal.issues, [{ option: "<options>", reason: "internal" }]);

  for (const error of [invalidService, internal]) {
    const serialized = JSON.stringify(error);
    assert.equal(serialized.includes("secret-never-emit"), false);
    assert.equal(error.message.includes("secret-never-emit"), false);
    assert.equal((error.stack ?? "").includes("secret-never-emit"), false);
    assert.equal("cause" in error, false);
  }
});

test("runs the process diagnostic with correlation and no secret canary", () => {
  const diagnosticPath = fileURLToPath(new URL("../src/check-runtime-logging.js", import.meta.url));
  const result = spawnSync(process.execPath, [diagnosticPath], {
    encoding: "utf8",
    env: {},
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.includes("secret-never-emit"), false);
  const records = result.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.equal(records.length, 2);
  const firstRecord = records[0];
  const secondRecord = records[1];
  assert.ok(firstRecord);
  assert.ok(secondRecord);
  assert.deepEqual(
    records.map((record) => record["event"]),
    ["aster.logging.check", "aster.logging.redaction_check"],
  );
  assert.equal(firstRecord["traceId"], TRACE_ID);
  assert.equal(firstRecord["spanId"], SPAN_ID);
  const redactedAttributes = secondRecord["attributes"] as Record<string, unknown>;
  assert.equal(redactedAttributes["authorization"], REDACTED_LOG_VALUE);
});

test("keeps Pino out of the generated public declaration contract", async () => {
  const declaration = await readFile(
    new URL("../src/runtime-logger.d.ts", import.meta.url),
    "utf8",
  );
  assert.equal(declaration.toLowerCase().includes("pino"), false);
});
