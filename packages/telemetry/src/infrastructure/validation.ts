import {
  ASTER_DEPENDENCIES,
  ASTER_DEPENDENCY_OPERATIONS,
  ASTER_HTTP_METHODS,
  ASTER_HTTP_ROUTES,
  ASTER_OBSERVATION_OUTCOMES,
  ASTER_TELEMETRY_ENVIRONMENTS,
  AsterTelemetryConfigurationError,
  type AsterDependencyCompletion,
  type AsterDependencyObservationInput,
  type AsterEventProductionObservationInput,
  type AsterHttpCompletion,
  type AsterHttpObservationInput,
  type AsterTelemetryOptions,
} from "../ports/telemetry-contract.js";
import { isAsterOtlpMetricsEndpoint } from "../ports/otlp-endpoint.js";

const TOP_LEVEL_KEYS = new Set([
  "serviceName",
  "serviceVersion",
  "environment",
  "export",
  "monitoringPrecisionMs",
  "shutdownTimeoutMs",
  "maxActiveObservations",
  "maxActiveSpans",
  "cardinalityLimit",
]);
const EXPORT_NONE_KEYS = new Set(["mode"]);
const EXPORT_OTLP_KEYS = new Set(["mode", "endpoint", "intervalMs", "timeoutMs"]);
const SERVICE_NAME_PATTERN = /^[a-z][a-z0-9-]{0,63}$/u;
const SERVICE_VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/u;
const TRACEPARENT_PATTERN = /^00-[a-f0-9]{32}-[a-f0-9]{16}-0[01]$/u;
const MAX_CONFIGURATION_ISSUES = 16;

export interface ValidatedTelemetryOptions {
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly environment: (typeof ASTER_TELEMETRY_ENVIRONMENTS)[number];
  readonly export:
    | Readonly<{ mode: "none" }>
    | Readonly<{
        mode: "otlp-http";
        endpoint: string;
        intervalMs: number;
        timeoutMs: number;
      }>;
  readonly monitoringPrecisionMs: number;
  readonly shutdownTimeoutMs: number;
  readonly maxActiveObservations: number;
  readonly maxActiveSpans: number;
  readonly cardinalityLimit: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  try {
    return !Array.isArray(value);
  } catch {
    return false;
  }
}

function addIssue(issues: string[], issue: string): void {
  if (issues.length < MAX_CONFIGURATION_ISSUES) {
    issues.push(issue);
  }
}

function ownDataRecord(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
  path: string,
  issues: string[],
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    addIssue(issues, `${path} must be a plain object.`);
    return undefined;
  }

  try {
    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) {
      addIssue(issues, `${path} must use a plain object prototype.`);
      return undefined;
    }

    const keys = Reflect.ownKeys(value);
    if (keys.length > allowedKeys.size) {
      addIssue(issues, `${path} contains too many properties.`);
    }

    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys.slice(0, allowedKeys.size + 1)) {
      if (typeof key !== "string") {
        addIssue(issues, `${path} must not contain symbol keys.`);
        continue;
      }
      if (!allowedKeys.has(key)) {
        addIssue(issues, `${path} contains an unsupported property.`);
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor)) {
        addIssue(issues, `${path}.${key} must be a data property.`);
        continue;
      }
      result[key] = descriptor.value as unknown;
    }
    return result;
  } catch {
    addIssue(issues, `${path} could not be inspected safely.`);
    return undefined;
  }
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  path: string,
  issues: string[],
): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    addIssue(issues, `${path} must be an integer from ${minimum} through ${maximum}.`);
    return fallback;
  }
  return value as number;
}

