import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { request } from "node:http";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL, URL, URLSearchParams } from "node:url";
import { promisify } from "node:util";

import { validateDiagnosticProjectName } from "./verify-diagnostics-profile.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const execute = promisify(execFile);
const nativeFetch = globalThis.fetch;
const nativeAbortSignal = globalThis.AbortSignal;
const NativeAbortController = globalThis.AbortController;
const project = "aster-p12-diagnostics-" + randomUUID();
const RUN_BUDGET_MS = 12 * 60 * 1000;
let runDeadline = Number.POSITIVE_INFINITY;
let runSignal;
const SCENARIOS = Object.freeze(["catalog", "postgres", "redis"]);
const COMPOSE_FILES = Object.freeze([
  "infra/compose/compose.yml",
  "infra/compose/observability.yml",
  "infra/compose/diagnostics.yml",
  "infra/compose/diagnostics-proof.yml",
]);
const FAILURE_OUTCOMES = new Set(["error", "timeout", "cancelled", "unavailable"]);
const DEPENDENCY_OPERATIONS = new Set([
  "connect",
  "probe",
  "query",
  "command",
  "publish",
  "consume",
  "read",
  "write",
  "delete",
  "export",
  "flush",
  "process",
]);
const OBSERVATION_OUTCOMES = new Set([
  "success",
  "timeout",
  "cancelled",
  "unavailable",
  "rejected",
  "error",
]);
const TITLE_DETAIL = `query TitleDetail($id: ID!, $locale: String! = "en") {
  title(id: $id) {
    id
    localized(locale: $locale) { locale title synopsis }
    runtimeSeconds
    releaseYear
    languages
    genres
    accessibility
    editorialLabels
    credits { name role }
    artwork { url altText attribution { creator licenseUrl } }
    attribution {
      workTitle creator copyrightHolder sourceUrl licenseName licenseVersion
      licenseUrl attributionText modificationNotice
    }
  }
}`;
const POPULATION_COUNTER =
  'sum(http_server_request_duration_seconds_count{job="aster-router",aster_operation="TitleDetail",aster_outcome=~"completed|failed"})';
const GOOD_COUNTER =
  'sum(http_server_request_duration_seconds_bucket{job="aster-router",aster_operation="TitleDetail",aster_outcome="completed",le="0.3"})';
const RELEASED_SLI = 'aster:sli:good:ratio_rate5m{sli="catalog_title_read"}';

assert.equal(process.argv.length, 2, "Diagnostic exercises accept no external target or flags.");
assert.ok(validateDiagnosticProjectName(project));

export function diagnosticTimeout(requested, deadline, now) {
  assert.ok(Number.isInteger(requested) && requested > 0);
  assert.ok(deadline === Number.POSITIVE_INFINITY || Number.isFinite(deadline));
  assert.ok(Number.isFinite(now));
  const remaining = deadline - now;
  if (remaining <= 0) {
    throw new Error("Diagnostic execution deadline exceeded.");
  }
  return Math.max(1, Math.min(requested, remaining));
}

export async function settleDiagnosticInjection(responseWork, disruptionWork) {
  const [response, disruption] = await Promise.allSettled([responseWork, disruptionWork]);
  if (disruption.status === "rejected") {
    throw disruption.reason;
  }
  if (response.status === "rejected") {
    throw response.reason;
  }
  return response.value;
}

function boundedTimeout(requested) {
  return diagnosticTimeout(requested, runDeadline, Date.now());
}

function operationSignal(timeout) {
  const deadlineSignal = nativeAbortSignal.timeout(boundedTimeout(timeout));
  return runSignal ? nativeAbortSignal.any([deadlineSignal, runSignal]) : deadlineSignal;
}

function emit(event, facts = {}) {
  process.stdout.write(JSON.stringify({ event, ...facts }) + "\n");
}

function textValue(value) {
  if (typeof value === "string") {
    return value;
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }
  for (const key of ["stringValue", "intValue", "doubleValue", "boolValue"]) {
    if (key in value) {
      return String(value[key]);
    }
  }
  return undefined;
}

