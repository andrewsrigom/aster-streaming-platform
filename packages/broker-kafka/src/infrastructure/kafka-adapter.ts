import { Buffer } from "node:buffer";

import {
  Kafka,
  logLevel,
  type Admin,
  type Consumer,
  type EachMessagePayload,
  type Producer,
} from "kafkajs";

import type {
  AsterDependencyObservation,
  AsterDependencyOperation,
  AsterObservationOutcome,
} from "@aster/telemetry";

import {
  ASTER_KAFKA_BROKER_DEFAULTS,
  type AsterKafkaBrokerAdapter,
  type AsterKafkaBrokerCloseResult,
  AsterKafkaBrokerConfigurationError,
  type AsterKafkaBrokerConfigurationIssue,
  AsterKafkaBrokerLifecycleError,
  type AsterKafkaBrokerOperationResult,
  type AsterKafkaBrokerOptions,
  type AsterKafkaBrokerSnapshot,
  type AsterKafkaBrokerTelemetry,
  type AsterKafkaConsumedRecord,
  type AsterKafkaConsumerInput,
  type AsterKafkaPublishInput,
  type AsterKafkaTopicInput,
} from "../broker-contract.js";

const MAXIMUM_OPTION_COUNT = 12;
const MAXIMUM_BROKERS = 8;
const MAXIMUM_TEXT_LENGTH = 2_048;
const MAXIMUM_CLIENT_ID_LENGTH = 128;
const MAXIMUM_TOPIC_LENGTH = 249;
const MAXIMUM_MESSAGE_BYTES = 8 * 1024 * 1024;
const MAXIMUM_KEY_BYTES = 1_024;
const MAXIMUM_IN_FLIGHT_PUBLISHES = 256;
const MAXIMUM_TIMEOUT_MS = 300_000;
const MAXIMUM_RETRY_ATTEMPTS = 5;
const MAXIMUM_RETRY_DELAY_MS = 5_000;
const MAXIMUM_OFFSET_LENGTH = 20;
const KNOWN_OPTIONS = new Set([
  "brokers",
  "clientId",
  "groupId",
  "telemetry",
  "maxInFlightPublishes",
  "maxMessageBytes",
  "connectionTimeoutMs",
  "operationTimeoutMs",
  "closeTimeoutMs",
  "retryMaxAttempts",
  "retryBaseDelayMs",
]);

const COMPLETED = Object.freeze({ status: "completed" } as const);
const TIMED_OUT = Object.freeze({ status: "timed_out" } as const);
const ABORTED = Object.freeze({ status: "aborted" } as const);
const UNAVAILABLE = Object.freeze({ status: "unavailable" } as const);
const FAILED = Object.freeze({ status: "failed" } as const);
const INVALID_REQUEST = Object.freeze({ status: "rejected", reason: "invalid_request" } as const);
const CAPACITY_REJECTED = Object.freeze({
  status: "rejected",
  reason: "capacity_exceeded",
} as const);
const CLOSED_REJECTED = Object.freeze({
  status: "rejected",
  reason: "adapter_closed",
} as const);
const NOT_CONNECTED_REJECTED = Object.freeze({
  status: "rejected",
  reason: "not_connected",
} as const);
const CONSUMER_RUNNING_REJECTED = Object.freeze({
  status: "rejected",
  reason: "consumer_already_running",
} as const);
const INVALID_SIGNAL_REJECTED = Object.freeze({
  status: "rejected",
  reason: "invalid_signal",
} as const);

type ValidatedOptions = Readonly<{
  brokers: readonly string[];
  clientId: string;
  groupId: string;
  telemetry: Readonly<{
    target: AsterKafkaBrokerTelemetry;
    start: AsterKafkaBrokerTelemetry["startDependencyOperation"];
  }>;
  maxInFlightPublishes: number;
  maxMessageBytes: number;
  connectionTimeoutMs: number;
  operationTimeoutMs: number;
  closeTimeoutMs: number;
  retryMaxAttempts: number;
  retryBaseDelayMs: number;
}>;

export type AsterKafkaClientConfiguration = Readonly<{
  brokers: readonly string[];
  clientId: string;
  groupId: string;
  connectionTimeoutMs: number;
  requestTimeoutMs: number;
  retryMaxAttempts: number;
  retryBaseDelayMs: number;
  maxMessageBytes: number;
  maxInFlightRequests: 1;
  allowAutoTopicCreation: false;
  idempotent: true;
  logLevel: "nothing";
}>;

export type AsterKafkaRawRecord = Readonly<{
  key: Uint8Array | null;
  value: Uint8Array | null;
  partition: number;
  offset: string;
}>;

export interface AsterKafkaProducerClient {
  connect(): Promise<void>;
  metadata(topic: string): Promise<void>;
  publish(input: Readonly<{ topic: string; key: Uint8Array; value: Uint8Array }>): Promise<void>;
  disconnect(): Promise<void>;
}

