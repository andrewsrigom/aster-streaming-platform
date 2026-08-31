import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ReferenceRuntimeConfigError } from "@aster/config";
import {
  createAsterDeterministicIdentifierGenerator,
  createAsterFixedClock,
  createAsterLogger,
  type AsterReadinessMonitorOptions,
} from "@aster/runtime";
import { ASTER_METRIC_CATALOG, createAsterTelemetry, type AsterTelemetry } from "@aster/telemetry";

import {
  AsterIdentityCompositionError,
  createIdentityServiceWithFactories,
} from "../src/create-service.js";
import { createAsterIdentityRuntimeWithMonitor } from "../src/reference-runtime.js";
import { createIdentityHttpServer, type IdentityHttpServer } from "../src/transport/http-server.js";
import { configurationEntries, controlledDependency, silentLogger } from "./fixtures.js";

function runProcess(
  path: string,
  arguments_: string[] = [],
  env: NodeJS.ProcessEnv = process.env,
  timeoutMs = 5_000,
) {
  return new Promise<{
    code: number | string | undefined;
    killed: boolean;
    stdout: string;
    stderr: string;
  }>((resolve) => {
    execFile(
      process.execPath,
      [fileURLToPath(new URL(path, import.meta.url)), ...arguments_],
      {
        timeout: timeoutMs,
        killSignal: "SIGKILL",
        maxBuffer: 65_536,
        env,
      },
      (error, stdout, stderr) => {
        resolve({
          code: error ? (error.code ?? undefined) : 0,
          killed: error?.killed ?? false,
          stdout,
          stderr,
        });
      },
    );
  });
}

test("composes real health HTTP, controlled recovery, local metrics, clock/IDs and ordered resource closure", async () => {
  const postgresql = controlledDependency();
  const redis = controlledDependency();
  redis.state.ready = false;
  let http: IdentityHttpServer | undefined;
  let telemetry: AsterTelemetry | undefined;
  let monitor: AsterReadinessMonitorOptions | undefined;
  const logs: string[] = [];
  const service = await createIdentityServiceWithFactories(configurationEntries, {
    clock: () => createAsterFixedClock(Date.parse("2026-08-27T00:00:00.000Z")),
    identifiers: () => createAsterDeterministicIdentifierGenerator(["startup-1"]),
    logger: (options) => {
      assert.equal(typeof options.traceContextProvider, "function");
      return createAsterLogger({
        ...options,
        destination: {
          write: (line) => {
            logs.push(line);
          },
        },
      });
    },
    postgresql: () => postgresql,
    redis: () => redis,
    telemetry: (options) => {
      assert.equal(options.environment, "test");
      assert.deepEqual(options.export, { mode: "none" });
      telemetry = createAsterTelemetry(options);
      return telemetry;
    },
    http: (options) => {
      http = createIdentityHttpServer({ ...options, port: 0 });
      return http;
    },
    runtime: (options) =>
      createAsterIdentityRuntimeWithMonitor(options, (settings) => {
        monitor = settings;
        return { start: () => "started", stop: () => Promise.resolve("stopped") };
      }),
  });
  try {
    const startup = service.start();
    assert.equal(service.start(), startup);
    assert.deepEqual(await startup, { status: "started", readiness: "ready" });
    assert.ok(http);
    const listener = http;
    const port = listener.port();
    assert.ok(port);
    const health = async (route = "/health/ready", method = "GET") =>
      fetch(`http://127.0.0.1:${port}${route}`, {
        method,
        signal: AbortSignal.timeout(1_000),
        headers: { connection: "close" },
      });
    const ready = await health();
    assert.equal(ready.status, 200);
    assert.equal(ready.headers.get("cache-control"), "no-store");
    assert.deepEqual(await ready.json(), service.health());
    const live = await health("/health/live");
    assert.equal(live.status, 200);
    await live.text();
    const head = await health("/health/live", "HEAD");
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    const graphql = await health("/graphql", "POST");
    assert.equal(graphql.status, 503);
    await graphql.text();
    assert.equal(postgresql.state.connects, 1);
    assert.equal(postgresql.state.probes, 1);
    assert.equal(redis.state.connects, 0);
    assert.equal(redis.state.probes, 0);
    const initialLease = service.tryBeginWork();
    assert.ok(initialLease);
    initialLease.complete();
    assert.ok(monitor);
    const settings = monitor;
    const cycle = async (): Promise<void> => {
      for (const [index, probe] of settings.probes.entries()) {
        settings.readiness.setCriticalDependencyState(
          index,
          await probe(new AbortController().signal),
        );
      }
    };
    redis.state.ready = true;
    await cycle();
    assert.equal(service.health().readiness, "ready");
    assert.equal(redis.state.connects, 0);
    const recovered = await health();
    assert.equal(recovered.status, 200);
    await recovered.text();
    const lease = service.tryBeginWork();
    assert.ok(lease);
    lease.complete();
    postgresql.state.ready = false;
    await cycle();
    assert.equal(service.health().readiness, "not_ready");
    assert.ok(telemetry);
    const collection = await telemetry.collect();
    assert.equal(collection.status, "collected");
    const metric = collection.metrics.find(
      (entry) => entry.name === ASTER_METRIC_CATALOG.httpDuration.name,
    );
    assert.ok(metric);
    assert.ok(metric.points.length > 0);
    assert.match(logs.join(""), /startup-1/u);
    assert.match(logs.join(""), /2026-08-27T00:00:00.000Z/u);
    assert.equal(
      logs.filter((line) => line.includes("aster.identity.readiness_changed")).length,
      2,
    );
    assert.doesNotMatch(logs.join(""), /postgresql:|redis:|localhost|controlled/u);
    const shutdown = await service.shutdown();
    assert.equal(shutdown.outcome, "completed");
    assert.ok(postgresql.state.closed);
    assert.ok(redis.state.closed);
    assert.equal(listener.port(), undefined);
    assert.equal((await telemetry.collect()).status, "unavailable");
  } finally {
    await service.shutdown();
  }
});

