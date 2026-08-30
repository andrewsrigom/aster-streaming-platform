import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import test from "node:test";
import type { AsterPostgresAdapter } from "@aster/postgres";
import type { AsterRedisAdapter } from "@aster/redis";
import { createLocalRouterTrust } from "@aster/http-express";
import { createAsterLogger } from "@aster/runtime";
import { createAsterTelemetry } from "@aster/telemetry";
import { createEngagementService } from "../src/create-service.js";
import {
  engagementRuntimeConfiguration,
  localEngagementDatabase,
} from "../src/infrastructure/runtime-configuration.js";
import { probeEngagementStore } from "../src/infrastructure/store-readiness.js";
import { migrateLocalEngagement } from "../src/infrastructure/local-migrations.js";

const environment = {
  ASTER_ENVIRONMENT: "local",
  ASTER_ENGAGEMENT_LOCAL_ENABLED: "true",
  ASTER_ROUTER_TRUST_ENABLED: "true",
  ASTER_ENGAGEMENT_DATABASE_URL: "postgresql://aster_engagement_local@127.0.0.1:5432/aster",
  ASTER_ENGAGEMENT_DATABASE_PASSWORD: "aster-test-only",
};

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    }),
  );
  return address.port;
}

function fixtureDatabase() {
  const state = {
    allowed: true,
    available: true,
    closed: false,
    version: 4,
    admission: true,
    constraint: true,
    watchlistConstraint: true,
  };
  const database: AsterPostgresAdapter = {
    connect: () => Promise.resolve({ status: "completed" }),
    probe: () => Promise.resolve({ status: "completed" }),
    async transaction(work, signal) {
      if (signal?.aborted) {
        return { status: "aborted" };
      }
      if (!state.available || state.closed) {
        return { status: "unavailable" };
      }
      const result = await work({
        query: (query) => {
          const rows = query.text.includes("FROM pg_roles")
            ? [{ allowed: state.allowed }]
            : query.text.includes("SELECT version")
              ? [{ version: 1 }, { version: 2 }, { version: 3 }, { version: state.version }]
              : query.text.includes("SELECT singleton") && state.admission
                ? [{ singleton: true }]
                : query.text.includes("SELECT tgname") &&
                    query.text.includes("engagement.watchlists")
                  ? state.watchlistConstraint
                    ? [
                        { tgname: "engagement_watchlist_commit" },
                        { tgname: "engagement_watchlist_entry_commit" },
                      ]
                    : []
                  : query.text.includes("SELECT tgname") && state.constraint
                    ? [{ tgname: "engagement_progress_commit" }]
                    : [];
          return Promise.resolve({ rowCount: rows.length, rows });
        },
      });
      return {
        status: result.action === "rollback" ? "rolled_back" : "committed",
        value: result.value,
      };
    },
    close: () => {
      state.closed = true;
      return Promise.resolve({ status: "completed" });
    },
    snapshot: () => ({
      state: state.closed ? "closed" : "open",
      totalConnections: 0,
      idleConnections: 0,
      vendorWaitingConnections: 0,
      reservedSlots: 0,
    }),
    lifecycleHooks: () => ({ closeDependencies: () => Promise.resolve() }),
  };
  return { database, state };
}

function fixtureRedis() {
  const state = { available: true, ready: false, closed: false };
  const result = () =>
    Promise.resolve(
      state.available && !state.closed
        ? ({ status: "completed" } as const)
        : ({ status: "unavailable" } as const),
    );
  const redis: AsterRedisAdapter = {
    connect: async () => {
      const value = await result();
      state.ready = value.status === "completed";
      return value;
    },
    probe: result,
    read: () => Promise.resolve({ status: "completed", value: null }),
    write: () => Promise.resolve({ status: "completed", stored: true }),
    acquireLease: () => Promise.resolve({ status: "completed", stored: true }),
    delete: () => Promise.resolve({ status: "completed", deleted: true }),
    compareAndDelete: () => Promise.resolve({ status: "completed", deleted: true }),
    consumeTokenBucket: () =>
      Promise.resolve({
        status: "completed",
        allowed: true,
        remaining: 1,
        retryAfterMs: 0,
        resetAfterMs: 1_000,
        recovered: false,
        deduplicated: false,
      }),
    snapshot: () => ({
      state: state.closed ? "closed" : state.ready ? "ready" : "idle",
      open: !state.closed,
      ready: state.ready,
      inFlightCommands: 0,
      reconnectAttempts: 0,
    }),
    close: () => {
      state.closed = true;
      state.ready = false;
      return Promise.resolve({ status: "completed" });
    },
    lifecycleHooks: () => ({ closeDependencies: () => Promise.resolve() }),
  };
  return { redis, state };
}

