import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import test from "node:test";
import type { AsterPostgresAdapter } from "@aster/postgres";
import { createLocalRouterTrust } from "@aster/http-express";
import { createAsterLogger } from "@aster/runtime";
import { createAsterTelemetry } from "@aster/telemetry";
import { createPlaybackService } from "../src/create-service.js";
import {
  playbackRuntimeConfiguration,
  localPlaybackDatabase,
} from "../src/infrastructure/runtime-configuration.js";
import { probePlaybackStore } from "../src/infrastructure/store-readiness.js";
import { migrateLocalPlayback } from "../src/infrastructure/local-migrations.js";

const environment = {
  ASTER_ENVIRONMENT: "local",
  ASTER_PLAYBACK_LOCAL_ENABLED: "true",
  ASTER_ROUTER_TRUST_ENABLED: "true",
  ASTER_PLAYBACK_DATABASE_URL: "postgresql://aster_playback_local@127.0.0.1:5432/aster",
  ASTER_PLAYBACK_DATABASE_PASSWORD: "aster-test-only",
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
    version: 1,
    admission: true,
    owner: true,
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
              ? [{ version: state.version }]
              : query.text.includes("SELECT singleton") && state.admission
                ? [{ singleton: true }]
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

test("Playback runtime requires explicit local activation, fixed owner credentials and protected listener", () => {
  assert.equal(playbackRuntimeConfiguration(environment).port, 3300);
  assert.equal(playbackRuntimeConfiguration(environment).engagementRead, false);
  assert.equal(
    playbackRuntimeConfiguration({
      ...environment,
      ASTER_OTLP_METRICS_ENDPOINT: "http://collector:4318/v1/metrics",
    }).otlpMetricsEndpoint,
    "http://collector:4318/v1/metrics",
  );
  assert.equal(
    playbackRuntimeConfiguration({ ...environment, ASTER_PLAYBACK_ENGAGEMENT_READ_ENABLED: "true" })
      .engagementRead,
    true,
  );
  for (const change of [
    { ASTER_PLAYBACK_ENGAGEMENT_READ_ENABLED: "yes" },
    { ASTER_ENVIRONMENT: "production" },
    { ASTER_PLAYBACK_LOCAL_ENABLED: "false" },
    { ASTER_ROUTER_TRUST_ENABLED: "false" },
    { ASTER_PLAYBACK_ADMIN_DATABASE_PASSWORD: "aster-test-only" },
    { ASTER_PLAYBACK_DATABASE_URL: "postgresql://aster@127.0.0.1/aster" },
    { ASTER_PLAYBACK_DATABASE_URL: "postgresql://aster_playback_local@remote.invalid/aster" },
    { ASTER_PLAYBACK_DATABASE_URL: "postgresql://aster_playback_local:secret@postgres/aster" },
    {
      ASTER_PLAYBACK_DATABASE_URL:
        "postgresql://aster_playback_local@postgres/aster?sslmode=disable",
    },
    { ASTER_PLAYBACK_DATABASE_URL: "postgresql://aster_playback_local@postgres/foreign" },
    { ASTER_PLAYBACK_DATABASE_PASSWORD: "" },
    { ASTER_PLAYBACK_HTTP_HOST: "example.invalid" },
    { ASTER_PLAYBACK_HTTP_PORT: "80" },
    { ASTER_PLAYBACK_HTTP_PORT: "65536" },
    { ASTER_PLAYBACK_HTTP_PORT: "3300.0" },
    { ASTER_OTLP_METRICS_ENDPOINT: "http://collector:4318/v1/metrics?token=private" },
  ]) {
    assert.throws(() => playbackRuntimeConfiguration({ ...environment, ...change }));
  }
  const migration = {
    ASTER_ENVIRONMENT: "local",
    ASTER_PLAYBACK_MIGRATION_ENABLED: "true",
    ASTER_PLAYBACK_ADMIN_DATABASE_URL: "postgresql://aster@postgres:5432/aster",
    ASTER_PLAYBACK_ADMIN_DATABASE_PASSWORD: "aster-test-only",
  };
  assert.equal(new URL(localPlaybackDatabase(migration, "migration")).username, "aster");
  assert.throws(() => localPlaybackDatabase(environment, "migration"));
  assert.throws(() => localPlaybackDatabase(migration, "runtime"));
});

test("migration rejects unauthorized or pre-cancelled activation before network work", async () => {
  await assert.rejects(migrateLocalPlayback(environment, AbortSignal.timeout(1000)), /activation/u);
  await assert.rejects(
    migrateLocalPlayback(
      {
        ASTER_ENVIRONMENT: "local",
        ASTER_PLAYBACK_MIGRATION_ENABLED: "true",
        ASTER_PLAYBACK_ADMIN_DATABASE_URL: "postgresql://aster@postgres:5432/aster",
        ASTER_PLAYBACK_ADMIN_DATABASE_PASSWORD: "aster-test-only",
      },
      AbortSignal.abort(),
    ),
  );
});

test("store readiness rejects authority, schema, admission and connectivity loss", async () => {
  const { database, state } = fixtureDatabase();
  const signal = AbortSignal.timeout(2000);
  assert.equal(await probePlaybackStore(database, signal), "ready");
  for (const field of ["allowed", "admission", "available"] as const) {
    state[field] = false;
    assert.equal(await probePlaybackStore(database, signal), "unavailable", field);
    state[field] = true;
  }
  state.version = 2;
  assert.equal(await probePlaybackStore(database, signal), "unavailable");
  state.version = 1;
  assert.equal(await probePlaybackStore(database, AbortSignal.abort()), "unavailable");
});

test("runtime probes only Catalog and its store, denies untrusted GraphQL, recovers readiness and shuts down", async () => {
  const { database, state } = fixtureDatabase();
  const logs: string[] = [];
  const ownerCalls: string[] = [];
  const telemetry = createAsterTelemetry({
    serviceName: "playback",
    serviceVersion: "0.0.0",
    environment: "test",
  });
  const service = await createPlaybackService(
    { ...environment, ASTER_PLAYBACK_HTTP_PORT: String(await freePort()) },
    {
      database,
      telemetry,
      catalog: {
        currentPublication: (id, signal) => {
          ownerCalls.push(id);
          assert.equal(signal.aborted, false);
          return Promise.resolve(
            state.owner ? { status: "completed", value: null } : { status: "unavailable" },
          );
        },
      },
      routerTrust: createLocalRouterTrust("playback", randomBytes(32).toString("hex")),
      logger: createAsterLogger({
        service: "playback",
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
    assert.equal(await status("/graphql", { query: "{ _service { sdl } }" }), 403);
    for (const field of ["allowed", "available", "owner"] as const) {
      state[field] = false;
      assert.equal(await service.checkReadiness(AbortSignal.timeout(2000)), "unavailable");
      assert.equal(await status("/health/ready"), 503);
      assert.equal(await status("/health/live"), 200);
      assert.equal(await status("/graphql", { query: "{ _service { sdl } }" }), 503);
      state[field] = true;
      assert.equal(await service.checkReadiness(AbortSignal.timeout(2000)), "ready");
    }
    assert.equal(ownerCalls.length, 7);
    assert.ok(ownerCalls.every((id) => id === "00000000-0000-4000-8000-000000000000"));
    const collected = await telemetry.collect();
    assert.equal(collected.status, "collected");
    assert.ok(collected.metrics.some((metric) => metric.name.includes("http")));
    assert.ok(logs.some((line) => line.includes("aster.playback.readiness_changed")));
    assert.doesNotMatch(logs.join(""), /aster-test-only|postgresql:\/\/|master\.m3u8/u);
    assert.equal((await service.shutdown()).outcome, "completed");
    assert.equal(state.closed, true);
    assert.equal(service.health().phase, "stopped");
  } finally {
    await service.shutdown();
  }
});

test("runtime starts degraded without dependencies and can stop before listening", async () => {
  for (const start of [true, false]) {
    const { database, state } = fixtureDatabase();
    state.available = false;
    const service = await createPlaybackService(
      { ...environment, ASTER_PLAYBACK_HTTP_PORT: String(await freePort()) },
      {
        database,
        catalog: { currentPublication: () => Promise.resolve({ status: "unavailable" }) },
        routerTrust: createLocalRouterTrust("playback", randomBytes(32).toString("hex")),
        logger: createAsterLogger({
          service: "playback",
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