export interface AsterKafkaConsumerClient {
  start(
    topic: string,
    onMessage: (record: AsterKafkaRawRecord) => Promise<void>,
    onCrash: () => void,
  ): Promise<void>;
  disconnect(): Promise<void>;
}

export interface AsterKafkaClientBundle {
  readonly producer: AsterKafkaProducerClient;
  createConsumer(): AsterKafkaConsumerClient;
}

type ClientFactory = (configuration: AsterKafkaClientConfiguration) => AsterKafkaClientBundle;

type WaitResult<T> =
  | Readonly<{ status: "completed"; value: T }>
  | Readonly<{ status: "timed_out" }>
  | Readonly<{ status: "aborted" }>
  | Readonly<{ status: "failed"; error: unknown }>;

type ConsumerSession = {
  readonly client: AsterKafkaConsumerClient;
  readonly aborter: AbortController;
  readonly handlerSettlements: Set<Promise<void>>;
  stopWork: Promise<boolean> | undefined;
};

class AsterKafkaProtocolError extends Error {
  constructor() {
    super("Kafka client violated the repository transport contract.");
    this.name = "AsterKafkaProtocolError";
  }
}

function issue(
  option: AsterKafkaBrokerConfigurationIssue["option"],
  reason: AsterKafkaBrokerConfigurationIssue["reason"],
): AsterKafkaBrokerConfigurationIssue {
  return Object.freeze({ option, reason });
}

function ownDataValue(source: object, key: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (!descriptor || "get" in descriptor) {
      return undefined;
    }
    return descriptor.value as unknown;
  } catch {
    return undefined;
  }
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

function boundedText(value: unknown, minimum: number, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= minimum &&
    value.length <= maximum &&
    !containsControlCharacter(value)
  );
}

function validIdentifier(value: unknown): value is string {
  return (
    boundedText(value, 1, MAXIMUM_CLIENT_ID_LENGTH) &&
    /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/u.test(value)
  );
}

function validTopic(value: unknown): value is string {
  return (
    boundedText(value, 1, MAXIMUM_TOPIC_LENGTH) &&
    value !== "." &&
    value !== ".." &&
    /^[A-Za-z0-9._-]+$/u.test(value)
  );
}

function validBroker(value: unknown): value is string {
  if (!boundedText(value, 3, MAXIMUM_TEXT_LENGTH) || value.includes("/")) {
    return false;
  }
  try {
    const broker = new URL(`tcp://${value}`);
    return (
      broker.hostname.length > 0 &&
      broker.port.length > 0 &&
      Number(broker.port) >= 1 &&
      Number(broker.port) <= 65_535 &&
      broker.username.length === 0 &&
      broker.password.length === 0 &&
      broker.search.length === 0 &&
      broker.hash.length === 0 &&
      (broker.pathname === "/" || broker.pathname.length === 0)
    );
  } catch {
    return false;
  }
}

