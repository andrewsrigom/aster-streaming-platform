import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { AsterDependencyObservationInput, AsterObservationOutcome } from "@aster/telemetry";

import {
  AsterRedisConfigurationError,
  AsterRedisLifecycleError,
  createAsterRedisAdapter,
  type AsterRedisOptions,
  type AsterRedisTelemetry,
} from "../src/index.js";
import {
  type AsterRedisClient,
  type AsterRedisClientConfiguration,
  type AsterRedisClientEvent,
  createAsterRedisAdapterWithClientFactory,
} from "../src/infrastructure/redis-adapter.js";

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}>;

const SECRET_CANARY = ["secret", "-never-emit"].join("");

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

class RecordingTelemetry implements AsterRedisTelemetry {
  readonly attempts: Array<{
    input: AsterDependencyObservationInput;
    outcome?: AsterObservationOutcome;
  }> = [];

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
}

class FakeClient implements AsterRedisClient {
  isOpen = false;
  isReady = false;
  connectCalls = 0;
  pingCalls = 0;
  getCalls = 0;
  setCalls = 0;
  deleteCalls = 0;
  compareAndDeleteCalls = 0;
  destroyCalls = 0;
  connectHandler: () => Promise<void> = () => {
    this.isReady = true;
    this.emit("ready");
    return Promise.resolve();
  };
  pingHandler: (signal: AbortSignal) => Promise<string> = () => Promise.resolve("PONG");
  getHandler: (key: string, signal: AbortSignal) => Promise<string | null> = () =>
    Promise.resolve(null);
  setHandler: (
    key: string,
    value: string,
    ttlMs: number,
    onlyIfAbsent: boolean,
    signal: AbortSignal,
  ) => Promise<string | null> = () => Promise.resolve("OK");
  deleteHandler: (key: string, signal: AbortSignal) => Promise<number> = () => Promise.resolve(0);
  compareAndDeleteHandler: (
    key: string,
    expectedValue: string,
    signal: AbortSignal,
  ) => Promise<number> = () => Promise.resolve(0);
  destroyHandler: () => void = () => {};
  readonly listeners = new Map<AsterRedisClientEvent, Set<(detail?: unknown) => void>>();

  async connect(): Promise<void> {
    this.connectCalls += 1;
    this.isOpen = true;
    this.emit("connect");
    await this.connectHandler();
  }

  ping(signal: AbortSignal): Promise<string> {
    this.pingCalls += 1;
    return this.pingHandler(signal);
  }

  get(key: string, signal: AbortSignal): Promise<string | null> {
    this.getCalls += 1;
    return this.getHandler(key, signal);
  }

  set(
    key: string,
    value: string,
    ttlMs: number,
    onlyIfAbsent: boolean,
    signal: AbortSignal,
  ): Promise<string | null> {
    this.setCalls += 1;
    return this.setHandler(key, value, ttlMs, onlyIfAbsent, signal);
  }

  del(key: string, signal: AbortSignal): Promise<number> {
    this.deleteCalls += 1;
    return this.deleteHandler(key, signal);
  }

  compareAndDelete(key: string, expectedValue: string, signal: AbortSignal): Promise<number> {
    this.compareAndDeleteCalls += 1;
    return this.compareAndDeleteHandler(key, expectedValue, signal);
  }

  destroy(): void {
    this.destroyCalls += 1;
    this.isOpen = false;
    this.isReady = false;
    this.destroyHandler();
    this.emit("end");
  }

  on(event: AsterRedisClientEvent, listener: (detail?: unknown) => void): void {
    let eventListeners = this.listeners.get(event);
    if (!eventListeners) {
      eventListeners = new Set();
      this.listeners.set(event, eventListeners);
    }
    eventListeners.add(listener);
  }

  off(event: AsterRedisClientEvent, listener: (detail?: unknown) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: AsterRedisClientEvent, detail?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(detail);
    }
  }
}

