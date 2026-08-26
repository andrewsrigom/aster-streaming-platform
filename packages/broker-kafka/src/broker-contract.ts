import type { AsterTelemetry } from "@aster/telemetry";

export const ASTER_KAFKA_BROKER_DEFAULTS = Object.freeze({
  maxInFlightPublishes: 32,
  maxMessageBytes: 1024 * 1024,
  connectionTimeoutMs: 1_500,
  operationTimeoutMs: 2_000,
  closeTimeoutMs: 2_000,
  retryMaxAttempts: 2,
  retryBaseDelayMs: 50,
} as const);

export type AsterKafkaBrokerConfigurationOption =
  | "<options>"
  | "brokers"
  | "clientId"
  | "groupId"
  | "telemetry"
  | "maxInFlightPublishes"
  | "maxMessageBytes"
  | "connectionTimeoutMs"
  | "operationTimeoutMs"
  | "closeTimeoutMs"
  | "retryMaxAttempts"
  | "retryBaseDelayMs";

export type AsterKafkaBrokerConfigurationIssue = Readonly<{
  option: AsterKafkaBrokerConfigurationOption;
  reason: "missing" | "invalid" | "unknown" | "internal";
}>;

export type AsterKafkaBrokerTelemetry = Pick<AsterTelemetry, "startDependencyOperation">;

export interface AsterKafkaBrokerOptions {
  readonly brokers: readonly string[];
  readonly clientId: string;
  readonly groupId: string;
  readonly telemetry: AsterKafkaBrokerTelemetry;
  readonly maxInFlightPublishes?: number;
  readonly maxMessageBytes?: number;
  readonly connectionTimeoutMs?: number;
  readonly operationTimeoutMs?: number;
  readonly closeTimeoutMs?: number;
  readonly retryMaxAttempts?: number;
  readonly retryBaseDelayMs?: number;
}

export interface AsterKafkaTopicInput {
  readonly topic: string;
}

export interface AsterKafkaPublishInput extends AsterKafkaTopicInput {
  readonly key: Uint8Array;
  readonly value: Uint8Array;
}

export type AsterKafkaConsumedRecord = Readonly<{
  key: Uint8Array | null;
  value: Uint8Array;
  partition: number;
  offset: string;
  signal: AbortSignal;
}>;

export interface AsterKafkaConsumerInput extends AsterKafkaTopicInput {
  readonly handle: (record: AsterKafkaConsumedRecord) => Promise<void>;
}

export type AsterKafkaBrokerOperationResult =
  | Readonly<{ status: "completed" }>
  | Readonly<{ status: "timed_out" }>
  | Readonly<{ status: "aborted" }>
  | Readonly<{
      status: "delivery_ambiguous";
      reason: "timed_out" | "aborted";
    }>
  | Readonly<{ status: "unavailable" }>
  | Readonly<{
      status: "rejected";
      reason:
        | "invalid_request"
        | "capacity_exceeded"
        | "adapter_closed"
        | "not_connected"
        | "consumer_already_running"
        | "invalid_signal";
    }>
  | Readonly<{ status: "failed" }>;

export type AsterKafkaBrokerCloseResult = Readonly<{
  status: "completed" | "already_completed" | "timed_out" | "aborted" | "failed";
}>;

export type AsterKafkaBrokerSnapshot = Readonly<{
  state: "idle" | "connecting" | "ready" | "degraded" | "closing" | "closed";
  consumerState: "idle" | "starting" | "running" | "stopping" | "degraded";
  inFlightPublishes: number;
  inFlightHandlers: number;
}>;

export interface AsterKafkaBrokerAdapter {
  connect(signal?: AbortSignal): Promise<AsterKafkaBrokerOperationResult>;
  metadata(
    input: AsterKafkaTopicInput,
    signal?: AbortSignal,
  ): Promise<AsterKafkaBrokerOperationResult>;
  publish(
    input: AsterKafkaPublishInput,
    signal?: AbortSignal,
  ): Promise<AsterKafkaBrokerOperationResult>;
  startConsumer(
    input: AsterKafkaConsumerInput,
    signal?: AbortSignal,
  ): Promise<AsterKafkaBrokerOperationResult>;
  stopConsumer(signal?: AbortSignal): Promise<AsterKafkaBrokerOperationResult>;
  snapshot(): AsterKafkaBrokerSnapshot;
  close(signal?: AbortSignal): Promise<AsterKafkaBrokerCloseResult>;
  lifecycleHooks(): Readonly<{
    stopConsumers(signal: AbortSignal): Promise<void>;
    closeDependencies(signal: AbortSignal): Promise<void>;
  }>;
}

export class AsterKafkaBrokerConfigurationError extends Error {
  readonly issues: readonly AsterKafkaBrokerConfigurationIssue[];

  constructor(issues: readonly AsterKafkaBrokerConfigurationIssue[]) {
    super("Invalid Aster Kafka broker configuration.");
    this.name = "AsterKafkaBrokerConfigurationError";
    this.issues = Object.freeze([...issues]);
  }
}

export class AsterKafkaBrokerLifecycleError extends Error {
  constructor() {
    super("Aster Kafka broker lifecycle operation did not complete.");
    this.name = "AsterKafkaBrokerLifecycleError";
  }
}
