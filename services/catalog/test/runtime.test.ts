import assert from "node:assert/strict";
import { createServer } from "node:net";
import { test } from "node:test";
import type { AsterPostgresAdapter } from "@aster/postgres";
import { createAsterLogger } from "@aster/runtime";
import { createAsterTelemetry } from "@aster/telemetry";
import { createCatalogService } from "../src/create-service.js";
import { catalogRuntimeConfiguration } from "../src/infrastructure/runtime-configuration.js";

const environment = {
  ASTER_ENVIRONMENT: "local",
  ASTER_CATALOG_LOCAL_ENABLED: "true",
  ASTER_CATALOG_READER_DATABASE_URL: "postgresql://aster_catalog_reader_local@127.0.0.1:5432/aster",
  ASTER_CATALOG_READER_DATABASE_PASSWORD: "aster-test-only",
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

test("Catalog runtime configuration rejects hosted, privileged and malformed local settings", () => {
  assert.equal(catalogRuntimeConfiguration(environment).port, 3200);
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
    { ASTER_CATALOG_READER_DATABASE_PASSWORD: "" },
  ]) {
    assert.throws(() => catalogRuntimeConfiguration({ ...environment, ...change }));
  }
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