test("rejects invalid environment before constructing resources", async () => {
  let constructions = 0;
  await assert.rejects(
    createIdentityServiceWithFactories([], {
      telemetry: () => {
        constructions += 1;
        throw new Error("must-not-run");
      },
    }),
    ReferenceRuntimeConfigError,
  );
  assert.equal(constructions, 0);
});

test("configured OTLP export stays optional for readiness and reports failed flush truthfully", async (t) => {
  for (const available of [true, false]) {
    let requests = 0;
    const collector = createHttpServer((request, response) => {
      requests += 1;
      request.resume();
      response.statusCode = available ? 200 : 503;
      response.end();
    });
    t.after(async () => {
      collector.closeAllConnections();
      await new Promise<void>((resolve) => {
        collector.close(() => {
          resolve();
        });
      });
    });
    await new Promise<void>((resolve) => collector.listen(0, "127.0.0.1", resolve));
    const address = collector.address();
    assert.ok(address && typeof address === "object");
    const endpoint = `http://127.0.0.1:${address.port}/v1/metrics`;
    const postgresql = controlledDependency();
    const redis = controlledDependency();
    let telemetry: AsterTelemetry | undefined;
    const service = await createIdentityServiceWithFactories(
      [...configurationEntries, ["ASTER_OTLP_METRICS_ENDPOINT", endpoint]],
      {
        logger: silentLogger,
        postgresql: () => postgresql,
        redis: () => redis,
        http: (options) => createIdentityHttpServer({ ...options, port: 0 }),
        telemetry: (options) => {
          assert.deepEqual(options.export, {
            mode: "otlp-http",
            endpoint,
            intervalMs: 5_000,
            timeoutMs: 1_000,
          });
          assert.equal(options.shutdownTimeoutMs, 2_000);
          telemetry = createAsterTelemetry(options);
          return telemetry;
        },
        terminate: () => assert.fail("Optional export must close without process force."),
      },
    );
    try {
      assert.deepEqual(await service.start(), { status: "started", readiness: "ready" });
      assert.ok(telemetry);
      const flush = await telemetry.forceFlush();
      assert.equal(flush.status === "completed", available);
      assert.equal(service.health().readiness, "ready");
      assert.ok(requests > 0);
      const shutdown = await service.shutdown();
      assert.equal(shutdown.outcome, available ? "completed" : "degraded");
      assert.equal(postgresql.state.closed, true);
      assert.equal(redis.state.closed, true);
    } finally {
      await service.shutdown();
    }
  }
});

