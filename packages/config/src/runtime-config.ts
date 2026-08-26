import { URL } from "node:url";

import * as z from "zod";

const MAX_OWNED_VARIABLES = 16;
const MAX_REPORTED_ISSUES = 8;
const MAX_SOURCE_ENTRIES = 256;
const MAX_VARIABLE_NAME_LENGTH = 128;
const MAX_VALUE_LENGTH = 2_048;
const SERVICE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
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
}

export const REFERENCE_RUNTIME_CONFIG_VARIABLES = Object.freeze({
  ASTER_ENV: Object.freeze({ classification: "non-secret" }),
  ASTER_SERVICE_NAME: Object.freeze({ classification: "non-secret" }),
  DATABASE_URL: Object.freeze({ classification: "secret" }),
  REDIS_URL: Object.freeze({ classification: "secret" }),
} satisfies Record<string, RuntimeVariableDefinition>);

const KNOWN_VARIABLES = Object.freeze(
  Object.keys(REFERENCE_RUNTIME_CONFIG_VARIABLES) as ReferenceRuntimeConfigVariable[],
);
const KNOWN_VARIABLE_SET = new Set<string>(KNOWN_VARIABLES);

const runtimeConfigSchema = z.strictObject({
  ASTER_ENV: z.enum(RUNTIME_ENVIRONMENTS),
  ASTER_SERVICE_NAME: z.string().min(1).max(63).regex(SERVICE_NAME_PATTERN),
  DATABASE_URL: z
    .string()
    .max(MAX_VALUE_LENGTH)
    .refine((value) => hasUrlProtocol(value, POSTGRES_PROTOCOLS)),
  REDIS_URL: z
    .string()
    .max(MAX_VALUE_LENGTH)
    .refine((value) => hasUrlProtocol(value, REDIS_PROTOCOLS)),
});

export interface ReferenceRuntimeConfig {
  readonly environment: RuntimeEnvironment;
  readonly serviceName: string;
  readonly databaseUrl: string;
  readonly redisUrl: string;
}

export interface ReferenceRuntimeConfigIssue {
  readonly variable: string;
  readonly classification: ConfigClassification | "unknown";
  readonly reason: ReferenceRuntimeConfigIssueReason;
}

export interface ConfiguredNonSecretVariable {
  readonly name: "ASTER_ENV" | "ASTER_SERVICE_NAME";
  readonly classification: "non-secret";
  readonly status: "configured";
  readonly value: string;
}

export interface ConfiguredSecretVariable {
  readonly name: "DATABASE_URL" | "REDIS_URL";
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

function hasAsciiControl(value: string): boolean {
  for (const character of value) {
    const codePoint = character.charCodeAt(0);
    if (codePoint <= 0x1f || codePoint === 0x7f) {
      return true;
    }
  }
  return false;
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
    ASTER_SERVICE_NAME: undefined,
    DATABASE_URL: undefined,
    REDIS_URL: undefined,
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

    if (!KNOWN_VARIABLE_SET.has(name)) {
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
      issues.push(knownIssue(variable, "missing"));
      continue;
    }

    const value = input[variable];
    if (value === undefined) {
      issues.push(knownIssue(variable, "missing"));
    } else if (value.length === 0 || value.trim().length === 0) {
      issues.push(knownIssue(variable, "empty"));
    } else if (value.length > MAX_VALUE_LENGTH) {
      issues.push(knownIssue(variable, "too_long"));
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

  return Object.freeze({
    environment: result.data.ASTER_ENV,
    serviceName: result.data.ASTER_SERVICE_NAME,
    databaseUrl: result.data.DATABASE_URL,
    redisUrl: result.data.REDIS_URL,
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
        name: "ASTER_SERVICE_NAME",
        classification: "non-secret",
        status: "configured",
        value: config.serviceName,
      }),
      Object.freeze({ name: "DATABASE_URL", classification: "secret", status: "configured" }),
      Object.freeze({ name: "REDIS_URL", classification: "secret", status: "configured" }),
    ]),
  });
}
