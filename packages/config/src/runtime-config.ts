import { URL } from "node:url";

import * as z from "zod";

const MAX_OWNED_VARIABLES = 16;
const MAX_REPORTED_ISSUES = 8;
const MAX_VARIABLE_NAME_LENGTH = 128;
const MAX_VALUE_LENGTH = 2_048;
const SERVICE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const OWNED_PREFIXES = ["ASTER_", "DATABASE_", "REDIS_"] as const;
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
  return OWNED_PREFIXES.some((prefix) => name.startsWith(prefix));
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

function preflight(
  source: Readonly<Record<string, string | undefined>>,
): ReferenceRuntimeConfigIssue[] {
  const issues: ReferenceRuntimeConfigIssue[] = [];
  let ownedVariableCount = 0;

  for (const name in source) {
    if (!Object.hasOwn(source, name) || !isOwnedVariable(name)) {
      continue;
    }

    ownedVariableCount += 1;
    if (ownedVariableCount > MAX_OWNED_VARIABLES) {
      return [
        ...issues.slice(0, MAX_REPORTED_ISSUES - 1),
        Object.freeze({
          variable: "<owned-variables>",
          classification: "unknown",
          reason: "too_many",
        }),
      ];
    }

    if (!KNOWN_VARIABLE_SET.has(name)) {
      issues.push(
        Object.freeze({
          variable: safeUnexpectedVariableName(name),
          classification: "unknown",
          reason: "unexpected",
        }),
      );
    }
  }

  for (const variable of KNOWN_VARIABLES) {
    const value = source[variable];
    if (value === undefined) {
      issues.push(knownIssue(variable, "missing"));
    } else if (value.length === 0 || value.trim().length === 0) {
      issues.push(knownIssue(variable, "empty"));
    } else if (value.length > MAX_VALUE_LENGTH) {
      issues.push(knownIssue(variable, "too_long"));
    }
  }
  return issues;
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
  source: Readonly<Record<string, string | undefined>>,
): ReferenceRuntimeConfig {
  const preflightIssues = preflight(source);
  if (preflightIssues.length > 0) {
    throw new ReferenceRuntimeConfigError(boundedIssues(preflightIssues));
  }

  const input = Object.fromEntries(KNOWN_VARIABLES.map((variable) => [variable, source[variable]]));
  const result = runtimeConfigSchema.safeParse(input);
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
  source: Readonly<Record<string, string | undefined>>,
): ReferenceRuntimeConfig {
  try {
    return parseReferenceRuntimeConfig(source);
  } catch (error) {
    if (error instanceof ReferenceRuntimeConfigError) {
      throw error;
    }
    throw new ReferenceRuntimeConfigError([
      Object.freeze({
        variable: "<owned-variables>",
        classification: "unknown",
        reason: "internal",
      }),
    ]);
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
