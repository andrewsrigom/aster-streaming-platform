import assert from "node:assert/strict";
import test from "node:test";

import {
  assertTelemetryPrivacy,
  catalogOperationTraceContext,
  classifyDiagnosticScenario,
  diagnosticBoundaries,
  diagnosticTraceQuery,
  diagnosticTraceReady,
  diagnosticTimeout,
  parseJsonLines,
  traceSearchFacts,
} from "./run-diagnostic-exercises.mjs";

const MULTILINE_GRAPHQL = `query TitleDetail($id: ID!) {
  title(id: $id) { id }
}`;

const dependencyFacts = (dependency, outcome) => [
  {
    service: "catalog",
    name: "aster.dependency.operation",
    traceId: "1".repeat(32),
    spanId: "2".repeat(16),
    parentSpanId: "",
    status: "error",
    attributes: {
      "aster.dependency": dependency,
      "aster.operation": "query",
      "aster.outcome": outcome,
    },
  },
];

const selectedSearch = (traceId, dependency, outcome, status = "error") => ({
  traces: [
    {
      traceID: traceId,
      spanSets: [
        {
          spans: [
            {
              spanID: "b".repeat(16),
              attributes: [
                { key: "span.aster.dependency", value: { stringValue: dependency } },
                { key: "span.aster.operation", value: { stringValue: "query" } },
                { key: "span.aster.outcome", value: { stringValue: outcome } },
                { key: "span:name", value: { stringValue: "aster.dependency.operation" } },
                { key: "span:status", value: { stringValue: status } },
                { key: "resource.service.name", value: { stringValue: "catalog" } },
                { key: "private", value: { stringValue: "discarded" } },
              ],
            },
          ],
        },
      ],
    },
  ],
});

const selectedCatalogSearch = (traceId) => ({
  traces: [
    {
      traceID: traceId,
      spanSets: [
        {
          spans: [
            {
              spanID: "c".repeat(16),
              attributes: [
                { key: "span.subgraph.name", value: { stringValue: "catalog" } },
                { key: "span:name", value: { stringValue: "router.catalog_subgraph" } },
                { key: "span:status", value: { stringValue: "error" } },
                { key: "resource.service.name", value: { stringValue: "aster-router" } },
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

test("builds exact finite TraceQL queries for each scenario boundary", () => {
  const traceId = "a".repeat(32);
  assert.equal(
    diagnosticTraceQuery(traceId, "catalog"),
    `{ trace:id = "${traceId}" && span.subgraph.name = "catalog" && span:status = error } | select(span.subgraph.name, span:name, span:status, resource.service.name)`,
  );
  assert.equal(
    diagnosticTraceQuery(traceId, "postgres"),
    `{ trace:id = "${traceId}" && span.aster.dependency = "postgresql" && span.aster.outcome =~ "timeout|cancelled|unavailable|error" } | select(span.aster.dependency, span.aster.operation, span.aster.outcome, span:name, span:status, resource.service.name)`,
  );
  assert.equal(
    diagnosticTraceQuery(traceId, "redis"),
    `{ trace:id = "${traceId}" && span.aster.dependency = "redis" && span.aster.outcome =~ "timeout|cancelled|unavailable|error" } | select(span.aster.dependency, span.aster.operation, span.aster.outcome, span:name, span:status, resource.service.name)`,
  );
  assert.throws(() => diagnosticTraceQuery("unsafe", "redis"));
});

test("extracts only selected finite facts from a TraceQL boundary result", () => {
  const traceId = "a".repeat(32);
  assert.deepEqual(traceSearchFacts(selectedSearch(traceId, "postgresql", "timeout"), traceId), [
    {
      service: "catalog",
      name: "aster.dependency.operation",
      traceId,
      spanId: "b".repeat(16),
      parentSpanId: "",
      status: "error",
      attributes: {
        "aster.dependency": "postgresql",
        "aster.operation": "query",
        "aster.outcome": "timeout",
      },
    },
  ]);
  assert.deepEqual(traceSearchFacts(selectedCatalogSearch(traceId), traceId), [
    {
      service: "aster-router",
      name: "router.catalog_subgraph",
      traceId,
      spanId: "c".repeat(16),
      parentSpanId: "",
      status: "error",
      attributes: { "subgraph.name": "catalog" },
    },
  ]);
  assert.deepEqual(traceSearchFacts({ traces: [] }, traceId), []);
  assert.equal(diagnosticTraceReady(selectedCatalogSearch(traceId), traceId, "catalog"), true);
  assert.equal(
    diagnosticTraceReady(
      selectedSearch(traceId, "postgresql", "success", "ok"),
      traceId,
      "postgres",
    ),
    false,
  );
  assert.equal(
    diagnosticTraceReady(selectedSearch(traceId, "postgresql", "timeout"), traceId, "postgres"),
    true,
  );
  assert.equal(
    diagnosticTraceReady(
      selectedSearch(traceId, "postgresql", "cancelled", "unset"),
      traceId,
      "postgres",
    ),
    true,
  );
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
  const catalogFacts = traceSearchFacts(selectedCatalogSearch("a".repeat(32)), "a".repeat(32));
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
      facts: [
        {
          service: "unknown",
          name: "unknown",
          status: "error",
          attributes: { "aster.dependency": "postgresql" },
        },
      ],
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
      facts: dependencyFacts("redis", "unavailable"),
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
  assert.throws(() =>
    classifyDiagnosticScenario({
      scenario: "postgres",
      response: { errors: [{}] },
      metricDelta: { population: 1, good: 0 },
      facts: dependencyFacts("postgresql", "success").map((fact) => ({
        ...fact,
        status: "ok",
      })),
      logs: {
        router: '{"kind":"aster.router.operation"}',
        catalog: '{"event":"aster.catalog.graphql_diagnostic"}',
        cache: "",
      },
    }),
  );
  assert.throws(() => assertTelemetryPrivacy("private-canary", ["private-canary"]));
  assert.throws(() =>
    assertTelemetryPrivacy(JSON.stringify({ traceAttribute: MULTILINE_GRAPHQL }), [
      MULTILINE_GRAPHQL,
    ]),
  );
  assert.throws(() => assertTelemetryPrivacy("graphql.document", []));
  const storedTrace = {
    trace: {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  attributes: [
                    {
                      key: "private.attribute",
                      value: { stringValue: MULTILINE_GRAPHQL },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };
  assert.doesNotThrow(() =>
    assertTelemetryPrivacy(JSON.stringify(selectedSearch("a".repeat(32), "redis", "unavailable")), [
      MULTILINE_GRAPHQL,
    ]),
  );
  assert.throws(() => assertTelemetryPrivacy(JSON.stringify(storedTrace), [MULTILINE_GRAPHQL]));
  assert.doesNotThrow(() => assertTelemetryPrivacy("bounded sanitized trace", ["missing"]));
});
