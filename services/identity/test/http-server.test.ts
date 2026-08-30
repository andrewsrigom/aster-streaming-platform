import assert from "node:assert/strict";
import test from "node:test";

import { createAsterLogger } from "@aster/runtime";
import { createAsterTelemetry } from "@aster/telemetry";

import { createIdentityHttpServer } from "../src/transport/http-server.js";

test("a startup deadline after binding cannot close the live health listener", async () => {
  const telemetry = createAsterTelemetry({
    serviceName: "identity-test",
    serviceVersion: "0.0.0",
    environment: "test",
  });
  const http = createIdentityHttpServer({
    host: "127.0.0.1",
    port: 0,
    telemetry,
    health: () => ({
      phase: "ready",
      liveness: "live",
      readiness: "not_ready",
      reason: "dependency_unavailable",
    }),
    onFatalError: () => {
      assert.fail("No listener error expected.");
    },
  });
  try {
    const startup = new AbortController();
    await http.listen(startup.signal);
    startup.abort();
    const port = http.port();
    assert.ok(port);
    const response = await fetch(`http://127.0.0.1:${port}/health/live`, {
      signal: AbortSignal.timeout(1_000),
      headers: { connection: "close" },
    });
    assert.equal(response.status, 200);
    await response.text();
  } finally {
    await http.stopTraffic(new AbortController().signal);
    await telemetry.shutdown();
  }
});

test("cancels a pending bind and tolerates cleanup before any listener exists", async () => {
  const telemetry = createAsterTelemetry({
    serviceName: "identity-test",
    serviceVersion: "0.0.0",
    environment: "test",
  });
  const http = createIdentityHttpServer({
    host: "127.0.0.1",
    port: 0,
    telemetry,
    health: () => ({
      phase: "starting",
      liveness: "live",
      readiness: "not_ready",
      reason: "starting",
    }),
    onFatalError: () => {
      assert.fail("No listener error expected.");
    },
  });
  const startup = new AbortController();
  const listening = http.listen(startup.signal);
  startup.abort();
  try {
    await assert.rejects(listening, /cancelled/u);
    await http.stopTraffic(new AbortController().signal);
    assert.equal(http.port(), undefined);
  } finally {
    http.forceClose();
    await telemetry.shutdown();
  }
});

test("HTTP context parents dependency spans and correlates async logs", async () => {
  const telemetry = createAsterTelemetry({
    serviceName: "identity-trace-test",
    serviceVersion: "0.0.0",
    environment: "test",
    maxActiveSpans: 8,
  });
  const lines: string[] = [];
  const logger = createAsterLogger({
    service: "identity-trace-test",
    version: "0.0.0",
    environment: "integration",
    destination: { write: (line) => lines.push(line) },
    traceContextProvider: () => telemetry.activeTraceContext(),
  });
  const http = createIdentityHttpServer({
    host: "127.0.0.1",
    port: 0,
    telemetry,
    health: () => ({
      phase: "ready",
      liveness: "live",
      readiness: "ready",
      reason: "ready",
    }),
    onFatalError: () => {
      assert.fail("No listener error expected.");
    },
    graphql: async (_request, response) => {
      await Promise.resolve();
      const dependency = telemetry.startDependencyOperation({
        dependency: "postgresql",
        operation: "query",
      });
      assert.equal(dependency.status, "started");
      assert.ok(dependency.observation.run);
      await dependency.observation.run(async () => {
        await Promise.resolve();
        assert.equal(logger.info({ event: "aster.identity.trace_probe" }), "written");
      });
      dependency.observation.complete({ outcome: "success" });
      response.status(200).json({ data: { traceProbe: true } });
    },
  });
  try {
    await http.listen(new AbortController().signal);
    const port = http.port();
    assert.ok(port);
    const inboundTraceId = "a".repeat(32);
    const inboundSpanId = "b".repeat(16);
    const response = await fetch(`http://127.0.0.1:${port}/graphql`, {
      method: "POST",
      signal: AbortSignal.timeout(1_000),
      headers: {
        connection: "close",
        "content-type": "application/json",
        traceparent: `00-${inboundTraceId}-${inboundSpanId}-01`,
      },
      body: JSON.stringify({ query: "query TraceProbe { __typename }" }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { data: { traceProbe: true } });

    const collection = await telemetry.collectTraces();
    assert.equal(collection.status, "collected");
    const server = collection.traces.find((span) => span.kind === "server");
    const dependency = collection.traces.find((span) => span.kind === "client");
    assert.ok(server && dependency);
    assert.equal(server.traceId, inboundTraceId);
    assert.equal(server.parentSpanId, inboundSpanId);
    assert.equal(dependency.traceId, server.traceId);
    assert.equal(dependency.parentSpanId, server.spanId);
    assert.equal(lines.length, 1);
    const log = JSON.parse(lines[0] ?? "null") as Record<string, unknown>;
    assert.equal(log["traceId"], dependency.traceId);
    assert.equal(log["spanId"], dependency.spanId);
    assert.equal(JSON.stringify(log).includes("TraceProbe { __typename }"), false);
  } finally {
    await http.stopTraffic(new AbortController().signal);
    await telemetry.shutdown();
  }
});
