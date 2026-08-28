import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, URL } from "node:url";
import { promisify } from "node:util";
import { validateCatalogProofVolume } from "./verify-catalog-runtime.mjs";

const execute = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const project = "aster-catalog-proof-" + randomUUID();
const args = [
  "compose",
  "--project-name",
  project,
  "--file",
  "infra/compose/compose.yml",
  "--file",
  "infra/compose/subgraph-diagnostics.yml",
  "--profile",
  "runtime",
];
const started = performance.now();
const docker = async (input, timeout = 15000) =>
  (
    await execute("docker", input, {
      cwd: root,
      timeout,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    })
  ).stdout.trim();
const compose = (input, timeout) => docker([...args, ...input], timeout);
const record = (event, details) =>
  process.stdout.write(JSON.stringify({ event, ...details }) + "\n");
const list = async (kind) =>
  (
    await docker([
      kind,
      "ls",
      ...(kind === "container" ? ["--all"] : []),
      "--quiet",
      "--filter",
      "label=com.docker.compose.project=" + project,
    ])
  )
    .split("\n")
    .filter(Boolean);
let runtime;
let failure;
try {
  assert.deepEqual(await list("container"), []);
  await compose(["build", "catalog", "catalog-init"], 180000);
  await compose(["up", "--detach", "--wait", "--wait-timeout", "30", "postgres"], 45000);
  const postgres = await compose(["ps", "--quiet", "postgres"]);
  assert.match(postgres, /^[a-f0-9]{64}$/);
  const sql = (statement) =>
    docker([
      "exec",
      postgres,
      "psql",
      "-U",
      "aster",
      "-d",
      "aster",
      "-v",
      "ON_ERROR_STOP=1",
      "-Atc",
      statement,
    ]);
  const first = await compose(["run", "--rm", "--no-deps", "catalog-init"], 20000);
  const repeat = await compose(["run", "--rm", "--no-deps", "catalog-init"], 20000);
  assert.ok(first.includes('"applied":[1,2,3,4,5,6,7,8,9]'));
  assert.ok(repeat.includes('"applied":[]'));
  runtime = await compose(
    [
      "run",
      "--detach",
      "--no-deps",
      "--name",
      project + "-runtime",
      "--publish",
      "127.0.0.1::3200",
      "catalog",
    ],
    20000,
  );
  const inspect = () =>
    docker(["container", "inspect", runtime]).then((text) => JSON.parse(text)[0]);
  const info = await inspect();
  runtime = info.Id;
  assert.equal(info.Config.User, "1000:1000");
  assert.equal(info.HostConfig.ReadonlyRootfs, true);
  assert.deepEqual(info.HostConfig.CapDrop, ["ALL"]);
  assert.equal(info.HostConfig.Memory, 384 * 1024 * 1024);
  assert.equal(info.HostConfig.PidsLimit, 64);
  assert.equal(info.NetworkSettings.Ports["3200/tcp"][0].HostIp, "127.0.0.1");
  const port = Number(info.NetworkSettings.Ports["3200/tcp"][0].HostPort);
  const base = "http://127.0.0.1:" + String(port);
  const health = async (path) => {
    try {
      const response = await globalThis.fetch(base + path, {
        signal: globalThis.AbortSignal.timeout(1500),
      });
      await response.body?.cancel();
      return response.status;
    } catch {
      return 0;
    }
  };
  const waitHealth = async (status) => {
    const until = performance.now() + 15000;
    do {
      if ((await health("/health/ready")) === status) {
        return;
      }
      await delay(200);
    } while (performance.now() < until);
    throw new Error("Catalog readiness deadline");
  };
  await waitHealth(200);
  const query = {
    operationName: "RuntimeCatalog",
    query: "query RuntimeCatalog { titles(first: 1) { edges { node { id } } } }",
  };
  const response = await globalThis.fetch(base + "/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(query),
    signal: globalThis.AbortSignal.timeout(3000),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { data: { titles: { edges: [] } } });
  await assert.rejects(
    sql(
      "SET ROLE aster_catalog_reader_local; INSERT INTO catalog.titles(id) VALUES ('00000000-0000-4000-8000-000000000777')",
    ),
  );
  await assert.rejects(
    sql("SET ROLE aster_catalog_reader_local; SELECT * FROM catalog.rights_revisions"),
  );
  record("catalog_docker_started", {
    image: info.Image,
    uid: 1000,
    emptyBrowse: true,
    idempotentMigrations: true,
    readerDeniedWriteAndHistory: true,
    redisRequired: false,
  });
  await sql("GRANT SELECT ON catalog.titles TO aster_catalog_reader_local");
  await waitHealth(503);
  assert.equal(await health("/health/live"), 200);
  await sql("REVOKE SELECT ON catalog.titles FROM aster_catalog_reader_local");
  await waitHealth(200);
  await docker(["stop", "--time", "5", postgres], 15000);
  await waitHealth(503);
  assert.equal(await health("/health/live"), 200);
  await docker(["start", postgres]);
  await waitHealth(200);
  const shutdownStart = performance.now();
  await docker(["stop", "--time", "15", runtime], 20000);
  const stopped = await inspect();
  assert.equal(stopped.State.OOMKilled, false);
  assert.equal(stopped.State.ExitCode, 143);
  const logs = await docker(["logs", runtime]);
  assert.ok(logs.includes("aster.catalog.graphql_completed"));
  assert.ok(logs.includes("aster.lifecycle.shutdown_completed"));
  assert.ok(logs.includes('"outcome":"completed"'));
  assert.ok(!logs.includes("aster-test-only"));
  record("catalog_docker_recovered", {
    excessPrivilegeRejected: true,
    databaseOutageRecovered: true,
    shutdownMs: Math.round(performance.now() - shutdownStart),
    exitCode: stopped.State.ExitCode,
    sanitizedLogs: true,
  });
} catch (error) {
  failure = error;
  if (runtime) {
    record("catalog_docker_failure", {
      logs: await docker(["logs", runtime]).catch(() => "unavailable"),
    });
  }
} finally {
  // This proof owns a fresh project only. Verify every resource before scoped teardown.
  const ownedIds = [];
  for (const id of await list("container")) {
    const info = JSON.parse(await docker(["container", "inspect", id]))[0];
    ownedIds.push(info.Id);
    assert.equal(info.Config.Labels["com.docker.compose.project"], project);
    assert.ok(
      ["postgres", "catalog", "catalog-init"].includes(
        info.Config.Labels["com.docker.compose.service"],
      ),
    );
    assert.ok(
      info.Mounts.every(
        (mount) => mount.Type === "volume" && mount.Name === project + "_postgres-data",
      ),
    );
  }
  const volumes = await list("volume");
  assert.ok(volumes.length <= 9);
  for (const name of volumes) {
    const [volume] = JSON.parse(await docker(["volume", "inspect", name]));
    const attachedIds = (
      await docker(["ps", "--all", "--quiet", "--no-trunc", "--filter", "volume=" + name])
    )
      .split("\n")
      .filter(Boolean);
    assert.ok(validateCatalogProofVolume(project, volume, attachedIds, ownedIds));
  }
  for (const id of await list("network")) {
    const info = JSON.parse(await docker(["network", "inspect", id]))[0];
    assert.ok([project + "_platform", project + "_edge"].includes(info.Name));
    for (const container of Object.keys(info.Containers ?? {})) {
      const info = JSON.parse(await docker(["container", "inspect", container]))[0];
      assert.equal(info.Config.Labels["com.docker.compose.project"], project);
    }
  }
  await compose(["down", "--volumes", "--remove-orphans", "--timeout", "10"], 30000);
  for (const kind of ["container", "volume", "network"]) {
    assert.deepEqual(await list(kind), []);
  }
  record("catalog_docker_cleaned", {
    remaining: 0,
    durationMs: Math.round(performance.now() - started),
  });
}
if (failure) {
  throw new Error("Catalog Docker verification failed", { cause: failure });
}