test("cleans already-created owners on partial factory failure without reflecting its cause", async () => {
  const postgresql = controlledDependency();
  let telemetry: AsterTelemetry | undefined;
  await assert.rejects(
    createIdentityServiceWithFactories(configurationEntries, {
      logger: silentLogger,
      telemetry: (options) => {
        telemetry = createAsterTelemetry(options);
        return telemetry;
      },
      postgresql: () => postgresql,
      redis: () => {
        throw new Error("private-factory-value");
      },
      terminate: () => assert.fail("Partial cleanup must finish naturally."),
    }),
    (error: unknown) => {
      assert.ok(error instanceof AsterIdentityCompositionError);
      assert.doesNotMatch(String(error), /private/u);
      return true;
    },
  );
  assert.ok(postgresql.state.closed);
  assert.ok(telemetry);
  assert.equal((await telemetry.collect()).status, "unavailable");
});

test("listener bind failure closes both dependency owners and telemetry", async () => {
  const occupied = createServer();
  await new Promise<void>((resolve) => occupied.listen(0, "127.0.0.1", resolve));
  const address = occupied.address();
  assert.ok(address && typeof address === "object");
  const postgresql = controlledDependency();
  const redis = controlledDependency();
  try {
    const service = await createIdentityServiceWithFactories(configurationEntries, {
      logger: silentLogger,
      postgresql: () => postgresql,
      redis: () => redis,
      http: (options) => createIdentityHttpServer({ ...options, port: address.port }),
      terminate: () => assert.fail("Failed listener cleanup must finish naturally."),
    });
    assert.deepEqual(await service.start(), { status: "failed" });
    assert.ok(postgresql.state.closed);
    assert.ok(redis.state.closed);
    assert.equal(postgresql.state.connects, 0);
    assert.equal(redis.state.connects, 0);
  } finally {
    await new Promise<void>((resolve) => {
      occupied.close(() => {
        resolve();
      });
    });
  }
});

test("diagnostic runs real loopback health transitions and exits naturally", async () => {
  // The child bounds startup, three transitions, eight HTTP reads and shutdown separately.
  const result = await runProcess("../src/check-identity.js", [], process.env, 30_000);
  assert.equal(result.killed, false);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    event: "identity_diagnostic_passed",
    dependencyMode: "controlled",
    healthStatesChecked: 4,
    httpMetrics: "collected",
    shutdown: "completed",
  });
});

test("real PostgreSQL failure removes readiness while unopened Redis still closes safely", async () => {
  const result = await runProcess("./real-adapters-fixture.js", [], process.env, 15_000);
  assert.equal(result.killed, false);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "real-adapters-natural-exit\n");
});

test("executable rejects missing configuration with a bounded, cause-free diagnostic", async () => {
  const result = await runProcess("../src/main.js", [], {});
  assert.equal(result.killed, false);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /ASTER_CONFIGURATION_INVALID/u);
  assert.ok(result.stderr.length < 2_000);
  assert.doesNotMatch(result.stderr, /at |Error:|postgresql:\/\//u);
});

test(
  "SIGTERM drains accepted work, disposes owners, and exits naturally with 143",
  { skip: process.platform === "win32" },
  async () => {
    const result = await runProcess("./process-fixture.js", ["signal"]);
    assert.equal(result.killed, false);
    assert.equal(result.code, 143, result.stderr);
    assert.equal(result.stdout, "natural-exit\n");
  },
);

test("unclosable dependency invokes bounded terminal fallback for signal and manual shutdown", async () => {
  for (const [mode, expected] of [
    ["force-signal", 143],
    ["force-manual", 1],
  ] as const) {
    if (mode === "force-signal" && process.platform === "win32") {
      continue;
    }
    const result = await runProcess("./process-fixture.js", [mode]);
    assert.equal(result.killed, false);
    assert.equal(result.code, expected, result.stderr);
    assert.equal(result.stdout, "");
  }
});
