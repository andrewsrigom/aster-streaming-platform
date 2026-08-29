import { createClient, RESP_TYPES } from "@redis/client";

import type {
  AsterDependencyObservation,
  AsterDependencyOperation,
  AsterObservationOutcome,
} from "@aster/telemetry";

import {
  ASTER_REDIS_COMMAND_LIMITS,
  ASTER_REDIS_DEFAULTS,
  type AsterRedisAdapter,
  type AsterRedisCloseResult,
  type AsterRedisCommandFailure,
  AsterRedisConfigurationError,
  type AsterRedisConfigurationIssue,
  AsterRedisLifecycleError,
  type AsterRedisOperationResult,
  type AsterRedisOptions,
  type AsterRedisReadResult,
  type AsterRedisSnapshot,
  type AsterRedisTelemetry,
  type AsterRedisDeleteResult,
  type AsterRedisTokenBucketPolicy,
  type AsterRedisTokenBucketResult,
  type AsterRedisWriteMode,
  type AsterRedisWriteResult,
} from "../redis-contract.js";

const MAXIMUM_OPTION_COUNT = 8;
const MAXIMUM_URL_LENGTH = 2_048;
const MAXIMUM_IN_FLIGHT_COMMANDS = 128;
const MAXIMUM_TIMEOUT_MS = 300_000;
const MAXIMUM_RECONNECT_ATTEMPTS = 10;
const MAXIMUM_RECONNECT_DELAY_MS = 5_000;
const KNOWN_OPTIONS = new Set([
  "url",
  "telemetry",
  "maxInFlightCommands",
  "connectionTimeoutMs",
  "operationTimeoutMs",
  "closeTimeoutMs",
  "reconnectMaxAttempts",
  "reconnectBaseDelayMs",
]);

const COMPLETED = Object.freeze({ status: "completed" } as const);
const TIMED_OUT = Object.freeze({ status: "timed_out" } as const);
const ABORTED = Object.freeze({ status: "aborted" } as const);
const UNAVAILABLE = Object.freeze({ status: "unavailable" } as const);
const FAILED = Object.freeze({ status: "failed" } as const);
const CAPACITY_REJECTED = Object.freeze({
  status: "rejected",
  reason: "capacity_exceeded",
} as const);
const CLOSED_REJECTED = Object.freeze({
  status: "rejected",
  reason: "adapter_closed",
} as const);
const INVALID_SIGNAL_REJECTED = Object.freeze({
  status: "rejected",
  reason: "invalid_signal",
} as const);
const INVALID_INPUT_REJECTED = Object.freeze({
  status: "rejected",
  reason: "invalid_input",
} as const);
const VALUE_TOO_LARGE_REJECTED = Object.freeze({
  status: "rejected",
  reason: "value_too_large",
} as const);
const BOUNDED_READ_SCRIPT =
  "local kind = redis.call('TYPE', KEYS[1]).ok; if kind == 'none' then return {0} end; if kind ~= 'string' then return {3} end; local size = redis.call('STRLEN', KEYS[1]); if size > tonumber(ARGV[1]) then return {2} end; return {1, redis.call('GET', KEYS[1])}";
const COMPARE_AND_DELETE_SCRIPT =
  "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
const ACQUIRE_RECOVERABLE_LEASE_SCRIPT =
  "local kind = redis.call('TYPE', KEYS[1]).ok; if kind == 'none' then redis.call('PSETEX', KEYS[1], ARGV[2], ARGV[1]); return 1 end; local ttl = redis.call('PTTL', KEYS[1]); if kind ~= 'string' or ttl == -1 or ttl > tonumber(ARGV[2]) then redis.call('DEL', KEYS[1]); redis.call('PSETEX', KEYS[1], ARGV[2], ARGV[1]); return 1 end; return 0";
