import { createClient } from "@redis/client";

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
const COMPARE_AND_DELETE_SCRIPT =
  "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
const WRITE_MODES = new Set<unknown>(["replace", "if_absent"]);

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

export interface AsterRedisClient {
  readonly isOpen: boolean;
  readonly isReady: boolean;
  connect(): Promise<void>;
  ping(signal: AbortSignal): Promise<string>;
  get(key: string, signal: AbortSignal): Promise<string | null>;
  set(
    key: string,
    value: string,
    ttlMs: number,
    onlyIfAbsent: boolean,
    signal: AbortSignal,
  ): Promise<string | null>;
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
    get(key, signal): Promise<string | null> {
      return client.withCommandOptions({ abortSignal: signal }).get(key);
    },
    set(key, value, ttlMs, onlyIfAbsent, signal): Promise<string | null> {
      return client.withCommandOptions({ abortSignal: signal }).set(key, value, {
        expiration: { type: "PX", value: ttlMs },
        ...(onlyIfAbsent ? { condition: "NX" as const } : {}),
      });
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

  const read = async (key: string, signal?: AbortSignal): Promise<AsterRedisReadResult> => {
    if (!validKey(key)) {
      return INVALID_INPUT_REJECTED;
    }
    return runCommand(
      "read",
      signal,
      (client, operationSignal) => client.get(key, operationSignal),
      (value): value is string | null => typeof value === "string" || value === null,
    );
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
    delete: deleteKey,
    compareAndDelete,
    snapshot,
    close,
    lifecycleHooks: () => lifecycleHooks,
  });
}

export function createAsterRedisAdapter(input: AsterRedisOptions): AsterRedisAdapter {
  return createAsterRedisAdapterWithClientFactory(input, defaultClientFactory);
}
