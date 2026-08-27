import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";

import { createAsterPostgresAdapter } from "@aster/postgres";
import { createAsterRedisAdapter } from "@aster/redis";
import { createAsterTelemetry } from "@aster/telemetry";

import { createIdentityServiceWithFactories } from "../../src/create-service.js";
import {
  createIdentityHttpServer,
  type IdentityHttpServer,
} from "../../src/transport/http-server.js";
import { configurationEntries, silentLogger } from "../fixtures.js";
import { eventually, type CoreService } from "./docker-fixture.js";
import { verifyHttpDrain } from "./http-drain.js";

const mode = process.argv[2];
const postgresPort = Number(process.argv[3]);
const redisPort = Number(process.argv[4]);
for (const port of [postgresPort, redisPort]) {
  assert.ok(Number.isSafeInteger(port) && port >= 1024 && port <= 65535);
}
const databaseUrl = new URL(`postgresql://127.0.0.1:${postgresPort}/aster`);
databaseUrl.username = "aster";
databaseUrl.password = "aster-test-only";
const connectionString = databaseUrl.toString();
const redisUrl = `redis://127.0.0.1:${redisPort}/0`;
let requestId = 0;

function output(event: string, details: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({ event, ...details })}\n`);
}

async function change(
  service: CoreService,
  action: "stop" | "start" | "pause" | "unpause",
): Promise<void> {
  const id = ++requestId;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      process.off("message", onMessage);
      reject(new Error("Fixture control deadline exceeded"));
    }, 60_000);
    function onMessage(message: unknown): void {
      if (
        typeof message === "object" &&
        message !== null &&
        (message as Record<string, unknown>)["id"] === id
      ) {
        clearTimeout(timer);
        process.off("message", onMessage);
        resolve();
      }
    }
    process.on("message", onMessage);
    assert.equal(typeof process.send, "function");
    process.send?.({ id, service, action });
  });
}

async function adapters(): Promise<void> {
  const telemetry = createAsterTelemetry({
    serviceName: "integration-core",
    serviceVersion: "0.0.0",
    environment: "test",
    export: { mode: "none" },
  });
  const postgresql = createAsterPostgresAdapter({
    connectionString,
    telemetry,
    maxConnections: 1,
    idleTimeoutMs: 60_000,
    operationTimeoutMs: 600,
  });
  const redis = createAsterRedisAdapter({
    url: redisUrl,
    telemetry,
    maxInFlightCommands: 1,
    operationTimeoutMs: 600,
  });
  try {
    assert.equal((await postgresql.connect()).status, "completed");
    assert.equal((await postgresql.probe()).status, "completed");
    assert.equal(postgresql.snapshot().idleConnections, 1);
    assert.equal((await redis.connect()).status, "completed");
    assert.equal((await redis.probe()).status, "completed");
    output("protocol_probes", { postgresql: "completed", redis: "completed" });
    if (mode === "protocol") {
      return;
    }

    // A stop after a successful query exercises idle-pool errors, not only refused startup sockets.
    await change("postgres", "stop");
    assert.notEqual((await postgresql.probe()).status, "completed");
    const unavailablePostgres = createAsterPostgresAdapter({
      connectionString,
      telemetry,
      connectionTimeoutMs: 500,
    });
    try {
      assert.notEqual((await unavailablePostgres.connect()).status, "completed");
    } finally {
      assert.equal((await unavailablePostgres.close()).status, "completed");
    }
    await change("postgres", "start");
    assert.equal((await postgresql.probe()).status, "completed");
    output("postgres_stop_recovery", { outcome: "passed" });

    await change("postgres", "pause");
    const timeoutStarted = performance.now();
    assert.equal((await postgresql.probe()).status, "timed_out");
    assert.ok(performance.now() - timeoutStarted < 2_000);
    await change("postgres", "unpause");
    assert.equal((await postgresql.probe()).status, "completed");
    await change("postgres", "pause");
    const controller = new AbortController();
    const cancelled = postgresql.probe(controller.signal);
    await nextTurn();
    assert.equal(postgresql.snapshot().reservedSlots, 1);
    controller.abort();
    assert.equal((await cancelled).status, "aborted");
    await change("postgres", "unpause");
    assert.equal((await postgresql.probe()).status, "completed");
    output("postgres_timeout_cancellation", {
      outcome: "passed",
      reservedSlots: postgresql.snapshot().reservedSlots,
    });

    await change("redis", "stop");
    assert.notEqual((await redis.probe()).status, "completed");
    assert.ok(redis.snapshot().reconnectAttempts <= 3);
    const unavailableRedis = createAsterRedisAdapter({
      url: redisUrl,
      telemetry,
      connectionTimeoutMs: 500,
    });
    try {
      assert.notEqual((await unavailableRedis.connect()).status, "completed");
    } finally {
      assert.equal((await unavailableRedis.close()).status, "completed");
    }
    await change("redis", "start");
    await eventually("Redis reconnect", async () => (await redis.connect()).status === "completed");
    assert.equal((await redis.probe()).status, "completed");
    output("redis_stop_recovery", { outcome: "passed" });

    await change("redis", "pause");
    const redisController = new AbortController();
    const command = redis.probe(redisController.signal);
    await nextTurn();
    assert.equal(redis.snapshot().inFlightCommands, 1);
    assert.deepEqual(await redis.probe(), { status: "rejected", reason: "capacity_exceeded" });
    redisController.abort();
    assert.equal((await command).status, "aborted");
    assert.equal(redis.snapshot().inFlightCommands, 0);
    await change("redis", "unpause");
    assert.equal((await redis.connect()).status, "completed");
    assert.equal((await redis.probe()).status, "completed");
    await change("redis", "pause");
    assert.equal((await redis.probe()).status, "timed_out");
    await change("redis", "unpause");
    assert.equal((await redis.connect()).status, "completed");
    assert.equal((await redis.probe()).status, "completed");
    output("redis_cancellation_capacity_timeout", { outcome: "passed" });
  } finally {
    assert.equal((await postgresql.close()).status, "completed");
    assert.equal((await postgresql.close()).status, "already_completed");
    assert.equal(postgresql.snapshot().totalConnections, 0);
    assert.equal((await redis.close()).status, "completed");
    assert.equal((await redis.close()).status, "already_completed");
    assert.equal(redis.snapshot().open, false);
    assert.equal((await telemetry.shutdown()).status, "completed");
    output("adapter_close", { outcome: "passed", connections: 0 });
  }
}

async function identity(): Promise<void> {
  let http: IdentityHttpServer | undefined;
  const service = await createIdentityServiceWithFactories(
    configurationEntries.map(([name, value]) => [
      name,
      name === "DATABASE_URL" ? connectionString : name === "REDIS_URL" ? redisUrl : value,
    ]),
    {
      logger: silentLogger,
      http: (options) => {
        http = createIdentityHttpServer({ ...options, port: 0 });
        return http;
      },
    },
  );
  async function health(path: "live" | "ready"): Promise<number> {
    const port = http?.port();
    assert.ok(port);
    const response = await fetch(`http://127.0.0.1:${port}/health/${path}`, {
      signal: AbortSignal.timeout(1_000),
      headers: { connection: "close" },
    });
    const body = await response.text();
    assert.ok(
      !body.includes("postgres") && !body.includes("redis") && !body.includes("aster-test-only"),
    );
    return response.status;
  }
  try {
    assert.deepEqual(await service.start(), { status: "started", readiness: "ready" });
    assert.equal(await health("ready"), 200);
    for (const dependency of ["postgres", "redis"] as const) {
      await change(dependency, "stop");
      await eventually("Identity not ready", async () => (await health("ready")) === 503, 20_000);
      assert.equal(await health("live"), 200);
      assert.equal(service.tryBeginWork(), undefined);
      await change(dependency, "start");
      await eventually(
        "Identity ready after recovery",
        async () => (await health("ready")) === 200,
        20_000,
      );
      output("identity_dependency_recovery", { dependency, outcome: "passed" });
    }
    const lease = service.tryBeginWork();
    assert.ok(lease);
    const shutdownStarted = performance.now();
    service.bindProcessSignals();
    process.kill(process.pid, "SIGTERM");
    await eventually("Identity draining", () => service.health().phase === "draining");
    assert.equal(service.tryBeginWork(), undefined);
    lease.complete();
    assert.equal((await service.shutdown()).outcome, "completed");
    assert.ok(performance.now() - shutdownStarted < 10_000);
    output("identity_signal_drain", {
      outcome: "passed",
      durationMs: Math.round(performance.now() - shutdownStarted),
    });
  } finally {
    assert.equal((await service.shutdown()).outcome, "completed");
  }
}

assert.ok(
  mode === "protocol" || mode === "adapters" || mode === "identity" || mode === "http-drain",
);
if (mode === "http-drain") {
  output("http_inflight_drain", {
    durationMs: await verifyHttpDrain(connectionString, redisUrl).catch(reportFailure),
    outcome: "passed",
  });
} else if (mode === "identity") {
  await identity().catch(reportFailure);
} else {
  await adapters().catch(reportFailure);
}
process.disconnect();
process.once("beforeExit", () => {
  output("natural_exit", { mode });
});

function reportFailure(error: unknown): never {
  if (error instanceof Error && !(error instanceof assert.AssertionError)) {
    output("scenario_failed", { name: error.name, message: error.message.slice(0, 512) });
  }
  if (error instanceof assert.AssertionError) {
    output("assertion_failed", {
      message: error.message.slice(0, 2_048),
      operator: error.operator,
      stack: error.stack
        ?.split("\n")
        .filter((line) => line.includes("core-worker.js"))
        .slice(0, 2),
    });
  }
  throw new Error("Core integration scenario failed.");
}