test("Engagement runtime requires explicit local activation, fixed owner credentials and protected listener", () => {
  assert.deepEqual(
    {
      port: engagementRuntimeConfiguration(environment).port,
      distributedRateLimit: engagementRuntimeConfiguration(environment).distributedRateLimit,
    },
    { port: 3400, distributedRateLimit: false },
  );
  assert.equal(
    engagementRuntimeConfiguration({
      ...environment,
      ASTER_OTLP_METRICS_ENDPOINT: "http://collector:4318/v1/metrics",
    }).otlpMetricsEndpoint,
    "http://collector:4318/v1/metrics",
  );
  assert.deepEqual(
    engagementRuntimeConfiguration({
      ...environment,
      ASTER_ENGAGEMENT_RATE_LIMIT_ENABLED: "true",
      REDIS_URL: "redis://redis:6379/0",
    }),
    {
      ...engagementRuntimeConfiguration(environment),
      distributedRateLimit: true,
      redisUrl: "redis://redis:6379/0",
    },
  );
  for (const change of [
    { ASTER_ENGAGEMENT_UNKNOWN_FLAG: "true" },
    { ASTER_ENVIRONMENT: "production" },
    { ASTER_ENGAGEMENT_LOCAL_ENABLED: "false" },
    { ASTER_ROUTER_TRUST_ENABLED: "false" },
    { ASTER_ENGAGEMENT_ADMIN_DATABASE_PASSWORD: "aster-test-only" },
    { ASTER_ENGAGEMENT_DATABASE_URL: "postgresql://aster@127.0.0.1/aster" },
    { ASTER_ENGAGEMENT_DATABASE_URL: "postgresql://aster_engagement_local@remote.invalid/aster" },
    { ASTER_ENGAGEMENT_DATABASE_URL: "postgresql://aster_engagement_local:secret@postgres/aster" },
    {
      ASTER_ENGAGEMENT_DATABASE_URL:
        "postgresql://aster_engagement_local@postgres/aster?sslmode=disable",
    },
    { ASTER_ENGAGEMENT_DATABASE_URL: "postgresql://aster_engagement_local@postgres/foreign" },
    { ASTER_ENGAGEMENT_DATABASE_PASSWORD: "" },
    { ASTER_ENGAGEMENT_HTTP_HOST: "example.invalid" },
    { ASTER_ENGAGEMENT_HTTP_PORT: "80" },
    { ASTER_ENGAGEMENT_HTTP_PORT: "65536" },
    { ASTER_ENGAGEMENT_HTTP_PORT: "3400.0" },
    { ASTER_ENGAGEMENT_RATE_LIMIT_ENABLED: "sometimes" },
    { ASTER_ENGAGEMENT_RATE_LIMIT_ENABLED: "true", REDIS_URL: "" },
    { ASTER_OTLP_METRICS_ENDPOINT: "http://user@collector:4318/v1/metrics" },
  ]) {
    assert.throws(() => engagementRuntimeConfiguration({ ...environment, ...change }));
  }
  const migration = {
    ASTER_ENVIRONMENT: "local",
    ASTER_ENGAGEMENT_MIGRATION_ENABLED: "true",
    ASTER_ENGAGEMENT_ADMIN_DATABASE_URL: "postgresql://aster@postgres:5432/aster",
    ASTER_ENGAGEMENT_ADMIN_DATABASE_PASSWORD: "aster-test-only",
  };
  assert.equal(new URL(localEngagementDatabase(migration, "migration")).username, "aster");
  assert.throws(() => localEngagementDatabase(environment, "migration"));
  assert.throws(() => localEngagementDatabase(migration, "runtime"));
});

test("migration rejects unauthorized or pre-cancelled activation before network work", async () => {
  await assert.rejects(
    migrateLocalEngagement(environment, AbortSignal.timeout(1000)),
    /activation/u,
  );
  await assert.rejects(
    migrateLocalEngagement(
      {
        ASTER_ENVIRONMENT: "local",
        ASTER_ENGAGEMENT_MIGRATION_ENABLED: "true",
        ASTER_ENGAGEMENT_ADMIN_DATABASE_URL: "postgresql://aster@postgres:5432/aster",
        ASTER_ENGAGEMENT_ADMIN_DATABASE_PASSWORD: "aster-test-only",
      },
      AbortSignal.abort(),
    ),
  );
});

test("store readiness rejects authority, schema, admission and connectivity loss", async () => {
  const { database, state } = fixtureDatabase();
  const signal = AbortSignal.timeout(2000);
  assert.equal(await probeEngagementStore(database, signal), "ready");
  for (const field of [
    "allowed",
    "admission",
    "available",
    "constraint",
    "watchlistConstraint",
  ] as const) {
    state[field] = false;
    assert.equal(await probeEngagementStore(database, signal), "unavailable", field);
    state[field] = true;
  }
  state.version = 3;
  assert.equal(await probeEngagementStore(database, signal), "unavailable");
  state.version = 4;
  assert.equal(await probeEngagementStore(database, AbortSignal.abort()), "unavailable");
});

