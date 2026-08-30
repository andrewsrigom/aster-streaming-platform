import assert from "node:assert/strict";
import test from "node:test";
import {
  discoveryRuntimeConfiguration,
  localDiscoveryDatabase,
} from "../src/infrastructure/runtime-configuration.js";

const runtime = {
  ASTER_ENVIRONMENT: "local",
  ASTER_DISCOVERY_LOCAL_ENABLED: "true",
  ASTER_ROUTER_TRUST_ENABLED: "true",
  ASTER_EVENTS_ENABLED: "true",
  ASTER_DISCOVERY_HTTP_HOST: "0.0.0.0",
  ASTER_DISCOVERY_HTTP_PORT: "3500",
  ASTER_DISCOVERY_DATABASE_URL: "postgresql://aster_discovery_local@postgres:5432/aster",
  ASTER_DISCOVERY_DATABASE_PASSWORD: "runtime-test",
  ASTER_DISCOVERY_PROJECTOR_DATABASE_URL:
    "postgresql://aster_discovery_projector_local@postgres:5432/aster",
  ASTER_DISCOVERY_PROJECTOR_DATABASE_PASSWORD: "projector-test",
  ASTER_DISCOVERY_CACHE_ENABLED: "true",
  REDIS_URL: "redis://redis:6379/0",
};

test("runtime configuration keeps read and projector credentials purpose-separated", () => {
  const config = discoveryRuntimeConfiguration(runtime);
  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.port, 3500);
  assert.equal(new URL(config.connectionString).username, "aster_discovery_local");
  assert.equal(
    new URL(config.projectorConnectionString).username,
    "aster_discovery_projector_local",
  );
  assert.equal(new URL(config.connectionString).password, "runtime-test");
  assert.equal(new URL(config.projectorConnectionString).password, "projector-test");
  assert.equal(config.cache, true);
  assert.equal(config.redisUrl, "redis://redis:6379/0");
  assert.equal(
    discoveryRuntimeConfiguration({
      ...runtime,
      ASTER_OTLP_METRICS_ENDPOINT: "http://collector:4318/v1/metrics",
    }).otlpMetricsEndpoint,
    "http://collector:4318/v1/metrics",
  );
  assert.equal(
    new URL(
      localDiscoveryDatabase(
        {
          ASTER_ENVIRONMENT: "local",
          ASTER_DISCOVERY_MIGRATION_ENABLED: "true",
          ASTER_DISCOVERY_ADMIN_DATABASE_URL: "postgresql://aster@127.0.0.1:5432/aster",
          ASTER_DISCOVERY_ADMIN_DATABASE_PASSWORD: "admin-test",
        },
        "migration",
      ),
    ).username,
    "aster",
  );
});

test("runtime rejects disabled trust/events, foreign endpoints and unsupported knobs", () => {
  for (const changed of [
    { ASTER_ENVIRONMENT: "hosted" },
    { ASTER_DISCOVERY_LOCAL_ENABLED: "false" },
    { ASTER_ROUTER_TRUST_ENABLED: "false" },
    { ASTER_EVENTS_ENABLED: "false" },
    { ASTER_DISCOVERY_HTTP_HOST: "example.com" },
    { ASTER_DISCOVERY_HTTP_PORT: "80" },
    { ASTER_DISCOVERY_CACHE_ENABLED: "sometimes" },
    { ASTER_DISCOVERY_CACHE_ENABLED: "true", REDIS_URL: "" },
    { ASTER_DISCOVERY_DATABASE_URL: "postgresql://aster@postgres:5432/aster" },
    {
      ASTER_DISCOVERY_PROJECTOR_DATABASE_URL:
        "postgresql://aster_discovery_projector_local@example.com:5432/aster",
    },
    { ASTER_DISCOVERY_UNKNOWN: "true" },
    { ASTER_OTLP_METRICS_ENDPOINT: " http://collector:4318/v1/metrics" },
  ]) {
    assert.throws(() => discoveryRuntimeConfiguration({ ...runtime, ...changed }));
  }
});

test("runtime keeps Redis optional and explicitly disabled", () => {
  const config = discoveryRuntimeConfiguration({
    ...runtime,
    ASTER_DISCOVERY_CACHE_ENABLED: "false",
    REDIS_URL: undefined,
  });
  assert.equal(config.cache, false);
  assert.equal("redisUrl" in config, false);
});

test("database configuration rejects embedded secrets, query options and controls", () => {
  for (const changed of [
    { ASTER_DISCOVERY_DATABASE_URL: "postgresql://aster_discovery_local:secret@postgres/aster" },
    { ASTER_DISCOVERY_DATABASE_URL: "postgresql://aster_discovery_local@postgres/other" },
    { ASTER_DISCOVERY_DATABASE_URL: "postgresql://aster_discovery_local@postgres/aster?ssl=0" },
    { ASTER_DISCOVERY_DATABASE_PASSWORD: "bad\nsecret" },
  ]) {
    assert.throws(() => localDiscoveryDatabase({ ...runtime, ...changed }, "runtime"));
  }
});