export function validateTelemetryOptions(
  options: AsterTelemetryOptions,
): ValidatedTelemetryOptions {
  const issues: string[] = [];
  const record = ownDataRecord(options, TOP_LEVEL_KEYS, "options", issues) ?? {};

  const serviceName = record["serviceName"];
  if (typeof serviceName !== "string" || !SERVICE_NAME_PATTERN.test(serviceName)) {
    addIssue(issues, "options.serviceName must be a lowercase service slug up to 64 characters.");
  }

  const serviceVersion = record["serviceVersion"];
  if (typeof serviceVersion !== "string" || !SERVICE_VERSION_PATTERN.test(serviceVersion)) {
    addIssue(issues, "options.serviceVersion must be a bounded release identifier.");
  }

  const environment = record["environment"];
  if (!ASTER_TELEMETRY_ENVIRONMENTS.includes(environment as never)) {
    addIssue(issues, "options.environment is not an allowed environment.");
  }

  const monitoringPrecisionMs = boundedInteger(
    record["monitoringPrecisionMs"],
    10,
    10,
    1_000,
    "options.monitoringPrecisionMs",
    issues,
  );
  const shutdownTimeoutMs = boundedInteger(
    record["shutdownTimeoutMs"],
    5_000,
    50,
    30_000,
    "options.shutdownTimeoutMs",
    issues,
  );
  const maxActiveObservations = boundedInteger(
    record["maxActiveObservations"],
    10_000,
    1,
    100_000,
    "options.maxActiveObservations",
    issues,
  );
  const maxActiveSpans = boundedInteger(
    record["maxActiveSpans"],
    128,
    1,
    512,
    "options.maxActiveSpans",
    issues,
  );
  const cardinalityLimit = boundedInteger(
    record["cardinalityLimit"],
    128,
    16,
    512,
    "options.cardinalityLimit",
    issues,
  );

  let exportOptions: ValidatedTelemetryOptions["export"] = Object.freeze({ mode: "none" });
  if (record["export"] !== undefined) {
    const untrustedExport = record["export"];
    let modeDescriptor: PropertyDescriptor | undefined;
    try {
      modeDescriptor = isRecord(untrustedExport)
        ? Object.getOwnPropertyDescriptor(untrustedExport, "mode")
        : undefined;
    } catch {
      modeDescriptor = undefined;
    }
    const mode: unknown =
      modeDescriptor !== undefined && "value" in modeDescriptor
        ? (modeDescriptor.value as unknown)
        : undefined;
    const allowedKeys = mode === "otlp-http" ? EXPORT_OTLP_KEYS : EXPORT_NONE_KEYS;
    const exportRecord =
      ownDataRecord(untrustedExport, allowedKeys, "options.export", issues) ?? {};
    if (exportRecord["mode"] === "none") {
      exportOptions = Object.freeze({ mode: "none" });
    } else if (exportRecord["mode"] === "otlp-http") {
      const endpoint = exportRecord["endpoint"];
      if (!isAsterOtlpMetricsEndpoint(endpoint)) {
        addIssue(
          issues,
          "options.export.endpoint must be a complete HTTP(S) metrics URL without credentials or parameters.",
        );
      }
      const intervalMs = boundedInteger(
        exportRecord["intervalMs"],
        60_000,
        1_000,
        300_000,
        "options.export.intervalMs",
        issues,
      );
      const timeoutMs = boundedInteger(
        exportRecord["timeoutMs"],
        5_000,
        50,
        30_000,
        "options.export.timeoutMs",
        issues,
      );
      if (timeoutMs >= intervalMs) {
        addIssue(issues, "options.export.timeoutMs must be less than options.export.intervalMs.");
      }
      exportOptions = Object.freeze({
        mode: "otlp-http",
        endpoint: typeof endpoint === "string" ? endpoint : "http://127.0.0.1:4318/v1/metrics",
        intervalMs,
        timeoutMs,
      });
    } else {
      addIssue(issues, 'options.export.mode must be "none" or "otlp-http".');
    }
  }

  if (issues.length > 0) {
    throw new AsterTelemetryConfigurationError(issues);
  }

  return Object.freeze({
    serviceName: serviceName as string,
    serviceVersion: serviceVersion as string,
    environment: environment as ValidatedTelemetryOptions["environment"],
    export: exportOptions,
    monitoringPrecisionMs,
    shutdownTimeoutMs,
    maxActiveObservations,
    maxActiveSpans,
    cardinalityLimit,
  });
}

