import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  ASTER_DEPENDENCIES,
  ASTER_DEPENDENCY_OPERATIONS,
  ASTER_DISCOVERY_RAIL_KINDS,
  ASTER_DISCOVERY_RAIL_OUTCOMES,
  ASTER_HTTP_METHODS,
  ASTER_HTTP_ROUTES,
  ASTER_METRIC_CATALOG,
  ASTER_OBSERVATION_OUTCOMES,
  ASTER_TELEMETRY_ENVIRONMENTS,
  AsterTelemetryConfigurationError,
  createAsterTelemetry,
  type AsterCollectedMetric,
} from "../src/index.js";
import { elapsedSeconds } from "../src/infrastructure/duration.js";

function metricByName(
  metrics: readonly AsterCollectedMetric[],
  name: string,
): AsterCollectedMetric {
  const metric = metrics.find((candidate) => candidate.name === name);
  assert.ok(metric, `expected metric ${name}`);
  return metric;
}

test("rejects accessors and unknown configuration without invoking them", () => {
  let invoked = false;
  const hostile = Object.defineProperty(
    {
      serviceVersion: "1.0.0",
      environment: "test",
      surprise: "not-allowed",
    },
    "serviceName",
    {
      enumerable: true,
      get: () => {
        invoked = true;
        return "hostile";
      },
    },
  );

  assert.throws(
    () => createAsterTelemetry(hostile as never),
    (error: unknown) => {
      assert.ok(error instanceof AsterTelemetryConfigurationError);
      assert.equal(error.message, "Invalid Aster telemetry configuration.");
      assert.ok(error.issues.some((issue) => issue.includes("data property")));
      assert.ok(error.issues.some((issue) => issue.includes("unsupported property")));
      assert.equal("cause" in error, false);
      return true;
    },
  );
  assert.equal(invoked, false);

  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  assert.throws(
    () => createAsterTelemetry(revoked.proxy as never),
    AsterTelemetryConfigurationError,
  );

  const excessive = Object.fromEntries(
    Array.from({ length: 100 }, (_, index) => [`unsupported-${index}`, index]),
  );
  assert.throws(
    () => createAsterTelemetry(excessive as never),
    (error: unknown) => {
      assert.ok(error instanceof AsterTelemetryConfigurationError);
      assert.ok(error.issues.length <= 16);
      assert.ok(error.issues.every((issue) => issue.length <= 100));
      return true;
    },
  );
});

test("freezes the public finite vocabularies", () => {
  for (const vocabulary of [
    ASTER_TELEMETRY_ENVIRONMENTS,
    ASTER_HTTP_METHODS,
    ASTER_HTTP_ROUTES,
    ASTER_DEPENDENCIES,
    ASTER_DEPENDENCY_OPERATIONS,
    ASTER_OBSERVATION_OUTCOMES,
    ASTER_DISCOVERY_RAIL_KINDS,
    ASTER_DISCOVERY_RAIL_OUTCOMES,
  ]) {
    assert.equal(Object.isFrozen(vocabulary), true);
  }
});

