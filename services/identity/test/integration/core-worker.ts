import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { setImmediate as nextTurn } from "node:timers/promises";

import { createAsterPostgresAdapter } from "@aster/postgres";
import { createAsterRedisAdapter } from "@aster/redis";
import { createAsterTelemetry } from "@aster/telemetry";

import { createIdentityServiceWithFactories } from "../../src/create-service.js";
import { createIdentityProfileOperationLimiter } from "../../src/infrastructure/profile-operation-limiter.js";
import {
  createIdentityHttpServer,
  type IdentityHttpServer,
} from "../../src/transport/http-server.js";
import { configurationEntries, silentLogger } from "../fixtures.js";
import { eventually } from "./docker-fixture.js";
import { verifyHttpDrain } from "./http-drain.js";
import { change } from "./worker-control.js";

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
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

function output(event: string, details: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({ event, ...details })}\n`);
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
  const firstLimiter = createIdentityProfileOperationLimiter({
    environment: "test",
    redis,
    digest,
  });
  const secondLimiter = createIdentityProfileOperationLimiter({
    environment: "test",
    redis,
    digest,
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

    const accountId = "00000000-0000-4000-8000-000000009901";
    const admission = digest("real-redis-shared-admission");
    assert.deepEqual(
      await firstLimiter.admit(
        "profile_mutation",
        accountId,
        admission,
        AbortSignal.timeout(1_000),
      ),
      { status: "allowed" },
    );
    assert.deepEqual(
      await secondLimiter.admit(
        "profile_mutation",
        accountId,
        admission,
        AbortSignal.timeout(1_000),
      ),
      { status: "allowed" },
    );
    output("identity_rate_atomic_admission", { outcome: "passed", replicas: 2 });

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
    assert.deepEqual(
      await firstLimiter.admit(
        "profile_selection",
        "00000000-0000-4000-8000-000000009902",
        digest("redis-outage-fallback"),
        AbortSignal.timeout(1_000),
      ),
      { status: "allowed" },
    );
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
    assert.deepEqual(
      await secondLimiter.admit(
        "profile_selection",
        "00000000-0000-4000-8000-000000009902",
        digest("redis-recovered-admission"),
        AbortSignal.timeout(1_000),
      ),
      { status: "allowed" },
    );
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
    firstLimiter.close();
    secondLimiter.close();
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
    await change("postgres", "stop");
    await eventually("Identity not ready", async () => (await health("ready")) === 503, 20_000);
    assert.equal(await health("live"), 200);
    assert.equal(service.tryBeginWork(), undefined);
    await change("postgres", "start");
    await eventually(
      "Identity ready after PostgreSQL recovery",
      async () => (await health("ready")) === 200,
      20_000,
    );
    output("identity_dependency_recovery", { dependency: "postgres", outcome: "passed" });

    await change("redis", "stop");
    assert.equal(await health("ready"), 200);
    const redisOutageLease = service.tryBeginWork();
    assert.ok(redisOutageLease);
    redisOutageLease.complete();
    await change("redis", "start");
    assert.equal(await health("ready"), 200);
    output("identity_optional_redis", { outcome: "passed", readiness: "ready" });
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