function readDataRecord(
  value: unknown,
  keys: ReadonlySet<string>,
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      return undefined;
    }
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length > keys.size) {
      return undefined;
    }
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of ownKeys) {
      if (typeof key !== "string" || !keys.has(key)) {
        return undefined;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor)) {
        return undefined;
      }
      result[key] = descriptor.value as unknown;
    }
    return result;
  } catch {
    return undefined;
  }
}

export function parseHttpObservationInput(value: unknown): AsterHttpObservationInput | undefined {
  const record = readDataRecord(value, new Set(["method", "route", "traceparent"]));
  if (record === undefined) {
    return undefined;
  }
  const method = record["method"];
  const route = record["route"];
  const traceparent = validTraceparent(record["traceparent"]);
  if (
    !ASTER_HTTP_METHODS.includes(method as never) ||
    !ASTER_HTTP_ROUTES.includes(route as never)
  ) {
    return undefined;
  }
  return Object.freeze({
    method: method as AsterHttpObservationInput["method"],
    route: route as AsterHttpObservationInput["route"],
    ...(traceparent ? { traceparent } : {}),
  });
}

function validTraceparent(value: unknown): string | undefined {
  return typeof value === "string" &&
    TRACEPARENT_PATTERN.test(value) &&
    value.slice(3, 35) !== "0".repeat(32) &&
    value.slice(36, 52) !== "0".repeat(16)
    ? value
    : undefined;
}

export function parseHttpCompletion(value: unknown): AsterHttpCompletion | undefined {
  const record = readDataRecord(value, new Set(["outcome", "statusCode"]));
  if (record === undefined) {
    return undefined;
  }
  const outcome = record["outcome"];
  const statusCode = record["statusCode"];
  if (
    !ASTER_OBSERVATION_OUTCOMES.includes(outcome as never) ||
    !Number.isInteger(statusCode) ||
    (statusCode as number) < 100 ||
    (statusCode as number) > 599
  ) {
    return undefined;
  }
  return Object.freeze({
    outcome: outcome as AsterHttpCompletion["outcome"],
    statusCode: statusCode as number,
  });
}

export function parseDependencyObservationInput(
  value: unknown,
): AsterDependencyObservationInput | undefined {
  const record = readDataRecord(value, new Set(["dependency", "operation", "linkedTraceparent"]));
  if (record === undefined) {
    return undefined;
  }
  const dependency = record["dependency"];
  const operation = record["operation"];
  if (
    !ASTER_DEPENDENCIES.includes(dependency as never) ||
    !ASTER_DEPENDENCY_OPERATIONS.includes(operation as never)
  ) {
    return undefined;
  }
  return Object.freeze({
    dependency: dependency as AsterDependencyObservationInput["dependency"],
    operation: operation as AsterDependencyObservationInput["operation"],
    ...(validTraceparent(record["linkedTraceparent"]) === undefined
      ? {}
      : { linkedTraceparent: record["linkedTraceparent"] as string }),
  });
}

export function parseDependencyCompletion(value: unknown): AsterDependencyCompletion | undefined {
  const record = readDataRecord(value, new Set(["outcome"]));
  if (record === undefined) {
    return undefined;
  }
  const outcome = record["outcome"];
  if (!ASTER_OBSERVATION_OUTCOMES.includes(outcome as never)) {
    return undefined;
  }
  return Object.freeze({ outcome: outcome as AsterDependencyCompletion["outcome"] });
}

export function parseEventProductionObservationInput(
  value: unknown,
): AsterEventProductionObservationInput | undefined {
  const record = readDataRecord(value, new Set(["owner"]));
  return record?.["owner"] === "catalog" ? Object.freeze({ owner: "catalog" }) : undefined;
}
