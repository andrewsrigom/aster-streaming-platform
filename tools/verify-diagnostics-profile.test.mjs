import assert from "node:assert/strict";
import test from "node:test";

import {
  readDiagnosticsSources,
  validateDiagnosticProjectName,
  validateDiagnosticsProfile,
} from "./verify-diagnostics-profile.mjs";

const valid = await readDiagnosticsSources();

test("accepts the bounded diagnostic profile", () => {
  assert.deepEqual(validateDiagnosticsProfile(valid), []);
});

test("accepts only internally generated UUID-scoped diagnostic projects", () => {
  assert.equal(
    validateDiagnosticProjectName("aster-p12-diagnostics-00000000-0000-4000-8000-000000000001"),
    true,
  );
  for (const value of [
    "aster",
    "aster-p04-development",
    "aster-p12-diagnostics-00000000-0000-0000-0000-000000000000",
    "aster-p12-diagnostics-00000000-0000-4000-8000-000000000001;rm",
  ]) {
    assert.equal(validateDiagnosticProjectName(value), false, value);
  }
});

test("rejects weakened storage, network, resource, retention and exporter bounds", () => {
  for (const [file, before, after] of [
    ["proof", 'ports: !override ["127.0.0.1::3200"]', 'ports: !override ["0.0.0.0::3200"]'],
    ["compose", "mem_limit: 384m", "mem_limit: 4g"],
    ["compose", "/var/tempo:size=128m", "/var/tempo:size=1g"],
    [
      "compose",
      '    networks: [platform, edge]\n    user: "10001:10001"',
      '    ports:\n      - "127.0.0.1:3200:3200"\n    networks: [platform, edge]\n    user: "10001:10001"',
    ],
    ["compose", 'restart: "no"', "restart: always"],
    ["proof", "ports: !override", "ports:"],
    ["proof", "volumes: !reset []", "volumes: [postgres-data:/var/lib/postgresql]"],
    ["tempo", "block_retention: 1h", "block_retention: 24h"],
    ["tempo", "max_traces_per_user: 256", "max_traces_per_user: 0"],
    ["tempo", "max_query_expression_size_bytes: 4096", "max_query_expression_size_bytes: 0"],
    ["collector", "queue_size: 128", "queue_size: 0"],
    ["collector", "max_elapsed_time: 2s", "max_elapsed_time: 0s"],
    ["collector", "span/router_names, attributes/router_privacy", "span/router_names"],
    ["datasource", "editable: false", "editable: true"],
    ["tempoDockerfile", "@sha256:", "@changed:"],
  ]) {
    const changed = { ...valid, [file]: valid[file].replace(before, after) };
    assert.ok(validateDiagnosticsProfile(changed).length > 0, `${file}: ${before}`);
  }
});

test("rejects an externally selected or broadly destructive runner", () => {
  for (const value of ["process.argv[2]", "docker system prune", "wsl --shutdown"]) {
    const changed = { ...valid, runner: `${valid.runner}\n// ${value}` };
    assert.ok(validateDiagnosticsProfile(changed).length > 0, value);
  }
  for (const [before, after] of [
    ["signal: operationSignal(timeout),", "timeout,"],
    ["const RUN_BUDGET_MS = 12 * 60 * 1000;", "const RUN_BUDGET_MS = 24 * 60 * 1000;"],
    ['process.once("SIGTERM", interrupt);', ""],
    ['killSignal: "SIGKILL",', 'killSignal: "SIGTERM",'],
    [
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'aster-p12-diagnostic-lock';",
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity;",
    ],
  ]) {
    const changed = { ...valid, runner: valid.runner.replace(before, after) };
    assert.ok(validateDiagnosticsProfile(changed).length > 0, before);
  }
});
