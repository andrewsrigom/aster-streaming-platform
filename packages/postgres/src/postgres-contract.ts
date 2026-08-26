import type { AsterTelemetry } from "@aster/telemetry";

export const ASTER_POSTGRES_DEFAULTS = Object.freeze({
  maxConnections: 10,
  connectionTimeoutMs: 3_000,
  idleTimeoutMs: 10_000,
  statementTimeoutMs: 2_000,
  operationTimeoutMs: 2_000,
  closeTimeoutMs: 3_000,
} as const);

export type AsterPostgresConfigurationOption =
  | "<options>"
  | "connectionString"
  | "telemetry"
  | "maxConnections"
  | "connectionTimeoutMs"
  | "idleTimeoutMs"
  | "statementTimeoutMs"
  | "operationTimeoutMs"
  | "closeTimeoutMs";

export type AsterPostgresConfigurationIssue = Readonly<{
  option: AsterPostgresConfigurationOption;
  reason: "missing" | "invalid" | "unknown" | "internal";
}>;

export type AsterPostgresTelemetry = Pick<AsterTelemetry, "startDependencyOperation">;

export interface AsterPostgresOptions {
  readonly connectionString: string;
  readonly telemetry: AsterPostgresTelemetry;
  readonly maxConnections?: number;
  readonly connectionTimeoutMs?: number;
  readonly idleTimeoutMs?: number;
  readonly statementTimeoutMs?: number;
  readonly operationTimeoutMs?: number;
  readonly closeTimeoutMs?: number;
}

export type AsterPostgresOperationResult =
  | Readonly<{ status: "completed" }>
  | Readonly<{ status: "timed_out" }>
  | Readonly<{ status: "aborted" }>
  | Readonly<{ status: "unavailable" }>
  | Readonly<{
      status: "rejected";
      reason: "capacity_exceeded" | "adapter_closed" | "invalid_signal";
    }>
  | Readonly<{ status: "failed" }>;

export type AsterPostgresCloseResult = Readonly<{
  status: "completed" | "already_completed" | "timed_out" | "aborted" | "failed";
}>;

export type AsterPostgresPoolSnapshot = Readonly<{
  state: "open" | "closing" | "closed";
  totalConnections: number;
  idleConnections: number;
  vendorWaitingConnections: number;
  reservedSlots: number;
}>;

export interface AsterPostgresAdapter {
  connect(signal?: AbortSignal): Promise<AsterPostgresOperationResult>;
  probe(signal?: AbortSignal): Promise<AsterPostgresOperationResult>;
  snapshot(): AsterPostgresPoolSnapshot;
  close(signal?: AbortSignal): Promise<AsterPostgresCloseResult>;
  lifecycleHooks(): Readonly<{
    closeDependencies(signal: AbortSignal): Promise<void>;
  }>;
}

export class AsterPostgresConfigurationError extends Error {
  readonly issues: readonly AsterPostgresConfigurationIssue[];

  constructor(issues: readonly AsterPostgresConfigurationIssue[]) {
    super("Invalid Aster PostgreSQL configuration.");
    this.name = "AsterPostgresConfigurationError";
    this.issues = Object.freeze([...issues]);
  }
}

export class AsterPostgresLifecycleError extends Error {
  constructor() {
    super("Aster PostgreSQL dependency closure did not complete.");
    this.name = "AsterPostgresLifecycleError";
  }
}