function attributes(values) {
  if (!Array.isArray(values)) {
    return {};
  }
  const output = {};
  for (const entry of values) {
    if (!entry || typeof entry !== "object" || typeof entry.key !== "string") {
      continue;
    }
    const value = textValue(entry.value);
    if (value !== undefined) {
      output[entry.key] = value;
    }
  }
  return output;
}

export function parseJsonLines(source) {
  const parsed = [];
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) {
      continue;
    }
    try {
      const value = JSON.parse(trimmed);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        parsed.push(value);
      }
    } catch {
      // Non-JSON dependency output is not an application event.
    }
  }
  return parsed;
}

export function catalogOperationTraceContext(source, expectedTraceId) {
  const events = parseJsonLines(source).filter(
    (candidate) => candidate.event === "aster.catalog.graphql_completed",
  );
  const event = expectedTraceId
    ? events.find((candidate) => candidate.attributes?.trace_id === expectedTraceId)
    : events.at(-1);
  assert.ok(event, "Catalog did not emit a completed GraphQL operation log.");
  const declaredTraceId = event.attributes?.trace_id;
  const activeTraceId = event.traceId;
  assert.match(declaredTraceId ?? "", /^[a-f0-9]{32}$/u, "Catalog log has no Router trace ID.");
  if (activeTraceId !== undefined) {
    assert.match(activeTraceId, /^[a-f0-9]{32}$/u, "Catalog log has an invalid active trace ID.");
    assert.equal(activeTraceId, declaredTraceId, "Catalog log trace contexts disagree.");
  }
  return Object.freeze({ declaredTraceId, activeTraceId });
}

export function diagnosticTraceQuery(traceId, scenario) {
  assert.match(traceId, /^[a-f0-9]{32}$/u, "Diagnostic trace ID is invalid.");
  assert.ok(SCENARIOS.includes(scenario), "Diagnostic scenario is invalid.");
  const boundary =
    scenario === "catalog"
      ? 'span.subgraph.name = "catalog" && span:status = error'
      : `span.aster.dependency = "${scenario === "postgres" ? "postgresql" : "redis"}" && span.aster.outcome =~ "timeout|cancelled|unavailable|error"`;
  const selected =
    scenario === "catalog"
      ? "span.subgraph.name, span:name, span:status, resource.service.name"
      : "span.aster.dependency, span.aster.operation, span.aster.outcome, span:name, span:status, resource.service.name";
  return `{ trace:id = "${traceId}" && ${boundary} } | select(${selected})`;
}

export function traceSearchFacts(payload, traceId) {
  assert.match(traceId, /^[a-f0-9]{32}$/u, "Diagnostic trace ID is invalid.");
  const trace = Array.isArray(payload?.traces)
    ? payload.traces.find(
        (candidate) => candidate?.traceID === traceId || candidate?.traceId === traceId,
      )
    : undefined;
  const facts = [];
  for (const spanSet of Array.isArray(trace?.spanSets) ? trace.spanSets : []) {
    for (const span of Array.isArray(spanSet?.spans) ? spanSet.spans : []) {
      const selected = attributes(span?.attributes);
      const selectedValue = (...names) => names.map((name) => selected[name]).find(Boolean);
      const normalized = Object.freeze({
        ...(selectedValue("span.subgraph.name", "subgraph.name")
          ? { "subgraph.name": selectedValue("span.subgraph.name", "subgraph.name") }
          : {}),
        ...(selectedValue("span.aster.dependency", "aster.dependency")
          ? { "aster.dependency": selectedValue("span.aster.dependency", "aster.dependency") }
          : {}),
        ...(selectedValue("span.aster.operation", "aster.operation")
          ? { "aster.operation": selectedValue("span.aster.operation", "aster.operation") }
          : {}),
        ...(selectedValue("span.aster.outcome", "aster.outcome")
          ? { "aster.outcome": selectedValue("span.aster.outcome", "aster.outcome") }
          : {}),
      });
      facts.push(
        Object.freeze({
          service: selectedValue("resource.service.name", "service.name") ?? "unknown",
          name: selectedValue("span:name", "name") ?? "unknown",
          traceId,
          spanId: typeof span?.spanID === "string" ? span.spanID : "",
          parentSpanId: "",
          status: (selectedValue("span:status", "status") ?? "unset").toLowerCase(),
          attributes: normalized,
        }),
      );
    }
  }
  return Object.freeze(facts);
}

