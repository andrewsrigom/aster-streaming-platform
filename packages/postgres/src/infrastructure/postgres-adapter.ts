import { Pool, type PoolConfig } from "pg";

import { ASTER_POSTGRES_POOL_ROLES } from "@aster/telemetry";
import type {
  AsterDependencyObservation,
  AsterDependencyOperation,
  AsterObservationOutcome,
} from "@aster/telemetry";

import {
  ASTER_POSTGRES_DEFAULTS,
  AsterPostgresConfigurationError,
  AsterPostgresLifecycleError,
  type AsterPostgresAdapter,
  type AsterPostgresCloseResult,
  type AsterPostgresConfigurationIssue,
  type AsterPostgresOperationResult,
  type AsterPostgresOptions,
  type AsterPostgresPoolSnapshot,
  type AsterPostgresTelemetry,
  type AsterPostgresValue,
  type AsterPostgresTransaction,
  type AsterPostgresTransactionDecision,
  type AsterPostgresTransactionResult,
} from "../postgres-contract.js";
import { executeTransaction } from "./postgres-transaction.js";
import { waitFor } from "./postgres-wait.js";

const MAXIMUM_OPTION_COUNT = 9;
const MAXIMUM_CONNECTION_STRING_LENGTH = 2_048;
const MAXIMUM_CONNECTIONS = 32;
const MAXIMUM_TIMEOUT_MS = 300_000;
const KNOWN_OPTIONS = new Set([
  "connectionString",
  "telemetry",
  "poolRole",
  "maxConnections",
  "connectionTimeoutMs",
  "idleTimeoutMs",
  "statementTimeoutMs",
  "operationTimeoutMs",
  "closeTimeoutMs",
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

type ValidatedOptions = Readonly<{
  connectionString: string;
  telemetry: Readonly<{
    target: AsterPostgresTelemetry;
    start: AsterPostgresTelemetry["startDependencyOperation"];
    recordPool: NonNullable<AsterPostgresTelemetry["recordPostgresPool"]> | undefined;
  }>;
  poolRole: (typeof ASTER_POSTGRES_POOL_ROLES)[number];
  maxConnections: number;
  connectionTimeoutMs: number;
  idleTimeoutMs: number;
  statementTimeoutMs: number;
  operationTimeoutMs: number;
  closeTimeoutMs: number;
}>;

export interface AsterPostgresPoolClient {
  query(
    config: Readonly<{ text: string; values?: AsterPostgresValue[]; query_timeout: number }>,
  ): Promise<
    Readonly<{
      rowCount: number | null;
      rows: readonly unknown[];
    }>
  >;
  release(destroy?: boolean): void;
}

export interface AsterPostgresPool {
  readonly totalCount: number;
  readonly idleCount: number;
  readonly waitingCount: number;
  connect(): Promise<AsterPostgresPoolClient>;
  end(): Promise<void>;
}

type PoolFactory = (config: PoolConfig) => AsterPostgresPool;

function issue(
  option: AsterPostgresConfigurationIssue["option"],
  reason: AsterPostgresConfigurationIssue["reason"],
): AsterPostgresConfigurationIssue {
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

function validConnectionString(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > MAXIMUM_CONNECTION_STRING_LENGTH ||
    containsControlCharacter(value)
  ) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "postgres:" || parsed.protocol === "postgresql:") &&
      parsed.hostname.length > 0 &&
      parsed.pathname.length > 1
    );
  } catch {
    return false;
  }
}

function boundedInteger(value: unknown, fallback: number, maximum: number): number | undefined {
  const selected = value === undefined ? fallback : value;
  if (
    typeof selected !== "number" ||
    !Number.isSafeInteger(selected) ||
    selected < 1 ||
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
    const findMethod = (name: "startDependencyOperation" | "recordPostgresPool"): unknown => {
      let owner: object | null = value;
      for (let depth = 0; depth < 4 && owner; depth += 1) {
        const method = Object.getOwnPropertyDescriptor(owner, name);
        if (method) {
          if ("get" in method) {
            return null;
          }
          const candidate: unknown = method.value;
          return typeof candidate === "function" ? candidate : null;
        }
        const prototype: unknown = Object.getPrototypeOf(owner);
        owner = typeof prototype === "object" ? prototype : null;
      }
      return undefined;
    };
    const start = findMethod("startDependencyOperation");
    const recordPool = findMethod("recordPostgresPool");
    if (typeof start !== "function" || recordPool === null) {
      return undefined;
    }
    return Object.freeze({
      target: value as AsterPostgresTelemetry,
      start: start as AsterPostgresTelemetry["startDependencyOperation"],
      recordPool:
        typeof recordPool === "function"
          ? (recordPool as NonNullable<AsterPostgresTelemetry["recordPostgresPool"]>)
          : undefined,
    });
  } catch {
    return undefined;
  }
}

