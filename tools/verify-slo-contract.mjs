import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED = Object.freeze({
  supergraph: Object.freeze({ owner: "Platform", target: 0.999, window: "30d", latency: 3 }),
  catalog_title_read: Object.freeze({
    owner: "Catalog",
    target: 0.999,
    window: "28d",
    latency: 0.3,
  }),
  playback_start: Object.freeze({
    owner: "Playback",
    target: 0.999,
    window: "30d",
    latency: 0.5,
  }),
  progress_write: Object.freeze({
    owner: "Engagement",
    target: 0.9995,
    window: "30d",
    latency: 0.4,
  }),
});

const EXPECTED_SOURCES = Object.freeze({
  supergraph: Object.freeze({
    populationMetric: "http_server_request_duration_seconds_count",
    goodMetric: "http_server_request_duration_seconds_count",
    scrapeJob: "aster-router",
  }),
  catalog_title_read: Object.freeze({
    populationMetric: "http_server_request_duration_seconds_count",
    goodMetric: "http_server_request_duration_seconds_bucket",
    scrapeJob: "aster-router",
  }),
  playback_start: Object.freeze({
    populationMetric: "aster_product_operation_outcomes_total",
    goodMetric: "aster_product_operation_duration_seconds_bucket",
    scrapeJob: "aster-local",
  }),
  progress_write: Object.freeze({
    populationMetric: "aster_product_operation_outcomes_total",
    goodMetric: "aster_product_operation_duration_seconds_bucket",
    scrapeJob: "aster-local",
  }),
});

const FORBIDDEN_QUERY_TEXT = Object.freeze([
  "user_id",
  "account_id",
  "profile_id",
  "title_id",
  "request_id",
  "trace_id",
  "signed_url",
  "graphql_document",
  "graphql_operation_name",
]);

function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value, maximum = 768) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function parsedRules(source) {
  return [
    ...source.matchAll(
      /^ {6}- record: (\S+)\n(?: {8}labels:\n {10}sli: (\S+)\n)? {8}expr: (.+)$/gmu,
    ),
  ].map((match) => ({ record: match[1], sli: match[2], expression: match[3] }));
}

export async function readSloSources(root) {
  const paths = {
    contract: "infra/observability/slo-contract.json",
    rules: "infra/observability/slo-rules.yml",
    ruleTests: "infra/observability/slo-rules.test.yml",
    routerConfig: "infra/router/router.yaml",
    routerPolicy: "infra/router/main.rhai",
    prometheusConfig: "infra/compose/prometheus.local.yml",
    prometheusImage: "infra/docker/prometheus.Dockerfile",
    metricCatalog: "packages/telemetry/src/infrastructure/metric-catalog.ts",
  };
  const sources = Object.fromEntries(
    await Promise.all(
      Object.entries(paths).map(async ([name, path]) => [
        name,
        await readFile(resolve(root, path), "utf8"),
      ]),
    ),
  );
  return { ...sources, contract: JSON.parse(sources.contract) };
}