const CONSUME_TOKEN_BUCKET_SCRIPT = [
  "local capacity = tonumber(ARGV[1])",
  "local refill = tonumber(ARGV[2])",
  "local cost = tonumber(ARGV[3])",
  "local state_ttl = tonumber(ARGV[4])",
  "local marker_kind = redis.call('TYPE', KEYS[2]).ok",
  "if marker_kind == 'string' then local marker = redis.call('GET', KEYS[2]); local saved_remaining, saved_reset = string.match(marker, '^v1:(%d+):(%d+)$'); local marker_ttl = redis.call('PTTL', KEYS[2]); saved_remaining = tonumber(saved_remaining); saved_reset = tonumber(saved_reset); if saved_remaining and saved_reset and saved_remaining >= 0 and saved_remaining < capacity / 1000 and saved_reset >= 1 and saved_reset <= state_ttl and marker_ttl >= 0 and marker_ttl <= state_ttl then return {1, saved_remaining, 0, saved_reset, 0, 1} end; redis.call('DEL', KEYS[2]) elseif marker_kind ~= 'none' then redis.call('DEL', KEYS[2]) end",
  "local clock = redis.call('TIME')",
  "local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)",
  "local tokens = capacity",
  "local recovered = 0",
  "local kind = redis.call('TYPE', KEYS[1]).ok",
  "if kind == 'string' then local raw = redis.call('GET', KEYS[1]); local saved_tokens, saved_at = string.match(raw, '^v1:(%d+):(%d+)$'); local ttl = redis.call('PTTL', KEYS[1]); saved_tokens = tonumber(saved_tokens); saved_at = tonumber(saved_at); if saved_tokens and saved_at and saved_tokens >= 0 and saved_tokens <= capacity and saved_at <= now and now - saved_at <= state_ttl and ttl >= 0 and ttl <= state_ttl then tokens = math.min(capacity, saved_tokens + math.floor((now - saved_at) * refill / 1000)) else recovered = 1 end elseif kind ~= 'none' then redis.call('DEL', KEYS[1]); recovered = 1 end",
  "local allowed = 0",
  "if tokens >= cost then tokens = tokens - cost; allowed = 1 end",
  "local retry = 0",
  "if allowed == 0 then retry = math.ceil((cost - tokens) * 1000 / refill) end",
  "local reset = math.ceil((capacity - tokens) * 1000 / refill)",
  "local remaining = math.floor(tokens / 1000)",
  "redis.call('PSETEX', KEYS[1], state_ttl, 'v1:' .. tokens .. ':' .. now)",
  "if allowed == 1 then redis.call('PSETEX', KEYS[2], state_ttl, 'v1:' .. remaining .. ':' .. reset) end",
  "return {allowed, remaining, retry, reset, recovered, 0}",
].join("; ");
const WRITE_MODES = new Set<unknown>(["replace", "if_absent"]);
const STRICT_UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

type ValidatedOptions = Readonly<{
  url: string;
  telemetry: Readonly<{
    target: AsterRedisTelemetry;
    start: AsterRedisTelemetry["startDependencyOperation"];
  }>;
  maxInFlightCommands: number;
  connectionTimeoutMs: number;
  operationTimeoutMs: number;
  closeTimeoutMs: number;
  reconnectMaxAttempts: number;
  reconnectBaseDelayMs: number;
}>;

export type AsterRedisClientEvent = "connect" | "ready" | "reconnecting" | "error" | "end";

type BoundedReadReply = readonly [0] | readonly [1, Buffer] | readonly [2] | readonly [3];
type TokenBucketReply = readonly [0 | 1, number, number, number, 0 | 1, 0 | 1];

export interface AsterRedisClient {
  readonly isOpen: boolean;
  readonly isReady: boolean;
  connect(): Promise<void>;
  ping(signal: AbortSignal): Promise<string>;
  getBounded(key: string, maximumBytes: number, signal: AbortSignal): Promise<BoundedReadReply>;
  set(
    key: string,
    value: string,
    ttlMs: number,
    onlyIfAbsent: boolean,
    signal: AbortSignal,
  ): Promise<string | null>;
  acquireLease(
    key: string,
    ownershipToken: string,
    ttlMs: number,
    signal: AbortSignal,
  ): Promise<number>;
  consumeTokenBucket(
    bucketKey: string,
    admissionKey: string,
    capacityMilliTokens: number,
    refillMilliTokensPerSecond: number,
    costMilliTokens: number,
    ttlMs: number,
    signal: AbortSignal,
  ): Promise<TokenBucketReply>;
  del(key: string, signal: AbortSignal): Promise<number>;
  compareAndDelete(key: string, expectedValue: string, signal: AbortSignal): Promise<number>;
  destroy(): void;
  on(event: AsterRedisClientEvent, listener: (detail?: unknown) => void): void;
  off(event: AsterRedisClientEvent, listener: (detail?: unknown) => void): void;
}

export type AsterRedisClientConfiguration = Readonly<{
  url: string;
  commandsQueueMaxLength: number;
  disableOfflineQueue: true;
  disableClientInfo: true;
  maintNotifications: "disabled";
  socket: Readonly<{
    connectTimeout: number;
    reconnectStrategy(retries: number): false | number;
  }>;
}>;

type ClientFactory = (configuration: AsterRedisClientConfiguration) => AsterRedisClient;

type WaitResult<T> =
  | Readonly<{ status: "completed"; value: T }>
  | Readonly<{ status: "timed_out" }>
  | Readonly<{ status: "aborted" }>
  | Readonly<{ status: "failed"; error: unknown }>;

type RedisCommandResult<T> = Readonly<{ status: "completed"; value: T }> | AsterRedisCommandFailure;

type ClientRegistration = Readonly<{
  client: AsterRedisClient;
  detach(): void;
}>;

function issue(
  option: AsterRedisConfigurationIssue["option"],
  reason: AsterRedisConfigurationIssue["reason"],
): AsterRedisConfigurationIssue {
  return Object.freeze({ option, reason });
}

function ownDataValue(source: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  if (!descriptor || "get" in descriptor) {
    return undefined;
  }
  return descriptor.value as unknown;
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) {
      return true;
    }
  }
  return false;
}