function validateOptions(input: unknown): ValidatedOptions {
  const issues: AsterPostgresConfigurationIssue[] = [];
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      throw new AsterPostgresConfigurationError([issue("<options>", "invalid")]);
    }
    const prototype: unknown = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new AsterPostgresConfigurationError([issue("<options>", "invalid")]);
    }
    const keys = Reflect.ownKeys(input);
    if (keys.length > MAXIMUM_OPTION_COUNT) {
      throw new AsterPostgresConfigurationError([issue("<options>", "invalid")]);
    }
    for (const key of keys) {
      if (typeof key !== "string" || !KNOWN_OPTIONS.has(key)) {
        issues.push(issue("<options>", "unknown"));
        break;
      }
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || "get" in descriptor) {
        issues.push(
          issue(key as Exclude<AsterPostgresConfigurationIssue["option"], "<options>">, "invalid"),
        );
      }
    }

    const connectionString = ownDataValue(input, "connectionString");
    const telemetry = ownDataValue(input, "telemetry");
    const poolRole = ownDataValue(input, "poolRole") ?? ASTER_POSTGRES_DEFAULTS.poolRole;
    const boundTelemetry = telemetryBinding(telemetry);
    if (!validConnectionString(connectionString)) {
      issues.push(
        issue("connectionString", connectionString === undefined ? "missing" : "invalid"),
      );
    }
    if (!boundTelemetry) {
      issues.push(issue("telemetry", telemetry === undefined ? "missing" : "invalid"));
    }
    if (!ASTER_POSTGRES_POOL_ROLES.includes(poolRole as never)) {
      issues.push(issue("poolRole", "invalid"));
    }

    const maxConnections = boundedInteger(
      ownDataValue(input, "maxConnections"),
      ASTER_POSTGRES_DEFAULTS.maxConnections,
      MAXIMUM_CONNECTIONS,
    );
    const connectionTimeoutMs = boundedInteger(
      ownDataValue(input, "connectionTimeoutMs"),
      ASTER_POSTGRES_DEFAULTS.connectionTimeoutMs,
      MAXIMUM_TIMEOUT_MS,
    );
    const idleTimeoutMs = boundedInteger(
      ownDataValue(input, "idleTimeoutMs"),
      ASTER_POSTGRES_DEFAULTS.idleTimeoutMs,
      MAXIMUM_TIMEOUT_MS,
    );
    const statementTimeoutMs = boundedInteger(
      ownDataValue(input, "statementTimeoutMs"),
      ASTER_POSTGRES_DEFAULTS.statementTimeoutMs,
      MAXIMUM_TIMEOUT_MS,
    );
    const operationTimeoutMs = boundedInteger(
      ownDataValue(input, "operationTimeoutMs"),
      ASTER_POSTGRES_DEFAULTS.operationTimeoutMs,
      MAXIMUM_TIMEOUT_MS,
    );
    const closeTimeoutMs = boundedInteger(
      ownDataValue(input, "closeTimeoutMs"),
      ASTER_POSTGRES_DEFAULTS.closeTimeoutMs,
      MAXIMUM_TIMEOUT_MS,
    );
    for (const [name, value] of [
      ["maxConnections", maxConnections],
      ["connectionTimeoutMs", connectionTimeoutMs],
      ["idleTimeoutMs", idleTimeoutMs],
      ["statementTimeoutMs", statementTimeoutMs],
      ["operationTimeoutMs", operationTimeoutMs],
      ["closeTimeoutMs", closeTimeoutMs],
    ] as const) {
      if (value === undefined) {
        issues.push(issue(name, "invalid"));
      }
    }
    if (issues.length > 0) {
      throw new AsterPostgresConfigurationError(issues.slice(0, MAXIMUM_OPTION_COUNT));
    }

    return Object.freeze({
      connectionString: connectionString as string,
      telemetry: boundTelemetry as ValidatedOptions["telemetry"],
      poolRole: poolRole as ValidatedOptions["poolRole"],
      maxConnections: maxConnections as number,
      connectionTimeoutMs: connectionTimeoutMs as number,
      idleTimeoutMs: idleTimeoutMs as number,
      statementTimeoutMs: statementTimeoutMs as number,
      operationTimeoutMs: operationTimeoutMs as number,
      closeTimeoutMs: closeTimeoutMs as number,
    });
  } catch (error) {
    if (error instanceof AsterPostgresConfigurationError) {
      throw error;
    }
    throw new AsterPostgresConfigurationError([issue("<options>", "internal")]);
  }
}