export function diagnosticTraceReady(payload, traceId, scenario) {
  assert.ok(SCENARIOS.includes(scenario), "Diagnostic scenario is invalid.");
  const facts = traceSearchFacts(payload, traceId);
  return scenario === "catalog"
    ? facts.length > 0
    : hasFailedDependency(facts, scenario === "postgres" ? "postgresql" : "redis");
}

export function assertTelemetryPrivacy(serialized, canaries) {
  assert.ok(Buffer.byteLength(serialized) <= 2 * 1024 * 1024, "Telemetry evidence is oversized.");
  for (const canary of canaries) {
    const escapedCanary = JSON.stringify(canary).slice(1, -1);
    assert.ok(
      !serialized.includes(canary) && !serialized.includes(escapedCanary),
      "Telemetry exposed a request canary.",
    );
  }
  for (const prohibited of [
    "graphql.document",
    "authorization",
    "aster_local_session",
    "aster-test-only",
    "signed media",
  ]) {
    assert.ok(!serialized.toLowerCase().includes(prohibited), `Telemetry exposed ${prohibited}.`);
  }
}

export function diagnosticBoundaries(facts) {
  return facts
    .filter(
      (fact) =>
        fact.attributes["subgraph.name"] === "catalog" ||
        ["postgresql", "redis"].includes(fact.attributes["aster.dependency"]),
    )
    .slice(0, 12)
    .map((fact) => {
      const dependency = ["postgresql", "redis"].includes(fact.attributes["aster.dependency"])
        ? fact.attributes["aster.dependency"]
        : undefined;
      const operation = DEPENDENCY_OPERATIONS.has(fact.attributes["aster.operation"])
        ? fact.attributes["aster.operation"]
        : "unknown";
      const outcome = OBSERVATION_OUTCOMES.has(fact.attributes["aster.outcome"])
        ? fact.attributes["aster.outcome"]
        : "unknown";
      return {
        service: fact.attributes["subgraph.name"] === "catalog" ? "aster-router" : "catalog",
        name:
          fact.attributes["subgraph.name"] === "catalog"
            ? "router.catalog_subgraph"
            : "aster.dependency.operation",
        status:
          fact.status.includes("error") || FAILURE_OUTCOMES.has(outcome)
            ? "error"
            : outcome === "success"
              ? "ok"
              : "unknown",
        subgraph: fact.attributes["subgraph.name"] === "catalog" ? "catalog" : undefined,
        dependency,
        operation,
        outcome,
      };
    });
}

function hasFailedDependency(facts, dependency) {
  return facts.some(
    (fact) =>
      fact.attributes["aster.dependency"] === dependency &&
      (fact.status === "error" || FAILURE_OUTCOMES.has(fact.attributes["aster.outcome"])),
  );
}

export function classifyDiagnosticScenario({ scenario, response, metricDelta, facts, logs }) {
  assert.ok(SCENARIOS.includes(scenario));
  assert.ok(
    metricDelta.population >= 1,
    "The released Catalog SLI population did not observe the request.",
  );
  assert.ok(Number.isFinite(metricDelta.good) && metricDelta.good >= 0);
  assert.ok(typeof logs.router === "string" && logs.router.length > 0);
  const failed = Array.isArray(response?.errors) && response.errors.length > 0;
  if (scenario === "catalog") {
    assert.equal(failed, true, "Catalog service loss must be a visible failed operation.");
    assert.equal(metricDelta.good, 0);
    assert.ok(
      facts.some(
        (fact) =>
          fact.service === "aster-router" &&
          fact.attributes["subgraph.name"] === "catalog" &&
          (fact.status.includes("error") || fact.attributes["otel.status_code"] === "ERROR"),
      ),
      "Trace does not identify the failed Router-to-Catalog boundary.",
    );
    return Object.freeze({ diagnosis: "catalog_service_unavailable", userOutcome: "failed" });
  }
  if (scenario === "postgres") {
    assert.equal(failed, true, "Catalog PostgreSQL loss must fail the authoritative read.");
    assert.equal(metricDelta.good, 0);
    assert.ok(hasFailedDependency(facts, "postgresql"), "Trace does not identify PostgreSQL.");
    assert.ok(logs.catalog.includes("aster.catalog.graphql"));
    return Object.freeze({ diagnosis: "catalog_postgresql_unavailable", userOutcome: "failed" });
  }
  assert.equal(failed, false, "Redis loss must preserve a completed authoritative response.");
  assert.ok(hasFailedDependency(facts, "redis"), "Trace does not identify Redis degradation.");
  assert.ok(logs.catalog.includes("aster.catalog.graphql_completed"));
  assert.ok(logs.cache.includes("aster.catalog.cache_readiness_changed"));
  return Object.freeze({
    diagnosis: "catalog_redis_degraded",
    userOutcome: metricDelta.good >= 1 ? "latency_qualified" : "completed_over_latency_target",
  });
}

