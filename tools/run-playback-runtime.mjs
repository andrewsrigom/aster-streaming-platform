import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { promisify } from "node:util";

assert.equal(process.argv.length, 2, "Playback proof accepts no target or extra flags.");
const root = fileURLToPath(new URL("../", import.meta.url));
const project = "aster-playback-proof-" + randomUUID();
const execute = promisify(execFile);
const docker = async (args, timeout = 15000) => {
  const result = await execute("docker", args, {
    cwd: root,
    timeout,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  return result.stdout.trim();
};
const composeArgs = [
  "compose",
  "--project-name",
  project,
  "--file",
  "infra/compose/compose.yml",
  "--file",
  "infra/compose/playback-proof.yml",
  "--profile",
  "runtime",
];
const compose = (args, timeout) => docker([...composeArgs, ...args], timeout);
const allowedServices = new Set([
  "postgres",
  "catalog-init",
  "catalog",
  "playback-init",
  "playback",
  "router-trust-init",
  "router",
]);
const expectedVolumes = new Set([
  "identity-router-trust",
  "catalog-router-trust",
  "playback-router-trust",
  "playback-catalog-trust",
  "engagement-router-trust",
  "engagement-identity-trust",
  "engagement-playback-trust",
  "engagement-catalog-trust",
  "discovery-router-trust",
  "discovery-catalog-trust",
]);
const emit = (event, facts) => process.stdout.write(JSON.stringify({ event, ...facts }) + "\n");
let failure;
try {
  await compose(["config", "--quiet"]);
  emit("playback_runtime_build", { project, status: "started" });
  await compose(
    [
      "build",
      "catalog",
      "catalog-init",
      "playback",
      "playback-init",
      "router",
      "router-trust-init",
    ],
    300000,
  );
  await compose(["up", "--no-build", "--wait", "--wait-timeout", "120", "router"], 130000);
  const ids = (await compose(["ps", "--all", "--quiet"])).split("\n").filter(Boolean);
  const containers = JSON.parse(await docker(["inspect", ...ids]));
  assert.equal(containers.length, 7);
  assert.ok(
    containers.every((container) =>
      allowedServices.has(container.Config.Labels["com.docker.compose.service"]),
    ),
  );
  const playback = containers.find(
    (container) => container.Config.Labels["com.docker.compose.service"] === "playback",
  );
  assert.equal(playback.State.Health.Status, "healthy");
  emit("playback_runtime_started", {
    project,
    optionalOwnersRunning: 0,
    images: Object.fromEntries(
      containers
        .filter((container) =>
          ["playback", "catalog", "router"].includes(
            container.Config.Labels["com.docker.compose.service"],
          ),
        )
        .map((container) => [
          container.Config.Labels["com.docker.compose.service"],
          container.Image,
        ]),
    ),
  });
  const worker = await readFile(
    new URL("../services/playback/dist/test/integration/federated-session.js", import.meta.url),
    "utf8",
  );
  assert.ok(Buffer.byteLength(worker) < 32768);
  const result = await docker(
    [
      "exec",
      "--env",
      "ASTER_FIXTURE_ID=" + project,
      playback.Id,
      "node",
      "--input-type=module",
      "--eval",
      worker,
    ],
    45000,
  );
  process.stdout.write(result + "\n");
  const logs = await compose([
    "logs",
    "--no-color",
    "--tail",
    "100",
    "playback",
    "catalog",
    "router",
  ]);
  assert.ok(logs.includes("aster.playback.graphql_completed"));
  assert.ok(logs.includes("aster.catalog.graphql_completed"));
  assert.ok(logs.includes("StartPlayback"));
  assert.doesNotMatch(
    logs,
    /aster-test-only|example\.invalid\/media\/master|x-aster-router-credential/u,
  );
  const events = result.split("\n").map((line) => JSON.parse(line));
  const correlationId = events.find(
    (event) => event.event === "playback_federated_creation",
  )?.correlationId;
  assert.equal(typeof correlationId, "string");
  const records = logs.split("\n").flatMap((line) => {
    const start = line.indexOf("{");
    if (start < 0) {
      return [];
    }
    try {
      return [JSON.parse(line.slice(start))];
    } catch {
      return [];
    }
  });
  const playbackLog = records.find(
    (entry) =>
      entry.event === "aster.playback.graphql_completed" && entry.requestId === correlationId,
  );
  const traceId = playbackLog?.attributes?.trace_id;
  assert.match(traceId ?? "", /^[a-f0-9]{32}$/);
  assert.notEqual(traceId, "0".repeat(32));
  assert.ok(
    records.some(
      (entry) =>
        entry.event === "aster.catalog.graphql_completed" && entry.attributes?.trace_id === traceId,
    ),
  );
  emit("playback_runtime_logs", {
    ownerCorrelation: true,
    finiteOperationLabel: "StartPlayback",
    credentialsAndMediaUrlExcluded: true,
  });
} catch (error) {
  if (error.stdout) {
    process.stdout.write(error.stdout);
  }
  if (error.stderr) {
    process.stderr.write(error.stderr);
  }
  failure = error;
} finally {
  const ids = (
    await docker([
      "container",
      "ls",
      "--all",
      "--quiet",
      "--no-trunc",
      "--filter",
      "label=com.docker.compose.project=" + project,
    ])
  )
    .split("\n")
    .filter(Boolean);
  assert.ok(ids.length <= allowedServices.size);
  for (const id of ids) {
    const [container] = JSON.parse(await docker(["inspect", id]));
    assert.equal(container.Config.Labels["com.docker.compose.project"], project);
    assert.ok(allowedServices.has(container.Config.Labels["com.docker.compose.service"]));
    assert.equal(container.Config.Labels["com.aster.environment"], "local");
    assert.ok(
      container.Mounts.every(
        (mount) =>
          mount.Type === "tmpfs" ||
          (mount.Type === "volume" &&
            expectedVolumes.has(mount.Name.slice(project.length + 1)) &&
            mount.Name.startsWith(project + "_")),
      ),
    );
  }
  const volumes = (
    await docker([
      "volume",
      "ls",
      "--quiet",
      "--filter",
      "label=com.docker.compose.project=" + project,
    ])
  )
    .split("\n")
    .filter(Boolean);
  for (const name of volumes) {
    const [volume] = JSON.parse(await docker(["volume", "inspect", name]));
    assert.equal(volume.Labels["com.docker.compose.project"], project);
    assert.ok(expectedVolumes.has(volume.Labels["com.docker.compose.volume"]));
    assert.equal(name, project + "_" + volume.Labels["com.docker.compose.volume"]);
    assert.equal(volume.Labels["com.aster.authority"], "disposable-local");
    const attached = (
      await docker([
        "container",
        "ls",
        "--all",
        "--quiet",
        "--no-trunc",
        "--filter",
        "volume=" + name,
      ])
    )
      .split("\n")
      .filter(Boolean);
    assert.ok(attached.every((id) => ids.includes(id)));
  }
  const networks = (
    await docker([
      "network",
      "ls",
      "--quiet",
      "--filter",
      "label=com.docker.compose.project=" + project,
    ])
  )
    .split("\n")
    .filter(Boolean);
  for (const id of networks) {
    const [network] = JSON.parse(await docker(["network", "inspect", id]));
    assert.equal(network.Labels["com.docker.compose.project"], project);
    assert.ok([project + "_platform", project + "_edge"].includes(network.Name));
    assert.ok(Object.keys(network.Containers).every((containerId) => ids.includes(containerId)));
  }
  await compose(["down", "--volumes"], 45000);
  for (const kind of ["container", "network", "volume"]) {
    assert.equal(
      await docker([
        kind,
        "ls",
        ...(kind === "container" ? ["--all"] : []),
        "--quiet",
        "--filter",
        "label=com.docker.compose.project=" + project,
      ]),
      "",
    );
  }
  emit("playback_runtime_fixture_cleaned", { remaining: 0, retainedRuntimeTouched: false });
}
if (failure) {
  throw new Error("Playback runtime proof failed; see the bounded command output above.");
}
