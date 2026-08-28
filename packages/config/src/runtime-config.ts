import { URL } from "node:url";

import * as z from "zod";

const MAX_OWNED_VARIABLES = 16;
const MAX_REPORTED_ISSUES = 8;
const MAX_SOURCE_ENTRIES = 256;
const MAX_VARIABLE_NAME_LENGTH = 128;
const MAX_VALUE_LENGTH = 2_048;
const SERVICE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const INTEGER_PATTERN = /^[1-9]\d*$/u;
const HTTP_PORT_MIN = 1_024;
const HTTP_PORT_MAX = 65_535;
const STARTUP_DEADLINE_MIN_MS = 5_000;
const STARTUP_DEADLINE_MAX_MS = 300_000;
export const REFERENCE_RUNTIME_CONFIG_OWNED_PREFIXES = Object.freeze([
  "ASTER_",
  "DATABASE_",
  "REDIS_",
] as const);
const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const REDIS_PROTOCOLS = new Set(["redis:", "rediss:"]);

export const RUNTIME_ENVIRONMENTS = Object.freeze([
  "local",
  "integration",
  "staging",
  "production",
] as const);

export type RuntimeEnvironment = (typeof RUNTIME_ENVIRONMENTS)[number];
export type ConfigClassification = "non-secret" | "secret";
export type ReferenceRuntimeConfigSourceEntry = readonly [name: string, value: string | undefined];
export type ReferenceRuntimeConfigVariable = keyof typeof REFERENCE_RUNTIME_CONFIG_VARIABLES;
export type ReferenceRuntimeConfigIssueReason =
  "empty" | "internal" | "invalid" | "missing" | "too_long" | "too_many" | "unexpected";

interface RuntimeVariableDefinition {
  readonly classification: ConfigClassification;
  readonly optional?: boolean;
}

export const REFERENCE_RUNTIME_CONFIG_VARIABLES = Object.freeze({
  ASTER_ENV: Object.freeze({ classification: "non-secret" }),
  ASTER_HTTP_HOST: Object.freeze({ classification: "non-secret" }),
  ASTER_HTTP_PORT: Object.freeze({ classification: "non-secret" }),
  ASTER_SERVICE_NAME: Object.freeze({ classification: "non-secret" }),
  ASTER_STARTUP_DEADLINE_MS: Object.freeze({ classification: "non-secret" }),
  DATABASE_URL: Object.freeze({ classification: "secret" }),
  REDIS_URL: Object.freeze({ classification: "secret" }),
  ASTER_DATABASE_PASSWORD: Object.freeze({ classification: "secret", optional: true }),
  ASTER_OTLP_METRICS_ENDPOINT: Object.freeze({ classification: "secret", optional: true }),
  ASTER_LOCAL_DEMO_ENABLED: Object.freeze({ classification: "non-secret", optional: true }),
  ASTER_PUBLIC_ORIGIN: Object.freeze({ classification: "non-secret", optional: true }),
  ASTER_ROUTER_TRUST_ENABLED: Object.freeze({ classification: "non-secret", optional: true }),
  ASTER_IDENTITY_ENGAGEMENT_READ_ENABLED: Object.freeze({
    classification: "non-secret",
    optional: true,
  }),
} satisfies Record<string, RuntimeVariableDefinition>);

const KNOWN_VARIABLES = Object.freeze(
  Object.keys(REFERENCE_RUNTIME_CONFIG_VARIABLES) as ReferenceRuntimeConfigVariable[],
);
const KNOWN_VARIABLE_SET = new Set<string>(KNOWN_VARIABLES);
const OPTIONAL_VARIABLE_SET = new Set<string>(
  Object.entries(REFERENCE_RUNTIME_CONFIG_VARIABLES)
    .filter(([, definition]) => "optional" in definition)
    .map(([name]) => name),
);

