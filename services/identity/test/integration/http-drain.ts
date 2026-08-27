import assert from "node:assert/strict";
import { createServer } from "node:http";

import { createExpressHttpAdapter } from "@aster/http-express";
import { createAsterPostgresAdapter, type AsterPostgresAdapter } from "@aster/postgres";
import { createAsterRedisAdapter, type AsterRedisAdapter } from "@aster/redis";
import { createAsterNodeHttpLifecycleHooks } from "@aster/runtime";
import { createAsterTelemetry } from "@aster/telemetry";

import { createIdentityServiceWithFactories } from "../../src/create-service.js";
import { configurationEntries, silentLogger } from "../fixtures.js";
import { eventually } from "./docker-fixture.js";

// Only this diagnostic mounts a held synthetic HTTP handler; Identity exposes no GraphQL schema.
export async function verifyHttpDrain(connectionString: string, redisUrl: string): Promise<number> {
  let port = 0;
  let completeRequest: (() => void) | undefined;
  let postgresql: AsterPostgresAdapter | undefined;
  let redis: AsterRedisAdapter | undefined;
  const completedStages: string[] = [];
  let responseFinished = false;
  const service = await createIdentityServiceWithFactories(
    configurationEntries.map(([name, value]) => [
      name,
      name === "DATABASE_URL" ? connectionString : name === "REDIS_URL" ? redisUrl : value,
    ]),
    {
      logger: silentLogger,
      postgresql: (options) => {
        postgresql = createAsterPostgresAdapter(options);
        return postgresql;
      },
      redis: (options) => {
        redis = createAsterRedisAdapter(options);
        return redis;
      },
      telemetry: (options) => {
        const telemetry = createAsterTelemetry(options);
        return {
          startHttpRequest: (input) => telemetry.startHttpRequest(input),
          startDependencyOperation: (input) => telemetry.startDependencyOperation(input),
          collect: () => telemetry.collect(),
          exportHealth: () => telemetry.exportHealth(),
          lifecycleHooks: () => telemetry.lifecycleHooks(),
          forceFlush: async (signal) => {
            assert.ok(responseFinished, "Telemetry flush precedes HTTP completion");
            const result = await telemetry.forceFlush(signal);
            if (result.status === "completed") {
              completedStages.push("flush");
            }
            return result;
          },
          shutdown: async (signal) => {
            const result = await telemetry.shutdown(signal);
            if (result.status === "completed") {
              completedStages.push("telemetry-close");
            }
            return result;
          },
        };
      },
      http: (options) => {
        const adapter = createExpressHttpAdapter({ healthSnapshotProvider: options.health });
        adapter.mountGraphql((_request, response) => {
          const lease = service.tryBeginWork();
          assert.ok(lease);
          const observation = options.telemetry.startHttpRequest({
            method: "POST",
            route: "/graphql",
          });
          assert.equal(observation.status, "started");
          response.once("finish", () => {
            responseFinished = true;
            lease.complete();
            observation.observation.complete({ statusCode: 200, outcome: "success" });
          });
          completeRequest = () => {
            completeRequest = undefined;
            response.status(200).json({ fixture: "completed" });
          };
        });
        const server = createServer(
          { requestTimeout: 2_000, headersTimeout: 2_000 },
          adapter.requestListener,
        );
        server.maxConnections = 2;
        const hooks = createAsterNodeHttpLifecycleHooks(server);
        return {
          listen: async (signal) => {
            signal.throwIfAborted();
            await new Promise<void>((resolve, reject) => {
              server.once("error", reject);
              server.listen(0, "127.0.0.1", resolve);
            });
            const address = server.address();
            assert.ok(address && typeof address === "object");
            port = address.port;
          },
          stopTraffic: hooks.stopTraffic,
          forceClose: hooks.forceClose,
          port: () => port,
        };
      },
    },
  );
  try {
    assert.deepEqual(await service.start(), { status: "started", readiness: "ready" });
    const response = fetch(`http://127.0.0.1:${port}/graphql`, {
      method: "POST",
      body: JSON.stringify({ fixture: "hold" }),
      headers: { "content-type": "application/json", connection: "close" },
      signal: AbortSignal.timeout(5_000),
    }).then(async (value) => ({ status: value.status, body: await value.json() }));
    // Retain rejection ownership while waiting for the server-side acceptance barrier.
    void response.catch(() => undefined);
    await eventually("HTTP request accepted", () => completeRequest !== undefined, 2_000);
    const started = performance.now();
    service.bindProcessSignals();
    process.kill(process.pid, "SIGTERM");
    await eventually("HTTP draining", () => service.health().phase === "draining", 2_000);
    assert.equal(service.tryBeginWork(), undefined);
    assert.deepEqual(completedStages, []);
    assert.equal(postgresql?.snapshot().state, "open");
    completeRequest?.();
    assert.deepEqual(await response, { status: 200, body: { fixture: "completed" } });
    assert.equal((await service.shutdown()).outcome, "completed");
    assert.equal(postgresql.snapshot().totalConnections, 0);
    assert.equal(postgresql.snapshot().state, "closed");
    assert.equal(redis?.snapshot().open, false);
    assert.equal(redis.snapshot().state, "closed");
    assert.deepEqual(completedStages, ["flush", "telemetry-close"]);
    const duration = Math.round(performance.now() - started);
    assert.ok(duration < 10_000);
    return duration;
  } finally {
    completeRequest?.();
    await service.shutdown();
  }
}