async function docker(args, timeout = 20_000) {
  const result = await execute("docker", args, {
    cwd: root,
    signal: operationSignal(timeout),
    killSignal: "SIGKILL",
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  return `${result.stdout}${result.stderr}`.trim();
}

const composePrefix = [
  "compose",
  "--parallel",
  "2",
  "--project-name",
  project,
  ...COMPOSE_FILES.flatMap((file) => ["--file", file]),
  "--profile",
  "full",
];
const compose = (args, timeout) => docker([...composePrefix, ...args], timeout);

async function boundedResponse(url, options = {}, maximum = 1024 * 1024) {
  const response = await nativeFetch(url, {
    redirect: "error",
    ...options,
    signal: operationSignal(5_000),
  });
  const declared = Number(response.headers.get("content-length") ?? 0);
  assert.ok(
    !Number.isFinite(declared) || declared <= maximum,
    "Response declares an oversized body.",
  );
  const reader = response.body?.getReader();
  const chunks = [];
  let size = 0;
  if (reader) {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        break;
      }
      size += next.value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new Error("Diagnostic response exceeds its bound.");
      }
      chunks.push(next.value);
    }
  }
  const body = Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    size,
  ).toString("utf8");
  return { status: response.status, body };
}

async function json(url, options, maximum) {
  const response = await boundedResponse(url, options, maximum);
  return { ...response, value: response.body ? JSON.parse(response.body) : undefined };
}

async function waitFor(description, operation, accept, timeoutMs = 30_000, intervalMs = 500) {
  assert.ok(Number.isInteger(intervalMs) && intervalMs >= 25 && intervalMs <= 1_000);
  const deadline = Math.min(Date.now() + timeoutMs, runDeadline);
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await operation();
      if (accept(value)) {
        return value;
      }
    } catch (error) {
      if (runSignal?.aborted) {
        throw new Error("Diagnostic execution interrupted.", { cause: error });
      }
      lastError = error;
    }
    await delay(Math.max(1, Math.min(intervalMs, deadline - Date.now())));
  }
  throw new Error(`Timed out waiting for ${description}.`, lastError ? { cause: lastError } : {});
}

async function hostPort(service, containerPort) {
  const output = await compose(["port", service, String(containerPort)]);
  const match = /^127\.0\.0\.1:([1-9][0-9]{3,4})$/u.exec(output);
  assert.ok(match, `${service} must publish one ephemeral IPv4 loopback port.`);
  return Number(match[1]);
}

async function containerId(service) {
  const id = (
    await docker([
      "ps",
      "--all",
      "--quiet",
      "--no-trunc",
      "--filter",
      `label=com.docker.compose.project=${project}`,
      "--filter",
      `label=com.docker.compose.service=${service}`,
    ])
  ).trim();
  assert.match(id, /^[a-f0-9]{64}$/u, `Expected exactly one ${service} container.`);
  return id;
}

async function postgresScalar(statement, timeout = 10_000) {
  return docker(
    [
      "exec",
      await containerId("postgres"),
      "psql",
      "--no-psqlrc",
      "--quiet",
      "--tuples-only",
      "--no-align",
      "--username",
      "aster",
      "--dbname",
      "aster",
      "--command",
      statement,
    ],
    timeout,
  );
}