function validRedisUrl(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > MAXIMUM_URL_LENGTH ||
    containsControlCharacter(value)
  ) {
    return false;
  }
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") ||
      parsed.hostname.length === 0 ||
      parsed.search.length > 0 ||
      parsed.hash.length > 0
    ) {
      return false;
    }
    return parsed.pathname === "/" || /^\/\d{1,4}$/u.test(parsed.pathname);
  } catch {
    return false;
  }
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number | undefined {
  const selected = value === undefined ? fallback : value;
  if (
    typeof selected !== "number" ||
    !Number.isSafeInteger(selected) ||
    selected < minimum ||
    selected > maximum
  ) {
    return undefined;
  }
  return selected;
}

function telemetryBinding(value: unknown): ValidatedOptions["telemetry"] | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  try {
    let owner: object | null = value;
    for (let depth = 0; depth < 4 && owner; depth += 1) {
      const method = Object.getOwnPropertyDescriptor(owner, "startDependencyOperation");
      if (method) {
        if ("get" in method || typeof method.value !== "function") {
          return undefined;
        }
        return Object.freeze({
          target: value as AsterRedisTelemetry,
          start: method.value as AsterRedisTelemetry["startDependencyOperation"],
        });
      }
      const prototype: unknown = Object.getPrototypeOf(owner);
      owner = typeof prototype === "object" ? prototype : null;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function validateOptions(input: unknown): ValidatedOptions {
  const issues: AsterRedisConfigurationIssue[] = [];
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      throw new AsterRedisConfigurationError([issue("<options>", "invalid")]);
    }
    const prototype: unknown = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new AsterRedisConfigurationError([issue("<options>", "invalid")]);
    }
    const keys = Reflect.ownKeys(input);
    if (keys.length > MAXIMUM_OPTION_COUNT) {
      throw new AsterRedisConfigurationError([issue("<options>", "invalid")]);
    }
    for (const key of keys) {
      if (typeof key !== "string" || !KNOWN_OPTIONS.has(key)) {
        issues.push(issue("<options>", "unknown"));
        break;
      }
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || "get" in descriptor) {
        issues.push(
          issue(key as Exclude<AsterRedisConfigurationIssue["option"], "<options>">, "invalid"),
        );
      }
    }

    const url = ownDataValue(input, "url");
    const telemetry = telemetryBinding(ownDataValue(input, "telemetry"));
    if (!validRedisUrl(url)) {
      issues.push(issue("url", url === undefined ? "missing" : "invalid"));
    }
    if (!telemetry) {
      issues.push(issue("telemetry", "invalid"));
    }

    const maxInFlightCommands = boundedInteger(
      ownDataValue(input, "maxInFlightCommands"),
      ASTER_REDIS_DEFAULTS.maxInFlightCommands,
      1,
      MAXIMUM_IN_FLIGHT_COMMANDS,
    );
    const connectionTimeoutMs = boundedInteger(
      ownDataValue(input, "connectionTimeoutMs"),
      ASTER_REDIS_DEFAULTS.connectionTimeoutMs,
      1,
      MAXIMUM_TIMEOUT_MS,
    );
    const operationTimeoutMs = boundedInteger(
      ownDataValue(input, "operationTimeoutMs"),
      ASTER_REDIS_DEFAULTS.operationTimeoutMs,
      1,
      MAXIMUM_TIMEOUT_MS,
    );
    const closeTimeoutMs = boundedInteger(
      ownDataValue(input, "closeTimeoutMs"),
      ASTER_REDIS_DEFAULTS.closeTimeoutMs,
      1,
      MAXIMUM_TIMEOUT_MS,
    );
    const reconnectMaxAttempts = boundedInteger(
      ownDataValue(input, "reconnectMaxAttempts"),
      ASTER_REDIS_DEFAULTS.reconnectMaxAttempts,
      0,
      MAXIMUM_RECONNECT_ATTEMPTS,
    );
    const reconnectBaseDelayMs = boundedInteger(
      ownDataValue(input, "reconnectBaseDelayMs"),
      ASTER_REDIS_DEFAULTS.reconnectBaseDelayMs,
      1,
      MAXIMUM_RECONNECT_DELAY_MS,
    );
    for (const [name, value] of [
      ["maxInFlightCommands", maxInFlightCommands],
      ["connectionTimeoutMs", connectionTimeoutMs],
      ["operationTimeoutMs", operationTimeoutMs],
      ["closeTimeoutMs", closeTimeoutMs],
      ["reconnectMaxAttempts", reconnectMaxAttempts],
      ["reconnectBaseDelayMs", reconnectBaseDelayMs],
    ] as const) {
      if (value === undefined) {
        issues.push(issue(name, "invalid"));
      }
    }
    if (issues.length > 0) {
      throw new AsterRedisConfigurationError(issues.slice(0, MAXIMUM_OPTION_COUNT));
    }
    return Object.freeze({
      url: url as string,
      telemetry: telemetry as ValidatedOptions["telemetry"],
      maxInFlightCommands: maxInFlightCommands as number,
      connectionTimeoutMs: connectionTimeoutMs as number,
      operationTimeoutMs: operationTimeoutMs as number,
      closeTimeoutMs: closeTimeoutMs as number,
      reconnectMaxAttempts: reconnectMaxAttempts as number,
      reconnectBaseDelayMs: reconnectBaseDelayMs as number,
    });
  } catch (error) {
    if (error instanceof AsterRedisConfigurationError) {
      throw error;
    }
    throw new AsterRedisConfigurationError([issue("<options>", "internal")]);
  }
}