function copyBrokers(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAXIMUM_BROKERS) {
    return undefined;
  }
  const result: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || "get" in descriptor || !validBroker(descriptor.value)) {
      return undefined;
    }
    result.push(descriptor.value);
  }
  return new Set(result).size === result.length ? Object.freeze(result) : undefined;
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number | undefined {
  const selected = value === undefined ? fallback : value;
  return typeof selected === "number" &&
    Number.isSafeInteger(selected) &&
    selected >= minimum &&
    selected <= maximum
    ? selected
    : undefined;
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
          target: value as AsterKafkaBrokerTelemetry,
          start: method.value as AsterKafkaBrokerTelemetry["startDependencyOperation"],
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
  const issues: AsterKafkaBrokerConfigurationIssue[] = [];
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      throw new AsterKafkaBrokerConfigurationError([issue("<options>", "invalid")]);
    }
    const prototype: unknown = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new AsterKafkaBrokerConfigurationError([issue("<options>", "invalid")]);
    }
    const keys = Reflect.ownKeys(input);
    if (keys.length > MAXIMUM_OPTION_COUNT) {
      throw new AsterKafkaBrokerConfigurationError([issue("<options>", "invalid")]);
    }
    for (const key of keys) {
      if (typeof key !== "string" || !KNOWN_OPTIONS.has(key)) {
        issues.push(issue("<options>", "unknown"));
        break;
      }
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || "get" in descriptor) {
        issues.push(
          issue(
            key as Exclude<AsterKafkaBrokerConfigurationIssue["option"], "<options>">,
            "invalid",
          ),
        );
      }
    }

    const brokers = copyBrokers(ownDataValue(input, "brokers"));
    const clientId = ownDataValue(input, "clientId");
    const groupId = ownDataValue(input, "groupId");
    const telemetry = telemetryBinding(ownDataValue(input, "telemetry"));
    if (!brokers) {
      issues.push(issue("brokers", "invalid"));
    }
    if (!validIdentifier(clientId)) {
      issues.push(issue("clientId", "invalid"));
    }
    if (!validIdentifier(groupId)) {
      issues.push(issue("groupId", "invalid"));
    }
    if (!telemetry) {
      issues.push(issue("telemetry", "invalid"));
    }

    const maxInFlightPublishes = boundedInteger(
      ownDataValue(input, "maxInFlightPublishes"),
      ASTER_KAFKA_BROKER_DEFAULTS.maxInFlightPublishes,
      1,
      MAXIMUM_IN_FLIGHT_PUBLISHES,
    );
    const maxMessageBytes = boundedInteger(
      ownDataValue(input, "maxMessageBytes"),
      ASTER_KAFKA_BROKER_DEFAULTS.maxMessageBytes,
      1,
      MAXIMUM_MESSAGE_BYTES,
    );
    const connectionTimeoutMs = boundedInteger(
      ownDataValue(input, "connectionTimeoutMs"),
      ASTER_KAFKA_BROKER_DEFAULTS.connectionTimeoutMs,
      1,
      MAXIMUM_TIMEOUT_MS,
    );
    const operationTimeoutMs = boundedInteger(
      ownDataValue(input, "operationTimeoutMs"),
      ASTER_KAFKA_BROKER_DEFAULTS.operationTimeoutMs,
      1,
      MAXIMUM_TIMEOUT_MS,
    );
    const closeTimeoutMs = boundedInteger(
      ownDataValue(input, "closeTimeoutMs"),
      ASTER_KAFKA_BROKER_DEFAULTS.closeTimeoutMs,
      1,
      MAXIMUM_TIMEOUT_MS,
    );
    const retryMaxAttempts = boundedInteger(
      ownDataValue(input, "retryMaxAttempts"),
      ASTER_KAFKA_BROKER_DEFAULTS.retryMaxAttempts,
      2,
      MAXIMUM_RETRY_ATTEMPTS,
    );
    const retryBaseDelayMs = boundedInteger(
      ownDataValue(input, "retryBaseDelayMs"),
      ASTER_KAFKA_BROKER_DEFAULTS.retryBaseDelayMs,
      1,
      MAXIMUM_RETRY_DELAY_MS,
    );
    for (const [name, value] of [
      ["maxInFlightPublishes", maxInFlightPublishes],
      ["maxMessageBytes", maxMessageBytes],
      ["connectionTimeoutMs", connectionTimeoutMs],
      ["operationTimeoutMs", operationTimeoutMs],
      ["closeTimeoutMs", closeTimeoutMs],
      ["retryMaxAttempts", retryMaxAttempts],
      ["retryBaseDelayMs", retryBaseDelayMs],
    ] as const) {
      if (value === undefined) {
        issues.push(issue(name, "invalid"));
      }
    }
    if (issues.length > 0) {
      throw new AsterKafkaBrokerConfigurationError(issues.slice(0, MAXIMUM_OPTION_COUNT));
    }
    return Object.freeze({
      brokers: brokers as readonly string[],
      clientId: clientId as string,
      groupId: groupId as string,
      telemetry: telemetry as ValidatedOptions["telemetry"],
      maxInFlightPublishes: maxInFlightPublishes as number,
      maxMessageBytes: maxMessageBytes as number,
      connectionTimeoutMs: connectionTimeoutMs as number,
      operationTimeoutMs: operationTimeoutMs as number,
      closeTimeoutMs: closeTimeoutMs as number,
      retryMaxAttempts: retryMaxAttempts as number,
      retryBaseDelayMs: retryBaseDelayMs as number,
    });
  } catch (error) {
    if (error instanceof AsterKafkaBrokerConfigurationError) {
      throw error;
    }
    throw new AsterKafkaBrokerConfigurationError([issue("<options>", "internal")]);
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

function validSignal(signal: AbortSignal | undefined): boolean {
  return signal === undefined || signal instanceof AbortSignal;
}

function signalIsAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

function observationFor(
  telemetry: ValidatedOptions["telemetry"],
  operation: AsterDependencyOperation,
): AsterDependencyObservation | undefined {
  try {
    const result = telemetry.start.call(telemetry.target, { dependency: "broker", operation });
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
    // Telemetry degradation cannot change broker behavior.
  }
}

function outcomeFor(result: AsterKafkaBrokerOperationResult): AsterObservationOutcome {
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

function validPlainInput(
  input: unknown,
  keys: readonly string[],
): input is Record<string, unknown> {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return false;
    }
    const prototype: unknown = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) {
      return false;
    }
    const ownKeys = Reflect.ownKeys(input);
    if (ownKeys.length > keys.length) {
      return false;
    }
    for (const key of ownKeys) {
      if (typeof key !== "string" || !keys.includes(key)) {
        return false;
      }
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || "get" in descriptor) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function topicFrom(input: unknown): string | undefined {
  if (!validPlainInput(input, ["topic"])) {
    return undefined;
  }
  const topic = ownDataValue(input, "topic");
  return validTopic(topic) ? topic : undefined;
}

function byteViewFrom(value: unknown, minimum: number, maximum: number): Uint8Array | undefined {
  try {
    if (
      !(value instanceof Uint8Array) ||
      value.byteLength < minimum ||
      value.byteLength > maximum
    ) {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}

function publishInputFrom(
  input: unknown,
  maximumBytes: number,
): Readonly<{ topic: string; key: Uint8Array; value: Uint8Array }> | undefined {
  if (!validPlainInput(input, ["topic", "key", "value"])) {
    return undefined;
  }
  const topic = ownDataValue(input, "topic");
  const key = byteViewFrom(ownDataValue(input, "key"), 1, MAXIMUM_KEY_BYTES);
  const value = byteViewFrom(ownDataValue(input, "value"), 1, maximumBytes);
  if (!validTopic(topic) || !key || !value || key.byteLength + value.byteLength > maximumBytes) {
    return undefined;
  }
  return Object.freeze({ topic, key, value });
}

function consumerInputFrom(
  input: unknown,
): Readonly<{ topic: string; handle: AsterKafkaConsumerInput["handle"] }> | undefined {
  if (!validPlainInput(input, ["topic", "handle"])) {
    return undefined;
  }
  const topic = ownDataValue(input, "topic");
  const handle = ownDataValue(input, "handle");
  return validTopic(topic) && typeof handle === "function"
    ? Object.freeze({ topic, handle: handle as AsterKafkaConsumerInput["handle"] })
    : undefined;
}

function recordFrom(
  input: AsterKafkaRawRecord,
  maximumBytes: number,
  signal: AbortSignal,
): AsterKafkaConsumedRecord | undefined {
  try {
    if (!validPlainInput(input, ["key", "value", "partition", "offset"])) {
      return undefined;
    }
    const rawKey = ownDataValue(input, "key");
    const rawValue = ownDataValue(input, "value");
    const partition = ownDataValue(input, "partition");
    const offset = ownDataValue(input, "offset");
    const keyView = rawKey === null ? null : byteViewFrom(rawKey, 0, MAXIMUM_KEY_BYTES);
    const valueView = rawValue === null ? undefined : byteViewFrom(rawValue, 1, maximumBytes);
    if (
      (rawKey !== null && !keyView) ||
      !valueView ||
      (keyView?.byteLength ?? 0) + valueView.byteLength > maximumBytes ||
      typeof partition !== "number" ||
      !Number.isSafeInteger(partition) ||
      partition < 0 ||
      !boundedText(offset, 1, MAXIMUM_OFFSET_LENGTH) ||
      !/^\d+$/u.test(offset)
    ) {
      return undefined;
    }
    const key = keyView === null ? null : Uint8Array.from(keyView as Uint8Array);
    const value = Uint8Array.from(valueView);
    return Object.freeze({
      key: key ?? null,
      value,
      partition,
      offset,
      signal,
    });
  } catch {
    return undefined;
  }
}

function nextOffset(value: string): string {
  try {
    return (BigInt(value) + 1n).toString();
  } catch {
    throw new AsterKafkaProtocolError();
  }
}

function noOpLogCreator(): () => void {
  return () => {};
}

function defaultClientFactory(
  configuration: AsterKafkaClientConfiguration,
): AsterKafkaClientBundle {
  const retry = Object.freeze({
    initialRetryTime: configuration.retryBaseDelayMs,
    maxRetryTime: configuration.retryBaseDelayMs * 2,
    retries: configuration.retryMaxAttempts - 1,
  });
  const kafka = new Kafka({
    brokers: [...configuration.brokers],
    clientId: configuration.clientId,
    connectionTimeout: configuration.connectionTimeoutMs,
    authenticationTimeout: configuration.connectionTimeoutMs,
    requestTimeout: configuration.requestTimeoutMs,
    enforceRequestTimeout: true,
    retry,
    logLevel: logLevel.NOTHING,
    logCreator: noOpLogCreator,
  });
  const producer: Producer = kafka.producer({
    allowAutoTopicCreation: configuration.allowAutoTopicCreation,
    idempotent: configuration.idempotent,
    maxInFlightRequests: configuration.maxInFlightRequests,
    retry,
  });
  const admin: Admin = kafka.admin({ retry });

  const producerClient: AsterKafkaProducerClient = {
    async connect(): Promise<void> {
      const settlements = await Promise.allSettled([producer.connect(), admin.connect()]);
      if (settlements.some((settlement) => settlement.status === "rejected")) {
        throw new AsterKafkaProtocolError();
      }
    },
    async metadata(topic): Promise<void> {
      const result = await admin.fetchTopicMetadata({ topics: [topic] });
      if (result.topics.length !== 1 || result.topics[0]?.name !== topic) {
        throw new AsterKafkaProtocolError();
      }
    },
    async publish(input): Promise<void> {
      await producer.send({
        topic: input.topic,
        acks: -1,
        timeout: configuration.requestTimeoutMs,
        messages: [{ key: Buffer.from(input.key), value: Buffer.from(input.value) }],
      });
    },
    async disconnect(): Promise<void> {
      const settlements = await Promise.allSettled([admin.disconnect(), producer.disconnect()]);
      if (settlements.some((settlement) => settlement.status === "rejected")) {
        throw new AsterKafkaProtocolError();
      }
    },
  };

  return Object.freeze({
    producer: producerClient,
    createConsumer(): AsterKafkaConsumerClient {
      const consumer: Consumer = kafka.consumer({
        groupId: configuration.groupId,
        allowAutoTopicCreation: configuration.allowAutoTopicCreation,
        maxBytesPerPartition: configuration.maxMessageBytes,
        minBytes: 1,
        maxBytes: configuration.maxMessageBytes,
        maxWaitTimeInMs: Math.min(100, configuration.requestTimeoutMs),
        maxInFlightRequests: configuration.maxInFlightRequests,
        retry: {
          ...retry,
          restartOnFailure: () => Promise.resolve(false),
        },
      });
      let removeCrashListener: (() => void) | undefined;
      return {
        async start(topic, onMessage, onCrash): Promise<void> {
          removeCrashListener = consumer.on(consumer.events.CRASH, () => {
            onCrash();
          });
          await consumer.connect();
          await consumer.subscribe({ topics: [topic], fromBeginning: false });
          await consumer.run({
            autoCommit: false,
            partitionsConsumedConcurrently: 1,
            async eachMessage(payload: EachMessagePayload): Promise<void> {
              await onMessage({
                key: payload.message.key,
                value: payload.message.value,
                partition: payload.partition,
                offset: payload.message.offset,
              });
              await consumer.commitOffsets([
                {
                  topic: payload.topic,
                  partition: payload.partition,
                  offset: nextOffset(payload.message.offset),
                },
              ]);
            },
          });
        },
        async disconnect(): Promise<void> {
          removeCrashListener?.();
          removeCrashListener = undefined;
          await consumer.disconnect();
        },
      };
    },
  });
}

export function createAsterKafkaBrokerAdapterWithClientFactory(
  input: AsterKafkaBrokerOptions,
  clientFactory: ClientFactory,
): AsterKafkaBrokerAdapter {
  const options = validateOptions(input);
  const configuration: AsterKafkaClientConfiguration = Object.freeze({
    brokers: options.brokers,
    clientId: options.clientId,
    groupId: options.groupId,
    connectionTimeoutMs: options.connectionTimeoutMs,
    requestTimeoutMs: options.operationTimeoutMs,
    retryMaxAttempts: options.retryMaxAttempts,
    retryBaseDelayMs: options.retryBaseDelayMs,
    maxMessageBytes: options.maxMessageBytes,
    maxInFlightRequests: 1,
    allowAutoTopicCreation: false,
    idempotent: true,
    logLevel: "nothing",
  });
  let state: AsterKafkaBrokerSnapshot["state"] = "idle";
  let consumerState: AsterKafkaBrokerSnapshot["consumerState"] = "idle";
  let bundle: AsterKafkaClientBundle | undefined;
  let connectWork: Promise<AsterKafkaBrokerOperationResult> | undefined;
  let consumerSession: ConsumerSession | undefined;
  let inFlightPublishes = 0;
  let inFlightHandlers = 0;
  let closeWork: Promise<AsterKafkaBrokerCloseResult> | undefined;
  let retirementFailed = false;
  const activeOperations = new Set<Promise<void>>();
  const backgroundWork = new Set<Promise<unknown>>();
  const retirementTimeoutMs = Math.max(1, Math.floor(options.closeTimeoutMs / 2));

  const isShuttingDown = (): boolean => state === "closing" || state === "closed";

  const trackBackground = (work: Promise<unknown>): void => {
    backgroundWork.add(work);
    const finish = (): void => {
      backgroundWork.delete(work);
    };
    void work.then(finish, finish);
  };

  const ensureBundle = (): AsterKafkaClientBundle | undefined => {
    if (bundle) {
      return bundle;
    }
    try {
      bundle = clientFactory(configuration);
      return bundle;
    } catch {
      state = "degraded";
      return undefined;
    }
  };

  const retireProducer = (expected: AsterKafkaClientBundle): void => {
    if (bundle !== expected) {
      return;
    }
    bundle = undefined;
    connectWork = undefined;
    if (state !== "closing" && state !== "closed") {
      state = "degraded";
    }
    const raw = Promise.resolve().then(() => expected.producer.disconnect());
    const retirement = waitFor(raw, undefined, retirementTimeoutMs).then((result) => {
      if (result.status !== "completed") {
        retirementFailed = true;
        throw new AsterKafkaProtocolError();
      }
    });
    trackBackground(retirement);
  };

  const connectOwner = (): Promise<AsterKafkaBrokerOperationResult> => {
    if (connectWork) {
      return connectWork;
    }
    const owned = ensureBundle();
    if (!owned) {
      return Promise.resolve(UNAVAILABLE);
    }
    state = "connecting";
    const raw = Promise.resolve().then(() => owned.producer.connect());
    const work = waitFor(raw, undefined, options.connectionTimeoutMs).then((result) => {
      if (result.status === "completed") {
        if (isShuttingDown() || bundle !== owned) {
          return CLOSED_REJECTED;
        }
        state = "ready";
        return COMPLETED;
      }
      if (isShuttingDown()) {
        return CLOSED_REJECTED;
      }
      retireProducer(owned);
      return result.status === "timed_out" ? TIMED_OUT : UNAVAILABLE;
    });
    connectWork = work;
    trackBackground(work);
    return work;
  };

  const connect = async (signal?: AbortSignal): Promise<AsterKafkaBrokerOperationResult> => {
    const observation = observationFor(options.telemetry, "connect");
    let finalResult: AsterKafkaBrokerOperationResult = FAILED;
    let completeOperation: (() => void) | undefined;
    const settlement = new Promise<void>((resolve) => {
      completeOperation = resolve;
    });
    activeOperations.add(settlement);
    try {
      if (!validSignal(signal)) {
        finalResult = INVALID_SIGNAL_REJECTED;
      } else if (signal?.aborted) {
        finalResult = ABORTED;
      } else if (state === "closing" || state === "closed") {
        finalResult = CLOSED_REJECTED;
      } else if (state === "ready") {
        finalResult = COMPLETED;
      } else {
        const result = await waitFor(connectOwner(), signal, options.connectionTimeoutMs);
        finalResult =
          result.status === "completed"
            ? result.value
            : result.status === "aborted"
              ? ABORTED
              : result.status === "timed_out"
                ? TIMED_OUT
                : FAILED;
      }
      return finalResult;
    } catch {
      finalResult = FAILED;
      return finalResult;
    } finally {
      completeObservation(observation, outcomeFor(finalResult));
      completeOperation?.();
      activeOperations.delete(settlement);
    }
  };

  const runProducer = async (
    operation: AsterDependencyOperation,
    signal: AbortSignal | undefined,
    work: (producer: AsterKafkaProducerClient) => Promise<void>,
    capacityOwned: boolean,
    onAccepted?: () => void,
  ): Promise<AsterKafkaBrokerOperationResult> => {
    const observation = observationFor(options.telemetry, operation);
    let finalResult: AsterKafkaBrokerOperationResult = FAILED;
    let owned: AsterKafkaClientBundle | undefined;
    let capacityClaimed = false;
    let completeOperation: (() => void) | undefined;
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
      if (state !== "ready" || !bundle) {
        finalResult = NOT_CONNECTED_REJECTED;
        return finalResult;
      }
      if (capacityOwned && inFlightPublishes >= options.maxInFlightPublishes) {
        finalResult = CAPACITY_REJECTED;
        return finalResult;
      }
      owned = bundle;
      onAccepted?.();
      if (capacityOwned) {
        inFlightPublishes += 1;
        capacityClaimed = true;
      }
      const raw = Promise.resolve().then(() => work(owned?.producer as AsterKafkaProducerClient));
      const result = await waitFor(raw, signal, options.operationTimeoutMs);
      if (result.status === "completed") {
        if (bundle === owned && !isShuttingDown()) {
          state = "ready";
        }
        finalResult = COMPLETED;
      } else if (result.status === "aborted" || result.status === "timed_out") {
        retireProducer(owned);
        finalResult = result.status === "aborted" ? ABORTED : TIMED_OUT;
      } else {
        retireProducer(owned);
        finalResult = UNAVAILABLE;
      }
      return finalResult;
    } catch {
      if (owned) {
        retireProducer(owned);
      }
      finalResult = FAILED;
      return finalResult;
    } finally {
      if (capacityClaimed) {
        inFlightPublishes -= 1;
      }
      completeObservation(observation, outcomeFor(finalResult));
      completeOperation?.();
      activeOperations.delete(settlement);
    }
  };

  const metadata = (
    input: AsterKafkaTopicInput,
    signal?: AbortSignal,
  ): Promise<AsterKafkaBrokerOperationResult> => {
    const topic = topicFrom(input);
    return topic
      ? runProducer("probe", signal, (producer) => producer.metadata(topic), false)
      : Promise.resolve(INVALID_REQUEST);
  };

  const publish = (
    input: AsterKafkaPublishInput,
    signal?: AbortSignal,
  ): Promise<AsterKafkaBrokerOperationResult> => {
    const validated = publishInputFrom(input, options.maxMessageBytes);
    if (!validated) {
      return Promise.resolve(INVALID_REQUEST);
    }
    let accepted: Readonly<{ topic: string; key: Uint8Array; value: Uint8Array }> | undefined;
    return runProducer(
      "publish",
      signal,
      (producer) => {
        if (!accepted) {
          throw new AsterKafkaProtocolError();
        }
        return producer.publish(accepted);
      },
      true,
      () => {
        accepted = Object.freeze({
          topic: validated.topic,
          key: Uint8Array.from(validated.key),
          value: Uint8Array.from(validated.value),
        });
      },
    );
  };

  const retireConsumer = (expected: ConsumerSession): void => {
    if (consumerSession !== expected || expected.stopWork) {
      return;
    }
    consumerSession = undefined;
    consumerState = "degraded";
    expected.aborter.abort();
    const raw = Promise.resolve().then(() => expected.client.disconnect());
    expected.stopWork = Promise.allSettled([raw, ...expected.handlerSettlements]).then(
      (settlements) => settlements.every((settlement) => settlement.status === "fulfilled"),
    );
    const retirement = waitFor(expected.stopWork, undefined, retirementTimeoutMs).then((result) => {
      if (result.status !== "completed" || !result.value) {
        retirementFailed = true;
        throw new AsterKafkaProtocolError();
      }
    });
    trackBackground(retirement);
  };

  const markConsumerFailure = (expected: ConsumerSession): void => {
    if (consumerSession !== expected) {
      return;
    }
    expected.aborter.abort();
    consumerState = "degraded";
    queueMicrotask(() => {
      retireConsumer(expected);
    });
  };

  const startConsumer = async (
    input: AsterKafkaConsumerInput,
    signal?: AbortSignal,
  ): Promise<AsterKafkaBrokerOperationResult> => {
    const validated = consumerInputFrom(input);
    if (!validated) {
      return INVALID_REQUEST;
    }
    const observation = observationFor(options.telemetry, "consume");
    let finalResult: AsterKafkaBrokerOperationResult = FAILED;
    let session: ConsumerSession | undefined;
    let completeOperation: (() => void) | undefined;
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
      if (state !== "ready" || !bundle) {
        finalResult = NOT_CONNECTED_REJECTED;
        return finalResult;
      }
      if (consumerSession) {
        finalResult = CONSUMER_RUNNING_REJECTED;
        return finalResult;
      }
      const client = bundle.createConsumer();
      session = {
        client,
        aborter: new AbortController(),
        handlerSettlements: new Set(),
        stopWork: undefined,
      };
      consumerSession = session;
      consumerState = "starting";
      const ownedSession = session;
      const raw = client.start(
        validated.topic,
        async (rawRecord) => {
          if (consumerSession !== ownedSession || ownedSession.aborter.signal.aborted) {
            throw new AsterKafkaProtocolError();
          }
          const record = recordFrom(
            rawRecord,
            options.maxMessageBytes,
            ownedSession.aborter.signal,
          );
          if (!record) {
            markConsumerFailure(ownedSession);
            throw new AsterKafkaProtocolError();
          }
          let settle: (() => void) | undefined;
          const settlement = new Promise<void>((resolve) => {
            settle = resolve;
          });
          ownedSession.handlerSettlements.add(settlement);
          inFlightHandlers += 1;
          try {
            await validated.handle(record);
            if (signalIsAborted(ownedSession.aborter.signal)) {
              throw new AsterKafkaProtocolError();
            }
          } catch {
            markConsumerFailure(ownedSession);
            throw new AsterKafkaProtocolError();
          } finally {
            inFlightHandlers -= 1;
            settle?.();
            ownedSession.handlerSettlements.delete(settlement);
          }
        },
        () => {
          markConsumerFailure(ownedSession);
        },
      );
      const result = await waitFor(raw, signal, options.operationTimeoutMs);
      if (result.status === "completed") {
        if (isShuttingDown()) {
          finalResult = CLOSED_REJECTED;
        } else if (consumerSession !== ownedSession || ownedSession.aborter.signal.aborted) {
          finalResult = UNAVAILABLE;
        } else {
          consumerState = "running";
          finalResult = COMPLETED;
        }
      } else if (result.status === "aborted" || result.status === "timed_out") {
        retireConsumer(ownedSession);
        finalResult = result.status === "aborted" ? ABORTED : TIMED_OUT;
      } else {
        retireConsumer(ownedSession);
        finalResult = UNAVAILABLE;
      }
      return finalResult;
    } catch {
      if (session) {
        retireConsumer(session);
      }
      finalResult = FAILED;
      return finalResult;
    } finally {
      completeObservation(observation, outcomeFor(finalResult));
      completeOperation?.();
      activeOperations.delete(settlement);
    }
  };

  const stopConsumerWork = (session: ConsumerSession): Promise<boolean> => {
    if (session.stopWork) {
      return session.stopWork;
    }
    session.aborter.abort();
    consumerState = "stopping";
    const raw = Promise.resolve().then(() => session.client.disconnect());
    session.stopWork = Promise.allSettled([raw, ...session.handlerSettlements]).then(
      (settlements) => settlements.every((settlement) => settlement.status === "fulfilled"),
    );
    void session.stopWork.then((completed) => {
      if (consumerSession === session) {
        consumerSession = undefined;
        consumerState = completed ? "idle" : "degraded";
      }
    });
    return session.stopWork;
  };

  const stopConsumer = async (signal?: AbortSignal): Promise<AsterKafkaBrokerOperationResult> => {
    const observation = observationFor(options.telemetry, "consume");
    let finalResult: AsterKafkaBrokerOperationResult = FAILED;
    try {
      if (!validSignal(signal)) {
        finalResult = INVALID_SIGNAL_REJECTED;
      } else if (signal?.aborted) {
        finalResult = ABORTED;
      } else if (!consumerSession) {
        finalResult = COMPLETED;
      } else {
        const result = await waitFor(
          stopConsumerWork(consumerSession),
          signal,
          options.closeTimeoutMs,
        );
        finalResult =
          result.status === "completed"
            ? result.value
              ? COMPLETED
              : FAILED
            : result.status === "aborted"
              ? ABORTED
              : result.status === "timed_out"
                ? TIMED_OUT
                : FAILED;
      }
      return finalResult;
    } catch {
      finalResult = FAILED;
      return finalResult;
    } finally {
      completeObservation(observation, outcomeFor(finalResult));
    }
  };

  const snapshot = (): AsterKafkaBrokerSnapshot =>
    Object.freeze({ state, consumerState, inFlightPublishes, inFlightHandlers });

  const startClose = (): Promise<AsterKafkaBrokerCloseResult> => {
    if (closeWork) {
      return closeWork;
    }
    state = "closing";
    const currentConsumer = consumerSession;
    const currentBundle = bundle;
    bundle = undefined;
    connectWork = undefined;
    const rawClose = (async (): Promise<boolean> => {
      const work: Promise<unknown>[] = [];
      if (currentConsumer) {
        work.push(stopConsumerWork(currentConsumer));
      }
      if (currentBundle) {
        work.push(currentBundle.producer.disconnect());
      }
      const direct = await Promise.allSettled([...work, ...activeOperations]);
      const retirements = await Promise.allSettled([...backgroundWork]);
      const completed =
        direct.every(
          (settlement) => settlement.status === "fulfilled" && settlement.value !== false,
        ) &&
        retirements.every((settlement) => settlement.status === "fulfilled") &&
        !retirementFailed;
      state = completed ? "closed" : "degraded";
      return completed;
    })();
    closeWork = waitFor(rawClose, undefined, options.closeTimeoutMs).then((result) => {
      if (result.status === "completed") {
        return result.value ? COMPLETED : FAILED;
      }
      return result.status === "timed_out" ? TIMED_OUT : FAILED;
    });
    return closeWork;
  };

  const close = async (signal?: AbortSignal): Promise<AsterKafkaBrokerCloseResult> => {
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
    return result.status === "timed_out" ? TIMED_OUT : FAILED;
  };

  const lifecycleHooks = Object.freeze({
    async stopConsumers(signal: AbortSignal): Promise<void> {
      const result = await stopConsumer(signal);
      if (result.status !== "completed") {
        throw new AsterKafkaBrokerLifecycleError();
      }
    },
    async closeDependencies(signal: AbortSignal): Promise<void> {
      const result = await close(signal);
      if (result.status !== "completed" && result.status !== "already_completed") {
        throw new AsterKafkaBrokerLifecycleError();
      }
    },
  });

  return Object.freeze({
    connect,
    metadata,
    publish,
    startConsumer,
    stopConsumer,
    snapshot,
    close,
    lifecycleHooks: () => lifecycleHooks,
  });
}

export function createAsterKafkaBrokerAdapter(
  input: AsterKafkaBrokerOptions,
): AsterKafkaBrokerAdapter {
  return createAsterKafkaBrokerAdapterWithClientFactory(input, defaultClientFactory);
}