test("runtime probes only its store without calling optional owners, denies untrusted GraphQL, recovers readiness and shuts down", async () => {
  const { database, state } = fixtureDatabase();
  const rateLimit = fixtureRedis();
  const logs: string[] = [];
  let ownerCalls = 0;
  const telemetry = createAsterTelemetry({
    serviceName: "engagement",
    serviceVersion: "0.0.0",
    environment: "test",
  });
  const service = await createEngagementService(
    {
      ...environment,
      ASTER_ENGAGEMENT_HTTP_PORT: String(await freePort()),
      ASTER_ENGAGEMENT_RATE_LIMIT_ENABLED: "true",
      REDIS_URL: "redis://redis:6379/0",
    },
    {
      database,
      redis: rateLimit.redis,
      telemetry,
      owners: {
        catalog: { visibility: () => Promise.resolve({ status: "unavailable" }) },
        identity: {
          authorizeProfile: () => {
            ownerCalls++;
            return Promise.resolve({ status: "unavailable" });
          },
        },
        playback: {
          inspect: () => {
            ownerCalls++;
            return Promise.resolve({ status: "unavailable" });
          },
        },
      },
      routerTrust: createLocalRouterTrust("engagement", randomBytes(32).toString("hex")),
      logger: createAsterLogger({
        service: "engagement",
        version: "0.0.0",
        environment: "integration",
        destination: {
          write: (line: string) => {
            logs.push(line);
          },
        },
      }),
      terminate: () => assert.fail("Unexpected forced termination"),
    },
  );
  const request = async (path: string, body?: object) =>
    fetch("http://127.0.0.1:" + String(service.port()) + path, {
      signal: AbortSignal.timeout(2000),
      ...(body
        ? {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
  const status = async (path: string, body?: object) => {
    const response = await request(path, body);
    await response.body?.cancel();
    return response.status;
  };
  try {
    assert.equal(await service.start(), "ready");
    assert.equal(await service.start(), "ready");
    assert.equal(await status("/health/ready"), 200);
    assert.equal(await service.checkRateLimitReadiness(AbortSignal.timeout(2_000)), "ready");
    rateLimit.state.available = false;
    assert.equal(await service.checkRateLimitReadiness(AbortSignal.timeout(2_000)), "unavailable");
    assert.equal(await status("/health/ready"), 200);
    rateLimit.state.available = true;
    assert.equal(await service.checkRateLimitReadiness(AbortSignal.timeout(2_000)), "ready");
    assert.equal(await status("/graphql", { query: "{ _service { sdl } }" }), 403);
    for (const field of ["allowed", "available", "constraint"] as const) {
      state[field] = false;
      assert.equal(await service.checkReadiness(AbortSignal.timeout(2000)), "unavailable");
      assert.equal(await status("/health/ready"), 503);
      assert.equal(await status("/health/live"), 200);
      assert.equal(await status("/graphql", { query: "{ _service { sdl } }" }), 503);
      state[field] = true;
      assert.equal(await service.checkReadiness(AbortSignal.timeout(2000)), "ready");
    }
    assert.equal(ownerCalls, 0);
    const collected = await telemetry.collect();
    assert.equal(collected.status, "collected");
    assert.ok(collected.metrics.some((metric) => metric.name.includes("http")));
    assert.ok(logs.some((line) => line.includes("aster.engagement.readiness_changed")));
    assert.doesNotMatch(logs.join(""), /aster-test-only|postgresql:\/\/|master\.m3u8/u);
    assert.equal((await service.shutdown()).outcome, "completed");
    assert.equal(state.closed, true);
    assert.equal(rateLimit.state.closed, true);
    assert.equal(service.health().phase, "stopped");
  } finally {
    await service.shutdown();
  }
});

test("runtime starts degraded without dependencies and can stop before listening", async () => {
  for (const start of [true, false]) {
    const { database, state } = fixtureDatabase();
    state.available = false;
    const service = await createEngagementService(
      { ...environment, ASTER_ENGAGEMENT_HTTP_PORT: String(await freePort()) },
      {
        database,
        owners: {
          catalog: { visibility: () => Promise.resolve({ status: "unavailable" }) },
          identity: { authorizeProfile: () => Promise.resolve({ status: "unavailable" }) },
          playback: { inspect: () => Promise.resolve({ status: "unavailable" }) },
        },
        routerTrust: createLocalRouterTrust("engagement", randomBytes(32).toString("hex")),
        logger: createAsterLogger({
          service: "engagement",
          version: "0.0.0",
          environment: "integration",
          destination: { write: () => undefined },
        }),
      },
    );
    try {
      if (start) {
        assert.equal(await service.start(), "degraded");
        assert.equal(service.health().readiness, "not_ready");
      }
      assert.equal((await service.shutdown()).outcome, "completed");
      if (!start) {
        assert.equal(await service.start(), "stopped");
      }
      assert.equal(state.closed, true);
    } finally {
      await service.shutdown();
    }
  }
});
