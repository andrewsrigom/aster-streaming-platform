import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { URL } from "node:url";
import { promisify } from "node:util";

const project = process.argv[2];
assert.equal(process.argv.length, 3);
assert.match(project, /^aster-(?:p04-development|router-proof-[a-f0-9-]{36})$/);
const execute = promisify(execFile);
const docker = async (args) =>
  await execute("docker", args, { timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true });
const ids = {};
for (const service of ["router", "catalog", "collector"]) {
  const { stdout } = await docker([
    "ps",
    "--quiet",
    "--no-trunc",
    "--filter",
    `label=com.docker.compose.project=${project}`,
    "--filter",
    `label=com.docker.compose.service=${service}`,
  ]);
  const id = stdout.trim();
  assert.match(id, /^[a-f0-9]{64}$/);
  const [info] = JSON.parse((await docker(["inspect", id])).stdout);
  assert.equal(info.Config.Labels["com.aster.environment"], "local");
  assert.equal(info.Config.Labels["com.aster.scope"], "platform");
  assert.equal(info.State.Paused, false);
  ids[service] = id;
}
const record = (event, data = {}) =>
  process.stdout.write(JSON.stringify({ event, ...data }) + "\n");
const before = new Date().toISOString();
let stopped = false;
let sinkStopped = false;
let stage = "cancellation";
let recovered = false;
try {
  const probe = await readFile(
    new URL("../services/catalog/test/router-cancellation-probe.mjs", import.meta.url),
    "utf8",
  );
  const result = await docker(["exec", ids.catalog, "node", "--input-type=module", "-e", probe]);
  const observed = JSON.parse(result.stdout);
  assert.equal(observed.readObserved, true);
  const log = await docker(["logs", "--since", before, ids.catalog]);
  const events = (log.stdout + log.stderr)
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line));
  const cancelled = events.find(
    (event) =>
      event.event === "aster.catalog.graphql_completed" && event.attributes?.code === "CANCELLED",
  );
  assert.ok(cancelled, "Owner must observe cancellation, not statement/Router timeout.");
  assert.ok(
    cancelled.durationMs < 900,
    "Cancellation must beat the 1000 ms database statement timeout.",
  );
  record("aster.router.cancellation_verified", {
    ownerDurationMs: Math.round(cancelled.durationMs),
    readObserved: true,
  });

  stage = "telemetry-outage";
  sinkStopped = true;
  await docker(["stop", "--time", "5", ids.collector]);
  const response = await globalThis.fetch("http://127.0.0.1:4000/graphql", {
    method: "POST",
    headers: {
      origin: "http://127.0.0.1:4000",
      "x-aster-csrf": "1",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      operationName: "Browse",
      query: "query Browse { titles(first:1) { pageInfo { hasNextPage } } }",
    }),
    signal: globalThis.AbortSignal.timeout(4000),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).errors, undefined);
  record("aster.router.telemetry_outage_verified");

  stage = "shutdown";
  const started = performance.now();
  stopped = true;
  await docker(["stop", "--time", "10", ids.router]);
  const [state] = JSON.parse((await docker(["inspect", ids.router])).stdout);
  assert.equal(state.State.Running, false);
  assert.equal(state.State.ExitCode, 0);
  assert.equal(state.State.OOMKilled, false);
  assert.ok(performance.now() - started < 10000);
  record("aster.router.shutdown_verified", {
    durationMs: Math.round(performance.now() - started),
    exitCode: state.State.ExitCode,
  });
} catch {
  record("aster.router.lifecycle_failed", { stage });
  process.exitCode = 1;
} finally {
  if (sinkStopped) {
    await docker(["start", ids.collector]);
  }
  if (stopped) {
    await docker(["start", ids.router]);
  }
  for (let attempt = 0; attempt < 30; attempt++) {
    const [info] = JSON.parse((await docker(["inspect", ids.router])).stdout);
    if (info.State.Health?.Status === "healthy") {
      recovered = true;
      record("aster.router.health_recovered");
      break;
    }
    await delay(250);
  }
}
assert.ok(recovered, "Router health did not recover after lifecycle probe.");