const runtimeConfigSchema = z.strictObject({
  ASTER_ENV: z.enum(RUNTIME_ENVIRONMENTS),
  ASTER_HTTP_HOST: z.enum(["127.0.0.1", "0.0.0.0"]),
  ASTER_HTTP_PORT: z
    .string()
    .regex(INTEGER_PATTERN)
    .refine((value) => integerInRange(value, HTTP_PORT_MIN, HTTP_PORT_MAX)),
  ASTER_SERVICE_NAME: z.string().min(1).max(63).regex(SERVICE_NAME_PATTERN),
  ASTER_STARTUP_DEADLINE_MS: z
    .string()
    .regex(INTEGER_PATTERN)
    .refine((value) => integerInRange(value, STARTUP_DEADLINE_MIN_MS, STARTUP_DEADLINE_MAX_MS)),
  DATABASE_URL: z
    .string()
    .max(MAX_VALUE_LENGTH)
    .refine((value) => hasUrlProtocol(value, POSTGRES_PROTOCOLS)),
  REDIS_URL: z
    .string()
    .max(MAX_VALUE_LENGTH)
    .refine((value) => hasUrlProtocol(value, REDIS_PROTOCOLS)),
  ASTER_DATABASE_PASSWORD: z
    .string()
    .refine((value) => !hasAsciiControl(value))
    .optional(),
  ASTER_OTLP_METRICS_ENDPOINT: z.string().refine(isOtlpMetricsEndpoint).optional(),
  ASTER_LOCAL_DEMO_ENABLED: z.enum(["true", "false"]).optional(),
  ASTER_PUBLIC_ORIGIN: z.string().max(128).refine(isLocalPublicOrigin).optional(),
  ASTER_ROUTER_TRUST_ENABLED: z.enum(["true", "false"]).optional(),
  ASTER_IDENTITY_ENGAGEMENT_READ_ENABLED: z.enum(["true", "false"]).optional(),
});

export interface ReferenceRuntimeConfig {
  readonly environment: RuntimeEnvironment;
  readonly httpHost: "0.0.0.0" | "127.0.0.1";
  readonly httpPort: number;
  readonly serviceName: string;
  readonly startupDeadlineMs: number;
  readonly databaseUrl: string;
  readonly databasePasswordConfigured: boolean;
  readonly redisUrl: string;
  readonly otlpMetricsEndpoint?: string;
  readonly localDemo?: Readonly<{
    publicOrigin: string;
    routerTrust?: true;
    engagementRead?: true;
  }>;
}

export interface ReferenceRuntimeConfigIssue {
  readonly variable: string;
  readonly classification: ConfigClassification | "unknown";
  readonly reason: ReferenceRuntimeConfigIssueReason;
}

export interface ConfiguredNonSecretVariable {
  readonly name:
    | "ASTER_ENV"
    | "ASTER_HTTP_HOST"
    | "ASTER_HTTP_PORT"
    | "ASTER_SERVICE_NAME"
    | "ASTER_STARTUP_DEADLINE_MS"
    | "ASTER_LOCAL_DEMO_ENABLED"
    | "ASTER_ROUTER_TRUST_ENABLED"
    | "ASTER_IDENTITY_ENGAGEMENT_READ_ENABLED"
    | "ASTER_PUBLIC_ORIGIN";
  readonly classification: "non-secret";
  readonly status: "configured";
  readonly value: string;
}

export interface ConfiguredSecretVariable {
  readonly name:
    "DATABASE_URL" | "REDIS_URL" | "ASTER_DATABASE_PASSWORD" | "ASTER_OTLP_METRICS_ENDPOINT";
  readonly classification: "secret";
  readonly status: "configured";
}

export interface ReferenceRuntimeConfigDiagnostic {
  readonly event: "aster.configuration.valid";
  readonly status: "ok";
  readonly variables: readonly (ConfiguredNonSecretVariable | ConfiguredSecretVariable)[];
}

export class ReferenceRuntimeConfigError extends Error {
  readonly code = "ASTER_CONFIGURATION_INVALID";
  readonly issues: readonly ReferenceRuntimeConfigIssue[];