test("records bounded HTTP, dependency, process, and runtime metrics", async () => {
  const telemetry = createAsterTelemetry({
    serviceName: "contract-test",
    serviceVersion: "1.0.0",
    environment: "test",
    export: { mode: "none" },
  });

  const request = telemetry.startHttpRequest({ method: "POST", route: "/graphql" });
  assert.equal(request.status, "started");
  assert.deepEqual(request.observation.complete({ outcome: "success", statusCode: 200 }), {
    status: "completed",
  });
  assert.deepEqual(request.observation.complete({ outcome: "error", statusCode: 500 }), {
    status: "already_completed",
  });

  const dependency = telemetry.startDependencyOperation({
    dependency: "redis",
    operation: "query",
  });
  assert.equal(dependency.status, "started");
  assert.deepEqual(dependency.observation.complete({ outcome: "timeout" }), {
    status: "completed",
  });

  const collection = await telemetry.collect();
  assert.equal(collection.status, "collected");
  const httpDuration = metricByName(collection.metrics, ASTER_METRIC_CATALOG.httpDuration.name);
  assert.equal(httpDuration.unit, "s");
  assert.deepEqual(Object.keys(httpDuration.points[0]?.attributes ?? {}).sort(), [
    "aster.outcome",
    "http.request.method",
    "http.response.status_class",
    "http.route",
  ]);
  assert.deepEqual(
    { ...httpDuration.points[0]?.attributes },
    {
      "aster.outcome": "success",
      "http.request.method": "POST",
      "http.response.status_class": "2xx",
      "http.route": "/graphql",
    },
  );

  const dependencyDuration = metricByName(
    collection.metrics,
    ASTER_METRIC_CATALOG.dependencyDuration.name,
  );
  assert.deepEqual(
    { ...dependencyDuration.points[0]?.attributes },
    {
      "aster.dependency": "redis",
      "aster.operation": "query",
      "aster.outcome": "timeout",
    },
  );
  assert.equal(
    metricByName(collection.metrics, ASTER_METRIC_CATALOG.httpActive.name).points[0]?.value,
    0,
  );
  assert.equal(
    metricByName(collection.metrics, ASTER_METRIC_CATALOG.dependencyActive.name).points[0]?.value,
    0,
  );
  metricByName(collection.metrics, ASTER_METRIC_CATALOG.processCpuTime.name);
  const cpuUtilization = metricByName(
    collection.metrics,
    ASTER_METRIC_CATALOG.processCpuUtilization.name,
  );
  for (const point of cpuUtilization.points) {
    assert.equal(typeof point.value, "number");
    assert.ok((point.value as number) >= 0 && (point.value as number) <= 1);
  }
  metricByName(collection.metrics, ASTER_METRIC_CATALOG.processMemoryUsage.name);
  metricByName(collection.metrics, ASTER_METRIC_CATALOG.processUptime.name);
  assert.ok(collection.metrics.some((metric) => metric.name.startsWith("nodejs.eventloop.")));
  assert.ok(collection.metrics.some((metric) => metric.name.startsWith("v8js.memory.heap.")));

  await telemetry.lifecycleHooks().flushTelemetry(new AbortController().signal);
  assert.deepEqual(await telemetry.shutdown(), { status: "completed" });
  assert.deepEqual(await telemetry.shutdown(), { status: "already_completed" });
  assert.deepEqual(await telemetry.collect(), {
    status: "unavailable",
    reason: "telemetry_closed",
  });
});

test("bounds hostile dimensions and active observation capacity", async () => {
  const telemetry = createAsterTelemetry({
    serviceName: "bounds-test",
    serviceVersion: "1.0.0",
    environment: "test",
    maxActiveObservations: 1,
  });

  assert.deepEqual(
    telemetry.startHttpRequest({ method: "TRACE", route: "/users/secret" } as never),
    { status: "rejected", reason: "invalid_dimension" },
  );
  let invoked = false;
  const proxiedInput = new Proxy(
    { method: "GET", route: "/health/live" },
    {
      get: () => {
        invoked = true;
        throw new Error("must not read through proxy get");
      },
    },
  );
  const first = telemetry.startHttpRequest(proxiedInput as never);
  assert.equal(first.status, "started");
  assert.equal(invoked, false);
  assert.deepEqual(
    telemetry.startDependencyOperation({ dependency: "redis", operation: "probe" }),
    { status: "rejected", reason: "capacity_exceeded" },
  );
  assert.deepEqual(first.observation.complete({ outcome: "success", statusCode: 99 } as never), {
    status: "rejected",
    reason: "invalid_completion",
  });
  const proxiedCompletion = new Proxy(
    { outcome: "success", statusCode: 204 },
    {
      get: () => {
        invoked = true;
        throw new Error("must not read completion through proxy get");
      },
    },
  );
  assert.deepEqual(first.observation.complete(proxiedCompletion as never), {
    status: "completed",
  });
  assert.equal(invoked, false);
  const health = telemetry.exportHealth();
  assert.equal(health.droppedObservations, 3);
  assert.equal(Object.isFrozen(health), true);
  await telemetry.shutdown();
});

test("records bounded Discovery rail and sampled search metrics", async () => {
  const telemetry = createAsterTelemetry({
    serviceName: "discovery-metric-test",
    serviceVersion: "1.0.0",
    environment: "test",
    export: { mode: "none" },
  });
  const recordRail = telemetry.recordDiscoveryRail?.bind(telemetry);
  const recordSearchSample = telemetry.recordDiscoverySearchSample?.bind(telemetry);
  assert.ok(recordRail);
  assert.ok(recordSearchSample);

  assert.deepEqual(
    recordRail({
      kind: "featured",
      outcome: "completed",
      durationMs: 25,
      freshnessSeconds: 12,
    }),
    { status: "recorded" },
  );
  assert.deepEqual(recordSearchSample({ resultCount: 6, topRank: 600_000 }), {
    status: "recorded",
  });
  assert.deepEqual(
    recordRail({
      kind: "secret-title",
      outcome: "completed",
      durationMs: 25,
    } as never),
    { status: "rejected", reason: "invalid_dimension" },
  );

  const collection = await telemetry.collect();
  assert.equal(collection.status, "collected");
  const duration = metricByName(
    collection.metrics,
    ASTER_METRIC_CATALOG.discoveryRailDuration.name,
  );
  assert.deepEqual(
    { ...duration.points[0]?.attributes },
    {
      "aster.discovery.rail": "featured",
      "aster.outcome": "completed",
    },
  );
  const freshness = metricByName(
    collection.metrics,
    ASTER_METRIC_CATALOG.discoveryRailFreshness.name,
  );
  assert.deepEqual(
    { ...freshness.points[0]?.attributes },
    {
      "aster.discovery.rail": "featured",
    },
  );
  const quality = metricByName(
    collection.metrics,
    ASTER_METRIC_CATALOG.discoverySearchQualitySamples.name,
  );
  assert.deepEqual(
    { ...quality.points[0]?.attributes },
    {
      "aster.discovery.result_bucket": "six_to_twenty",
      "aster.discovery.top_rank_bucket": "high",
    },
  );
  assert.ok(
    collection.metrics.every((metric) =>
      metric.points.every((point) =>
        Object.keys(point.attributes).every(
          (key) => !key.includes("query") && !key.includes("title") && !key.includes("profile"),
        ),
      ),
    ),
  );
  assert.equal(telemetry.exportHealth().droppedObservations, 1);
  await telemetry.shutdown();
});