function validSignal(signal: AbortSignal | undefined): boolean {
  return signal === undefined || signal instanceof AbortSignal;
}

function validCommandText(
  value: unknown,
  maximumBytes: number,
  allowEmpty = false,
): value is string {
  return (
    typeof value === "string" &&
    (allowEmpty || value.length > 0) &&
    Buffer.byteLength(value, "utf8") <= maximumBytes &&
    !containsControlCharacter(value)
  );
}

function validTtl(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= ASTER_REDIS_COMMAND_LIMITS.maximumTtlMs
  );
}

function tokenBucketPolicy(value: unknown): AsterRedisTokenBucketPolicy | undefined {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return undefined;
    }
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== 4 ||
      keys.some(
        (key) =>
          typeof key !== "string" ||
          !["capacity", "refillPerSecond", "cost", "ttlMs"].includes(key),
      )
    ) {
      return undefined;
    }
    const capacity = ownDataValue(value, "capacity");
    const refillPerSecond = ownDataValue(value, "refillPerSecond");
    const cost = ownDataValue(value, "cost");
    const ttlMs = ownDataValue(value, "ttlMs");
    if (
      ![capacity, refillPerSecond, cost].every(
        (item) =>
          typeof item === "number" && Number.isSafeInteger(item) && item >= 1 && item <= 1_000,
      ) ||
      typeof capacity !== "number" ||
      typeof refillPerSecond !== "number" ||
      typeof cost !== "number" ||
      cost > capacity ||
      !validTtl(ttlMs) ||
      ttlMs < Math.ceil((capacity * 1_000) / refillPerSecond)
    ) {
      return undefined;
    }
    return Object.freeze({ capacity, refillPerSecond, cost, ttlMs });
  } catch {
    return undefined;
  }
}

function waitFor<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<WaitResult<T>> {
  if (signal?.aborted) {
    return Promise.resolve(ABORTED);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: WaitResult<T>): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onAbort = (): void => {
      finish(ABORTED);
    };
    const timer = setTimeout(() => {
      finish(TIMED_OUT);
    }, timeoutMs);
    timer.unref();
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        finish(Object.freeze({ status: "completed", value }));
      },
      (error: unknown) => {
        finish(Object.freeze({ status: "failed", error }));
      },
    );
  });
}

function observationFor(
  telemetry: ValidatedOptions["telemetry"],
  operation: AsterDependencyOperation,
): AsterDependencyObservation | undefined {
  try {
    const result = telemetry.start.call(telemetry.target, {
      dependency: "redis",
      operation,
    });
    return result.status === "started" ? result.observation : undefined;
  } catch {
    return undefined;
  }
}

function completeObservation(
  observation: AsterDependencyObservation | undefined,
  outcome: AsterObservationOutcome,
): void {
  try {
    observation?.complete({ outcome });
  } catch {
    // Telemetry degradation cannot change dependency behavior.
  }
}

function outcomeFor(
  result: Readonly<{ status: AsterRedisOperationResult["status"] }>,
): AsterObservationOutcome {
  switch (result.status) {
    case "completed":
      return "success";
    case "timed_out":
      return "timeout";
    case "aborted":
      return "cancelled";
    case "unavailable":
      return "unavailable";
    case "rejected":
      return "rejected";
    case "failed":
      return "error";
  }
}

function safeBoolean(read: () => boolean): boolean {
  try {
    return read();
  } catch {
    return false;
  }
}

