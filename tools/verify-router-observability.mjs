import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

const project = process.argv[2];
assert.equal(process.argv.length, 3);
assert.match(project, /^aster(?:-p04-development|-router-proof-[a-f0-9-]{36})?$/);
const execute = promisify(execFile);
const docker = async (args) => {
  const result = await execute("docker", args, {
    timeout: 10000,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
  });
  return result.stdout + result.stderr;
};
const ids = {};
for (const service of ["router", "identity", "catalog", "collector"]) {
  const id = (
    await docker([
      "ps",
      "--quiet",
      "--no-trunc",
      "--filter",
      `label=com.docker.compose.project=${project}`,
      "--filter",
      `label=com.docker.compose.service=${service}`,
    ])
  ).trim();
  assert.match(id, /^[a-f0-9]{64}$/);
  ids[service] = id;
}
const origin = "http://127.0.0.1:4000";
const canaries = [
  "UserChosenOperationCanary",
  "zz-private-locale-canary",
  "telemetry.cookie.canary",
];
async function query(operationName, query, variables, extraHeaders = {}) {
  const response = await globalThis.fetch(origin + "/graphql", {
    method: "POST",
    headers: { origin, "x-aster-csrf": "1", "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify({ operationName, query, variables }),
    signal: globalThis.AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.errors, undefined);
  return body;
}

const before = new Date().toISOString();
await query(
  canaries[0],
  "query UserChosenOperationCanary($locale:String!) { titles(first:1) { edges { node { localized(locale:$locale) { title } } } pageInfo { hasNextPage } } }",
  { locale: canaries[1] },
  { cookie: "aster_local_session=" + canaries[2] },
);
const mixed = await query(
  "ViewerAndTitle",
  "query ViewerAndTitle($id:ID!) { me { accountId } title(id:$id) { id } }",
  { id: randomUUID() },
  { "apollo-expose-query-plan": "true" },
);
const plan = mixed.extensions?.apolloQueryPlan;
assert.ok(plan, "Enable the explicit Router diagnostic overlay for this check.");
assert.ok(JSON.stringify(plan).includes("Parallel"));
assert.ok(JSON.stringify(plan).includes("identity") && JSON.stringify(plan).includes("catalog"));
let logs;
let traces;
for (let attempt = 0; attempt < 20; attempt++) {
  logs = await docker(["logs", "--since", before, ids.router]);
  traces = await docker(["logs", "--since", before, ids.collector]);
  if (traces.includes("ViewerAndTitle") && traces.includes("subgraph")) {
    break;
  }
  await delay(250);
}
const metricText = await docker([
  "exec",
  ids.identity,
  "node",
  "--input-type=module",
  "-e",
  'const r=await fetch("http://router:9091/metrics",{signal:AbortSignal.timeout(2000)});if(r.status!==200)throw new Error("Metrics unavailable");const t=await r.text();if(t.length>1048576)throw new Error("Metrics oversized");process.stdout.write(t);',
]);
const identityLogs = await docker(["logs", "--since", before, ids.identity]);
const catalogLogs = await docker(["logs", "--since", before, ids.catalog]);
const ownerLogs = identityLogs + catalogLogs;
const allTelemetry = logs + traces + metricText + ownerLogs;
for (const canary of canaries) {
  assert.ok(!allTelemetry.includes(canary), "Telemetry exposed a private canary.");
}
assert.ok(!allTelemetry.includes("graphql.document"), "Raw documents must not be exported.");
const events = logs
  .split("\n")
  .filter((line) => line.startsWith("{"))
  .map((line) => JSON.parse(line));
const operation = events.find(
  (event) =>
    event.kind === "aster.router.operation" && event["aster.operation"] === "ViewerAndTitle",
);
assert.ok(operation && Number.isFinite(operation.duration_ms));
assert.match(operation.trace_id, /^[a-f0-9]{32}$/);
assert.ok(
  identityLogs.includes(operation.trace_id) && catalogLogs.includes(operation.trace_id),
  "Both owners must retain the authenticated Router trace ID.",
);
assert.ok(traces.includes(operation.trace_id), "Collector must receive the actual Router trace.");
assert.ok(
  events.some(
    (event) => event.kind === "aster.router.operation" && event["aster.operation"] === "other",
  ),
);
assert.ok(
  metricText.includes("http_request_duration") ||
    metricText.includes("http_server_request_duration"),
);
process.stdout.write(
  JSON.stringify({
    event: "aster.router.observability_verified",
    plan,
    operation,
    traceExport: traces,
    privacyCanaries: canaries.length,
    ownerTraceCorrelation: true,
  }) + "\n",
);