test("records finite cache outcomes, latency, payload and waiter buckets", async () => {
  const telemetry = createAsterTelemetry({
    serviceName: "cache-metric-test",
    serviceVersion: "1.0.0",
    environment: "test",
  });
  const record = telemetry.recordCacheOperation?.bind(telemetry);
  assert.ok(record);
  assert.deepEqual(
    record({
      cache: "catalog_public_title",
      outcome: "coalesced",
      durationMs: 12,
      payloadBytes: 4_096,
      waiterBucket: "two_to_four",
    }),
    { status: "recorded" },
  );
  assert.deepEqual(
    record({ cache: "discovery_rail", outcome: "stale_hit", durationMs: 2, payloadBytes: 512 }),
    { status: "recorded" },
  );
  assert.deepEqual(record({ cache: "discovery_rail", outcome: "refresh_failed", durationMs: 20 }), {
    status: "recorded",
  });
  assert.deepEqual(
    record({
      cache: "catalog_public_title",
      outcome: "hit",
      durationMs: 1,
      waiterBucket: "five_plus",
    }),
    { status: "rejected", reason: "invalid_dimension" },
  );

  const collection = await telemetry.collect();
  assert.equal(collection.status, "collected");
  const outcomes = metricByName(collection.metrics, ASTER_METRIC_CATALOG.cacheOutcomes.name);
  const outcomeAttributes = outcomes.points.map((point) => ({ ...point.attributes }));
  assert.ok(
    outcomeAttributes.some(
      (attributes) =>
        attributes["aster.cache"] === "catalog_public_title" &&
        attributes["aster.outcome"] === "coalesced" &&
        attributes["aster.cache.waiters"] === "two_to_four",
    ),
  );
  assert.ok(
    outcomeAttributes.some(
      (attributes) =>
        attributes["aster.cache"] === "discovery_rail" &&
        attributes["aster.outcome"] === "stale_hit" &&
        attributes["aster.cache.waiters"] === undefined,
    ),
  );
  assert.ok(
    outcomeAttributes.some(
      (attributes) =>
        attributes["aster.cache"] === "discovery_rail" &&
        attributes["aster.outcome"] === "refresh_failed",
    ),
  );
  const payload = metricByName(collection.metrics, ASTER_METRIC_CATALOG.cachePayloadBytes.name);
  assert.equal(
    payload.points.reduce((count, point) => count + (point.value as { count: number }).count, 0),
    2,
  );
  assert.equal(telemetry.exportHealth().droppedObservations, 1);
  await telemetry.shutdown();
});

test("aggregates finite series beyond the configured cardinality ceiling", async () => {
  const telemetry = createAsterTelemetry({
    serviceName: "cardinality-test",
    serviceVersion: "1.0.0",
    environment: "test",
    cardinalityLimit: 16,
  });

  for (const method of ASTER_HTTP_METHODS) {
    for (const route of ASTER_HTTP_ROUTES) {
      const observation = telemetry.startHttpRequest({ method, route });
      assert.equal(observation.status, "started");
      observation.observation.complete({ outcome: "success", statusCode: 200 });
    }
  }

  const collection = await telemetry.collect();
  assert.equal(collection.status, "collected");
  const duration = metricByName(collection.metrics, ASTER_METRIC_CATALOG.httpDuration.name);
  assert.ok(duration.points.length <= 16);
  assert.ok(duration.points.some((point) => point.attributes["otel.metric.overflow"] === true));
  await telemetry.shutdown();
});

test("uses an explicit monotonic duration rule", () => {
  assert.equal(elapsedSeconds(1_000_000_000n, 2_500_000_000n), 1.5);
  assert.equal(elapsedSeconds(2n, 1n), undefined);
  assert.equal(elapsedSeconds(-1n, 1n), undefined);
});