  constructor(issues: readonly ReferenceRuntimeConfigIssue[]) {
    super(
      `Runtime configuration is invalid (${issues.length} issue${issues.length === 1 ? "" : "s"}).`,
    );
    this.name = "ReferenceRuntimeConfigError";
    this.issues = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
  }
}

function hasUrlProtocol(value: string, protocols: ReadonlySet<string>): boolean {
  if (hasAsciiControl(value) || value !== value.trim()) {
    return false;
  }
  try {
    const url = new URL(value);
    return protocols.has(url.protocol) && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function integerInRange(value: string, minimum: number, maximum: number): boolean {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum;
}

function isOtlpMetricsEndpoint(value: string): boolean {
  if (hasAsciiControl(value) || value !== value.trim()) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname.length > 0 &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function hasAsciiControl(value: string): boolean {
  for (const character of value) {
    const codePoint = character.charCodeAt(0);
    if (codePoint <= 0x1f || codePoint === 0x7f) {
      return true;
    }
  }
  return false;
}

function isLocalPublicOrigin(value: string): boolean {
  const match = /^http:\/\/127\.0\.0\.1:([1-9]\d{3,4})$/u.exec(value);
  return match?.[1] !== undefined && integerInRange(match[1], HTTP_PORT_MIN, HTTP_PORT_MAX);
}

function isOwnedVariable(name: string): boolean {
  return REFERENCE_RUNTIME_CONFIG_OWNED_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function safeUnexpectedVariableName(name: string): string {
  if (name.length > MAX_VARIABLE_NAME_LENGTH || !/^[A-Z][A-Z\d_]*$/u.test(name)) {
    return "<unexpected-variable>";
  }
  return name;
}

function knownIssue(
  variable: ReferenceRuntimeConfigVariable,
  reason: ReferenceRuntimeConfigIssueReason,
): ReferenceRuntimeConfigIssue {
  return Object.freeze({
    variable,
    classification: REFERENCE_RUNTIME_CONFIG_VARIABLES[variable].classification,
    reason,
  });
}

function boundedIssues(
  issues: readonly ReferenceRuntimeConfigIssue[],
): readonly ReferenceRuntimeConfigIssue[] {
  if (issues.length <= MAX_REPORTED_ISSUES) {
    return issues;
  }
  return Object.freeze([
    ...issues.slice(0, MAX_REPORTED_ISSUES - 1),
    Object.freeze({
      variable: "<owned-variables>" as const,
      classification: "unknown" as const,
      reason: "too_many" as const,
    }),
  ]);
}

function sanitizedInternalError(): ReferenceRuntimeConfigError {
  return new ReferenceRuntimeConfigError([
    Object.freeze({
      variable: "<owned-variables>",
      classification: "unknown",
      reason: "internal",
    }),
  ]);
}

function guardUntrustedSourceAccess<T>(operation: () => T): T {
  try {
    return operation();
  } catch {
    throw sanitizedInternalError();
  }
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

interface PreflightResult {
  readonly input: Record<ReferenceRuntimeConfigVariable, string | undefined>;
  readonly issues: ReferenceRuntimeConfigIssue[];
}

function tooManyVariablesIssue(variable: string): ReferenceRuntimeConfigIssue {
  return Object.freeze({
    variable,
    classification: "unknown",
    reason: "too_many",
  });
}

function stopWithTooManyVariables(
  issues: readonly ReferenceRuntimeConfigIssue[],
  input: Record<ReferenceRuntimeConfigVariable, string | undefined>,
  variable: string,
): PreflightResult {
  return {
    input,
    issues: [...issues.slice(0, MAX_REPORTED_ISSUES - 1), tooManyVariablesIssue(variable)],
  };
}

function preflight(source: readonly ReferenceRuntimeConfigSourceEntry[]): PreflightResult {
  const untrustedSource: unknown = source;
  const issues: ReferenceRuntimeConfigIssue[] = [];
  const input: Record<ReferenceRuntimeConfigVariable, string | undefined> = {
    ASTER_ENV: undefined,
    ASTER_HTTP_HOST: undefined,
    ASTER_HTTP_PORT: undefined,
    ASTER_SERVICE_NAME: undefined,
    ASTER_STARTUP_DEADLINE_MS: undefined,
    DATABASE_URL: undefined,
    REDIS_URL: undefined,
    ASTER_DATABASE_PASSWORD: undefined,
    ASTER_OTLP_METRICS_ENDPOINT: undefined,
    ASTER_LOCAL_DEMO_ENABLED: undefined,
    ASTER_PUBLIC_ORIGIN: undefined,
    ASTER_ROUTER_TRUST_ENABLED: undefined,
    ASTER_IDENTITY_ENGAGEMENT_READ_ENABLED: undefined,
  };
  const seenKnownVariables = new Set<ReferenceRuntimeConfigVariable>();
  let ownedVariableCount = 0;

  if (!isUnknownArray(untrustedSource)) {
    throw new TypeError("Runtime configuration source must be an array.");
  }
  const sourceEntryCount: unknown = untrustedSource.length;
  if (
    typeof sourceEntryCount !== "number" ||
    !Number.isSafeInteger(sourceEntryCount) ||
    sourceEntryCount < 0
  ) {
    throw new TypeError("Runtime configuration source length must be a safe non-negative integer.");
  }
  if (sourceEntryCount > MAX_SOURCE_ENTRIES) {
    return stopWithTooManyVariables(issues, input, "<environment-variables>");
  }

  for (let index = 0; index < sourceEntryCount; index += 1) {
    if (!Object.hasOwn(untrustedSource, index)) {
      throw new TypeError("Runtime configuration source entries must be own array elements.");
    }

    const entry: unknown = untrustedSource[index];
    if (
      !isUnknownArray(entry) ||
      entry.length !== 2 ||
      !Object.hasOwn(entry, 0) ||
      !Object.hasOwn(entry, 1)
    ) {
      throw new TypeError("Runtime configuration source entry must be an own two-item tuple.");
    }

    const name: unknown = entry[0];
    if (typeof name !== "string") {
      throw new TypeError("Runtime configuration variable name must be a string.");
    }

    if (!isOwnedVariable(name)) {
      continue;
    }

    ownedVariableCount += 1;
    if (ownedVariableCount > MAX_OWNED_VARIABLES) {
      return stopWithTooManyVariables(issues, input, "<owned-variables>");
    }

    if (name.length > MAX_VARIABLE_NAME_LENGTH || !KNOWN_VARIABLE_SET.has(name)) {
      issues.push(
        Object.freeze({
          variable: safeUnexpectedVariableName(name),
          classification: "unknown",
          reason: "unexpected",
        }),
      );
      continue;
    }

    const variable = name as ReferenceRuntimeConfigVariable;
    if (seenKnownVariables.has(variable)) {
      issues.push(knownIssue(variable, "invalid"));
      continue;
    }

    seenKnownVariables.add(variable);
    const value: unknown = entry[1];
    if (value !== undefined && typeof value !== "string") {
      issues.push(knownIssue(variable, "invalid"));
      continue;
    }
    input[variable] = value;
  }

  for (const variable of KNOWN_VARIABLES) {
    if (!seenKnownVariables.has(variable)) {
      if (!OPTIONAL_VARIABLE_SET.has(variable)) {
        issues.push(knownIssue(variable, "missing"));
      }
      continue;
    }

    const value = input[variable];
    if (value === undefined) {
      issues.push(knownIssue(variable, "missing"));
    } else if (value.length > MAX_VALUE_LENGTH) {
      issues.push(knownIssue(variable, "too_long"));
    } else if (value.length === 0 || value.trim().length === 0) {
      issues.push(knownIssue(variable, "empty"));
    }
  }
  return { input, issues };
}

function issuesFromSchema(error: z.ZodError): ReferenceRuntimeConfigIssue[] {
  const variables = new Set<ReferenceRuntimeConfigVariable>();
  for (const issue of error.issues) {
    const variable = issue.path[0];
    if (typeof variable === "string" && KNOWN_VARIABLE_SET.has(variable)) {
      variables.add(variable as ReferenceRuntimeConfigVariable);
    }
  }
  return [...variables].map((variable) => knownIssue(variable, "invalid"));
}

function parseReferenceRuntimeConfig(
  source: readonly ReferenceRuntimeConfigSourceEntry[],
): ReferenceRuntimeConfig {
  const preflightResult = guardUntrustedSourceAccess(() => preflight(source));
  if (preflightResult.issues.length > 0) {
    throw new ReferenceRuntimeConfigError(boundedIssues(preflightResult.issues));
  }

  const result = runtimeConfigSchema.safeParse(preflightResult.input);
  if (!result.success) {
    const issues = issuesFromSchema(result.error);
    throw new ReferenceRuntimeConfigError(
      boundedIssues(
        issues.length > 0
          ? issues
          : [
              Object.freeze({
                variable: "<owned-variables>",
                classification: "unknown",
                reason: "internal",
              }),
            ],
      ),
    );
  }

  const localDemoEnabled = result.data.ASTER_LOCAL_DEMO_ENABLED === "true";
  const publicOrigin = result.data.ASTER_PUBLIC_ORIGIN;
  if (localDemoEnabled && (result.data.ASTER_ENV !== "local" || publicOrigin === undefined)) {
    throw new ReferenceRuntimeConfigError([knownIssue("ASTER_LOCAL_DEMO_ENABLED", "invalid")]);
  }
  if (!localDemoEnabled && publicOrigin !== undefined) {
    throw new ReferenceRuntimeConfigError([knownIssue("ASTER_PUBLIC_ORIGIN", "invalid")]);
  }
  const routerTrust = result.data.ASTER_ROUTER_TRUST_ENABLED === "true";
  if (routerTrust && (!localDemoEnabled || publicOrigin !== "http://127.0.0.1:4000")) {
    throw new ReferenceRuntimeConfigError([knownIssue("ASTER_ROUTER_TRUST_ENABLED", "invalid")]);
  }
  const engagementRead = result.data.ASTER_IDENTITY_ENGAGEMENT_READ_ENABLED === "true";
  if (engagementRead && (!routerTrust || result.data.ASTER_SERVICE_NAME !== "identity")) {
    throw new ReferenceRuntimeConfigError([
      knownIssue("ASTER_IDENTITY_ENGAGEMENT_READ_ENABLED", "invalid"),
    ]);
  }

  let databaseUrl = result.data.DATABASE_URL;
  const databasePassword = result.data.ASTER_DATABASE_PASSWORD;
  if (databasePassword !== undefined) {
    const parsedUrl = new URL(databaseUrl);
    if (parsedUrl.password.length > 0 || parsedUrl.searchParams.has("password")) {
      throw new ReferenceRuntimeConfigError([knownIssue("ASTER_DATABASE_PASSWORD", "invalid")]);
    }
    if (parsedUrl.username.length === 0) {
      throw new ReferenceRuntimeConfigError([knownIssue("DATABASE_URL", "invalid")]);
    }
    // Encode literal percent signs too; URL.password otherwise preserves escape sequences.
    const encoded = encodeURIComponent(databasePassword);
    parsedUrl.password = encoded;
    databaseUrl = parsedUrl.toString();
    if (databaseUrl.length > MAX_VALUE_LENGTH) {
      throw new ReferenceRuntimeConfigError([knownIssue("ASTER_DATABASE_PASSWORD", "too_long")]);
    }
  }

  return Object.freeze({
    environment: result.data.ASTER_ENV,
    httpHost: result.data.ASTER_HTTP_HOST,
    httpPort: Number(result.data.ASTER_HTTP_PORT),
    serviceName: result.data.ASTER_SERVICE_NAME,
    startupDeadlineMs: Number(result.data.ASTER_STARTUP_DEADLINE_MS),
    databaseUrl,
    databasePasswordConfigured: databasePassword !== undefined,
    redisUrl: result.data.REDIS_URL,
    ...(localDemoEnabled && publicOrigin !== undefined
      ? {
          localDemo: Object.freeze({
            publicOrigin,
            ...(routerTrust ? { routerTrust: true as const } : {}),
            ...(engagementRead ? { engagementRead: true as const } : {}),
          }),
        }
      : {}),
    ...(result.data.ASTER_OTLP_METRICS_ENDPOINT === undefined
      ? {}
      : { otlpMetricsEndpoint: result.data.ASTER_OTLP_METRICS_ENDPOINT }),
  });
}

export function loadReferenceRuntimeConfig(
  source: readonly ReferenceRuntimeConfigSourceEntry[],
): ReferenceRuntimeConfig {
  try {
    return parseReferenceRuntimeConfig(source);
  } catch (error) {
    if (error instanceof ReferenceRuntimeConfigError) {
      throw error;
    }
    throw sanitizedInternalError();
  }
}

export function createReferenceRuntimeConfigDiagnostic(
  config: ReferenceRuntimeConfig,
): ReferenceRuntimeConfigDiagnostic {
  return Object.freeze({
    event: "aster.configuration.valid",
    status: "ok",
    variables: Object.freeze([
      Object.freeze({
        name: "ASTER_ENV",
        classification: "non-secret",
        status: "configured",
        value: config.environment,
      }),
      Object.freeze({
        name: "ASTER_HTTP_HOST",
        classification: "non-secret",
        status: "configured",
        value: config.httpHost,
      }),
      Object.freeze({
        name: "ASTER_HTTP_PORT",
        classification: "non-secret",
        status: "configured",
        value: String(config.httpPort),
      }),
      Object.freeze({
        name: "ASTER_SERVICE_NAME",
        classification: "non-secret",
        status: "configured",
        value: config.serviceName,
      }),
      Object.freeze({
        name: "ASTER_STARTUP_DEADLINE_MS",
        classification: "non-secret",
        status: "configured",
        value: String(config.startupDeadlineMs),
      }),
      Object.freeze({ name: "DATABASE_URL", classification: "secret", status: "configured" }),
      Object.freeze({ name: "REDIS_URL", classification: "secret", status: "configured" }),
      ...(config.databasePasswordConfigured
        ? [
            Object.freeze({
              name: "ASTER_DATABASE_PASSWORD" as const,
              classification: "secret" as const,
              status: "configured" as const,
            }),
          ]
        : []),
      ...(config.otlpMetricsEndpoint === undefined
        ? []
        : [
            Object.freeze({
              name: "ASTER_OTLP_METRICS_ENDPOINT" as const,
              classification: "secret" as const,
              status: "configured" as const,
            }),
          ]),
      ...(config.localDemo === undefined
        ? []
        : [
            Object.freeze({
              name: "ASTER_LOCAL_DEMO_ENABLED" as const,
              classification: "non-secret" as const,
              status: "configured" as const,
              value: "true",
            }),
            Object.freeze({
              name: "ASTER_PUBLIC_ORIGIN" as const,
              classification: "non-secret" as const,
              status: "configured" as const,
              value: config.localDemo.publicOrigin,
            }),
          ]),
      ...(config.localDemo?.engagementRead
        ? [
            Object.freeze({
              name: "ASTER_IDENTITY_ENGAGEMENT_READ_ENABLED" as const,
              classification: "non-secret" as const,
              status: "configured" as const,
              value: "true",
            }),
          ]
        : []),
      ...(config.localDemo?.routerTrust
        ? [
            Object.freeze({
              name: "ASTER_ROUTER_TRUST_ENABLED" as const,
              classification: "non-secret" as const,
              status: "configured" as const,
              value: "true",
            }),
          ]
        : []),
    ]),
  });
}
