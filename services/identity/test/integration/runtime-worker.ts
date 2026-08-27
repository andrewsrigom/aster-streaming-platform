import assert from "node:assert/strict";
import { createServer } from "node:http";

import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";

import { createAsterKafkaBrokerAdapter } from "@aster/broker-kafka";
import { createExpressHttpAdapter } from "@aster/http-express";
import { createAsterObjectStorageAdapter } from "@aster/object-storage-s3";
import { createAsterPostgresAdapter } from "@aster/postgres";
import { createAsterRedisAdapter } from "@aster/redis";
import {
  bindAsterProcessSignals,
  createAsterNodeHttpLifecycleHooks,
  createAsterServiceLifecycle,
} from "@aster/runtime";
import { createAsterTelemetry } from "@aster/telemetry";

import { eventually } from "./docker-fixture.js";
import { httpProbe } from "./http-probe.js";

const [postgresPort, redisPort, brokerPort, storagePort, collectorPort, prometheusPort] =
  process.argv.slice(3).map(Number);
for (const port of [
  postgresPort,
  redisPort,
  brokerPort,
  storagePort,
  collectorPort,
  prometheusPort,
]) {
  assert.ok(port && Number.isSafeInteger(port) && port >= 1024 && port <= 65535);
}
const databaseUrl = new URL(`postgresql://127.0.0.1:${postgresPort}/aster`);
databaseUrl.username = "aster";
databaseUrl.password = "aster-test-only";

