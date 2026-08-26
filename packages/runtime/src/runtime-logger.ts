import pino, { type DestinationStream, type Logger as PinoLogger } from "pino";

const ABSENT = Symbol("absent");
const MAX_ERROR_CHAIN_DEPTH = 4;
const MAX_ID_LENGTH = 64;
const MAX_LOG_PROPERTIES = 32;
const MAX_PROPERTY_NAME_LENGTH = 64;
const MAX_PROPERTY_STRING_LENGTH = 512;
const MAX_STABLE_NAME_LENGTH = 128;
const MAX_VERSION_LENGTH = 64;
const NON_ZERO_SPAN_ID = /^(?!0{16}$)[0-9a-f]{16}$/u;
const NON_ZERO_TRACE_ID = /^(?!0{32}$)[0-9a-f]{32}$/u;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9_-]+$/u;
const PROPERTY_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/u;
const SERVICE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const STABLE_NAME_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const STABLE_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/u;
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+_-]*$/u;

export const REDACTED_LOG_VALUE = "[Redacted]" as const;
export const ASTER_LOG_LEVELS = Object.freeze([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
] as const);
export const ASTER_RUNTIME_ENVIRONMENTS = Object.freeze([
  "local",
  "integration",
  "staging",
  "production",
] as const);

const LOG_LEVEL_SET = new Set<string>(ASTER_LOG_LEVELS);
const RUNTIME_ENVIRONMENT_SET = new Set<string>(ASTER_RUNTIME_ENVIRONMENTS);
const LOG_OUTCOME_SET = new Set<string>(["ok", "error", "rejected", "degraded"]);
const SENSITIVE_PROPERTY_KEYS = Object.freeze([
  "apikey",
  "api_key",
  "accesstoken",
  "access_token",
  "authorization",
  "bearer",
  "clientkey",
  "client_key",
  "cookie",
  "credential",
  "credentials",
  "clientsecret",
  "client_secret",
  "csrf",
  "databaseurl",
  "database_url",
  "password",
  "passphrase",
  "privatekey",
  "private_key",
  "redisurl",
  "redis_url",
  "refreshtoken",
  "refresh_token",
  "secret",
  "session",
  "sessionid",
  "session_id",
  "setcookie",
  "set_cookie",
  "signedurl",
  "signed_url",
  "token",
  "xsrf",
] as const);
const SENSITIVE_PROPERTY_KEY_SET = new Set<string>(SENSITIVE_PROPERTY_KEYS);
const PROHIBITED_IDENTIFIER_PROPERTIES = new Set([
  "account_id",
  "accountid",
  "profile_id",
  "profileid",
  "title_id",
  "titleid",
  "user_id",
  "userid",
]);
const KNOWN_ERROR_PROTOTYPES = new Map<object | null, string>([
  [Error.prototype, "Error"],
  [AggregateError.prototype, "AggregateError"],
  [EvalError.prototype, "EvalError"],
  [RangeError.prototype, "RangeError"],
  [ReferenceError.prototype, "ReferenceError"],
  [SyntaxError.prototype, "SyntaxError"],
  [TypeError.prototype, "TypeError"],
  [URIError.prototype, "URIError"],
]);
const PINO_REDACTION_PATHS = Object.freeze(
  SENSITIVE_PROPERTY_KEYS.flatMap((key) => [key, `attributes.${key}`]),
);

export type AsterLogLevel = (typeof ASTER_LOG_LEVELS)[number];
export type AsterRuntimeEnvironment = (typeof ASTER_RUNTIME_ENVIRONMENTS)[number];
export type AsterLogOutcome = "ok" | "error" | "rejected" | "degraded";
export type AsterLogScalar = string | number | boolean | null;
export type AsterLogProperty = readonly [name: string, value: AsterLogScalar];
export type AsterLogWriteResult = "failed" | "filtered" | "written";

export interface AsterTraceContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly traceFlags?: number;
}

export type AsterTraceContextProvider = () => AsterTraceContext | undefined;

export interface AsterLogDestination {
  write(line: string): unknown;
}

export interface AsterLogEntry {
  readonly event: string;
  readonly operation?: string;
  readonly outcome?: AsterLogOutcome;
  readonly requestId?: string;
  readonly eventId?: string;
  readonly errorCategory?: string;
  readonly durationMs?: number;
  readonly properties?: readonly AsterLogProperty[];
  readonly error?: unknown;
}

