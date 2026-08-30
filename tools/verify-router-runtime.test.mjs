import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { serviceBlock } from "./verify-optional-platform.mjs";
import {
  readRouterSources,
  validateRouterRuntime,
  validateRouterSources,
} from "./verify-router-runtime.mjs";

const root = resolve(import.meta.dirname, "..");
const compose = await readFile(resolve(root, "infra/compose/compose.yml"), "utf8");
const sources = await readRouterSources(root);

test("Router topology and source pin private bounded runtime without a GraphOS account", () => {
  assert.deepEqual(validateRouterRuntime(compose), []);
  assert.deepEqual(validateRouterSources(sources), []);
});

test("anonymous Router startup uses the base dependency graph without optional Identity", async () => {
  const block = serviceBlock(compose, "router");
  assert.ok(!block.includes("      identity:\n"));
  const coupled = compose.replace(
    block,
    block.replace(
      "    depends_on:\n",
      "    depends_on:\n      identity:\n        condition: service_healthy\n",
    ),
  );
  assert.ok(validateRouterRuntime(coupled).length);
  const proof = await readFile(resolve(root, "infra/compose/playback-proof.yml"), "utf8");
  assert.ok(!proof.includes("depends_on:"), "The proof cannot replace the base startup graph.");
});

test("Router and initializer reject weakened trust, network and lifecycle boundaries", () => {
  for (const name of ["router", "router-trust-init"]) {
    const block = serviceBlock(compose, name);
    for (const [before, after] of [
      ['user: "1000:1000"', 'user: "0:0"'],
      ["read_only: true", "read_only: false"],
      ["cap_drop: [ALL]", "cap_add: [SYS_ADMIN]"],
      ["pids:", "x-pids:"],
      ["stop_grace_period:", "x-stop_grace_period:"],
      ["    volumes:\n", "    entrypoint: [sh]\n    volumes:\n"],
      [
        "identity-router-trust:/run/aster-router/identity",
        "catalog-router-trust:/run/aster-router/identity",
      ],
    ]) {
      assert.ok(
        validateRouterRuntime(compose.replace(block, block.replace(before, after))).length,
        name + ": " + before,
      );
    }
  }
  for (const [before, after] of [
    ["127.0.0.1:4000:4000", "0.0.0.0:4000:4000"],
    ["network_mode: none", "network_mode: host"],
    ["condition: service_healthy", "condition: service_started"],
    ['APOLLO_EXPOSE_QUERY_PLAN: "false"', 'APOLLO_EXPOSE_QUERY_PLAN: "true"'],
    ["com.aster.authority: disposable-local", "com.aster.authority: durable-local"],
  ]) {
    assert.ok(validateRouterRuntime(compose.replace(before, after)).length, before);
  }
});

test("Router packaging and config reject unsafe limits, notices and propagation", () => {
  for (const [file, before, after] of [
    ["infra/docker/router.Dockerfile", "@sha256:", "@changed:"],
    ["infra/docker/router.Dockerfile", "COPY LICENSE", "COPY README.md"],
    ["infra/docker/router.Dockerfile", "--timeout=2s", "--timeout=200s"],
    ["infra/docker/router-trust.Dockerfile", "-m 0700", "-m 0777"],
    ["infra/docker/router-trust.Dockerfile", "USER node", "USER root"],
    ["infra/router/router.yaml", "concurrency_limit: 8", "concurrency_limit: 800"],
    ["infra/router/router.yaml", "early_cancel: true", "early_cancel: false"],
    ["infra/router/router.yaml", "http://127.0.0.1:3000", "*"],
    ["infra/router/router.yaml", "allow_credentials: true", "allow_credentials: false"],
    ["infra/router/router.yaml", "required_headers: [x-aster-csrf]", "required_headers: []"],
    ["infra/router/router.yaml", "timeout: 2s", "timeout: 200s"],
    ["infra/router/router.yaml", "timeout: 2700ms", "timeout: 4s"],
    [
      "infra/router/router.yaml",
      "    deduplicate_query: false\n",
      "    deduplicate_query: false\n    retry:\n      attempts: 2\n",
    ],
    [
      "infra/router/router.yaml",
      "    playback:\n      timeout: 2700ms\n",
      "    playback: { timeout: 2700ms, retry: { attempts: 2 } }\n",
    ],
    [
      "infra/router/router.yaml",
      "    engagement:\n      timeout: 2700ms\n",
      '    engagement: { timeout: 2700ms, "retry": { attempts: 2 } }\n',
    ],
    [
      "infra/router/router.yaml",
      "    concurrency_limit: 8\n",
      '    concurrency_limit: 8\n    "retr\\u0079": { attempts: 2 }\n',
    ],
    [
      "infra/router/router.yaml",
      "    concurrency_limit: 8\n",
      '    concurrency_limit: 8\n    "retr\\x79": { attempts: 2 }\n',
    ],
    [
      "infra/router/router.yaml",
      "    concurrency_limit: 8\n",
      '    concurrency_limit: 8\n    "retr\\U00000079": { attempts: 2 }\n',
    ],
    [
      "infra/router/router.yaml",
      "    concurrency_limit: 8\n",
      "    concurrency_limit: 8\n    'retry': { attempts: 2 }\n",
    ],
    [
      "infra/router/router.yaml",
      "    concurrency_limit: 8\n",
      '    concurrency_limit: 8\n    "retr\\q": { attempts: 2 }\n',
    ],
    [
      "infra/router/router.yaml",
      "    concurrency_limit: 8\n",
      '    concurrency_limit: 8\n    "${env.ASTER_ROUTER_RETRY_KEY:-retry}": { attempts: 2 }\n',
    ],
    [
      "infra/router/router.yaml",
      "    concurrency_limit: 8\n",
      '    concurrency_limit: 8\n    "\\x24{env.ASTER_ROUTER_RETRY_KEY:-retry}": { attempts: 2 }\n',
    ],
    [
      "infra/router/router.yaml",
      "traffic_shaping:\n",
      "shared: &shared { timeout: 1s }\ntraffic_shaping:\n  inherited: *shared\n",
    ],
    ["infra/router/router.yaml", "traffic_shaping:\n", "traffic_shaping: [\n"],
    ["infra/router/router.yaml", "/playback/playback.key", "/catalog/catalog.key"],
    ["infra/router/router.yaml", "max_queue_size: 128", "max_queue_size: 12800"],
    ["infra/router/router.yaml", "named: cookie", "matching: .*"],
    ["infra/router/router.yaml", "    catalog:\n", "    catalog:\n      named: cookie\n"],
    ["infra/router/router.yaml", "limits:\n", "limits:\n  max_depth: 12\n"],
    ["infra/router/LICENSE-APOLLO-ROUTER", "Elastic License 2.0", "MIT"],
  ]) {
    assert.ok(
      validateRouterSources({ ...sources, [file]: sources[file].replaceAll(before, after) }).length,
      file + ": " + before,
    );
  }
});
