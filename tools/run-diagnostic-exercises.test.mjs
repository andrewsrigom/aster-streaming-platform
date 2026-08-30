import assert from "node:assert/strict";
import test from "node:test";

import {
  assertTelemetryPrivacy,
  catalogOperationTraceContext,
  classifyDiagnosticScenario,
  diagnosticBoundaries,
  diagnosticTimeout,
  parseJsonLines,
  traceFacts,
} from "./run-diagnostic-exercises.mjs";

const trace = (dependency, outcome) => ({
  resourceSpans: [
    {
      resource: { attributes: [{ key: "service.name", value: { stringValue: "aster-catalog" } }] },
      scopeSpans: [
        {
          spans: [
            {
              traceId: "1".repeat(32),
              spanId: "2".repeat(16),
              name: "aster.dependency.operation",
              status: { code: "STATUS_CODE_ERROR" },
              attributes: [
                { key: "aster.dependency", value: { stringValue: dependency } },
                { key: "aster.operation", value: { stringValue: "query" } },
                { key: "aster.outcome", value: { stringValue: outcome } },
              ],
            },
          ],
        },
      ],
    },
  ],
});

test("parses only bounded JSON application events", () => {
  assert.deepEqual(parseJsonLines('noise\n{"event":"ok"}\n{invalid}\n'), [{ event: "ok" }]);
});

test("bounds every operation under one execution deadline with cleanup headroom", () => {
  assert.equal(diagnosticTimeout(20_000, 100_000, 90_000), 10_000);
  assert.equal(diagnosticTimeout(5_000, Number.POSITIVE_INFINITY, 90_000), 5_000);
  assert.throws(() => diagnosticTimeout(5_000, 90_000, 90_000));
});

test("requires Catalog operation logs to expose declared and consistent active trace context", () => {
  const traceId = "a".repeat(32);
  assert.deepEqual(
    catalogOperationTraceContext(
      JSON.stringify({
        event: "aster.catalog.graphql_completed",
        traceId,
        attributes: { trace_id: traceId },
      }),
    ),
    { declaredTraceId: traceId, activeTraceId: traceId },
  );
  assert.deepEqual(
    catalogOperationTraceContext(
      JSON.stringify({
        event: "aster.catalog.graphql_completed",
        attributes: { trace_id: traceId },
      }),
      traceId,
    ),
    { declaredTraceId: traceId, activeTraceId: undefined },
  );
  assert.throws(() =>
    catalogOperationTraceContext(
      JSON.stringify({
        event: "aster.catalog.graphql_completed",
        traceId: "b".repeat(32),
        attributes: { trace_id: traceId },
      }),
    ),
  );
});

test("extracts finite service, span and dependency facts", () => {
  assert.deepEqual(traceFacts(trace("postgresql", "unavailable")), [
    {
      service: "aster-catalog",
      name: "aster.dependency.operation",
      traceId: "1".repeat(32),
      spanId: "2".repeat(16),
      parentSpanId: "",
      status: "status_code_error",
      attributes: {
        "aster.dependency": "postgresql",
        "aster.operation": "query",
        "aster.outcome": "unavailable",
      },
    },
  ]);
});

test("emits only finite diagnostic boundary categories from untrusted traces", () => {
  const [boundary] = diagnosticBoundaries([
    {
      service: "private-value",
      name: "private-value",
      status: "private-value",
      attributes: {
        "aster.dependency": "redis",
        "aster.operation": "private-value",
        "aster.outcome": "private-value",
      },
    },
  ]);
  assert.deepEqual(boundary, {
    service: "catalog",
    name: "aster.dependency.operation",
    status: "unknown",
    subgraph: undefined,
    dependency: "redis",
    operation: "unknown",
    outcome: "unknown",
  });
});

test("classifies Catalog, PostgreSQL and Redis failures from telemetry contracts", () => {
  const catalogFacts = [
    {
      service: "aster-router",
      name: "subgraph",
      status: "status_code_error",
      attributes: { "subgraph.name": "catalog" },
    },
  ];
  assert.deepEqual(
    classifyDiagnosticScenario({
      scenario: "catalog",
      response: { errors: [{ extensions: { code: "SUBREQUEST_HTTP_ERROR" } }] },
      metricDelta: { population: 1, good: 0 },
      facts: catalogFacts,
      logs: { router: '{"kind":"aster.router.operation"}', catalog: "", cache: "" },
    }),
    { diagnosis: "catalog_service_unavailable", userOutcome: "failed" },
  );
  assert.deepEqual(
    classifyDiagnosticScenario({
      scenario: "postgres",
      response: { errors: [{ extensions: { code: "UNAVAILABLE" } }] },
      metricDelta: { population: 1, good: 0 },
      facts: traceFacts(trace("postgresql", "unavailable")),
      logs: {
        router: '{"kind":"aster.router.operation"}',
        catalog: '{"event":"aster.catalog.graphql_diagnostic"}',
        cache: "",
      },
    }),
    { diagnosis: "catalog_postgresql_unavailable", userOutcome: "failed" },
  );
  assert.deepEqual(
    classifyDiagnosticScenario({
      scenario: "redis",
      response: { data: { title: null } },
      metricDelta: { population: 1, good: 1 },
      facts: traceFacts(trace("redis", "unavailable")),
      logs: {
        router: '{"kind":"aster.router.operation"}',
        catalog: '{"event":"aster.catalog.graphql_completed"}',
        cache: '{"event":"aster.catalog.cache_readiness_changed"}',
      },
    }),
    { diagnosis: "catalog_redis_degraded", userOutcome: "latency_qualified" },
  );
});

test("rejects missing diagnosis signals and private canaries", () => {
  assert.throws(() =>
    classifyDiagnosticScenario({
      scenario: "postgres",
      response: { errors: [{}] },
      metricDelta: { population: 1, good: 0 },
      facts: [],
      logs: { router: "router", catalog: "catalog", cache: "" },
    }),
  );
  assert.throws(() => assertTelemetryPrivacy("private-canary", ["private-canary"]));
  assert.throws(() => assertTelemetryPrivacy("graphql.document", []));
  assert.doesNotThrow(() => assertTelemetryPrivacy("bounded sanitized trace", ["missing"]));
});