export interface AsterLoggerOptions {
  readonly service: string;
  readonly environment: AsterRuntimeEnvironment;
  readonly version: string;
  readonly level?: AsterLogLevel;
  readonly traceContextProvider?: AsterTraceContextProvider;
  readonly destination?: AsterLogDestination;
}

export interface AsterLogger {
  trace(entry: AsterLogEntry): AsterLogWriteResult;
  debug(entry: AsterLogEntry): AsterLogWriteResult;
  info(entry: AsterLogEntry): AsterLogWriteResult;
  warn(entry: AsterLogEntry): AsterLogWriteResult;
  error(entry: AsterLogEntry): AsterLogWriteResult;
  fatal(entry: AsterLogEntry): AsterLogWriteResult;
  isLevelEnabled(level: AsterLogLevel): boolean;
}

export interface AsterLoggingIssue {
  readonly option: "<options>" | "destination" | "environment" | "level" | "service" | "version";
  readonly reason: "internal" | "invalid" | "missing";
}

export class AsterLoggingError extends Error {
  readonly code = "ASTER_LOGGING_INVALID_OPTIONS";
  readonly issues: readonly AsterLoggingIssue[];

  constructor(issues: readonly AsterLoggingIssue[]) {
    super(
      `Runtime logging configuration is invalid (${issues.length} issue${issues.length === 1 ? "" : "s"}).`,
    );
    this.name = "AsterLoggingError";
    this.issues = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
  }
}

class InvalidOptionError extends Error {
  readonly option: AsterLoggingIssue["option"];
  readonly reason: AsterLoggingIssue["reason"];

  constructor(option: AsterLoggingIssue["option"], reason: AsterLoggingIssue["reason"]) {
    super("Invalid runtime logging option.");
    this.name = "InvalidOptionError";
    this.option = option;
    this.reason = reason;
  }
}

class InvalidLogEntryError extends Error {
  constructor() {
    super("Invalid log entry.");
    this.name = "InvalidLogEntryError";
  }
}

interface NormalizedLoggerOptions {
  readonly destinationWrite: (line: string) => unknown;
  readonly environment: AsterRuntimeEnvironment;
  readonly level: AsterLogLevel;
  readonly service: string;
  readonly traceContextProvider: AsterTraceContextProvider | undefined;
  readonly version: string;
}

interface SanitizedErrorFrame {
  readonly type: string;
  readonly code?: string;
}

interface SanitizedError {
  readonly chain: readonly SanitizedErrorFrame[];
  readonly truncated?: true;
}

interface NormalizedLogEntry {
  readonly event: string;
  readonly operation?: string;
  readonly outcome?: AsterLogOutcome;
  readonly requestId?: string;
  readonly eventId?: string;
  readonly errorCategory?: string;
  readonly durationMs?: number;
  readonly attributes?: Readonly<Record<string, AsterLogScalar>>;
  readonly error?: SanitizedError;
}

function isObject(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function ownDataValue(object: object, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor) {
    return ABSENT;
  }
  if (!("value" in descriptor)) {
    throw new InvalidLogEntryError();
  }
  return descriptor.value;
}

function requiredOption(options: object, key: "environment" | "service" | "version"): unknown {
  const value = ownDataValue(options, key);
  if (value === ABSENT) {
    throw new InvalidOptionError(key, "missing");
  }
  return value;
}

function optionalOption(options: object, key: "destination" | "level"): unknown {
  return ownDataValue(options, key);
}

function normalizeRequiredString(
  value: unknown,
  option: "service" | "version",
  maximumLength: number,
  pattern: RegExp,
): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength ||
    !pattern.test(value)
  ) {
    throw new InvalidOptionError(option, "invalid");
  }
  return value;
}

function normalizeDestination(value: unknown): (line: string) => unknown {
  const destination = value === ABSENT ? process.stdout : value;
  if (!isObject(destination)) {
    throw new InvalidOptionError("destination", "invalid");
  }
  let writer: unknown;
  try {
    writer = Reflect.get(destination, "write");
  } catch {
    throw new InvalidOptionError("destination", "invalid");
  }
  if (typeof writer !== "function") {
    throw new InvalidOptionError("destination", "invalid");
  }
  return (line: string): unknown => Reflect.apply(writer, destination, [line]);
}

