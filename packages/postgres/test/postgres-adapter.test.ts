import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type {
  AsterDependencyObservationInput,
  AsterObservationOutcome,
  AsterPostgresPoolMetricInput,
} from "@aster/telemetry";

import {
  AsterPostgresConfigurationError,
  AsterPostgresLifecycleError,
  type AsterPostgresOptions,
  type AsterPostgresTelemetry,
} from "../src/index.js";
import {
  createAsterPostgresAdapterWithPoolFactory,
  type AsterPostgresPool,
  type AsterPostgresPoolClient,
} from "../src/infrastructure/postgres-adapter.js";

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}>;

function deferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | undefined;
  let rejectPromise: ((error: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve(value): void {
      resolvePromise?.(value);
    },
    reject(error): void {
      rejectPromise?.(error);
    },
  };
}

class RecordingTelemetry implements AsterPostgresTelemetry {
  readonly attempts: Array<{
    input: AsterDependencyObservationInput;
    outcome?: AsterObservationOutcome;
  }> = [];
  readonly poolSnapshots: AsterPostgresPoolMetricInput[] = [];
  throwOnPoolRecord = false;

  startDependencyOperation(input: AsterDependencyObservationInput) {
    const attempt: (typeof this.attempts)[number] = { input };
    this.attempts.push(attempt);
    return {
      status: "started" as const,
      observation: {
        complete: ({ outcome }: { outcome: AsterObservationOutcome }) => {
          attempt.outcome = outcome;
          return { status: "completed" as const };
        },
      },
    };
  }

  recordPostgresPool(input: AsterPostgresPoolMetricInput) {
    if (this.throwOnPoolRecord) {
      throw new Error("telemetry-unavailable");
    }
    this.poolSnapshots.push(input);
    return { status: "recorded" as const };
  }
}

class FakeClient implements AsterPostgresPoolClient {
  readonly releases: boolean[] = [];
  queryCalls = 0;

  constructor(
    private readonly queryHandler: () => Promise<
      Readonly<{ rowCount: number | null; rows: readonly unknown[] }>
    >,
    private readonly onDestroy?: () => void,
  ) {}

  query(): Promise<Readonly<{ rowCount: number | null; rows: readonly unknown[] }>> {
    this.queryCalls += 1;
    return this.queryHandler();
  }

  release(destroy = false): void {
    this.releases.push(destroy);
    if (destroy) {
      this.onDestroy?.();
    }
  }
}

class FakePool implements AsterPostgresPool {
  totalCount = 0;
  idleCount = 0;
  waitingCount = 0;
  connectCalls = 0;
  endCalls = 0;
  readonly connections: Array<() => Promise<AsterPostgresPoolClient>> = [];
  endHandler: () => Promise<void> = () => Promise.resolve();

  connect(): Promise<AsterPostgresPoolClient> {
    this.connectCalls += 1;
    const next = this.connections.shift();
    if (!next) {
      return Promise.reject(new Error("no fake connection"));
    }
    return next();
  }

  end(): Promise<void> {
    this.endCalls += 1;
    return this.endHandler();
  }
}