function defaultClientFactory(configuration: AsterRedisClientConfiguration): AsterRedisClient {
  // node-redis normalizes URL fields into both objects; keep our internal snapshot immutable.
  const client = createClient({ ...configuration, socket: { ...configuration.socket } });
  return {
    get isOpen(): boolean {
      return client.isOpen;
    },
    get isReady(): boolean {
      return client.isReady;
    },
    async connect(): Promise<void> {
      await client.connect();
    },
    ping(signal): Promise<string> {
      return client.withCommandOptions({ abortSignal: signal }).ping();
    },
    getBounded(key, maximumBytes, signal): Promise<BoundedReadReply> {
      return client
        .withCommandOptions({
          abortSignal: signal,
          typeMapping: { [RESP_TYPES.BLOB_STRING]: Buffer },
        })
        .eval(BOUNDED_READ_SCRIPT, {
          keys: [key],
          arguments: [String(maximumBytes)],
        }) as unknown as Promise<BoundedReadReply>;
    },
    set(key, value, ttlMs, onlyIfAbsent, signal): Promise<string | null> {
      return client.withCommandOptions({ abortSignal: signal }).set(key, value, {
        expiration: { type: "PX", value: ttlMs },
        ...(onlyIfAbsent ? { condition: "NX" as const } : {}),
      });
    },
    acquireLease(key, ownershipToken, ttlMs, signal): Promise<number> {
      return client
        .withCommandOptions({ abortSignal: signal })
        .eval(ACQUIRE_RECOVERABLE_LEASE_SCRIPT, {
          keys: [key],
          arguments: [ownershipToken, String(ttlMs)],
        }) as Promise<number>;
    },
    consumeTokenBucket(
      bucketKey,
      admissionKey,
      capacityMilliTokens,
      refillMilliTokensPerSecond,
      costMilliTokens,
      ttlMs,
      signal,
    ): Promise<TokenBucketReply> {
      return client.withCommandOptions({ abortSignal: signal }).eval(CONSUME_TOKEN_BUCKET_SCRIPT, {
        keys: [bucketKey, admissionKey],
        arguments: [
          String(capacityMilliTokens),
          String(refillMilliTokensPerSecond),
          String(costMilliTokens),
          String(ttlMs),
        ],
      }) as unknown as Promise<TokenBucketReply>;
    },
    del(key, signal): Promise<number> {
      return client.withCommandOptions({ abortSignal: signal }).del(key);
    },
    compareAndDelete(key, expectedValue, signal): Promise<number> {
      return client.withCommandOptions({ abortSignal: signal }).eval(COMPARE_AND_DELETE_SCRIPT, {
        keys: [key],
        arguments: [expectedValue],
      }) as Promise<number>;
    },
    destroy(): void {
      client.destroy();
    },
    on(event, listener): void {
      client.on(event, listener);
    },
    off(event, listener): void {
      client.off(event, listener);
    },
  };
}