function normalizeLoggerOptions(input: AsterLoggerOptions): NormalizedLoggerOptions {
  if (!isObject(input) || Array.isArray(input)) {
    throw new InvalidOptionError("<options>", "invalid");
  }

  const service = normalizeRequiredString(
    requiredOption(input, "service"),
    "service",
    63,
    SERVICE_NAME_PATTERN,
  );
  const version = normalizeRequiredString(
    requiredOption(input, "version"),
    "version",
    MAX_VERSION_LENGTH,
    VERSION_PATTERN,
  );
  const environment = requiredOption(input, "environment");
  if (typeof environment !== "string" || !RUNTIME_ENVIRONMENT_SET.has(environment)) {
    throw new InvalidOptionError("environment", "invalid");
  }

  const levelInput = optionalOption(input, "level");
  const level = levelInput === ABSENT ? "info" : levelInput;
  if (typeof level !== "string" || !LOG_LEVEL_SET.has(level)) {
    throw new InvalidOptionError("level", "invalid");
  }

  const traceContextProvider = ownDataValue(input, "traceContextProvider");
  if (traceContextProvider !== ABSENT && typeof traceContextProvider !== "function") {
    throw new InvalidOptionError("<options>", "invalid");
  }

  return {
    destinationWrite: normalizeDestination(optionalOption(input, "destination")),
    environment: environment as AsterRuntimeEnvironment,
    level: level as AsterLogLevel,
    service,
    traceContextProvider:
      traceContextProvider === ABSENT
        ? undefined
        : (traceContextProvider as AsterTraceContextProvider),
    version,
  };
}

function stableName(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_STABLE_NAME_LENGTH ||
    !STABLE_NAME_PATTERN.test(value)
  ) {
    throw new InvalidLogEntryError();
  }
  return value;
}

function opaqueId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_ID_LENGTH ||
    !OPAQUE_ID_PATTERN.test(value)
  ) {
    throw new InvalidLogEntryError();
  }
  return value;
}

function optionalEntryValue(entry: object, key: keyof AsterLogEntry): unknown {
  return ownDataValue(entry, key);
}

function normalizePropertyValue(value: unknown): AsterLogScalar {
  if (typeof value === "string") {
    if (value.length > MAX_PROPERTY_STRING_LENGTH) {
      throw new InvalidLogEntryError();
    }
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
      throw new InvalidLogEntryError();
    }
    return value;
  }
  if (typeof value === "boolean" || value === null) {
    return value;
  }
  throw new InvalidLogEntryError();
}

function normalizeProperties(source: unknown): Readonly<Record<string, AsterLogScalar>> {
  if (!Array.isArray(source)) {
    throw new InvalidLogEntryError();
  }
  const sourceLength: unknown = source.length;
  if (
    typeof sourceLength !== "number" ||
    !Number.isSafeInteger(sourceLength) ||
    sourceLength < 0 ||
    sourceLength > MAX_LOG_PROPERTIES
  ) {
    throw new InvalidLogEntryError();
  }

  const properties: Record<string, AsterLogScalar> = Object.create(null) as Record<
    string,
    AsterLogScalar
  >;
  const names = new Set<string>();
  for (let index = 0; index < sourceLength; index += 1) {
    if (!Object.hasOwn(source, index)) {
      throw new InvalidLogEntryError();
    }
    const property = ownDataValue(source, index);
    if (property === ABSENT || !Array.isArray(property)) {
      throw new InvalidLogEntryError();
    }
    const propertyLength = ownDataValue(property, "length");
    if (propertyLength !== 2) {
      throw new InvalidLogEntryError();
    }
    const rawName = ownDataValue(property, 0);
    const rawValue = ownDataValue(property, 1);
    if (
      rawName === ABSENT ||
      rawValue === ABSENT ||
      typeof rawName !== "string" ||
      rawName.length === 0 ||
      rawName.length > MAX_PROPERTY_NAME_LENGTH ||
      !PROPERTY_NAME_PATTERN.test(rawName)
    ) {
      throw new InvalidLogEntryError();
    }
    const name = rawName.toLowerCase();
    if (names.has(name) || PROHIBITED_IDENTIFIER_PROPERTIES.has(name)) {
      throw new InvalidLogEntryError();
    }
    names.add(name);
    properties[name] = SENSITIVE_PROPERTY_KEY_SET.has(name)
      ? REDACTED_LOG_VALUE
      : normalizePropertyValue(rawValue);
  }
  return properties;
}