test("bounds a stalled OTLP exporter and records export health", async () => {
  const server = createServer(() => undefined);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  if (address === null || typeof address === "string") {
    throw new Error("Expected an ephemeral TCP address.");
  }

  const telemetry = createAsterTelemetry({
    serviceName: "export-test",
    serviceVersion: "1.0.0",
    environment: "test",
    export: {
      mode: "otlp-http",
      endpoint: `http://127.0.0.1:${address.port}/v1/metrics`,
      intervalMs: 1_000,
      timeoutMs: 50,
    },
    shutdownTimeoutMs: 500,
  });
  const dependency = telemetry.startDependencyOperation({
    dependency: "telemetry",
    operation: "export",
  });
  if (dependency.status === "started") {
    dependency.observation.complete({ outcome: "success" });
  }

  const started = performance.now();
  const ownerFlush = telemetry.forceFlush();
  const lifecycleFlush = telemetry.lifecycleHooks().flushTelemetry(new AbortController().signal);
  const joinedController = new AbortController();
  const joinedFlush = telemetry.forceFlush(joinedController.signal);
  joinedController.abort();
  assert.deepEqual(await joinedFlush, { status: "aborted" });
  assert.ok(performance.now() - started < 100);
  assert.deepEqual(await ownerFlush, { status: "failed" });
  await assert.rejects(lifecycleFlush, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "Telemetry flush did not complete.");
    assert.equal("cause" in error, false);
    assert.equal(error.message.includes(String(address.port)), false);
    return true;
  });
  assert.ok(performance.now() - started < 1_000);
  assert.deepEqual(await telemetry.collect(), { status: "unavailable", reason: "remote_export" });
  assert.deepEqual(telemetry.exportHealth(), {
    attempts: 1,
    successes: 0,
    failures: 1,
    droppedObservations: telemetry.exportHealth().droppedObservations,
    lastResult: "failure",
  });
  assert.ok(telemetry.exportHealth().droppedObservations > 0);

  await telemetry.shutdown();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
    server.closeAllConnections();
  });
});

test("exports successfully and shares concurrent bounded shutdown", async () => {
  let receivedRequests = 0;
  const server = createServer((request, response) => {
    receivedRequests += 1;
    request.resume();
    response.statusCode = 200;
    response.end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected an ephemeral TCP address.");
  }

  const telemetry = createAsterTelemetry({
    serviceName: "export-success-test",
    serviceVersion: "1.0.0",
    environment: "test",
    export: {
      mode: "otlp-http",
      endpoint: `http://127.0.0.1:${address.port}/v1/metrics`,
      intervalMs: 1_000,
      timeoutMs: 250,
    },
    shutdownTimeoutMs: 500,
  });

  const firstFlush = telemetry.forceFlush();
  const secondFlush = telemetry.forceFlush();
  assert.deepEqual(await Promise.all([firstFlush, secondFlush]), [
    { status: "completed" },
    { status: "completed" },
  ]);
  assert.equal(receivedRequests, 1);
  assert.deepEqual(telemetry.exportHealth(), {
    attempts: 1,
    successes: 1,
    failures: 0,
    droppedObservations: 0,
    lastResult: "success",
  });

  const abortController = new AbortController();
  abortController.abort();
  assert.deepEqual(await telemetry.forceFlush(abortController.signal), { status: "aborted" });
  await assert.rejects(
    telemetry.lifecycleHooks().flushTelemetry(abortController.signal),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "Telemetry flush did not complete.");
      assert.equal("cause" in error, false);
      return true;
    },
  );

  const firstShutdown = telemetry.shutdown();
  const secondShutdown = telemetry.shutdown();
  const joinedShutdownController = new AbortController();
  const joinedShutdown = telemetry.shutdown(joinedShutdownController.signal);
  joinedShutdownController.abort();
  assert.deepEqual(await joinedShutdown, { status: "aborted" });
  assert.deepEqual(await Promise.all([firstShutdown, secondShutdown]), [
    { status: "completed" },
    { status: "completed" },
  ]);
  assert.deepEqual(await telemetry.shutdown(), { status: "already_completed" });

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
    server.closeAllConnections();
  });
});

test("keeps the generated public declaration free of infrastructure types", async () => {
  const declaration = await readFile(new URL("../src/index.d.ts", import.meta.url), "utf8");
  for (const forbidden of [
    "@opentelemetry/",
    "express",
    "apollo",
    "postgres",
    "redis",
    "kafka",
    "object-storage",
  ]) {
    assert.equal(declaration.toLowerCase().includes(forbidden), false, forbidden);
  }
});