function validSignal(signal: AbortSignal | undefined): boolean {
  return signal === undefined || signal instanceof AbortSignal;
}

function observationFor(
  telemetry: ValidatedOptions["telemetry"],
  operation: AsterDependencyOperation,
): AsterDependencyObservation | undefined {
  try {
    const result = telemetry.start.call(telemetry.target, {
      dependency: "postgresql",
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

function outcomeFor(result: AsterPostgresOperationResult): AsterObservationOutcome {
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

function safePoolCount(read: () => number, maximum: number): number {
  try {
    const value = read();
    if (!Number.isSafeInteger(value) || value < 0) {
      return 0;
    }
    return Math.min(value, maximum);
  } catch {
    return 0;
  }
}

function metricPoolCounts(
  pool: AsterPostgresPool,
  maximum: number,
): Readonly<{ total: number; idle: number; waiting: number }> | undefined {
  try {
    const total = pool.totalCount;
    const idle = pool.idleCount;
    const waiting = pool.waitingCount;
    if (
      ![total, idle, waiting].every(
        (value) => Number.isSafeInteger(value) && value >= 0 && value <= maximum,
      ) ||
      idle > total
    ) {
      return undefined;
    }
    return Object.freeze({ total, idle, waiting });
  } catch {
    return undefined;
  }
}

function isPgQueryTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message: unknown = Object.getOwnPropertyDescriptor(error, "message")?.value;
  const code: unknown = Object.getOwnPropertyDescriptor(error, "code")?.value;
  return message === "Query read timeout" || code === "57014";
}

function defaultPoolFactory(config: PoolConfig): AsterPostgresPool {
  const pool = new Pool(config);
  pool.on("error", () => {
    // pg has already removed the failed idle client. The next probe reports availability;
    // never let a recoverable disconnect crash the process or print the vendor client object.
  });
  return {
    get totalCount(): number {
      return pool.totalCount;
    },
    get idleCount(): number {
      return pool.idleCount;
    },
    get waitingCount(): number {
      return pool.waitingCount;
    },
    async connect(): Promise<AsterPostgresPoolClient> {
      const client = await pool.connect();
      return {
        async query(queryConfig) {
          const result = await client.query<Record<string, unknown>>(queryConfig);
          return { rowCount: result.rowCount, rows: result.rows };
        },
        release(destroy) {
          client.release(destroy);
        },
      };
    },
    end: () => pool.end(),
  };
}

export function createAsterPostgresAdapterWithPoolFactory(
  input: AsterPostgresOptions,
  poolFactory: PoolFactory,
): AsterPostgresAdapter {
  const options = validateOptions(input);
  let pool: AsterPostgresPool;
  try {
    pool = poolFactory({
      connectionString: options.connectionString,
      max: options.maxConnections,
      connectionTimeoutMillis: options.connectionTimeoutMs,
      idleTimeoutMillis: options.idleTimeoutMs,
      statement_timeout: options.statementTimeoutMs,
      query_timeout: options.operationTimeoutMs,
      application_name: "aster",
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
    });
  } catch {
    throw new AsterPostgresConfigurationError([issue("<options>", "internal")]);
  }

  let state: AsterPostgresPoolSnapshot["state"] = "open";
  let reservedSlots = 0;
  let closeWork: Promise<AsterPostgresCloseResult> | undefined;
  const activeDestroyers = new Set<() => void>();
  const activeOperations = new Set<Promise<void>>();
  const backgroundAcquisitions = new Set<Promise<void>>();
  const isOpen = (): boolean => state === "open";
  let recordPoolSnapshot = (): void => undefined;

  const run = async (
    operation: "connect" | "probe" | "query",
    signal: AbortSignal | undefined,
    work?: (
      client: AsterPostgresPoolClient,
      deadline: number,
      leaseOpen: () => boolean,
    ) => Promise<AsterPostgresOperationResult>,
  ): Promise<AsterPostgresOperationResult> => {
    const observation = observationFor(options.telemetry, operation);
    const deadline = performance.now() + options.operationTimeoutMs;
    let finalResult: AsterPostgresOperationResult = FAILED;
    let completeOperation: (() => void) | undefined;
    let forceRelease: (() => void) | undefined;
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
      if (!isOpen()) {
        finalResult = CLOSED_REJECTED;
        return finalResult;
      }
      if (reservedSlots >= options.maxConnections) {
        finalResult = CAPACITY_REJECTED;
        return finalResult;
      }

      reservedSlots += 1;
      recordPoolSnapshot();
      let slotReleased = false;
      const releaseSlot = (): void => {
        if (!slotReleased) {
          slotReleased = true;
          reservedSlots -= 1;
          recordPoolSnapshot();
        }
      };

      let acquisition: Promise<AsterPostgresPoolClient>;
      try {
        acquisition = Promise.resolve(pool.connect());
      } catch {
        releaseSlot();
        finalResult = UNAVAILABLE;
        return finalResult;
      }
      const acquired = await waitFor(
        acquisition,
        signal,
        operation === "query"
          ? Math.max(1, Math.min(options.connectionTimeoutMs, deadline - performance.now()))
          : options.connectionTimeoutMs,
      );
      if (acquired.status !== "completed") {
        if (acquired.status === "failed") {
          releaseSlot();
          finalResult = UNAVAILABLE;
          return finalResult;
        }
        const cleanup = acquisition.then(
          (client) => {
            try {
              client.release(true);
            } catch {
              // The connection is already unusable; no caller observes vendor detail.
            } finally {
              releaseSlot();
            }
          },
          () => {
            releaseSlot();
          },
        );
        backgroundAcquisitions.add(cleanup);
        void cleanup.finally(() => {
          backgroundAcquisitions.delete(cleanup);
        });
        finalResult = acquired.status === "aborted" ? ABORTED : TIMED_OUT;
        return finalResult;
      }

      const client = acquired.value;
      let clientReleased = false;
      const releaseClient = (destroy: boolean): boolean => {
        if (clientReleased) {
          return true;
        }
        clientReleased = true;
        activeDestroyers.delete(destroyClient);
        try {
          client.release(destroy);
          return true;
        } catch {
          return false;
        } finally {
          releaseSlot();
        }
      };
      const destroyClient = (): void => {
        releaseClient(true);
      };
      forceRelease = destroyClient;
      activeDestroyers.add(destroyClient);

      if (!isOpen()) {
        releaseClient(true);
        finalResult = CLOSED_REJECTED;
        return finalResult;
      }
      if (operation === "connect") {
        finalResult = releaseClient(false) ? COMPLETED : FAILED;
        return finalResult;
      }

      if (work) {
        finalResult = await work(client, deadline, () => isOpen() && !clientReleased);
        releaseClient(finalResult.status !== "completed");
        return finalResult;
      }

      let query: ReturnType<AsterPostgresPoolClient["query"]>;
      try {
        query = Promise.resolve(
          client.query({
            text: "SELECT 1 AS aster_probe",
            query_timeout: options.operationTimeoutMs,
          }),
        );
      } catch {
        releaseClient(true);
        finalResult = UNAVAILABLE;
        return finalResult;
      }
      const queried = await waitFor(query, signal, options.operationTimeoutMs);
      if (queried.status === "aborted" || queried.status === "timed_out") {
        releaseClient(true);
        finalResult = queried.status === "aborted" ? ABORTED : TIMED_OUT;
        return finalResult;
      }
      if (queried.status === "failed") {
        releaseClient(true);
        finalResult = isPgQueryTimeout(queried.error) ? TIMED_OUT : UNAVAILABLE;
        return finalResult;
      }
      const firstRow = queried.value.rows[0] as Record<string, unknown> | undefined;
      if (queried.value.rowCount !== 1 || firstRow?.["aster_probe"] !== 1) {
        releaseClient(true);
        finalResult = FAILED;
        return finalResult;
      }
      finalResult = releaseClient(false) ? COMPLETED : FAILED;
      return finalResult;
    } catch {
      forceRelease?.();
      finalResult = FAILED;
      return finalResult;
    } finally {
      completeObservation(observation, outcomeFor(finalResult));
      completeOperation?.();
      activeOperations.delete(settlement);
    }
  };

  const transaction = async <T>(
    work: (transaction: AsterPostgresTransaction) => Promise<AsterPostgresTransactionDecision<T>>,
    signal?: AbortSignal,
  ): Promise<AsterPostgresTransactionResult<T>> => {
    let transactionResult: AsterPostgresTransactionResult<T> | undefined;
    const result = await run("query", signal, async (client, deadline, leaseOpen) => {
      transactionResult = await executeTransaction(client, work, signal, deadline, leaseOpen);
      if (transactionResult.status === "committed" || transactionResult.status === "rolled_back") {
        return COMPLETED;
      }
      return transactionResult.status === "indeterminate" ? FAILED : transactionResult;
    });
    return transactionResult ?? (result.status === "completed" ? FAILED : result);
  };

  const snapshot = (): AsterPostgresPoolSnapshot =>
    Object.freeze({
      state,
      totalConnections: safePoolCount(() => pool.totalCount, options.maxConnections),
      idleConnections: safePoolCount(() => pool.idleCount, options.maxConnections),
      vendorWaitingConnections: safePoolCount(() => pool.waitingCount, options.maxConnections),
      reservedSlots,
    });

  recordPoolSnapshot = (): void => {
    if (!options.telemetry.recordPool) {
      return;
    }
    const counts = metricPoolCounts(pool, options.maxConnections);
    if (!counts) {
      return;
    }
    try {
      options.telemetry.recordPool.call(options.telemetry.target, {
        pool: options.poolRole,
        state,
        maximum: options.maxConnections,
        total: counts.total,
        idle: counts.idle,
        reserved: reservedSlots,
        waiting: counts.waiting,
      });
    } catch {
      // Metrics remain best effort and cannot change database behavior.
    }
  };

  const startClose = (): Promise<AsterPostgresCloseResult> => {
    if (closeWork) {
      return closeWork;
    }
    state = "closing";
    recordPoolSnapshot();
    const rawClose = (async (): Promise<void> => {
      for (const destroy of [...activeDestroyers]) {
        try {
          destroy();
        } catch {
          // Continue closing remaining owned resources.
        }
      }
      await Promise.allSettled([...activeOperations, ...backgroundAcquisitions]);
      await pool.end();
      state = "closed";
      recordPoolSnapshot();
    })();
    closeWork = waitFor(rawClose, undefined, options.closeTimeoutMs).then((result) => {
      switch (result.status) {
        case "completed":
          return Object.freeze({ status: "completed" });
        case "timed_out":
          return Object.freeze({ status: "timed_out" });
        case "failed":
          return Object.freeze({ status: "failed" });
        case "aborted":
          return Object.freeze({ status: "failed" });
      }
    });
    return closeWork;
  };

  const close = async (signal?: AbortSignal): Promise<AsterPostgresCloseResult> => {
    if (!validSignal(signal)) {
      return FAILED;
    }
    if (signal?.aborted) {
      return ABORTED;
    }
    if (state === "closed") {
      return Object.freeze({ status: "already_completed" });
    }
    const joined = await waitFor(startClose(), signal, options.closeTimeoutMs);
    if (joined.status === "completed") {
      return joined.value;
    }
    if (joined.status === "aborted") {
      return Object.freeze({ status: "aborted" });
    }
    return Object.freeze({ status: joined.status === "timed_out" ? "timed_out" : "failed" });
  };

  const lifecycleHooks = Object.freeze({
    async closeDependencies(signal: AbortSignal): Promise<void> {
      const result = await close(signal);
      if (result.status !== "completed" && result.status !== "already_completed") {
        throw new AsterPostgresLifecycleError();
      }
    },
  });

  recordPoolSnapshot();

  return Object.freeze({
    connect: (signal?: AbortSignal) => run("connect", signal),
    probe: (signal?: AbortSignal) => run("probe", signal),
    transaction,
    snapshot,
    close,
    lifecycleHooks: () => lifecycleHooks,
  });
}

export function createAsterPostgresAdapter(input: AsterPostgresOptions): AsterPostgresAdapter {
  return createAsterPostgresAdapterWithPoolFactory(input, defaultPoolFactory);
}