function safeErrorType(error: object): string {
  try {
    if (!(error instanceof Error)) {
      return "UnknownError";
    }
    const prototype: object | null = Object.getPrototypeOf(error) as object | null;
    const knownType = KNOWN_ERROR_PROTOTYPES.get(prototype);
    if (knownType) {
      return knownType;
    }
    return "Error";
  } catch {
    return "UnknownError";
  }
}

function safeErrorCode(error: object): string | undefined {
  try {
    const code = ownDataValue(error, "code");
    if (
      typeof code === "string" &&
      code.length <= MAX_PROPERTY_NAME_LENGTH &&
      STABLE_ERROR_CODE_PATTERN.test(code)
    ) {
      return code;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function ownErrorCause(error: object): unknown {
  try {
    return ownDataValue(error, "cause");
  } catch {
    return ABSENT;
  }
}

function sanitizeError(error: unknown): SanitizedError {
  const chain: SanitizedErrorFrame[] = [];
  const seen = new WeakSet<object>();
  let current: unknown = error;
  let truncated = false;

  while (chain.length < MAX_ERROR_CHAIN_DEPTH) {
    if (!isObject(current)) {
      chain.push({ type: "UnknownError" });
      break;
    }
    if (seen.has(current)) {
      truncated = true;
      break;
    }
    seen.add(current);
    const code = safeErrorCode(current);
    chain.push(code ? { type: safeErrorType(current), code } : { type: safeErrorType(current) });
    const cause = ownErrorCause(current);
    if (cause === ABSENT) {
      break;
    }
    if (chain.length === MAX_ERROR_CHAIN_DEPTH) {
      truncated = true;
      break;
    }
    current = cause;
  }
  return truncated ? { chain, truncated: true } : { chain };
}

function normalizeLogEntry(input: AsterLogEntry): NormalizedLogEntry {
  if (!isObject(input) || Array.isArray(input)) {
    throw new InvalidLogEntryError();
  }

  const event = optionalEntryValue(input, "event");
  if (event === ABSENT) {
    throw new InvalidLogEntryError();
  }
  const normalized: {
    event: string;
    operation?: string;
    outcome?: AsterLogOutcome;
    requestId?: string;
    eventId?: string;
    errorCategory?: string;
    durationMs?: number;
    attributes?: Readonly<Record<string, AsterLogScalar>>;
    error?: SanitizedError;
  } = { event: stableName(event) };

  const operation = optionalEntryValue(input, "operation");
  if (operation !== ABSENT) {
    normalized.operation = stableName(operation);
  }
  const outcome = optionalEntryValue(input, "outcome");
  if (outcome !== ABSENT) {
    if (typeof outcome !== "string" || !LOG_OUTCOME_SET.has(outcome)) {
      throw new InvalidLogEntryError();
    }
    normalized.outcome = outcome as AsterLogOutcome;
  }
  const requestId = optionalEntryValue(input, "requestId");
  if (requestId !== ABSENT) {
    normalized.requestId = opaqueId(requestId);
  }
  const eventId = optionalEntryValue(input, "eventId");
  if (eventId !== ABSENT) {
    normalized.eventId = opaqueId(eventId);
  }
  const errorCategory = optionalEntryValue(input, "errorCategory");
  if (errorCategory !== ABSENT) {
    normalized.errorCategory = stableName(errorCategory);
  }
  const durationMs = optionalEntryValue(input, "durationMs");
  if (durationMs !== ABSENT) {
    if (
      typeof durationMs !== "number" ||
      !Number.isFinite(durationMs) ||
      durationMs < 0 ||
      durationMs > 86_400_000
    ) {
      throw new InvalidLogEntryError();
    }
    normalized.durationMs = durationMs;
  }
  const properties = optionalEntryValue(input, "properties");
  if (properties !== ABSENT) {
    normalized.attributes = normalizeProperties(properties);
  }
  const error = optionalEntryValue(input, "error");
  if (error !== ABSENT) {
    if (normalized.errorCategory === undefined) {
      throw new InvalidLogEntryError();
    }
    normalized.error = sanitizeError(error);
  }

  return normalized;
}

function safeLogEntry(entry: AsterLogEntry): NormalizedLogEntry {
  try {
    return normalizeLogEntry(entry);
  } catch {
    return {
      event: "aster.logging.invalid",
      outcome: "error",
      errorCategory: "logging.invalid_record",
    };
  }
}

function validTraceContext(value: unknown): AsterTraceContext | undefined {
  if (!isObject(value) || Array.isArray(value)) {
    return undefined;
  }
  const traceId = ownDataValue(value, "traceId");
  const spanId = ownDataValue(value, "spanId");
  if (
    typeof traceId !== "string" ||
    typeof spanId !== "string" ||
    !NON_ZERO_TRACE_ID.test(traceId) ||
    !NON_ZERO_SPAN_ID.test(spanId)
  ) {
    return undefined;
  }
  const traceFlags = ownDataValue(value, "traceFlags");
  if (traceFlags === ABSENT) {
    return { traceId, spanId };
  }
  if (
    typeof traceFlags !== "number" ||
    !Number.isSafeInteger(traceFlags) ||
    traceFlags < 0 ||
    traceFlags > 255
  ) {
    return { traceId, spanId };
  }
  return { traceId, spanId, traceFlags };
}

function activeTraceContext(
  provider: AsterTraceContextProvider | undefined,
): AsterTraceContext | Record<string, never> {
  if (!provider) {
    return {};
  }
  try {
    return validTraceContext(provider()) ?? {};
  } catch {
    return {};
  }
}

function invokePino(logger: PinoLogger, level: AsterLogLevel, entry: NormalizedLogEntry): void {
  switch (level) {
    case "trace":
      logger.trace(entry);
      break;
    case "debug":
      logger.debug(entry);
      break;
    case "info":
      logger.info(entry);
      break;
    case "warn":
      logger.warn(entry);
      break;
    case "error":
      logger.error(entry);
      break;
    case "fatal":
      logger.fatal(entry);
      break;
  }
}

function wrapLogger(logger: PinoLogger): AsterLogger {
  const write = (level: AsterLogLevel, entry: AsterLogEntry): AsterLogWriteResult => {
    if (!logger.isLevelEnabled(level)) {
      return "filtered";
    }
    try {
      invokePino(logger, level, safeLogEntry(entry));
      return "written";
    } catch {
      return "failed";
    }
  };
  const isLevelEnabled = (level: AsterLogLevel): boolean => {
    if (!LOG_LEVEL_SET.has(level)) {
      return false;
    }
    try {
      return logger.isLevelEnabled(level);
    } catch {
      return false;
    }
  };
  return Object.freeze({
    trace: (entry: AsterLogEntry) => write("trace", entry),
    debug: (entry: AsterLogEntry) => write("debug", entry),
    info: (entry: AsterLogEntry) => write("info", entry),
    warn: (entry: AsterLogEntry) => write("warn", entry),
    error: (entry: AsterLogEntry) => write("error", entry),
    fatal: (entry: AsterLogEntry) => write("fatal", entry),
    isLevelEnabled,
  });
}

export function createAsterLogger(options: AsterLoggerOptions): AsterLogger {
  let normalized: NormalizedLoggerOptions;
  try {
    normalized = normalizeLoggerOptions(options);
  } catch (error) {
    if (error instanceof InvalidOptionError) {
      throw new AsterLoggingError([{ option: error.option, reason: error.reason }]);
    }
    throw new AsterLoggingError([{ option: "<options>", reason: "internal" }]);
  }

  try {
    const destination: DestinationStream = {
      write(line: string): void {
        normalized.destinationWrite(line);
      },
    };
    const logger = pino(
      {
        base: {
          service: normalized.service,
          environment: normalized.environment,
          version: normalized.version,
        },
        depthLimit: 3,
        edgeLimit: 64,
        formatters: {
          level(label: string): { level: string } {
            return { level: label };
          },
        },
        level: normalized.level,
        mixin: () => activeTraceContext(normalized.traceContextProvider),
        redact: {
          censor: REDACTED_LOG_VALUE,
          paths: [...PINO_REDACTION_PATHS],
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      },
      destination,
    );
    return wrapLogger(logger);
  } catch {
    throw new AsterLoggingError([{ option: "<options>", reason: "internal" }]);
  }
}