async function startPostgresFailureBarrier() {
  const postgres = await containerId("postgres");
  await docker(
    [
      "exec",
      "--detach",
      postgres,
      "psql",
      "--no-psqlrc",
      "--quiet",
      "--set",
      "ON_ERROR_STOP=1",
      "--username",
      "aster",
      "--dbname",
      "aster",
      "--command",
      "SET application_name = 'aster-p12-diagnostic-lock'; BEGIN; LOCK TABLE catalog.public_candidates IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(30); COMMIT;",
    ],
    10_000,
  );
  await waitFor(
    "diagnostic PostgreSQL lock",
    () =>
      postgresScalar(
        "SELECT count(*) FROM pg_stat_activity WHERE application_name = 'aster-p12-diagnostic-lock';",
      ),
    (value) => value === "1",
    5_000,
  );
}

async function waitForBlockedCatalogQuery() {
  await waitFor(
    "Catalog PostgreSQL query barrier",
    () =>
      postgresScalar(
        "SELECT count(*) FROM pg_stat_activity WHERE application_name = 'aster' AND wait_event_type = 'Lock' AND query LIKE '%catalog.public_candidates%' AND query NOT LIKE '%FROM pg_roles%';",
      ),
    (value) => Number(value) >= 1,
    5_000,
    50,
  );
}

async function clearPostgresFailureBarrier() {
  await postgresScalar(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'aster-p12-diagnostic-lock';",
  );
  await waitFor(
    "diagnostic PostgreSQL lock cleanup",
    () =>
      postgresScalar(
        "SELECT count(*) FROM pg_stat_activity WHERE application_name = 'aster-p12-diagnostic-lock';",
      ),
    (value) => value === "0",
    5_000,
  );
}

async function waitServiceHealth(service, timeoutMs = 60_000) {
  const id = await containerId(service);
  return waitFor(
    `${service} health`,
    async () =>
      docker([
        "inspect",
        "--format",
        "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}",
        id,
      ]),
    (value) => value === "healthy" || value === "running",
    timeoutMs,
  );
}

async function logs(service, since) {
  return docker(["logs", "--since", since, "--tail", "240", await containerId(service)]);
}

