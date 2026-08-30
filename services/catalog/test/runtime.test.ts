import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { test } from "node:test";
import { createLocalCatalogDiscoveryTrust, createLocalRouterTrust } from "@aster/http-express";
import type { AsterPostgresAdapter } from "@aster/postgres";
import type { AsterRedisAdapter } from "@aster/redis";
import { createAsterLogger } from "@aster/runtime";
import { createAsterTelemetry } from "@aster/telemetry";
import { createCatalogService } from "../src/create-service.js";
import { catalogRuntimeConfiguration } from "../src/infrastructure/runtime-configuration.js";
import { CATALOG_DISCOVERY_SNAPSHOTS } from "../src/transport/discovery-operation.js";

const environment = {
  ASTER_ENVIRONMENT: "local",
  ASTER_CATALOG_LOCAL_ENABLED: "true",
  ASTER_CATALOG_READER_DATABASE_URL: "postgresql://aster_catalog_reader_local@127.0.0.1:5432/aster",
  ASTER_CATALOG_READER_DATABASE_PASSWORD: "aster-test-only",
};
const discoveryEnvironment = {
  ...environment,
  ASTER_ROUTER_TRUST_ENABLED: "true",
  ASTER_CATALOG_DISCOVERY_READ_ENABLED: "true",
  ASTER_CATALOG_DISCOVERY_READER_DATABASE_URL:
    "postgresql://aster_catalog_discovery_reader_local@127.0.0.1:5432/aster",
  ASTER_CATALOG_DISCOVERY_READER_DATABASE_PASSWORD: "aster-discovery-test-only",
};
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
  return address.port;
}
function fixtureDatabase() {
  const state = { allowed: true, available: true, closed: false, queries: 0 };
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
          state.queries++;
          const rows = query.text.includes("FROM pg_roles") ? [{ allowed: state.allowed }] : [];
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

function unavailableRedis() {
  const state = { connectCalls: 0, closeCalls: 0, closed: false };
  const unavailable = () => Promise.resolve({ status: "unavailable" } as const);
  const bypassRead = () => Promise.resolve({ status: "unavailable" } as const);
  const redis: AsterRedisAdapter = {
    connect: () => {
      state.connectCalls += 1;
      return unavailable();
    },
    probe: unavailable,
    read: bypassRead,
    write: unavailable,
    acquireLease: unavailable,
    consumeTokenBucket: unavailable,
    delete: unavailable,
    compareAndDelete: unavailable,
    snapshot: () => ({
      state: state.closed ? "closed" : "degraded",
      open: false,
      ready: false,
      inFlightCommands: 0,
      reconnectAttempts: 0,
    }),
    close: () => {
      state.closeCalls += 1;
      state.closed = true;
      return Promise.resolve({ status: "completed" });
    },
    lifecycleHooks: () => ({ closeDependencies: () => Promise.resolve() }),
  };
  return { redis, state };
}

test("Catalog runtime configuration rejects hosted, privileged and malformed local settings", () => {
  assert.equal(catalogRuntimeConfiguration(environment).port, 3200);
  assert.equal(
    catalogRuntimeConfiguration({
      ...environment,
      ASTER_OTLP_METRICS_ENDPOINT: "http://collector:4318/v1/metrics",
    }).otlpMetricsEndpoint,
    "http://collector:4318/v1/metrics",
  );
  for (const change of [
    { ASTER_ENVIRONMENT: "production" },
    { ASTER_CATALOG_LOCAL_ENABLED: "false" },
    { ASTER_CATALOG_OPERATOR_ENABLED: "true" },
    { ASTER_CATALOG_ADMIN_DATABASE_PASSWORD: "aster-test-only" },
    { ASTER_CATALOG_READER_DATABASE_URL: "postgresql://aster@127.0.0.1:5432/aster" },
    {
      ASTER_CATALOG_READER_DATABASE_URL:
        "postgresql://aster_catalog_reader_local@remote.invalid:5432/aster",
    },
    { ASTER_CATALOG_HTTP_HOST: "example.invalid" },
    { ASTER_CATALOG_HTTP_PORT: "80" },
    { ASTER_CATALOG_HTTP_PORT: "65536" },
    { ASTER_CATALOG_HTTP_PORT: "3200.0" },
    { ASTER_CATALOG_PLAYBACK_READ_ENABLED: "true" },
    { ASTER_CATALOG_PLAYBACK_READ_ENABLED: "invalid" },
    { ASTER_CATALOG_DISCOVERY_READ_ENABLED: "true" },
    { ASTER_CATALOG_DISCOVERY_READ_ENABLED: "invalid" },
    { ASTER_CATALOG_CACHE_ENABLED: "invalid" },
    { ASTER_CATALOG_CACHE_ENABLED: "true" },
    { ASTER_CATALOG_DISCOVERY_READER_DATABASE_PASSWORD: "unused" },
    {
      ASTER_ROUTER_TRUST_ENABLED: "true",
      ASTER_CATALOG_DISCOVERY_READ_ENABLED: "true",
      ASTER_CATALOG_DISCOVERY_READER_DATABASE_URL:
        "postgresql://aster_catalog_reader_local@127.0.0.1:5432/aster",
      ASTER_CATALOG_DISCOVERY_READER_DATABASE_PASSWORD: "aster-test-only",
    },
    { ASTER_CATALOG_READER_DATABASE_PASSWORD: "" },
    { ASTER_OTLP_METRICS_ENDPOINT: "http://collector:4318/v1/traces" },
  ]) {
    assert.throws(() => catalogRuntimeConfiguration({ ...environment, ...change }));
  }
  assert.equal(
    catalogRuntimeConfiguration({
      ...environment,
      ASTER_ROUTER_TRUST_ENABLED: "true",
      ASTER_CATALOG_PLAYBACK_READ_ENABLED: "true",
    }).playbackRead,
    true,
  );
  const cache = catalogRuntimeConfiguration({
    ...environment,
    ASTER_CATALOG_CACHE_ENABLED: "true",
    REDIS_URL: "redis://127.0.0.1:6379/0",
  });
  assert.equal(cache.cache, true);
  assert.equal(cache.redisUrl, "redis://127.0.0.1:6379/0");
  const discovery = catalogRuntimeConfiguration(discoveryEnvironment);
  assert.equal(discovery.discoveryRead, true);
  assert.match(
    discovery.discoveryConnectionString,
    /^postgresql:\/\/aster_catalog_discovery_reader_local:aster-discovery-test-only@/u,
  );
});

test("optional Discovery uses separate authority and failure does not block public Catalog", async () => {
  const primary = fixtureDatabase();
  const discovery = fixtureDatabase();
  discovery.state.available = false;
  const routerKey = "a".repeat(64);
  const discoveryKey = "b".repeat(64);
  const logs: string[] = [];
  const service = await createCatalogService(
    { ...discoveryEnvironment, ASTER_CATALOG_HTTP_PORT: String(await freePort()) },
    {
      database: primary.database,
      discoveryDatabase: discovery.database,
      routerTrust: createLocalRouterTrust("catalog", routerKey),
      discoveryTrust: createLocalCatalogDiscoveryTrust(discoveryKey),
      logger: createAsterLogger({
        service: "catalog",
        version: "0.0.0",
        environment: "integration",
        destination: {
          write: (line: string) => {
            logs.push(line);
          },
        },
      }),
    },
  );
  const post = async (body: object, headers: Record<string, string>) =>
    new Promise<{ readonly status: number; readonly json: Record<string, unknown> }>(
      (resolve, reject) => {
        const request = httpRequest(
          "http://127.0.0.1:" + String(service.port()) + "/graphql",
          {
            method: "POST",
            headers: { "content-type": "application/json", connection: "close", ...headers },
            signal: AbortSignal.timeout(2000),
          },
          (response) => {
            const chunks: Buffer[] = [];
            response.on("data", (chunk: Buffer) => {
              chunks.push(chunk);
            });
            response.once("error", reject);
            response.once("end", () => {
              resolve({
                status: response.statusCode ?? 500,
                json: JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>,
              });
            });
          },
        );
        request.once("error", reject);
        request.end(JSON.stringify(body));
      },
    );
  const base = { host: "catalog:3200", "x-aster-csrf": "1" };
  const correlationId = "00000000-0000-4000-8000-000000000099";
  try {
    assert.equal(await service.start(), "ready");
    assert.equal(await service.checkDiscoveryReadiness(AbortSignal.timeout(1000)), "unavailable");
    assert.equal(service.health().readiness, "ready");
    const publicRead = await post(
      {
        query: "query RuntimeCatalog { titles(first: 1) { edges { node { id } } } }",
        operationName: "RuntimeCatalog",
      },
      {
        ...base,
        origin: "http://127.0.0.1:4000",
        "x-aster-router-credential": routerKey,
      },
    );
    assert.equal(publicRead.status, 200);
    const unavailable = await post(
      {
        query: CATALOG_DISCOVERY_SNAPSHOTS,
        operationName: "DiscoverySnapshots",
        variables: { ids: ["00000000-0000-4000-8000-000000000001"] },
      },
      {
        ...base,
        origin: "http://discovery:3500",
        "x-aster-discovery-credential": discoveryKey,
        "x-aster-correlation-id": correlationId,
      },
    );
    assert.equal(unavailable.status, 200);
    assert.match(JSON.stringify(unavailable.json), /UNAVAILABLE/u);
    discovery.state.available = true;
    assert.equal(await service.checkDiscoveryReadiness(AbortSignal.timeout(1000)), "ready");
    const available = await post(
      {
        query: CATALOG_DISCOVERY_SNAPSHOTS,
        operationName: "DiscoverySnapshots",
        variables: { ids: ["00000000-0000-4000-8000-000000000001"] },
      },
      {
        ...base,
        origin: "http://discovery:3500",
        "x-aster-discovery-credential": discoveryKey,
        "x-aster-correlation-id": correlationId,
      },
    );
    assert.equal(available.status, 200);
    assert.deepEqual(available.json, { data: { _discoverySnapshots: [null] } });
    assert.ok(logs.some((line) => line.includes("discovery_readiness_changed")));
    assert.equal(logs.join("").includes(discoveryKey), false);
    assert.equal((await service.shutdown()).outcome, "completed");
    assert.equal(primary.state.closed, true);
    assert.equal(discovery.state.closed, true);
  } finally {
    await service.shutdown();
  }
});

test("optional Redis loss changes cache readiness but not Catalog readiness", async () => {
  const primary = fixtureDatabase();
  const cache = unavailableRedis();
  const service = await createCatalogService(
    {
      ...environment,
      ASTER_CATALOG_HTTP_PORT: String(await freePort()),
      ASTER_CATALOG_CACHE_ENABLED: "true",
      REDIS_URL: "redis://127.0.0.1:6379/0",
    },
    { database: primary.database, redis: cache.redis },
  );
  try {
    assert.equal(await service.start(), "ready");
    assert.equal(service.health().readiness, "ready");
    assert.equal(await service.checkCacheReadiness(AbortSignal.timeout(100)), "unavailable");
    assert.equal(cache.state.connectCalls >= 2, true);
  } finally {
    assert.equal((await service.shutdown()).outcome, "completed");
  }
  assert.equal(cache.state.closeCalls, 1);
});

test("Catalog serves guarded GraphQL, fails readiness on dependency/authority loss, recovers and closes", async () => {
  const { database, state } = fixtureDatabase();
  const logs: string[] = [];
  const telemetry = createAsterTelemetry({
    serviceName: "catalog",
    serviceVersion: "0.0.0",
    environment: "test",
  });
  const service = await createCatalogService(
    { ...environment, ASTER_CATALOG_HTTP_PORT: String(await freePort()) },
    {
      database,
      telemetry,
      logger: createAsterLogger({
        service: "catalog",
        version: "0.0.0",
        environment: "integration",
        destination: {
          write: (line: string) => {
            logs.push(line);
          },
        },
      }),
      terminate: () => {
        assert.fail("Unexpected forced termination");
      },
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
  try {
    assert.equal(await service.start(), "ready");
    assert.equal(await service.start(), "ready");
    const response = await request("/graphql", {
      query: "query RuntimeCatalog { titles(first: 1) { edges { node { id } } } }",
      operationName: "RuntimeCatalog",
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { data: { titles: { edges: [] } } });
    const bad = await request("/graphql", {
      query: "mutation Attack { privateSecret }",
      operationName: "Attack",
    });
    assert.equal(bad.status, 400);
    await bad.body?.cancel();
    for (const cause of ["available", "allowed"] as const) {
      state[cause] = false;
      assert.equal(await service.checkReadiness(AbortSignal.timeout(2000)), "unavailable");
      const health = await request("/health/ready");
      assert.equal(health.status, 503);
      await health.body?.cancel();
      const blocked = await request("/graphql", {
        query: "query RuntimeCatalog { titles(first: 1) { edges { node { id } } } }",
        operationName: "RuntimeCatalog",
      });
      assert.equal(blocked.status, 503);
      await blocked.body?.cancel();
      const live = await request("/health/live");
      assert.equal(live.status, 200);
      await live.body?.cancel();
      state[cause] = true;
      assert.equal(await service.checkReadiness(AbortSignal.timeout(2000)), "ready");
    }
    const metrics = await telemetry.collect();
    assert.equal(metrics.status, "collected");
    assert.ok(metrics.metrics.some((metric) => metric.name.includes("http")));
    assert.ok(
      logs.some(
        (line) => line.includes("aster.catalog.graphql_completed") && line.includes("trace_id"),
      ),
    );
    assert.ok(!logs.join("").includes("privateSecret"));
    assert.equal((await service.shutdown()).outcome, "completed");
    assert.equal(state.closed, true);
    assert.equal(service.health().phase, "stopped");
  } finally {
    await service.shutdown();
  }
});

test("Catalog starts degraded without data and can stop before startup without binding a listener", async () => {
  for (const start of [true, false]) {
    const { database, state } = fixtureDatabase();
    state.available = false;
    const service = await createCatalogService(
      { ...environment, ASTER_CATALOG_HTTP_PORT: String(await freePort()) },
      {
        database,
        logger: createAsterLogger({
          service: "catalog",
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
