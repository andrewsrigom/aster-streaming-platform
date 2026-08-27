import assert from "node:assert/strict";

import { createAsterPostgresAdapter, type AsterPostgresAdapter } from "@aster/postgres";
import { createAsterRedisAdapter, type AsterRedisAdapter } from "@aster/redis";
import { createAsterTelemetry, type AsterTelemetry } from "@aster/telemetry";

import { createIdentityServiceWithFactories } from "../../src/create-service.js";
import {
  createIdentityHttpServer,
  type IdentityHttpServer,
} from "../../src/transport/http-server.js";
import { configurationEntries, silentLogger } from "../fixtures.js";
import { eventually } from "./docker-fixture.js";
import { httpProbe } from "./http-probe.js";
import { change } from "./worker-control.js";

const [postgresPort, redisPort, collectorPort, prometheusPort] = process.argv.slice(3).map(Number);
for (const port of [postgresPort, redisPort, collectorPort, prometheusPort]) {
  assert.ok(port && Number.isSafeInteger(port) && port >= 1024 && port <= 65535);
}
assert.ok(collectorPort && prometheusPort);
const databaseUrl = new URL(`postgresql://127.0.0.1:${postgresPort}/aster`);
databaseUrl.username = "aster";
databaseUrl.password = "aster-test-only";

