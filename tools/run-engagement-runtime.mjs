import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { promisify } from "node:util";

assert.equal(process.argv.length, 2, "Engagement proof accepts no target or extra flags.");
const root = fileURLToPath(new URL("../", import.meta.url));
const project = "aster-engagement-proof-" + randomUUID();
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
  "infra/compose/engagement-proof.yml",
  "--profile",
  "runtime",
];
const compose = (args, timeout) => docker([...composeArgs, ...args], timeout);
const allowedServices = new Set([
  "postgres",
  "redis",
  "platform-init",
  "identity-init",
  "identity",
  "engagement-init",
  "engagement",
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
]);
const emit = (event, facts) => process.stdout.write(JSON.stringify({ event, ...facts }) + "\n");
let failure;
try {
  await compose(["config", "--quiet"]);
  emit("engagement_runtime_build", { project, status: "started" });
  await compose(
    [
      "build",
      "identity",
      "identity-init",
      "engagement",
      "engagement-init",
      "catalog",
      "catalog-init",
      "playback",
      "playback-init",
      "router",
      "router-trust-init",
    ],
    300000,
  );
  await compose(
    ["up", "--no-build", "--wait", "--wait-timeout", "120", "router", "identity", "engagement"],
    130000,
  );
  const ids = (await compose(["ps", "--all", "--quiet"])).split("\n").filter(Boolean);
  const containers = JSON.parse(await docker(["inspect", ...ids]));
  assert.equal(containers.length, 13);
  assert.ok(
    containers.every((container) =>
      allowedServices.has(container.Config.Labels["com.docker.compose.service"]),
    ),
  );
  const engagement = containers.find(
    (container) => container.Config.Labels["com.docker.compose.service"] === "engagement",
  );
  assert.equal(engagement.State.Health.Status, "healthy");
  assert.equal(engagement.Config.User, "1000:1000");
  emit("engagement_runtime_started", {
    project,
    privateOwnersRunning: 2,
    images: Object.fromEntries(
      containers
        .filter((container) =>
          ["identity", "engagement", "playback", "catalog", "router"].includes(
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
    new URL("../services/engagement/dist/test/integration/federated-progress.js", import.meta.url),
    "utf8",
  );
  assert.ok(Buffer.byteLength(worker) < 32768);
  const result = await docker(
    [
      "exec",
      "--env",
      "ASTER_FIXTURE_ID=" + project,
      engagement.Id,
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
    "150",
    "engagement",
    "identity",
    "playback",
    "router",
  ]);
  assert.ok(logs.includes("aster.engagement.graphql_completed"));
  assert.ok(logs.includes("RecordProgress"));
  assert.doesNotMatch(
    logs,
    /aster-test-only|example\.invalid\/media\/master|x-aster-engagement-credential|aster_local_session=/u,
  );
  const events = result.split("\n").map((line) => JSON.parse(line));
  const correlationId = events.find(
    (event) => event.event === "engagement_federated_commit",
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
  const savedLog = records.find(
    (entry) =>
      entry.event === "aster.engagement.graphql_completed" && entry.requestId === correlationId,
  );
  const traceId = savedLog?.attributes?.trace_id;
  assert.match(traceId ?? "", /^[a-f0-9]{32}$/);
  for (const owner of ["identity", "playback"]) {
    assert.ok(
      records.some(
        (entry) =>
          entry.event === "aster." + owner + ".graphql_completed" &&
          entry.requestId === correlationId &&
          entry.attributes?.trace_id === traceId,
      ),
    );
  }
  emit("engagement_runtime_logs", { ownerCorrelation: true, credentialsExcluded: true });
  await compose(
    [
      "up",
      "--no-build",
      "--no-deps",
      "--force-recreate",
      "--exit-code-from",
      "engagement-init",
      "engagement-init",
    ],
    30000,
  );
  const replayLogs = await compose(["logs", "--no-color", "--tail", "5", "engagement-init"]);
  assert.ok(replayLogs.includes('"applied":[]'));
  await compose(["stop", "--timeout", "15", "identity", "engagement"], 35000);
  const probe = `
    import assert from 'node:assert/strict';
    import { request } from 'node:http';
    const body = JSON.stringify({query: 'mutation StartPlayback($titleId: ID!) { createPlaybackSession(titleId: $titleId) { code } }', operationName: 'StartPlayback', variables: {titleId: '00000000-0000-4000-8000-000000000002'}});
    const response = await new Promise((resolve, reject) => {
      const outgoing = request('http://router:4000/graphql', { method: 'POST', signal: AbortSignal.timeout(4000), headers: {host: '127.0.0.1:4000', origin:'http://127.0.0.1:4000', 'x-aster-csrf':'1', 'content-type':'application/json'} }, (incoming) => {
        let data = '';
        incoming.setEncoding('utf8');
        incoming.on('data', chunk => {data += chunk; if(data.length > 16384) incoming.destroy(new Error('Overflow'));});
        incoming.on('error', reject);
        incoming.on('end', () => resolve(JSON.parse(data)));
      });
      outgoing.on('error', reject);
      outgoing.end(body);
    });
    assert.equal(response.data?.createPlaybackSession?.code, 'COMPLETED');
    console.log(JSON.stringify({event:'engagement_optional_failure', anonymousPlayback:'available', identityAndEngagement:'stopped'}));
  `;
  process.stdout.write(
    (await compose(
      ["exec", "-T", "playback", "node", "--input-type=module", "--eval", probe],
      10000,
    )) + "\n",
  );
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
  emit("engagement_runtime_fixture_cleaned", { remaining: 0, retainedRuntimeTouched: false });
}
if (failure) {
  throw new Error("Engagement runtime proof failed; see the bounded command output above.");
}
