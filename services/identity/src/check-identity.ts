import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";

import { createAsterLogger, createAsterReadinessMonitor } from "@aster/runtime";
import { ASTER_METRIC_CATALOG, createAsterTelemetry, type AsterTelemetry } from "@aster/telemetry";

import { createIdentityServiceWithFactories } from "./create-service.js";
import { createAsterIdentityRuntimeWithMonitor } from "./reference-runtime.js";
import { createIdentityHttpServer, type IdentityHttpServer } from "./transport/http-server.js";

let dependencyReady = false;
let dependencyCalls = 0;
let redisCalls = 0;
const dependency = {
  connect() {
    dependencyCalls += 1;
    return Promise.resolve({ status: dependencyReady ? "completed" : "unavailable" });
  },
  probe() {
    dependencyCalls += 1;
    return Promise.resolve({ status: dependencyReady ? "completed" : "unavailable" });
  },
  close: () => Promise.resolve({ status: "completed" }),
};
const optionalRedis = {
  connect() {
    redisCalls += 1;
    return Promise.resolve({ status: "unavailable" });
  },
  probe() {
    redisCalls += 1;
    return Promise.resolve({ status: "unavailable" });
  },
  close: () => Promise.resolve({ status: "completed" }),
};
let http: IdentityHttpServer | undefined;
let telemetry: AsterTelemetry | undefined;
const service = await createIdentityServiceWithFactories(
  [
    ["ASTER_ENV", "integration"],
    ["ASTER_HTTP_HOST", "127.0.0.1"],
    ["ASTER_HTTP_PORT", "3100"],
    ["ASTER_SERVICE_NAME", "identity-check"],
    ["ASTER_STARTUP_DEADLINE_MS", "5000"],
    ["DATABASE_URL", "postgresql://localhost/controlled"],
    ["REDIS_URL", "redis://localhost/0"],
  ],
  {
    logger: (options) => createAsterLogger({ ...options, destination: { write: () => undefined } }),
    postgresql: () => dependency,
    redis: () => optionalRedis,
    telemetry: (options) => {
      telemetry = createAsterTelemetry(options);
      return telemetry;
    },
    http: (options) => {
      http = createIdentityHttpServer({ ...options, port: 0 });
      return http;
    },
    runtime: (options) =>
      createAsterIdentityRuntimeWithMonitor(options, (monitor) =>
        createAsterReadinessMonitor({ ...monitor, intervalMs: 100, probeTimeoutMs: 100 }),
      ),
  },
);

try {
  assert.deepEqual(await service.start(), { status: "started", readiness: "not_ready" });
  const port = http?.port();
  assert.ok(port);
  const checkHealth = async (expected: "ready" | "not_ready"): Promise<void> => {
    for (const route of ["live", "ready"] as const) {
      const response = await fetch(`http://127.0.0.1:${port}/health/${route}`, {
        signal: AbortSignal.timeout(1_000),
        headers: { connection: "close" },
      });
      assert.equal(response.status, route === "live" || expected === "ready" ? 200 : 503);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), service.health());
    }
  };
  await checkHealth("not_ready");
  for (const expected of ["ready", "not_ready", "ready"] as const) {
    dependencyReady = expected === "ready";
    const deadline = performance.now() + 2_000;
    while (service.health().readiness !== expected) {
      assert.ok(performance.now() < deadline, "Controlled readiness transition exceeded deadline.");
      await setTimeout(10);
    }
    await checkHealth(expected);
  }
  assert.ok(dependencyCalls >= 6);
  assert.equal(redisCalls, 0);
  assert.ok(telemetry);
  const collection = await telemetry.collect();
  assert.equal(collection.status, "collected");
  assert.ok(
    collection.metrics.some((metric) => metric.name === ASTER_METRIC_CATALOG.httpDuration.name),
  );
  const result = await service.shutdown();
  assert.equal(result.outcome, "completed");
  assert.deepEqual(result.failedStages, []);
  assert.equal(http?.port(), undefined);
  process.stdout.write(
    `${JSON.stringify({
      event: "identity_diagnostic_passed",
      dependencyMode: "controlled",
      healthStatesChecked: 4,
      httpMetrics: "collected",
      shutdown: result.outcome,
    })}\n`,
  );
} finally {
  await service.shutdown();
}