async function titleDetail(routerPort, id) {
  const body = JSON.stringify({
    operationName: "TitleDetail",
    query: TITLE_DETAIL,
    variables: { id, locale: "en" },
  });
  assert.ok(Buffer.byteLength(body) < 16_384);
  const response = await new Promise((resolveResponse, reject) => {
    const outgoing = request(
      {
        hostname: "127.0.0.1",
        port: routerPort,
        path: "/graphql",
        method: "POST",
        signal: operationSignal(5_000),
        headers: {
          host: "127.0.0.1:4000",
          origin: "http://127.0.0.1:4000",
          "x-aster-csrf": "1",
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(body)),
          connection: "close",
        },
      },
      (incoming) => {
        const chunks = [];
        let size = 0;
        incoming.on("data", (chunk) => {
          size += chunk.byteLength;
          if (size > 64 * 1024) {
            incoming.destroy(new Error("GraphQL response exceeds 64 KiB."));
          } else {
            chunks.push(chunk);
          }
        });
        incoming.once("error", reject);
        incoming.once("end", () => {
          try {
            resolveResponse({
              status: incoming.statusCode,
              value: JSON.parse(Buffer.concat(chunks, size).toString("utf8")),
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    outgoing.once("error", reject);
    outgoing.end(body);
  });
  assert.equal(response.status, 200);
  assert.ok(response.value && typeof response.value === "object");
  return response.value;
}

async function prometheusValue(prometheusPort, query) {
  const response = await json(
    `http://127.0.0.1:${prometheusPort}/api/v1/query?${new URLSearchParams({ query })}`,
    undefined,
    256 * 1024,
  );
  assert.equal(response.status, 200);
  assert.equal(response.value?.status, "success");
  const results = response.value?.data?.result;
  assert.ok(Array.isArray(results));
  if (results.length === 0) {
    return undefined;
  }
  assert.equal(results.length, 1);
  const value = Number(results[0]?.value?.[1]);
  assert.ok(Number.isFinite(value));
  return value;
}

async function metricSnapshot(prometheusPort) {
  return {
    population: (await prometheusValue(prometheusPort, POPULATION_COUNTER)) ?? 0,
    good: (await prometheusValue(prometheusPort, GOOD_COUNTER)) ?? 0,
    releasedRatio: await prometheusValue(prometheusPort, RELEASED_SLI),
  };
}

async function settledMetricSnapshot(prometheusPort) {
  let previous = await metricSnapshot(prometheusPort);
  for (let attempt = 0; attempt < 3; attempt++) {
    await delay(5_500);
    const current = await metricSnapshot(prometheusPort);
    if (current.population === previous.population && current.good === previous.good) {
      return current;
    }
    previous = current;
  }
  throw new Error("Catalog SLI source counters did not settle before failure injection.");
}

async function waitMetricDelta(prometheusPort, before) {
  const after = await waitFor(
    "Catalog SLI source counter",
    () => metricSnapshot(prometheusPort),
    (value) => value.population >= before.population + 1,
    30_000,
  );
  return {
    after,
    delta: {
      population: after.population - before.population,
      good: after.good - before.good,
    },
  };
}

async function operationEvent(since) {
  const source = await waitFor(
    "correlated Router operation log",
    () => logs("router", since),
    (value) =>
      parseJsonLines(value).some(
        (event) =>
          event.kind === "aster.router.operation" &&
          event["aster.operation"] === "TitleDetail" &&
          /^[a-f0-9]{32}$/u.test(event.trace_id ?? ""),
      ),
    15_000,
  );
  const event = parseJsonLines(source).find(
    (candidate) =>
      candidate.kind === "aster.router.operation" &&
      candidate["aster.operation"] === "TitleDetail" &&
      /^[a-f0-9]{32}$/u.test(candidate.trace_id ?? ""),
  );
  assert.ok(event);
  return { event, source };
}

async function catalogOperationEvent(since, expectedTraceId) {
  const source = await waitFor(
    "correlated Catalog operation log",
    () => logs("catalog", since),
    (value) =>
      parseJsonLines(value).some(
        (event) =>
          event.event === "aster.catalog.graphql_completed" &&
          event.attributes?.trace_id === expectedTraceId,
      ),
    15_000,
  );
  const context = catalogOperationTraceContext(source, expectedTraceId);
  assert.equal(
    context.declaredTraceId,
    expectedTraceId,
    "Catalog operation log does not match the Router trace.",
  );
  return { context, source };
}

async function tempoSearch(grafanaPort, traceId, scenario) {
  const query = diagnosticTraceQuery(traceId, scenario);
  return waitFor(
    `TraceQL search for ${traceId}`,
    async () => {
      const response = await json(
        `http://127.0.0.1:${grafanaPort}/api/datasources/proxy/uid/aster-tempo/api/search?` +
          new URLSearchParams({ q: query, limit: "20" }),
        undefined,
        256 * 1024,
      );
      assert.equal(response.status, 200);
      assert.ok(Array.isArray(response.value?.traces));
      return response.value;
    },
    (response) => diagnosticTraceReady(response, traceId, scenario),
    45_000,
  );
}

export function assertStoredTraceMatches(value, traceId) {
  assert.match(traceId, /^[a-f0-9]{32}$/u, "Diagnostic trace ID is invalid.");
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  const expectedOtlpTraceId = Buffer.from(traceId, "hex").toString("base64");
  const resourceSpans = value.trace?.resourceSpans;
  assert.ok(Array.isArray(resourceSpans), "Tempo did not return an OTLP JSON trace.");
  const storedTraceIds = resourceSpans.flatMap((resourceSpan) =>
    (resourceSpan.scopeSpans ?? []).flatMap((scopeSpan) =>
      (scopeSpan.spans ?? []).map((span) => span.traceId),
    ),
  );
  assert.ok(storedTraceIds.length > 0, "Tempo returned a trace without spans.");
  assert.ok(
    storedTraceIds.every((storedTraceId) => storedTraceId === expectedOtlpTraceId),
    "Tempo returned a mismatched stored trace.",
  );
}

async function tempoStoredTrace(grafanaPort, traceId) {
  let previousBody;
  let stableSnapshots = 0;
  const stored = await waitFor(
    `complete Tempo trace ${traceId}`,
    async () => {
      const response = await boundedResponse(
        `http://127.0.0.1:${grafanaPort}/api/datasources/proxy/uid/aster-tempo/api/v2/traces/${traceId}`,
        undefined,
        1024 * 1024,
      );
      if (response.status !== 200) {
        return undefined;
      }
      const value = JSON.parse(response.body);
      assertStoredTraceMatches(value, traceId);
      stableSnapshots = response.body === previousBody ? stableSnapshots + 1 : 0;
      previousBody = response.body;
      return { stableSnapshots, value };
    },
    (value) => value?.stableSnapshots >= 2,
    45_000,
    1_000,
  );
  return stored.value;
}

async function waitCacheLog(state, since) {
  return waitFor(
    `Catalog cache ${state} log`,
    () => logs("catalog", since),
    (source) =>
      parseJsonLines(source).some(
        (event) =>
          event.event === "aster.catalog.cache_readiness_changed" &&
          (event.state === state || event.properties?.state === state),
      ) ||
      (source.includes("aster.catalog.cache_readiness_changed") && source.includes(state)),
    20_000,
  );
}

async function recover(service, routerPort) {
  const since = new Date(Date.now() - 1_000).toISOString();
  if (service === "postgres") {
    const paused = await docker([
      "inspect",
      "--format",
      "{{.State.Paused}}",
      await containerId(service),
    ]);
    if (paused === "true") {
      await compose(["unpause", service], 30_000);
    }
    await clearPostgresFailureBarrier();
  } else {
    await compose(["start", service], 60_000);
  }
  await waitServiceHealth(service);
  if (service === "postgres" || service === "catalog") {
    await waitServiceHealth("catalog", 60_000);
  }
  if (service === "redis") {
    await waitCacheLog("ready", since);
  }
  const response = await titleDetail(routerPort, randomUUID());
  assert.equal(response.errors, undefined, `${service} recovery did not restore TitleDetail.`);
  emit("aster.diagnostics.recovered", { service });
}

async function exercise(scenario, ports) {
  const service = scenario;
  const before = await settledMetricSnapshot(ports.prometheus);
  const since = new Date(Date.now() - 1_000).toISOString();
  let result;
  let error;
  try {
    const canary = randomUUID();
    let response;
    if (service === "postgres") {
      await startPostgresFailureBarrier();
      response = await settleDiagnosticInjection(
        titleDetail(ports.router, canary),
        (async () => {
          await waitForBlockedCatalogQuery();
          await compose(["pause", service], 30_000);
        })(),
      );
    } else {
      await compose(["stop", "--timeout", "5", service], 30_000);
      response = await titleDetail(ports.router, canary);
    }
    const router = await operationEvent(since);
    const traceId = router.event.trace_id;
    const catalogOperation =
      scenario === "catalog" ? undefined : await catalogOperationEvent(since, traceId);
    const search = await tempoSearch(ports.grafana, traceId, scenario);
    const facts = traceSearchFacts(search, traceId);
    const storedTrace = await tempoStoredTrace(ports.grafana, traceId);
    const measured = await waitMetricDelta(ports.prometheus, before);
    const catalogLogs = catalogOperation?.source ?? "";
    const cacheLogs = scenario === "redis" ? await waitCacheLog("unavailable", since) : "";
    const canaries = [canary, TITLE_DETAIL];
    assertTelemetryPrivacy(JSON.stringify(storedTrace), canaries);
    const serialized = JSON.stringify({
      search,
      router: router.source,
      catalogLogs,
      cacheLogs,
    });
    assertTelemetryPrivacy(serialized, canaries);
    const diagnosis = classifyDiagnosticScenario({
      scenario,
      response,
      metricDelta: measured.delta,
      facts,
      logs: { router: router.source, catalog: catalogLogs, cache: cacheLogs },
    });
    result = {
      scenario,
      traceId,
      diagnosis,
      metrics: {
        populationDelta: measured.delta.population,
        goodDelta: measured.delta.good,
        releasedRatio: measured.after.releasedRatio,
      },
      boundaries: diagnosticBoundaries(facts),
    };
  } catch (caught) {
    error = caught;
  }
  try {
    await recover(service, ports.router);
  } catch (recoveryError) {
    error ??= recoveryError;
  }
  if (error) {
    throw error;
  }
  assert.ok(result);
  emit("aster.diagnostics.scenario", result);
  return result;
}

async function assertCleanup() {
  const filter = `label=com.docker.compose.project=${project}`;
  const [containers, networks, volumes] = await Promise.all([
    docker(["ps", "--all", "--quiet", "--filter", filter]),
    docker(["network", "ls", "--quiet", "--filter", filter]),
    docker(["volume", "ls", "--quiet", "--filter", filter]),
  ]);
  assert.equal(containers, "", "Diagnostic containers remain after cleanup.");
  assert.equal(networks, "", "Diagnostic networks remain after cleanup.");
  assert.equal(volumes, "", "Diagnostic volumes remain after cleanup.");
}

export async function runDiagnosticExercises() {
  let stage = "configuration";
  let failure;
  const results = [];
  const interruption = new NativeAbortController();
  const interrupt = () => interruption.abort(new Error("Diagnostic execution interrupted."));
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  runSignal = interruption.signal;
  runDeadline = Date.now() + RUN_BUDGET_MS;
  try {
    await compose(["config", "--quiet"]);
    await docker(["info", "--format", "{{json .ServerVersion}}"], 10_000);
    stage = "startup";
    emit("aster.diagnostics.start", { project, scenarios: SCENARIOS.length });
    await compose(
      [
        "up",
        "--build",
        "--wait",
        "--wait-timeout",
        "180",
        "router",
        "collector",
        "prometheus",
        "grafana",
        "tempo",
        "redis",
      ],
      600_000,
    );
    const ports = {
      router: await hostPort("router", 4000),
      prometheus: await hostPort("prometheus", 9090),
      grafana: await hostPort("grafana", 3000),
    };
    const grafana = await json(`http://127.0.0.1:${ports.grafana}/api/health`, undefined, 16_384);
    assert.equal(grafana.status, 200);
    assert.equal(grafana.value?.database, "ok");
    const datasource = await json(
      `http://127.0.0.1:${ports.grafana}/api/datasources/uid/aster-tempo`,
      undefined,
      32_768,
    );
    assert.equal(datasource.status, 200);
    assert.equal(datasource.value?.uid, "aster-tempo");
    assert.equal(datasource.value?.url, "http://tempo:3200");
    await waitFor(
      "Grafana Tempo data source health",
      () =>
        json(
          `http://127.0.0.1:${ports.grafana}/api/datasources/uid/aster-tempo/health`,
          undefined,
          16_384,
        ),
      (response) => response.status === 200 && response.value?.status === "OK",
      30_000,
    );

    stage = "telemetry-warmup";
    assert.equal((await titleDetail(ports.router, randomUUID())).errors, undefined);
    await waitFor(
      "initial Catalog SLI source",
      () => metricSnapshot(ports.prometheus),
      (value) => value.population >= 1,
      30_000,
    );

    for (const scenario of SCENARIOS) {
      stage = `scenario-${scenario}`;
      results.push(await exercise(scenario, ports));
    }
    assert.deepEqual(
      results.map((result) => result.scenario),
      SCENARIOS,
    );
  } catch (error) {
    failure = error;
  } finally {
    stage = failure ? stage : "cleanup";
    runDeadline = Number.POSITIVE_INFINITY;
    runSignal = undefined;
    try {
      await compose(["down", "--volumes", "--remove-orphans", "--timeout", "10"], 120_000);
      await assertCleanup();
      emit("aster.diagnostics.cleanup", { project, status: "clean" });
    } catch (cleanupError) {
      failure ??= cleanupError;
    } finally {
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", interrupt);
    }
  }
  if (failure) {
    throw new Error(`Diagnostic exercises failed at ${stage}.`, { cause: failure });
  }
  emit("aster.diagnostics.completed", {
    scenarios: results.length,
    diagnoses: results.map((result) => result.diagnosis.diagnosis),
  });
  return results;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  await runDiagnosticExercises();
}