function output(event: string, details: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({ event, ...details })}\n`);
}

// Synthetic composition of shared packages, not new broker/storage dependencies of Identity.
async function run(): Promise<void> {
  const telemetry = createAsterTelemetry({
    serviceName: "integration-runtime",
    serviceVersion: "0.0.0",
    environment: "test",
    export: {
      mode: "otlp-http",
      endpoint: `http://127.0.0.1:${collectorPort}/v1/metrics`,
      intervalMs: 60_000,
      timeoutMs: 500,
    },
    shutdownTimeoutMs: 1_000,
  });
  const postgresql = createAsterPostgresAdapter({
    connectionString: databaseUrl.toString(),
    telemetry,
    maxConnections: 1,
  });
  const redis = createAsterRedisAdapter({
    url: `redis://127.0.0.1:${redisPort}/0`,
    telemetry,
    maxInFlightCommands: 1,
  });
  const broker = createAsterKafkaBrokerAdapter({
    brokers: [`127.0.0.1:${brokerPort}`],
    clientId: "aster-runtime",
    groupId: "aster-runtime",
    telemetry,
    maxInFlightPublishes: 1,
    maxMessageBytes: 1_024,
    closeTimeoutMs: 3_000,
  });
  const endpoint = `http://127.0.0.1:${storagePort}`;
  const bucket = "aster-runtime-fixtures";
  const credentials = { accessKeyId: "aster-test-access", secretAccessKey: "aster-test-only" };
  const storage = createAsterObjectStorageAdapter({
    endpoint,
    region: "us-east-1",
    bucket,
    ...credentials,
    telemetry,
    maxInFlightOperations: 1,
    maxObjectBytes: 1_024,
    operationTimeoutMs: 2_000,
    closeTimeoutMs: 2_000,
  });
  const initializer = new S3Client({
    endpoint,
    region: "us-east-1",
    credentials,
    forcePathStyle: true,
    maxAttempts: 1,
    requestHandler: new NodeHttpHandler({ connectionTimeout: 500, requestTimeout: 2_000 }),
  });
  let completeRequest: (() => void) | undefined;
  let responseFinished = false;
  const stages: string[] = [];
  const adapter = createExpressHttpAdapter({ healthSnapshotProvider: () => lifecycle.health() });
  const server = createServer(
    { requestTimeout: 2_000, headersTimeout: 2_000 },
    adapter.requestListener,
  );
  server.maxConnections = 2;
  const http = createAsterNodeHttpLifecycleHooks(server);
  const lifecycle = createAsterServiceLifecycle({
    shutdownDeadlineMs: 10_000,
    stopTraffic: http.stopTraffic,
    stopConsumers: async (signal) => {
      assert.equal(responseFinished, true);
      await broker.lifecycleHooks().stopConsumers(signal);
      stages.push("consumers");
    },
    flushTelemetry: async (signal) => {
      assert.equal(responseFinished, true);
      assert.deepEqual(stages, ["consumers"]);
      assert.equal((await telemetry.forceFlush(signal)).status, "completed");
      stages.push("flush");
    },
    closeDependencies: async (signal) => {
      assert.deepEqual(stages, ["consumers", "flush"]);
      const closed = await Promise.all([
        postgresql.close(signal),
        redis.close(signal),
        broker.close(signal),
        storage.close(signal),
      ]);
      assert.ok(closed.every((result) => result.status === "completed"));
      stages.push("adapters");
      assert.equal((await telemetry.shutdown(signal)).status, "completed");
      stages.push("telemetry");
    },
    forceClose: () => {
      http.forceClose();
      throw new Error("Integration required forced resource closure");
    },
  });
  const signals = bindAsterProcessSignals(lifecycle);
  adapter.mountGraphql((_request, response) => {
    const lease = lifecycle.tryBeginWork();
    assert.ok(lease);
    const observation = telemetry.startHttpRequest({ method: "POST", route: "/graphql" });
    assert.equal(observation.status, "started");
    response.once("finish", () => {
      responseFinished = true;
      observation.observation.complete({ statusCode: 200, outcome: "success" });
      lease.complete();
    });
    completeRequest = () => {
      completeRequest = undefined;
      response.status(200).json({ fixture: "completed" });
    };
  });
  try {
    await initializer.send(new CreateBucketCommand({ Bucket: bucket }), {
      abortSignal: AbortSignal.timeout(2_000),
    });
    initializer.destroy();
    assert.equal((await postgresql.connect()).status, "completed");
    assert.equal((await postgresql.probe()).status, "completed");
    assert.equal((await redis.connect()).status, "completed");
    assert.equal((await redis.probe()).status, "completed");
    assert.equal((await broker.connect()).status, "completed");
    assert.equal((await storage.probe()).status, "completed");
    assert.equal((await telemetry.forceFlush()).status, "completed");
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    assert.equal(lifecycle.markReady(), "applied");
    const response = httpProbe(address.port, "/graphql", '{"fixture":"hold"}');
    void response.catch(() => undefined);
    await eventually("All-adapter HTTP accepted", () => completeRequest !== undefined, 500);
    const started = performance.now();
    process.kill(process.pid, "SIGTERM");
    await eventually(
      "All-adapter HTTP draining",
      () => lifecycle.health().phase === "draining",
      500,
    );
    assert.equal(lifecycle.tryBeginWork(), undefined);
    assert.equal(lifecycle.health().readiness, "not_ready");
    assert.deepEqual(stages, []);
    assert.equal(postgresql.snapshot().state, "open");
    assert.equal(redis.snapshot().open, true);
    assert.equal(broker.snapshot().state, "ready");
    assert.equal(storage.snapshot().state, "open");
    completeRequest?.();
    assert.deepEqual(await response, { status: 200, body: '{"fixture":"completed"}' });
    const result = await lifecycle.shutdown();
    const durationMs = Math.round(performance.now() - started);
    assert.deepEqual(result, { trigger: "sigterm", outcome: "completed", failedStages: [] });
    assert.ok(durationMs < 10_000);
    assert.deepEqual(stages, ["consumers", "flush", "adapters", "telemetry"]);
    assert.equal(postgresql.snapshot().totalConnections, 0);
    assert.equal(postgresql.snapshot().state, "closed");
    assert.equal(redis.snapshot().open, false);
    assert.equal(redis.snapshot().state, "closed");
    assert.deepEqual(broker.snapshot(), {
      state: "closed",
      consumerState: "idle",
      inFlightPublishes: 0,
      inFlightHandlers: 0,
    });
    assert.deepEqual(storage.snapshot(), { state: "closed", inFlightOperations: 0 });
    assert.equal((await telemetry.shutdown()).status, "already_completed");
    assert.equal(server.listening, false);
    await eventually("Final drained HTTP metric scraped", async () => {
      const query = 'sum(http_server_request_duration_seconds_count{http_route="/graphql"})';
      const scraped = await httpProbe(
        prometheusPort as number,
        `/api/v1/query?query=${encodeURIComponent(query)}&timeout=500ms`,
      );
      assert.equal(scraped.status, 200);
      const body = JSON.parse(scraped.body) as {
        status?: unknown;
        data?: { result?: Array<{ value?: unknown[] }> };
      };
      assert.equal(body.status, "success");
      return body.data?.result?.length === 1 && body.data.result[0]?.value?.[1] === "1";
    });
    output("all_adapter_http_drain", {
      outcome: "passed",
      durationMs,
      stages,
      httpCount: 1,
      closed: ["http", "postgresql", "redis", "broker", "object_storage", "telemetry"],
    });
  } finally {
    completeRequest?.();
    signals.dispose();
    initializer.destroy();
    await lifecycle.shutdown();
    // Failure cleanup remains bounded even when an earlier assertion interrupts the ordered path.
    const signal = AbortSignal.timeout(3_000);
    await Promise.allSettled([
      postgresql.close(signal),
      redis.close(signal),
      broker.close(signal),
      storage.close(signal),
    ]);
    await telemetry.shutdown(signal);
    http.forceClose();
  }
}

await run().catch((error: unknown) => {
  if (error instanceof assert.AssertionError) {
    output("assertion_failed", {
      message: error.message.slice(0, 2_048),
      operator: error.operator,
      stack: error.stack
        ?.split("\n")
        .filter((line) => line.includes("runtime-worker.js"))
        .slice(0, 2),
    });
  } else if (error instanceof Error) {
    output("scenario_failed", { name: error.name, message: error.message.slice(0, 512) });
  }
  throw new Error("Runtime integration scenario failed.");
});
process.disconnect();
process.once("beforeExit", () => {
  output("natural_exit", { mode: "runtime" });
});