function options(
  telemetry: AsterPostgresTelemetry,
  overrides: Partial<AsterPostgresOptions> = {},
): AsterPostgresOptions {
  return {
    connectionString: "postgresql://aster@127.0.0.1:5432/aster",
    telemetry,
    maxConnections: 2,
    connectionTimeoutMs: 100,
    idleTimeoutMs: 1_000,
    statementTimeoutMs: 100,
    operationTimeoutMs: 100,
    closeTimeoutMs: 100,
    ...overrides,
  };
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test("validates bounded options before constructing a pool without leaking input", () => {
  const telemetry = new RecordingTelemetry();
  let poolCreations = 0;
  let accessorReads = 0;
  const accessorOptions = Object.create(null) as AsterPostgresOptions;
  Object.defineProperty(accessorOptions, "connectionString", {
    get(): string {
      accessorReads += 1;
      return "postgresql://accessor-secret-never-emit@127.0.0.1/aster";
    },
  });
  Object.defineProperty(accessorOptions, "telemetry", { value: telemetry, enumerable: true });
  const optionalAccessor = options(telemetry);
  Object.defineProperty(optionalAccessor, "maxConnections", {
    enumerable: true,
    get(): number {
      accessorReads += 1;
      return 1;
    },
  });
  const hostileOptions = new Proxy(
    {},
    {
      ownKeys(): never {
        throw new Error("proxy-secret-never-emit");
      },
    },
  ) as AsterPostgresOptions;

  for (const input of [
    accessorOptions,
    optionalAccessor,
    hostileOptions,
    options(telemetry, { connectionString: "postgresql://aster@127.0.0.1/aster\nsecret" }),
    options(telemetry, { maxConnections: 33 }),
    options(telemetry, { poolRole: "private-secret" as never }),
  ]) {
    assert.throws(
      () =>
        createAsterPostgresAdapterWithPoolFactory(input, () => {
          poolCreations += 1;
          return new FakePool();
        }),
      (error: unknown) => {
        assert.equal(error instanceof AsterPostgresConfigurationError, true);
        const configurationError = error as AsterPostgresConfigurationError;
        assert.equal(configurationError.issues.length >= 1, true);
        assert.equal(configurationError.issues.length <= 8, true);
        assert.equal("cause" in configurationError, false);
        const serialized = JSON.stringify(configurationError);
        assert.equal(serialized.includes("secret-never-emit"), false);
        return true;
      },
    );
  }
  assert.equal(accessorReads, 0);
  assert.equal(poolCreations, 0);
});

test("passes finite connection and server timeout policy to pg", () => {
  const telemetry = new RecordingTelemetry();
  const pool = new FakePool();
  let captured: Record<string, unknown> | undefined;
  const adapter = createAsterPostgresAdapterWithPoolFactory(options(telemetry), (config) => {
    captured = { ...config };
    return pool;
  });

  assert.equal(Object.isFrozen(adapter), true);
  assert.deepEqual(captured, {
    application_name: "aster",
    connectionString: "postgresql://aster@127.0.0.1:5432/aster",
    connectionTimeoutMillis: 100,
    idleTimeoutMillis: 1_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    max: 2,
    query_timeout: 100,
    statement_timeout: 100,
  });
});

test("records finite pool snapshots without coupling database behavior to metrics", async () => {
  const telemetry = new RecordingTelemetry();
  const pool = new FakePool();
  pool.totalCount = 1;
  pool.idleCount = 1;
  const client = new FakeClient(() => Promise.resolve({ rowCount: 1, rows: [] }));
  pool.connections.push(() => Promise.resolve(client));
  const adapter = createAsterPostgresAdapterWithPoolFactory(
    options(telemetry, { poolRole: "projection" }),
    () => pool,
  );

  assert.deepEqual(telemetry.poolSnapshots[0], {
    pool: "projection",
    state: "open",
    maximum: 2,
    total: 1,
    idle: 1,
    reserved: 0,
    waiting: 0,
  });
  assert.deepEqual(await adapter.connect(), { status: "completed" });
  assert.deepEqual(
    telemetry.poolSnapshots.map((snapshot) => [snapshot.state, snapshot.reserved]),
    [
      ["open", 0],
      ["open", 1],
      ["open", 0],
    ],
  );
  assert.deepEqual(await adapter.close(), { status: "completed" });
  assert.deepEqual(
    telemetry.poolSnapshots.slice(-2).map((snapshot) => snapshot.state),
    ["closing", "closed"],
  );

  const degradedTelemetry = new RecordingTelemetry();
  degradedTelemetry.throwOnPoolRecord = true;
  const degradedPool = new FakePool();
  const degraded = createAsterPostgresAdapterWithPoolFactory(
    options(degradedTelemetry),
    () => degradedPool,
  );
  assert.deepEqual(await degraded.close(), { status: "completed" });
});

test("connect and probe reserve one slot, release healthy clients, and emit finite telemetry", async () => {
  const telemetry = new RecordingTelemetry();
  const pool = new FakePool();
  pool.totalCount = 1;
  pool.idleCount = 1;
  const client = new FakeClient(() => Promise.resolve({ rowCount: 1, rows: [{ aster_probe: 1 }] }));
  pool.connections.push(
    () => Promise.resolve(client),
    () => Promise.resolve(client),
  );
  const adapter = createAsterPostgresAdapterWithPoolFactory(options(telemetry), () => pool);

  assert.deepEqual(await adapter.connect(), { status: "completed" });
  assert.deepEqual(await adapter.probe(), { status: "completed" });
  assert.deepEqual(client.releases, [false, false]);
  assert.equal(client.queryCalls, 1);
  assert.deepEqual(adapter.snapshot(), {
    state: "open",
    totalConnections: 1,
    idleConnections: 1,
    vendorWaitingConnections: 0,
    reservedSlots: 0,
  });
  assert.deepEqual(
    telemetry.attempts.map(({ input, outcome }) => ({ operation: input.operation, outcome })),
    [
      { operation: "connect", outcome: "success" },
      { operation: "probe", outcome: "success" },
    ],
  );
  assert.deepEqual(await adapter.close(), { status: "completed" });
  assert.equal(pool.endCalls, 1);
});

test("keeps an abandoned acquisition inside the finite capacity until it is destroyed", async () => {
  const telemetry = new RecordingTelemetry();
  const pool = new FakePool();
  const acquisition = deferred<AsterPostgresPoolClient>();
  const client = new FakeClient(() => Promise.resolve({ rowCount: 1, rows: [] }));
  pool.connections.push(() => acquisition.promise);
  const adapter = createAsterPostgresAdapterWithPoolFactory(
    options(telemetry, { maxConnections: 1 }),
    () => pool,
  );
  const controller = new AbortController();
  const first = adapter.connect(controller.signal);
  controller.abort();

  assert.deepEqual(await first, { status: "aborted" });
  assert.equal(adapter.snapshot().reservedSlots, 1);
  assert.deepEqual(await adapter.connect(), {
    status: "rejected",
    reason: "capacity_exceeded",
  });
  acquisition.resolve(client);
  await nextTurn();
  assert.deepEqual(client.releases, [true]);
  assert.equal(adapter.snapshot().reservedSlots, 0);
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("times out a stalled probe, destroys its connection, and remains closeable", async () => {
  const telemetry = new RecordingTelemetry();
  const pool = new FakePool();
  const never = new Promise<Readonly<{ rowCount: number | null; rows: readonly unknown[] }>>(
    () => {},
  );
  const client = new FakeClient(() => never);
  pool.connections.push(() => Promise.resolve(client));
  const adapter = createAsterPostgresAdapterWithPoolFactory(
    options(telemetry, { operationTimeoutMs: 20 }),
    () => pool,
  );
  const started = performance.now();

  assert.deepEqual(await adapter.probe(), { status: "timed_out" });
  assert.equal(performance.now() - started < 200, true);
  assert.deepEqual(client.releases, [true]);
  assert.equal(adapter.snapshot().reservedSlots, 0);
  assert.deepEqual(
    telemetry.attempts.map(({ outcome }) => outcome),
    ["timeout"],
  );
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("caller abort during a query destroys the connection and records cancellation", async () => {
  const telemetry = new RecordingTelemetry();
  const pool = new FakePool();
  const query = deferred<Readonly<{ rowCount: number | null; rows: readonly unknown[] }>>();
  const client = new FakeClient(() => query.promise);
  pool.connections.push(() => Promise.resolve(client));
  const adapter = createAsterPostgresAdapterWithPoolFactory(options(telemetry), () => pool);
  const controller = new AbortController();
  const probe = adapter.probe(controller.signal);
  await nextTurn();
  controller.abort();

  assert.deepEqual(await probe, { status: "aborted" });
  assert.deepEqual(client.releases, [true]);
  assert.deepEqual(
    telemetry.attempts.map(({ outcome }) => outcome),
    ["cancelled"],
  );
  assert.deepEqual(await adapter.connect({} as AbortSignal), {
    status: "rejected",
    reason: "invalid_signal",
  });
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("concurrent close destroys in-flight work while an aborted waiter remains local", async () => {
  const telemetry = new RecordingTelemetry();
  const pool = new FakePool();
  const query = deferred<Readonly<{ rowCount: number | null; rows: readonly unknown[] }>>();
  const end = deferred<undefined>();
  const client = new FakeClient(
    () => query.promise,
    () => {
      query.reject(new Error("connection destroyed"));
    },
  );
  pool.connections.push(() => Promise.resolve(client));
  pool.endHandler = () => end.promise;
  const adapter = createAsterPostgresAdapterWithPoolFactory(options(telemetry), () => pool);
  const probe = adapter.probe();
  await nextTurn();

  const owner = adapter.close();
  const waiterController = new AbortController();
  const waiter = adapter.close(waiterController.signal);
  waiterController.abort();
  assert.deepEqual(await waiter, { status: "aborted" });
  assert.deepEqual(client.releases, [true]);
  assert.deepEqual(await probe, { status: "unavailable" });
  end.resolve(undefined);
  assert.deepEqual(await owner, { status: "completed" });
  assert.deepEqual(await adapter.close(), { status: "already_completed" });
  assert.equal(pool.endCalls, 1);
});

test("an already-aborted close is side-effect free", async () => {
  const telemetry = new RecordingTelemetry();
  const pool = new FakePool();
  const adapter = createAsterPostgresAdapterWithPoolFactory(options(telemetry), () => pool);
  const controller = new AbortController();
  controller.abort();

  assert.deepEqual(await adapter.close(controller.signal), { status: "aborted" });
  assert.equal(pool.endCalls, 0);
  assert.equal(adapter.snapshot().state, "open");
  assert.deepEqual(await adapter.close(), { status: "completed" });
  assert.equal(pool.endCalls, 1);
});

test("close returns within its deadline while the underlying drain can finish later", async () => {
  const telemetry = new RecordingTelemetry();
  const pool = new FakePool();
  const end = deferred<undefined>();
  pool.endHandler = () => end.promise;
  const adapter = createAsterPostgresAdapterWithPoolFactory(
    options(telemetry, { closeTimeoutMs: 20 }),
    () => pool,
  );
  const started = performance.now();

  assert.deepEqual(await adapter.close(), { status: "timed_out" });
  assert.equal(performance.now() - started < 200, true);
  assert.equal(adapter.snapshot().state, "closing");
  assert.equal(pool.endCalls, 1);

  end.resolve(undefined);
  await nextTurn();
  assert.equal(adapter.snapshot().state, "closed");
  assert.deepEqual(await adapter.close(), { status: "already_completed" });
});

test("lifecycle close converts vendor failure to one cause-free repository error", async () => {
  const telemetry = new RecordingTelemetry();
  const pool = new FakePool();
  pool.endHandler = () => Promise.reject(new Error("close-secret-never-emit"));
  const adapter = createAsterPostgresAdapterWithPoolFactory(options(telemetry), () => pool);

  await assert.rejects(
    adapter.lifecycleHooks().closeDependencies(new AbortController().signal),
    (error: unknown) => {
      assert.equal(error instanceof AsterPostgresLifecycleError, true);
      const lifecycleError = error as AsterPostgresLifecycleError;
      assert.equal(lifecycleError.message.includes("secret-never-emit"), false);
      assert.equal("cause" in lifecycleError, false);
      return true;
    },
  );
});

test("runs an unavailable-endpoint diagnostic and keeps pg out of public declarations", async () => {
  const diagnosticPath = fileURLToPath(new URL("../src/check-postgres.js", import.meta.url));
  const diagnostic = spawnSync(process.execPath, [diagnosticPath], {
    encoding: "utf8",
    env: {},
    timeout: 3_000,
  });
  assert.equal(diagnostic.status, 0, diagnostic.stderr);
  assert.equal(diagnostic.stderr, "");
  assert.deepEqual(JSON.parse(diagnostic.stdout) as object, {
    event: "postgres_diagnostic_passed",
    unavailableOutcome: "unavailable",
    close: "completed",
  });

  const declaration = await readFile(new URL("../src/index.d.ts", import.meta.url), "utf8");
  const publicContract = declaration.toLowerCase();
  for (const vendor of ['from "pg"', "pg-pool", "poolclient", "queryresult"] as const) {
    assert.equal(publicContract.includes(vendor), false);
  }
});