export function validateSloContract(sources) {
  const violations = [];
  const reject = (detail) => violations.push({ rule: "slo-contract", detail });
  const contract = sources.contract;
  if (!record(contract) || contract.schemaVersion !== 1) {
    return [{ rule: "slo-contract", detail: "contract must use schema version 1" }];
  }
  if (contract.recordingWindow !== "5m" || contract.localRetention !== "1h") {
    reject("recording and local-retention boundaries must remain explicit");
  }
  const slis = Array.isArray(contract.slis) ? contract.slis : [];
  if (slis.length !== 4 || new Set(slis.map((sli) => sli?.id)).size !== 4) {
    reject("exactly four unique critical-journey SLIs are required");
  }

  const expectedRules = [];
  for (const sli of slis) {
    if (!record(sli) || typeof sli.id !== "string" || !(sli.id in EXPECTED)) {
      reject("unknown SLI definition");
      continue;
    }
    const expected = EXPECTED[sli.id];
    if (
      sli.owner !== expected.owner ||
      !boundedText(sli.population) ||
      !boundedText(sli.goodEvent) ||
      !boundedText(sli.aggregation) ||
      !boundedText(sli.userImpact)
    ) {
      reject(`${sli.id} is missing its owner or bounded semantic definition`);
    }
    if (
      !Array.isArray(sli.exclusions) ||
      sli.exclusions.length < 1 ||
      sli.exclusions.length > 8 ||
      sli.exclusions.some((value) => !boundedText(value, 160))
    ) {
      reject(`${sli.id} exclusions must be a finite non-empty vocabulary`);
    }
    const expectedSource = EXPECTED_SOURCES[sli.id];
    if (
      !record(sli.source) ||
      sli.source.scrapeJob !== expectedSource.scrapeJob ||
      sli.source.populationMetric !== expectedSource.populationMetric ||
      sli.source.goodMetric !== expectedSource.goodMetric ||
      !boundedText(sli.source.owner, 64)
    ) {
      reject(`${sli.id} has an unsupported source`);
    }
    if (
      !record(sli.objective) ||
      sli.objective.target !== expected.target ||
      sli.objective.window !== expected.window ||
      sli.objective.latencySeconds !== expected.latency ||
      Math.abs(sli.objective.errorBudgetFraction - (1 - expected.target)) > 1e-12
    ) {
      reject(`${sli.id} objective or error-budget arithmetic drifted`);
    }
    if (
      !record(sli.recordingQueries) ||
      !boundedText(sli.recordingQueries.population, 1024) ||
      !boundedText(sli.recordingQueries.good, 1024) ||
      !boundedText(sli.objectiveQuery, 2048) ||
      !sli.recordingQueries.population.includes(sli.source.populationMetric) ||
      !sli.recordingQueries.good.includes(sli.source.goodMetric) ||
      !sli.recordingQueries.population.includes(`[${contract.recordingWindow}]`) ||
      !sli.recordingQueries.good.includes(`[${contract.recordingWindow}]`) ||
      !sli.objectiveQuery.includes(`[${sli.objective.window}]`)
    ) {
      reject(`${sli.id} lacks executable recording or objective-window queries`);
      continue;
    }
    const queryText = [
      sli.recordingQueries.population,
      sli.recordingQueries.good,
      sli.objectiveQuery,
    ]
      .join(" ")
      .toLowerCase();
    for (const forbidden of FORBIDDEN_QUERY_TEXT) {
      if (queryText.includes(forbidden)) {
        reject(`${sli.id} query contains prohibited high-cardinality text: ${forbidden}`);
      }
    }
    expectedRules.push(
      {
        record: "aster:sli:population:rate5m",
        sli: sli.id,
        expression: sli.recordingQueries.population,
      },
      {
        record: "aster:sli:good:rate5m",
        sli: sli.id,
        expression: sli.recordingQueries.good,
      },
    );
  }

  const rules = parsedRules(sources.rules ?? "");
  const expectedRatio = {
    record: "aster:sli:good:ratio_rate5m",
    sli: undefined,
    expression: "aster:sli:good:rate5m / aster:sli:population:rate5m",
  };
  if (
    JSON.stringify(rules) !== JSON.stringify([...expectedRules, expectedRatio]) ||
    !(sources.rules ?? "").includes("interval: 15s\n    limit: 8\n") ||
    /(vector\(1\)|clamp_min\([^\n]*1)/u.test(sources.rules ?? "")
  ) {
    reject("recording rules must exactly implement the finite contract without no-traffic success");
  }

  const routerConfig = sources.routerConfig ?? "";
  for (const required of [
    "instruments:\n      default_requirement_level: none\n",
    "http.server.request.duration:\n          attributes:\n",
    "response_context: aster.operation\n",
    "response_context: aster.outcome\n",
    "cardinality_limit: 128\n",
    "allowed_attribute_keys: [aster.operation, aster.outcome]\n",
  ]) {
    if (!routerConfig.includes(required)) {
      reject(`Router SLI metric boundary missing: ${required.trim()}`);
    }
  }
  if (/graphql\.operation\.name|graphql\.document/u.test(routerConfig)) {
    reject("Router SLI metrics cannot retain arbitrary operation names or documents");
  }
  const routerBucketBlock =
    /name: http\.server\.request\.duration\n\s+aggregation:\n\s+histogram:\n\s+buckets: \[([^\]]+)\]/u.exec(
      routerConfig,
    )?.[1];
  const routerBuckets = new Set((routerBucketBlock?.match(/\d+(?:\.\d+)?/gu) ?? []).map(Number));
  for (const sli of slis.filter(
    (candidate) =>
      candidate?.source?.scrapeJob === "aster-router" &&
      candidate?.source?.goodMetric?.endsWith("_bucket"),
  )) {
    const latency = record(sli.objective) ? sli.objective.latencySeconds : undefined;
    if (typeof latency !== "number" || !routerBuckets.has(latency)) {
      reject(`${sli.id} requires a Router-duration bucket exported by the runtime`);
    }
  }

  const routerPolicy = sources.routerPolicy ?? "";
  for (const required of [
    'request.context["aster.operation"] = if name in known { name } else { "other" }',
    'response.context["aster.outcome"] = if failed { "failed" } else if rejected { "rejected" } else { "completed" }',
    '"GRAPHQL_VALIDATION_FAILED", "GRAPHQL_PARSE_FAILED"',
  ]) {
    if (!routerPolicy.includes(required)) {
      reject(`Router outcome classification missing: ${required}`);
    }
  }

  const prometheus = sources.prometheusConfig ?? "";
  for (const required of [
    "rule_files:\n  - /etc/aster/slo-rules.yml\n",
    "job_name: aster-router\n",
    "targets: [router:9091]",
    "sample_limit: 500\n",
    "label_limit: 16\n",
  ]) {
    if (!prometheus.includes(required)) {
      reject(`Prometheus SLI boundary missing: ${required.trim()}`);
    }
  }
  if (
    !(sources.prometheusImage ?? "").includes(
      "COPY infra/observability/slo-rules.yml /etc/aster/slo-rules.yml",
    )
  ) {
    reject("Prometheus image must bake the reviewed SLI rules");
  }
  const productBucketBlock =
    /PRODUCT_DURATION_BUCKETS_SECONDS = Object\.freeze\(\[([\s\S]*?)\]\);/u.exec(
      sources.metricCatalog ?? "",
    )?.[1];
  const productBuckets = new Set((productBucketBlock?.match(/\d+(?:\.\d+)?/gu) ?? []).map(Number));
  for (const sli of slis.filter((candidate) => candidate?.source?.scrapeJob === "aster-local")) {
    const latency = record(sli.objective) ? sli.objective.latencySeconds : undefined;
    if (typeof latency !== "number" || !productBuckets.has(latency)) {
      reject(`${sli.id} requires a product-duration bucket exported by the runtime`);
    }
  }
  if (
    !(sources.ruleTests ?? "").includes("excluded-only traffic creates no SLI ratio") ||
    !(sources.ruleTests ?? "").includes("good bad and excluded events retain exact SLI populations")
  ) {
    reject("synthetic rules must cover good, bad, excluded and zero-population behavior");
  }
  return violations;
}

export async function runSloContractCheck(root = resolve(import.meta.dirname, "..")) {
  try {
    const violations = validateSloContract(await readSloSources(root));
    if (violations.length > 0) {
      console.error(
        JSON.stringify({ check: "slo-contract", status: "error", violations }, null, 2),
      );
      return 1;
    }
    console.log(JSON.stringify({ check: "slo-contract", status: "ok", slis: 4 }));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({ check: "slo-contract", status: "error", errors: [message] }, null, 2),
    );
    return 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  process.exitCode = await runSloContractCheck();
}