function options(
  telemetry: AsterRedisTelemetry,
  overrides: Partial<AsterRedisOptions> = {},
): AsterRedisOptions {
  return {
    url: "redis://127.0.0.1:6379/0",
    telemetry,
    maxInFlightCommands: 2,
    connectionTimeoutMs: 100,
    operationTimeoutMs: 100,
    closeTimeoutMs: 100,
    reconnectMaxAttempts: 2,
    reconnectBaseDelayMs: 25,
    ...overrides,
  };
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test("the default vendor factory connects using an isolated mutable configuration copy", async () => {
  let connections = 0;
  const server = createServer((socket) => {
    connections += 1;
    socket.destroy();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const adapter = createAsterRedisAdapter(
    options(new RecordingTelemetry(), {
      url: `redis://127.0.0.1:${address.port}/0`,
      reconnectMaxAttempts: 0,
    }),
  );
  try {
    assert.equal((await adapter.connect()).status, "unavailable");
    assert.equal(connections, 1);
    assert.equal((await adapter.close()).status, "completed");
  } finally {
    await adapter.close();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }
});

test("validates bounded own-data options without invoking accessors or leaking secrets", () => {
  const telemetry = new RecordingTelemetry();
  let factoryCalls = 0;
  let accessorReads = 0;
  const accessorOptions = options(telemetry);
  Object.defineProperty(accessorOptions, "url", {
    enumerable: true,
    get(): string {
      accessorReads += 1;
      return ["redis://accessor:", SECRET_CANARY, "@127.0.0.1/0"].join("");
    },
  });
  const hostileOptions = new Proxy(
    {},
    {
      ownKeys(): never {
        throw new Error("proxy-secret-never-emit");
      },
    },
  ) as AsterRedisOptions;

  for (const input of [
    accessorOptions,
    hostileOptions,
    options(telemetry, {
      url: ["redis://aster:", SECRET_CANARY, "@127.0.0.1/0\nvalue"].join(""),
    }),
    options(telemetry, { maxInFlightCommands: 129 }),
    options(telemetry, { reconnectMaxAttempts: 11 }),
  ]) {
    assert.throws(
      () =>
        createAsterRedisAdapterWithClientFactory(input, () => {
          factoryCalls += 1;
          return new FakeClient();
        }),
      (error: unknown) => {
        assert.equal(error instanceof AsterRedisConfigurationError, true);
        const configurationError = error as AsterRedisConfigurationError;
        assert.equal(configurationError.issues.length >= 1, true);
        assert.equal(configurationError.issues.length <= 8, true);
        assert.equal("cause" in configurationError, false);
        assert.equal(JSON.stringify(configurationError).includes("secret-never-emit"), false);
        return true;
      },
    );
  }
  assert.equal(accessorReads, 0);
  assert.equal(factoryCalls, 0);
});

test("passes a finite no-offline-queue and reconnect policy to the client", async () => {
  const telemetry = new RecordingTelemetry();
  const client = new FakeClient();
  let captured: AsterRedisClientConfiguration | undefined;
  const adapter = createAsterRedisAdapterWithClientFactory(options(telemetry), (configuration) => {
    captured = configuration;
    return client;
  });

  assert.equal(Object.isFrozen(adapter), true);
  assert.deepEqual(await adapter.connect(), { status: "completed" });
  assert.equal(captured?.commandsQueueMaxLength, 2);
  assert.equal(captured.disableOfflineQueue, true);
  assert.equal(captured.disableClientInfo, true);
  assert.equal(captured.maintNotifications, "disabled");
  assert.equal(captured.socket.connectTimeout, 100);
  assert.equal(captured.socket.reconnectStrategy(0), 25);
  assert.equal(captured.socket.reconnectStrategy(1), 50);
  assert.equal(captured.socket.reconnectStrategy(2), false);
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("connect and probe expose ready state and finite telemetry", async () => {
  const telemetry = new RecordingTelemetry();
  const client = new FakeClient();
  const adapter = createAsterRedisAdapterWithClientFactory(options(telemetry), () => client);

  assert.deepEqual(await adapter.connect(), { status: "completed" });
  assert.deepEqual(await adapter.probe(), { status: "completed" });
  assert.deepEqual(adapter.snapshot(), {
    state: "ready",
    open: true,
    ready: true,
    inFlightCommands: 0,
    reconnectAttempts: 0,
  });
  assert.equal(client.pingCalls, 1);
  assert.deepEqual(
    telemetry.attempts.map(({ input, outcome }) => ({ operation: input.operation, outcome })),
    [
      { operation: "connect", outcome: "success" },
      { operation: "probe", outcome: "success" },
    ],
  );
  assert.deepEqual(await adapter.close(), { status: "completed" });
  assert.equal(client.destroyCalls, 1);
});

test("executes only bounded cache commands and reports finite dependency operations", async () => {
  const telemetry = new RecordingTelemetry();
  const client = new FakeClient();
  client.getHandler = (key) => Promise.resolve(key === "aster:test:key" ? "cached" : null);
  client.setHandler = (key, value, ttlMs, onlyIfAbsent) => {
    assert.equal(key, "aster:test:key");
    assert.equal(value, "cached");
    assert.equal(ttlMs, 2_000);
    return Promise.resolve(onlyIfAbsent ? null : "OK");
  };
  client.deleteHandler = (key) => Promise.resolve(key === "aster:test:key" ? 1 : 0);
  let lease = "owner-a";
  client.compareAndDeleteHandler = (_key, expected) => {
    if (lease !== expected) {
      return Promise.resolve(0);
    }
    lease = "";
    return Promise.resolve(1);
  };
  const adapter = createAsterRedisAdapterWithClientFactory(options(telemetry), () => client);

  assert.deepEqual(await adapter.connect(), { status: "completed" });
  assert.deepEqual(await adapter.read("aster:test:key"), {
    status: "completed",
    value: "cached",
  });
  assert.deepEqual(await adapter.write("aster:test:key", "cached", 2_000, "replace"), {
    status: "completed",
    stored: true,
  });
  assert.deepEqual(await adapter.write("aster:test:key", "cached", 2_000, "if_absent"), {
    status: "completed",
    stored: false,
  });
  assert.deepEqual(await adapter.delete("aster:test:key"), {
    status: "completed",
    deleted: true,
  });
  assert.deepEqual(await adapter.compareAndDelete("aster:test:lease", "owner-b"), {
    status: "completed",
    deleted: false,
  });
  assert.deepEqual(await adapter.compareAndDelete("aster:test:lease", "owner-a"), {
    status: "completed",
    deleted: true,
  });
  assert.deepEqual(
    telemetry.attempts.map(({ input, outcome }) => [input.operation, outcome]),
    [
      ["connect", "success"],
      ["read", "success"],
      ["write", "success"],
      ["write", "success"],
      ["delete", "success"],
      ["delete", "success"],
      ["delete", "success"],
    ],
  );
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("rejects malformed cache command input before vendor work", async () => {
  const client = new FakeClient();
  const adapter = createAsterRedisAdapterWithClientFactory(
    options(new RecordingTelemetry()),
    () => client,
  );
  assert.deepEqual(await adapter.connect(), { status: "completed" });
  const rejected = { status: "rejected", reason: "invalid_input" };

  assert.deepEqual(await adapter.read(""), rejected);
  assert.deepEqual(await adapter.read("x".repeat(257)), rejected);
  assert.deepEqual(await adapter.write("key", "x".repeat(16_385), 10, "replace"), rejected);
  assert.deepEqual(await adapter.write("key", "value", 0, "replace"), rejected);
  assert.deepEqual(await adapter.write("key", "value", 300_001, "replace"), rejected);
  assert.deepEqual(await adapter.write("key", "value", 10, "unknown" as "replace"), rejected);
  assert.deepEqual(await adapter.compareAndDelete("key", ""), rejected);
  assert.deepEqual(
    [client.getCalls, client.setCalls, client.deleteCalls, client.compareAndDeleteCalls],
    [0, 0, 0, 0],
  );
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("shares one bounded connect while caller cancellation remains local", async () => {
  const telemetry = new RecordingTelemetry();
  const client = new FakeClient();
  const connection = deferred<undefined>();
  client.connectHandler = async () => {
    await connection.promise;
    client.isReady = true;
    client.emit("ready");
  };
  const adapter = createAsterRedisAdapterWithClientFactory(options(telemetry), () => client);
  const owner = adapter.connect();
  const waiterController = new AbortController();
  const waiter = adapter.connect(waiterController.signal);
  waiterController.abort();

  assert.deepEqual(await waiter, { status: "aborted" });
  assert.equal(client.destroyCalls, 0);
  connection.resolve(undefined);
  assert.deepEqual(await owner, { status: "completed" });
  assert.equal(client.connectCalls, 1);
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("a timed-out connect destroys its generation and a later connect creates a new one", async () => {
  const telemetry = new RecordingTelemetry();
  const first = new FakeClient();
  first.connectHandler = () => new Promise(() => {});
  const second = new FakeClient();
  const clients = [first, second];
  const adapter = createAsterRedisAdapterWithClientFactory(
    options(telemetry, { connectionTimeoutMs: 20 }),
    () => clients.shift() as FakeClient,
  );
  const started = performance.now();

  assert.deepEqual(await adapter.connect(), { status: "timed_out" });
  assert.equal(performance.now() - started < 200, true);
  assert.equal(first.destroyCalls, 1);
  await nextTurn();
  assert.deepEqual(await adapter.connect(), { status: "completed" });
  assert.equal(second.connectCalls, 1);
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("a late connect completion cannot revive an adapter that is closing", async () => {
  const telemetry = new RecordingTelemetry();
  const client = new FakeClient();
  const connection = deferred<undefined>();
  client.connectHandler = async () => {
    await connection.promise;
    client.isReady = true;
    client.emit("ready");
  };
  const adapter = createAsterRedisAdapterWithClientFactory(
    options(telemetry, { connectionTimeoutMs: 200, closeTimeoutMs: 20 }),
    () => client,
  );

  const connecting = adapter.connect();
  await nextTurn();
  assert.deepEqual(await adapter.close(), { status: "timed_out" });
  assert.equal(adapter.snapshot().state, "closed");

  connection.resolve(undefined);
  assert.deepEqual(await connecting, { status: "rejected", reason: "adapter_closed" });
  await nextTurn();
  assert.equal(adapter.snapshot().state, "closed");
  assert.deepEqual(await adapter.close(), { status: "already_completed" });
});

test("rejects excess in-flight probes without extending the vendor queue", async () => {
  const telemetry = new RecordingTelemetry();
  const client = new FakeClient();
  const ping = deferred<string>();
  client.pingHandler = () => ping.promise;
  const adapter = createAsterRedisAdapterWithClientFactory(
    options(telemetry, { maxInFlightCommands: 1 }),
    () => client,
  );
  assert.deepEqual(await adapter.connect(), { status: "completed" });
  const first = adapter.probe();
  await nextTurn();

  assert.deepEqual(await adapter.probe(), {
    status: "rejected",
    reason: "capacity_exceeded",
  });
  assert.equal(client.pingCalls, 1);
  ping.resolve("PONG");
  assert.deepEqual(await first, { status: "completed" });
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("caller abort destroys an ambiguous command generation and permits explicit recovery", async () => {
  const telemetry = new RecordingTelemetry();
  const first = new FakeClient();
  const ping = deferred<string>();
  first.pingHandler = () => ping.promise;
  first.destroyHandler = () => {
    ping.reject(new Error("destroyed-secret-never-emit"));
  };
  const second = new FakeClient();
  const clients = [first, second];
  const adapter = createAsterRedisAdapterWithClientFactory(
    options(telemetry),
    () => clients.shift() as FakeClient,
  );
  assert.deepEqual(await adapter.connect(), { status: "completed" });
  const controller = new AbortController();
  const probe = adapter.probe(controller.signal);
  await nextTurn();
  controller.abort();

  assert.deepEqual(await probe, { status: "aborted" });
  assert.equal(first.destroyCalls, 1);
  assert.equal(adapter.snapshot().state, "degraded");
  assert.deepEqual(await adapter.connect(), { status: "completed" });
  assert.deepEqual(await adapter.probe(), { status: "completed" });
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("a stalled probe times out, destroys its client, and returns within the deadline", async () => {
  const telemetry = new RecordingTelemetry();
  const client = new FakeClient();
  const ping = deferred<string>();
  client.pingHandler = () => ping.promise;
  client.destroyHandler = () => {
    ping.reject(new Error("destroyed"));
  };
  const adapter = createAsterRedisAdapterWithClientFactory(
    options(telemetry, { operationTimeoutMs: 20 }),
    () => client,
  );
  assert.deepEqual(await adapter.connect(), { status: "completed" });
  const started = performance.now();

  assert.deepEqual(await adapter.probe(), { status: "timed_out" });
  assert.equal(performance.now() - started < 200, true);
  assert.equal(client.destroyCalls, 1);
  assert.equal(adapter.snapshot().inFlightCommands, 0);
  assert.deepEqual(
    telemetry.attempts.map(({ outcome }) => outcome),
    ["success", "timeout"],
  );
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("reconnect events expose only bounded availability state", async () => {
  const telemetry = new RecordingTelemetry();
  const client = new FakeClient();
  const adapter = createAsterRedisAdapterWithClientFactory(options(telemetry), () => client);
  assert.deepEqual(await adapter.connect(), { status: "completed" });

  client.emit("error", new Error("endpoint-secret-never-emit"));
  assert.equal(adapter.snapshot().state, "degraded");
  client.emit("reconnecting");
  client.emit("reconnecting");
  client.emit("reconnecting");
  assert.equal(adapter.snapshot().state, "reconnecting");
  assert.equal(adapter.snapshot().reconnectAttempts, 2);
  client.isReady = true;
  client.emit("ready");
  assert.equal(adapter.snapshot().state, "ready");
  assert.equal(adapter.snapshot().reconnectAttempts, 0);
  assert.equal(JSON.stringify(adapter.snapshot()).includes("secret-never-emit"), false);
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("close aborts active work once, supports local waiter cancellation, and is idempotent", async () => {
  const telemetry = new RecordingTelemetry();
  const client = new FakeClient();
  const ping = deferred<string>();
  client.pingHandler = () => ping.promise;
  client.destroyHandler = () => {
    ping.reject(new Error("destroyed"));
  };
  const adapter = createAsterRedisAdapterWithClientFactory(options(telemetry), () => client);
  assert.deepEqual(await adapter.connect(), { status: "completed" });
  const probe = adapter.probe();
  await nextTurn();

  const owner = adapter.close();
  const waiterController = new AbortController();
  const waiter = adapter.close(waiterController.signal);
  waiterController.abort();
  assert.deepEqual(await waiter, { status: "aborted" });
  assert.deepEqual(await probe, { status: "aborted" });
  assert.deepEqual(await owner, { status: "completed" });
  assert.deepEqual(await adapter.close(), { status: "already_completed" });
  assert.equal(client.destroyCalls, 1);
});

test("an already-aborted close is side-effect free and lifecycle failure is cause-free", async () => {
  const telemetry = new RecordingTelemetry();
  const client = new FakeClient();
  const connection = new Promise<void>(() => {});
  client.connectHandler = () => connection;
  const adapter = createAsterRedisAdapterWithClientFactory(
    options(telemetry, { connectionTimeoutMs: 100, closeTimeoutMs: 20 }),
    () => client,
  );
  const controller = new AbortController();
  controller.abort();
  assert.deepEqual(await adapter.close(controller.signal), { status: "aborted" });
  assert.equal(client.destroyCalls, 0);
  const connect = adapter.connect();
  await nextTurn();

  await assert.rejects(
    adapter.lifecycleHooks().closeDependencies(new AbortController().signal),
    (error: unknown) => {
      assert.equal(error instanceof AsterRedisLifecycleError, true);
      assert.equal("cause" in (error as AsterRedisLifecycleError), false);
      return true;
    },
  );
  assert.equal(client.destroyCalls, 1);
  await connect;
});

test("lifecycle close reports a cause-free failure when vendor destruction throws", async () => {
  const telemetry = new RecordingTelemetry();
  const client = new FakeClient();
  client.destroyHandler = () => {
    throw new Error("destroy-secret-never-emit");
  };
  const adapter = createAsterRedisAdapterWithClientFactory(options(telemetry), () => client);
  assert.deepEqual(await adapter.connect(), { status: "completed" });

  await assert.rejects(
    adapter.lifecycleHooks().closeDependencies(new AbortController().signal),
    (error: unknown) => {
      assert.equal(error instanceof AsterRedisLifecycleError, true);
      const lifecycleError = error as AsterRedisLifecycleError;
      assert.equal(lifecycleError.message.includes("secret-never-emit"), false);
      assert.equal("cause" in lifecycleError, false);
      return true;
    },
  );
  assert.equal(client.destroyCalls, 1);
  assert.equal(adapter.snapshot().state, "degraded");
  assert.deepEqual(await adapter.close(), { status: "failed" });
});

test("runs an unavailable-endpoint diagnostic and keeps the Redis client private", async () => {
  const diagnosticPath = fileURLToPath(new URL("../src/check-redis.js", import.meta.url));
  const diagnostic = spawnSync(process.execPath, [diagnosticPath], {
    encoding: "utf8",
    env: {},
    timeout: 5_000,
  });
  assert.equal(diagnostic.status, 0, diagnostic.stderr);
  assert.equal(diagnostic.stderr, "");
  assert.deepEqual(JSON.parse(diagnostic.stdout) as object, {
    event: "redis_diagnostic_passed",
    unavailableOutcome: "unavailable",
    close: "completed",
  });

  const declaration = await readFile(new URL("../src/index.d.ts", import.meta.url), "utf8");
  const publicContract = declaration.toLowerCase();
  for (const vendor of [
    "@redis/client",
    "redisclienttype",
    "redisclientoptions",
    "cluster-key-slot",
  ] as const) {
    assert.equal(publicContract.includes(vendor), false);
  }
});
