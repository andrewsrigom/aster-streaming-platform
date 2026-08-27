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

export type AsterPostgresValue = string | number | boolean | null;

export interface AsterPostgresQuery {
  /** Source-owned, single SELECT/INSERT/UPDATE/DELETE statement; never caller-supplied SQL. */
  readonly text: string;
  readonly values?: readonly AsterPostgresValue[];
}

export interface AsterPostgresRows {
  readonly rowCount: number;
  readonly rows: readonly unknown[];
}

export interface AsterPostgresTransaction {
  /** Sequential queries only. The lease expires when the callback settles or its budget ends. */
  query(query: AsterPostgresQuery): Promise<AsterPostgresRows>;
}

export type AsterPostgresTransactionDecision<T> = Readonly<{
  action: "commit" | "rollback";
  value: T;
}>;

export type AsterPostgresTransactionResult<T> =
  | Readonly<{ status: "committed"; value: T }>
  | Readonly<{ status: "rolled_back"; value: T }>
  | Exclude<AsterPostgresOperationResult, { status: "completed" }>
  | Readonly<{ status: "indeterminate" }>;

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
  transaction<T>(
    work: (transaction: AsterPostgresTransaction) => Promise<AsterPostgresTransactionDecision<T>>,
    signal?: AbortSignal,
  ): Promise<AsterPostgresTransactionResult<T>>;
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