export function createAsterRedisAdapterWithClientFactory(
  input: AsterRedisOptions,
  clientFactory: ClientFactory,
): AsterRedisAdapter {
  const options = validateOptions(input);
  const configuration: AsterRedisClientConfiguration = Object.freeze({
    url: options.url,
    commandsQueueMaxLength: options.maxInFlightCommands,
    disableOfflineQueue: true,
    disableClientInfo: true,
    maintNotifications: "disabled",
    socket: Object.freeze({
      connectTimeout: options.connectionTimeoutMs,
      reconnectStrategy(retries: number): false | number {
        if (retries >= options.reconnectMaxAttempts) {
          return false;
        }
        return Math.min((retries + 1) * options.reconnectBaseDelayMs, MAXIMUM_RECONNECT_DELAY_MS);
      },
    }),
  });

  let state: AsterRedisSnapshot["state"] = "idle";
  let current: ClientRegistration | undefined;
  let connectWork: Promise<AsterRedisOperationResult> | undefined;
  let closeWork: Promise<AsterRedisCloseResult> | undefined;
  let inFlightCommands = 0;
  let reconnectAttempts = 0;
  const operationAborters = new Set<AbortController>();
  const activeOperations = new Set<Promise<void>>();
  const backgroundWork = new Set<Promise<unknown>>();

  const registerClient = (client: AsterRedisClient): ClientRegistration => {
    const onConnect = (): void => {
      if (current?.client === client && state !== "closing" && state !== "closed") {
        state = "connecting";
      }
    };
    const onReady = (): void => {
      if (current?.client === client && state !== "closing" && state !== "closed") {
        state = "ready";
        reconnectAttempts = 0;
      }
    };
    const onReconnecting = (): void => {
      if (current?.client === client && state !== "closing" && state !== "closed") {
        state = "reconnecting";
        reconnectAttempts = Math.min(reconnectAttempts + 1, options.reconnectMaxAttempts);
      }
    };
    const onError = (): void => {
      if (current?.client === client && state !== "closing" && state !== "closed") {
        state = "degraded";
      }
    };
    const onEnd = (): void => {
      if (current?.client === client && state !== "closing" && state !== "closed") {
        state = "degraded";
      }
    };
    const listeners = [
      ["connect", onConnect],
      ["ready", onReady],
      ["reconnecting", onReconnecting],
      ["error", onError],
      ["end", onEnd],
    ] as const;
    for (const [event, listener] of listeners) {
      client.on(event, listener);
    }
    return Object.freeze({
      client,
      detach(): void {
        for (const [event, listener] of listeners) {
          try {
            client.off(event, listener);
          } catch {
            // Detach the remaining listeners even if one vendor callback fails.
          }
        }
      },
    });
  };

  const ensureClient = (): AsterRedisClient | undefined => {
    if (current) {
      return current.client;
    }
    try {
      const client = clientFactory(configuration);
      current = registerClient(client);
      return client;
    } catch {
      state = "degraded";
      return undefined;
    }
  };

  const destroyCurrent = (expected?: AsterRedisClient): boolean => {
    const registration = current;
    if (!registration || (expected && registration.client !== expected)) {
      return true;
    }
    current = undefined;
    registration.detach();
    try {
      if (registration.client.isOpen) {
        registration.client.destroy();
      }
    } catch {
      if (state !== "closing" && state !== "closed") {
        state = "degraded";
      }
      return false;
    }
    if (state !== "closing" && state !== "closed") {
      state = "degraded";
    }
    return true;
  };

  const startConnect = (): Promise<AsterRedisOperationResult> => {
    if (connectWork) {
      return connectWork;
    }
    const client = ensureClient();
    if (!client) {
      return Promise.resolve(UNAVAILABLE);
    }
    if (client.isReady) {
      state = "ready";
      return Promise.resolve(COMPLETED);
    }
    if (client.isOpen) {
      return Promise.resolve(UNAVAILABLE);
    }
    state = "connecting";
    let raw: Promise<void>;
    try {
      raw = Promise.resolve(client.connect());
    } catch {
      return Promise.resolve(destroyCurrent(client) ? UNAVAILABLE : FAILED);
    }
    const work = waitFor(raw, undefined, options.connectionTimeoutMs).then(
      (result): AsterRedisOperationResult => {
        try {
          if (state === "closing" || state === "closed" || current?.client !== client) {
            return CLOSED_REJECTED;
          }
          if (result.status === "completed" && client.isReady) {
            state = "ready";
            return COMPLETED;
          }
          const destroyed = destroyCurrent(client);
          if (!destroyed) {
            return FAILED;
          }
          if (result.status === "timed_out") {
            return TIMED_OUT;
          }
          return UNAVAILABLE;
        } catch {
          return destroyCurrent(client) ? UNAVAILABLE : FAILED;
        }
      },
    );
    connectWork = work;
    backgroundWork.add(work);
    const finishBackgroundWork = (): void => {
      backgroundWork.delete(work);
      if (connectWork === work) {
        connectWork = undefined;
      }
    };
    void work.then(finishBackgroundWork, finishBackgroundWork);
    return work;
  };

  const connect = async (signal?: AbortSignal): Promise<AsterRedisOperationResult> => {
    const observation = observationFor(options.telemetry, "connect");
    let finalResult: AsterRedisOperationResult = FAILED;
    try {
      if (!validSignal(signal)) {
        finalResult = INVALID_SIGNAL_REJECTED;
        return finalResult;
      }
      if (signal?.aborted) {
        finalResult = ABORTED;
        return finalResult;
      }
      if (state === "closing" || state === "closed") {
        finalResult = CLOSED_REJECTED;
        return finalResult;
      }
      const result = await waitFor(startConnect(), signal, options.connectionTimeoutMs);
      if (result.status === "completed") {
        finalResult = result.value;
      } else if (result.status === "aborted") {
        finalResult = ABORTED;
      } else if (result.status === "timed_out") {
        finalResult = TIMED_OUT;
      } else {
        finalResult = FAILED;
      }
      return finalResult;
    } catch {
      finalResult = FAILED;
      return finalResult;
    } finally {
      completeObservation(observation, outcomeFor(finalResult));
    }
  };

  const runCommand = async <T>(
    operation: AsterDependencyOperation,
    signal: AbortSignal | undefined,
    invoke: (client: AsterRedisClient, operationSignal: AbortSignal) => Promise<T>,
    validReply: (value: unknown) => value is T,
  ): Promise<RedisCommandResult<T>> => {
    const observation = observationFor(options.telemetry, operation);
    let finalResult: RedisCommandResult<T> = FAILED;
    let completeOperation: (() => void) | undefined;
    let operationController: AbortController | undefined;
    let client: AsterRedisClient | undefined;
    const settlement = new Promise<void>((resolve) => {
      completeOperation = resolve;
    });
    activeOperations.add(settlement);
    try {
      if (!validSignal(signal)) {
        finalResult = INVALID_SIGNAL_REJECTED;
        return finalResult;
      }
      if (signal?.aborted) {
        finalResult = ABORTED;
        return finalResult;
      }
      if (state === "closing" || state === "closed") {
        finalResult = CLOSED_REJECTED;
        return finalResult;
      }
      client = current?.client;
      if (!client?.isReady || state !== "ready") {
        finalResult = UNAVAILABLE;
        return finalResult;
      }
      if (inFlightCommands >= options.maxInFlightCommands) {
        finalResult = CAPACITY_REJECTED;
        return finalResult;
      }
      inFlightCommands += 1;
      operationController = new AbortController();
      operationAborters.add(operationController);
      const operationSignal = signal
        ? AbortSignal.any([signal, operationController.signal])
        : operationController.signal;
      let raw: Promise<T>;
      try {
        raw = Promise.resolve(invoke(client, operationSignal));
      } catch {
        finalResult = destroyCurrent(client) ? UNAVAILABLE : FAILED;
        return finalResult;
      }
      const result = await waitFor(raw, operationSignal, options.operationTimeoutMs);
      if (result.status === "completed" && validReply(result.value)) {
        finalResult = Object.freeze({ status: "completed", value: result.value });
        return finalResult;
      }
      if (result.status === "aborted") {
        finalResult = destroyCurrent(client) ? ABORTED : FAILED;
        return finalResult;
      }
      if (result.status === "timed_out") {
        finalResult = destroyCurrent(client) ? TIMED_OUT : FAILED;
        return finalResult;
      }
      const destroyed = destroyCurrent(client);
      finalResult = result.status === "failed" && destroyed ? UNAVAILABLE : FAILED;
      return finalResult;
    } catch {
      if (client) {
        destroyCurrent(client);
      }
      finalResult = FAILED;
      return finalResult;
    } finally {
      if (operationController) {
        operationAborters.delete(operationController);
        inFlightCommands -= 1;
      }
      completeObservation(observation, outcomeFor(finalResult));
      completeOperation?.();
      activeOperations.delete(settlement);
    }
  };

  const probe = async (signal?: AbortSignal): Promise<AsterRedisOperationResult> => {
    const result = await runCommand(
      "probe",
      signal,
      (client, operationSignal) => client.ping(operationSignal),
      (value): value is string => value === "PONG",
    );
    return result.status === "completed" ? COMPLETED : result;
  };

  const validKey = (key: unknown): key is string =>
    validCommandText(key, ASTER_REDIS_COMMAND_LIMITS.maximumKeyBytes);
  const validValue = (value: unknown): value is string =>
    validCommandText(value, ASTER_REDIS_COMMAND_LIMITS.maximumValueBytes, true);
  const validBoundedReadReply = (value: unknown): value is BoundedReadReply => {
    if (!Array.isArray(value)) {
      return false;
    }
    if ((value[0] === 0 || value[0] === 2 || value[0] === 3) && value.length === 1) {
      return true;
    }
    return (
      value[0] === 1 &&
      value.length === 2 &&
      Buffer.isBuffer(value[1]) &&
      value[1].byteLength <= ASTER_REDIS_COMMAND_LIMITS.maximumValueBytes
    );
  };

  const validTokenBucketReply = (
    value: unknown,
    policy: AsterRedisTokenBucketPolicy,
  ): value is TokenBucketReply =>
    Array.isArray(value) &&
    value.length === 6 &&
    (value[0] === 0 || value[0] === 1) &&
    value.slice(1).every((item) => typeof item === "number" && Number.isSafeInteger(item)) &&
    typeof value[1] === "number" &&
    value[1] >= 0 &&
    value[1] < policy.capacity &&
    typeof value[2] === "number" &&
    (value[0] === 0 ? value[2] >= 1 : value[2] === 0) &&
    value[2] <= policy.ttlMs &&
    typeof value[3] === "number" &&
    value[3] >= 1 &&
    value[3] <= policy.ttlMs &&
    (value[4] === 0 || (value[4] === 1 && value[0] === 1 && value[5] === 0)) &&
    (value[5] === 0 || (value[5] === 1 && value[0] === 1));

  const read = async (key: string, signal?: AbortSignal): Promise<AsterRedisReadResult> => {
    if (!validKey(key)) {
      return INVALID_INPUT_REJECTED;
    }
    const result = await runCommand(
      "read",
      signal,
      (client, operationSignal) =>
        client.getBounded(key, ASTER_REDIS_COMMAND_LIMITS.maximumValueBytes, operationSignal),
      validBoundedReadReply,
    );
    if (result.status !== "completed") {
      return result;
    }
    if (result.value[0] === 0) {
      return Object.freeze({ status: "completed", value: null });
    }
    if (result.value[0] === 2 || result.value[0] === 3) {
      return VALUE_TOO_LARGE_REJECTED;
    }
    try {
      return Object.freeze({
        status: "completed",
        value: STRICT_UTF8_DECODER.decode(result.value[1]),
      });
    } catch {
      return VALUE_TOO_LARGE_REJECTED;
    }
  };

  const write = async (
    key: string,
    value: string,
    ttlMs: number,
    mode: AsterRedisWriteMode,
    signal?: AbortSignal,
  ): Promise<AsterRedisWriteResult> => {
    if (!validKey(key) || !validValue(value) || !validTtl(ttlMs) || !WRITE_MODES.has(mode)) {
      return INVALID_INPUT_REJECTED;
    }
    const result = await runCommand(
      "write",
      signal,
      (client, operationSignal) =>
        client.set(key, value, ttlMs, mode === "if_absent", operationSignal),
      (reply): reply is string | null => reply === "OK" || reply === null,
    );
    return result.status === "completed"
      ? Object.freeze({ status: "completed", stored: result.value === "OK" })
      : result;
  };

  const acquireLease = async (
    key: string,
    ownershipToken: string,
    ttlMs: number,
    signal?: AbortSignal,
  ): Promise<AsterRedisWriteResult> => {
    if (
      !validKey(key) ||
      !validValue(ownershipToken) ||
      ownershipToken.length === 0 ||
      !validTtl(ttlMs)
    ) {
      return INVALID_INPUT_REJECTED;
    }
    const result = await runCommand(
      "write",
      signal,
      (client, operationSignal) => client.acquireLease(key, ownershipToken, ttlMs, operationSignal),
      (reply): reply is number => reply === 0 || reply === 1,
    );
    return result.status === "completed"
      ? Object.freeze({ status: "completed", stored: result.value === 1 })
      : result;
  };

  const deleteKey = async (key: string, signal?: AbortSignal): Promise<AsterRedisDeleteResult> => {
    if (!validKey(key)) {
      return INVALID_INPUT_REJECTED;
    }
    const result = await runCommand(
      "delete",
      signal,
      (client, operationSignal) => client.del(key, operationSignal),
      (reply): reply is number => reply === 0 || reply === 1,
    );
    return result.status === "completed"
      ? Object.freeze({ status: "completed", deleted: result.value === 1 })
      : result;
  };

  const compareAndDelete = async (
    key: string,
    expectedValue: string,
    signal?: AbortSignal,
  ): Promise<AsterRedisDeleteResult> => {
    if (!validKey(key) || !validValue(expectedValue) || expectedValue.length === 0) {
      return INVALID_INPUT_REJECTED;
    }
    const result = await runCommand(
      "delete",
      signal,
      (client, operationSignal) => client.compareAndDelete(key, expectedValue, operationSignal),
      (reply): reply is number => reply === 0 || reply === 1,
    );
    return result.status === "completed"
      ? Object.freeze({ status: "completed", deleted: result.value === 1 })
      : result;
  };

  const consumeTokenBucket = async (
    bucketKey: string,
    admissionKey: string,
    input: AsterRedisTokenBucketPolicy,
    signal?: AbortSignal,
  ): Promise<AsterRedisTokenBucketResult> => {
    const policy = tokenBucketPolicy(input);
    if (!validKey(bucketKey) || !validKey(admissionKey) || bucketKey === admissionKey || !policy) {
      return INVALID_INPUT_REJECTED;
    }
    const result = await runCommand(
      "command",
      signal,
      (client, operationSignal) =>
        client.consumeTokenBucket(
          bucketKey,
          admissionKey,
          policy.capacity * 1_000,
          policy.refillPerSecond * 1_000,
          policy.cost * 1_000,
          policy.ttlMs,
          operationSignal,
        ),
      (reply): reply is TokenBucketReply => validTokenBucketReply(reply, policy),
    );
    return result.status === "completed"
      ? Object.freeze({
          status: "completed",
          allowed: result.value[0] === 1,
          remaining: result.value[1],
          retryAfterMs: result.value[2],
          resetAfterMs: result.value[3],
          recovered: result.value[4] === 1,
          deduplicated: result.value[5] === 1,
        })
      : result;
  };

  const snapshot = (): AsterRedisSnapshot =>
    Object.freeze({
      state,
      open: current ? safeBoolean(() => current?.client.isOpen === true) : false,
      ready: current ? safeBoolean(() => current?.client.isReady === true) : false,
      inFlightCommands,
      reconnectAttempts,
    });

  const startClose = (): Promise<AsterRedisCloseResult> => {
    if (closeWork) {
      return closeWork;
    }
    state = "closing";
    for (const controller of [...operationAborters]) {
      controller.abort();
    }
    const destroyed = destroyCurrent();
    const rawClose = Promise.allSettled([...activeOperations, ...backgroundWork]);
    closeWork = waitFor(rawClose, undefined, options.closeTimeoutMs).then((result) => {
      if (!destroyed) {
        state = "degraded";
        return FAILED;
      }
      state = "closed";
      if (result.status === "completed") {
        return COMPLETED;
      }
      if (result.status === "timed_out") {
        return TIMED_OUT;
      }
      return FAILED;
    });
    return closeWork;
  };

  const close = async (signal?: AbortSignal): Promise<AsterRedisCloseResult> => {
    if (!validSignal(signal)) {
      return FAILED;
    }
    if (signal?.aborted) {
      return ABORTED;
    }
    if (state === "closed") {
      return Object.freeze({ status: "already_completed" });
    }
    const result = await waitFor(startClose(), signal, options.closeTimeoutMs);
    if (result.status === "completed") {
      return result.value;
    }
    if (result.status === "aborted") {
      return ABORTED;
    }
    return Object.freeze({ status: result.status === "timed_out" ? "timed_out" : "failed" });
  };

  const lifecycleHooks = Object.freeze({
    async closeDependencies(signal: AbortSignal): Promise<void> {
      const result = await close(signal);
      if (result.status !== "completed" && result.status !== "already_completed") {
        throw new AsterRedisLifecycleError();
      }
    },
  });

  return Object.freeze({
    connect,
    probe,
    read,
    write,
    acquireLease,
    delete: deleteKey,
    compareAndDelete,
    consumeTokenBucket,
    snapshot,
    close,
    lifecycleHooks: () => lifecycleHooks,
  });
}

export function createAsterRedisAdapter(input: AsterRedisOptions): AsterRedisAdapter {
  return createAsterRedisAdapterWithClientFactory(input, defaultClientFactory);
}
