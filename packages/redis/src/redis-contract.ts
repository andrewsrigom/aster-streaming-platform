import type { AsterTelemetry } from "@aster/telemetry";

export const ASTER_REDIS_DEFAULTS = Object.freeze({
  maxInFlightCommands: 32,
  connectionTimeoutMs: 1_500,
  operationTimeoutMs: 1_000,
  closeTimeoutMs: 1_000,
  reconnectMaxAttempts: 3,
  reconnectBaseDelayMs: 50,
} as const);

export const ASTER_REDIS_COMMAND_LIMITS = Object.freeze({
  maximumKeyBytes: 256,
  maximumValueBytes: 16_384,
  maximumTtlMs: 300_000,
} as const);

export type AsterRedisConfigurationOption =
  | "<options>"
  | "url"
  | "telemetry"
  | "maxInFlightCommands"
  | "connectionTimeoutMs"
  | "operationTimeoutMs"
  | "closeTimeoutMs"
  | "reconnectMaxAttempts"
  | "reconnectBaseDelayMs";

export type AsterRedisConfigurationIssue = Readonly<{
  option: AsterRedisConfigurationOption;
  reason: "missing" | "invalid" | "unknown" | "internal";
}>;

export type AsterRedisTelemetry = Pick<AsterTelemetry, "startDependencyOperation">;

export interface AsterRedisOptions {
  readonly url: string;
  readonly telemetry: AsterRedisTelemetry;
  readonly maxInFlightCommands?: number;
  readonly connectionTimeoutMs?: number;
  readonly operationTimeoutMs?: number;
  readonly closeTimeoutMs?: number;
  readonly reconnectMaxAttempts?: number;
  readonly reconnectBaseDelayMs?: number;
}

export type AsterRedisOperationResult =
  | Readonly<{ status: "completed" }>
  | Readonly<{ status: "timed_out" }>
  | Readonly<{ status: "aborted" }>
  | Readonly<{ status: "unavailable" }>
  | Readonly<{
      status: "rejected";
      reason: "capacity_exceeded" | "adapter_closed" | "invalid_input" | "invalid_signal";
    }>
  | Readonly<{ status: "failed" }>;

export type AsterRedisCommandFailure = Exclude<AsterRedisOperationResult, { status: "completed" }>;

export type AsterRedisReadResult =
  | Readonly<{ status: "completed"; value: string | null }>
  | Readonly<{ status: "rejected"; reason: "value_too_large" }>
  | AsterRedisCommandFailure;

export type AsterRedisWriteResult =
  Readonly<{ status: "completed"; stored: boolean }> | AsterRedisCommandFailure;

export type AsterRedisDeleteResult =
  Readonly<{ status: "completed"; deleted: boolean }> | AsterRedisCommandFailure;

export type AsterRedisWriteMode = "replace" | "if_absent";

export type AsterRedisCloseResult = Readonly<{
  status: "completed" | "already_completed" | "timed_out" | "aborted" | "failed";
}>;

export type AsterRedisSnapshot = Readonly<{
  state: "idle" | "connecting" | "ready" | "reconnecting" | "degraded" | "closing" | "closed";
  open: boolean;
  ready: boolean;
  inFlightCommands: number;
  reconnectAttempts: number;
}>;

export interface AsterRedisAdapter {
  connect(signal?: AbortSignal): Promise<AsterRedisOperationResult>;
  probe(signal?: AbortSignal): Promise<AsterRedisOperationResult>;
  read(key: string, signal?: AbortSignal): Promise<AsterRedisReadResult>;
  write(
    key: string,
    value: string,
    ttlMs: number,
    mode: AsterRedisWriteMode,
    signal?: AbortSignal,
  ): Promise<AsterRedisWriteResult>;
  acquireLease(
    key: string,
    ownershipToken: string,
    ttlMs: number,
    signal?: AbortSignal,
  ): Promise<AsterRedisWriteResult>;
  delete(key: string, signal?: AbortSignal): Promise<AsterRedisDeleteResult>;
  compareAndDelete(
    key: string,
    expectedValue: string,
    signal?: AbortSignal,
  ): Promise<AsterRedisDeleteResult>;
  snapshot(): AsterRedisSnapshot;
  close(signal?: AbortSignal): Promise<AsterRedisCloseResult>;
  lifecycleHooks(): Readonly<{
    closeDependencies(signal: AbortSignal): Promise<void>;
  }>;
}

export class AsterRedisConfigurationError extends Error {
  readonly issues: readonly AsterRedisConfigurationIssue[];

  constructor(issues: readonly AsterRedisConfigurationIssue[]) {
    super("Invalid Aster Redis configuration.");
    this.name = "AsterRedisConfigurationError";
    this.issues = Object.freeze([...issues]);
  }
}

export class AsterRedisLifecycleError extends Error {
  constructor() {
    super("Aster Redis dependency closure did not complete.");
    this.name = "AsterRedisLifecycleError";
  }
}