function output(event: string, details: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({ event, ...details })}\n`);
}

function record(value: unknown): Record<string, unknown> {
  assert.ok(typeof value === "object" && value !== null && !Array.isArray(value));
  return value as Record<string, unknown>;
}

type Sample = Readonly<{ metric: Record<string, unknown>; value: number }>;

async function query(expression: string): Promise<Sample[]> {
  const response = await httpProbe(
    prometheusPort as number,
    `/api/v1/query?query=${encodeURIComponent(expression)}&timeout=500ms`,
  );
  assert.equal(response.status, 200);
  const body = record(JSON.parse(response.body) as unknown);
  assert.equal(body["status"], "success");
  const data = record(body["data"]);
  assert.equal(data["resultType"], "vector");
  const results = data["result"];
  assert.ok(Array.isArray(results) && results.length <= 2_000);
  return results.map((result: unknown) => {
    const item = record(result);
    const value = item["value"];
    assert.ok(Array.isArray(value) && value.length === 2 && typeof value[1] === "string");
    return { metric: record(item["metric"]), value: Number(value[1]) };
  });
}

const readyCount = 'http_server_request_duration_seconds_count{http_route="/health/ready"}';

async function run(): Promise<void> {
  await eventually("OTLP receiver ready", async () =>
    httpProbe(collectorPort as number, "/v1/metrics", "{}")
      .then((response) => response.status === 200)
      .catch(() => false),
  );
  let telemetry: AsterTelemetry | undefined;
  let postgresql: AsterPostgresAdapter | undefined;
  let redis: AsterRedisAdapter | undefined;
  let http: IdentityHttpServer | undefined;
  const service = await createIdentityServiceWithFactories(
    configurationEntries.map(([name, value]) => [
      name,
      name === "DATABASE_URL"
        ? databaseUrl.toString()
        : name === "REDIS_URL"
          ? `redis://127.0.0.1:${redisPort}/0`
          : value,
    ]),
    {
      logger: silentLogger,
      telemetry: (options) => {
        telemetry = createAsterTelemetry({
          ...options,
          export: {
            mode: "otlp-http",
            endpoint: `http://127.0.0.1:${collectorPort}/v1/metrics`,
            intervalMs: 60_000,
            timeoutMs: 300,
          },
          shutdownTimeoutMs: 1_000,
        });
        return telemetry;
      },
      postgresql: (options) => {
        postgresql = createAsterPostgresAdapter(options);
        return postgresql;
      },
      redis: (options) => {
        redis = createAsterRedisAdapter(options);
        return redis;
      },
      http: (options) => {
        http = createIdentityHttpServer({ ...options, port: 0 });
        return http;
      },
    },
  );
  assert.ok(telemetry && postgresql && redis);
  const metrics = telemetry;
  async function healthy(): Promise<void> {
    const port = http?.port();
    assert.ok(port);
    for (const path of ["live", "ready"]) {
      const response = await httpProbe(port, `/health/${path}`);
      assert.equal(response.status, 200);
      assert.doesNotMatch(response.body, /postgres|redis|collector|prometheus|aster-test-only/);
    }
    assert.equal(service.health().readiness, "ready");
  }
  async function flushed(): Promise<void> {
    assert.deepEqual(await metrics.forceFlush(), { status: "completed" });
    assert.equal(metrics.exportHealth().lastResult, "success");
  }
  try {
    assert.deepEqual(await service.start(), { status: "started", readiness: "ready" });
    await healthy();
    await flushed();
    await eventually(
      "HTTP histogram scraped",
      async () => (await query(readyCount))[0]?.value === 1,
    );
    await eventually("Event-loop delay sampled and scraped", async () => {
      await flushed();
      const delay = (await query("nodejs_eventloop_delay_p99_seconds"))[0]?.value;
      return delay !== undefined && Number.isFinite(delay) && delay > 0;
    });
    const samples = await query('{job="aster-integration"}');
    const names = [...new Set(samples.map((sample) => sample.metric["__name__"]))].sort();
    assert.ok(names.includes("process_memory_usage_bytes"));
    assert.ok(names.includes("process_cpu_time_seconds_total"));
    assert.ok(names.includes("nodejs_eventloop_delay_p99_seconds"));
    assert.ok(
      names.some((name) => typeof name === "string" && name.startsWith("nodejs_eventloop_")),
    );
    assert.ok(
      names.some((name) => typeof name === "string" && name.startsWith("v8js_memory_heap_")),
    );
    for (const dependency of ["postgresql", "redis"]) {
      assert.ok(
        samples.some(
          (sample) =>
            sample.metric["__name__"] === "aster_dependency_operation_outcomes_total" &&
            sample.metric["aster_dependency"] === dependency &&
            sample.metric["aster_outcome"] === "success" &&
            sample.value >= 1,
        ),
      );
    }
    const buckets = samples.filter(
      (sample) =>
        sample.metric["__name__"] === "http_server_request_duration_seconds_bucket" &&
        sample.metric["http_route"] === "/health/ready",
    );
    assert.equal(buckets.length, 15);
    assert.ok(buckets.some((sample) => sample.metric["le"] === "+Inf" && sample.value === 1));
    assert.doesNotMatch(
      JSON.stringify(samples),
      /aster-test-only|127\.0\.0\.1|postgresql:\/\/|redis:\/\//,
    );
    output("otlp_prometheus_round_trip", {
      outcome: "passed",
      series: samples.length,
      metricNames: names,
    });

    await change("prometheus", "stop");
    await healthy();
    await flushed();
    output("scrape_backend_down", { readiness: "ready", export: "success" });
    await change("prometheus", "start");
    await eventually(
      "Scrape backend recovers",
      async () => (await query(readyCount))[0]?.value === 2,
    );

    await change("collector", "stop");
    const unavailableStarted = performance.now();
    assert.deepEqual(await metrics.forceFlush(), { status: "failed" });
    const unavailableMs = Math.round(performance.now() - unavailableStarted);
    assert.ok(unavailableMs < 1_500);
    assert.equal(metrics.exportHealth().lastResult, "failure");
    assert.ok(metrics.exportHealth().droppedObservations > 0);
    await healthy();
    await eventually(
      "Collector scrape down",
      async () => (await query('up{job="aster-integration"}'))[0]?.value === 0,
    );
    await change("collector", "start");
    await flushed();
    await eventually(
      "Collector recovers cumulative metrics",
      async () => (await query(readyCount))[0]?.value === 3,
    );
    output("collector_stop_recovery", {
      readiness: "ready",
      unavailableFlushMs: unavailableMs,
      recoveredCount: 3,
    });

    await change("collector", "pause");
    const timeoutStarted = performance.now();
    const ownerFlush = metrics.forceFlush();
    const controller = new AbortController();
    const joinedFlush = metrics.forceFlush(controller.signal);
    controller.abort();
    assert.deepEqual(await joinedFlush, { status: "aborted" });
    assert.deepEqual(await ownerFlush, { status: "failed" });
    const timeoutMs = Math.round(performance.now() - timeoutStarted);
    assert.ok(timeoutMs < 1_500);
    await healthy();
    await change("collector", "unpause");
    await flushed();
    output("collector_deadline_cancellation", { outcome: "passed", flushMs: timeoutMs });

    await change("collector", "stop");
    await healthy();
    const shutdownStarted = performance.now();
    const result = await service.shutdown();
    const shutdownMs = Math.round(performance.now() - shutdownStarted);
    assert.equal(result.outcome, "degraded");
    assert.deepEqual(result.failedStages, ["flush_telemetry"]);
    assert.ok(shutdownMs < 10_000);
    assert.equal(postgresql.snapshot().state, "closed");
    assert.equal(postgresql.snapshot().totalConnections, 0);
    assert.equal(redis.snapshot().state, "closed");
    assert.equal(redis.snapshot().open, false);
    assert.deepEqual(await metrics.shutdown(), { status: "already_completed" });
    assert.deepEqual(await service.shutdown(), result);
    output("exporter_down_shutdown", {
      outcome: result.outcome,
      failedStages: result.failedStages,
      durationMs: shutdownMs,
      connections: 0,
    });
  } finally {
    await service.shutdown();
  }
}

await run().catch((error: unknown) => {
  if (error instanceof assert.AssertionError) {
    output("assertion_failed", {
      message: error.message.slice(0, 2_048),
      operator: error.operator,
      stack: error.stack
        ?.split("\n")
        .filter((line) => line.includes("telemetry-worker.js"))
        .slice(0, 2),
    });
  } else if (error instanceof Error) {
    output("scenario_failed", { name: error.name, message: error.message.slice(0, 512) });
  }
  throw new Error("Telemetry integration scenario failed.");
});
process.disconnect();
process.once("beforeExit", () => {
  output("natural_exit", { mode: "telemetry" });
});
