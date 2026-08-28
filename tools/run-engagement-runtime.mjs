import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { promisify } from "node:util";
import { eventShutdownComplete } from "./verify-engagement-runtime.mjs";

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
  "--parallel",
  "1",
  "--project-name",
  project,
  "--file",
  "infra/compose/compose.yml",
  "--file",
  "infra/compose/engagement-proof.yml",
  // Query plans are exposed only in this disposable, loopback-only proof.
  "--file",
  "infra/compose/router-diagnostics.yml",
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
  "broker",
  "broker-init",
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
  "identity-event-trust",
  "broker-data",
]);
const emit = (event, facts) => process.stdout.write(JSON.stringify({ event, ...facts }) + "\n");
const eventComposeArgs = [
  ...composeArgs.slice(0, -2),
  "--file",
  "infra/compose/events.yml",
  "--file",
  "infra/compose/engagement-events-proof.yml",
  "--profile",
  "runtime",
];
const eventCompose = (args, timeout) => docker([...eventComposeArgs, ...args], timeout);
let eventControl = {};
let stage = "build";
async function eventWorker(mode, active = false) {
  stage = "events-" + mode;
  const source = await readFile(
    new URL("../services/engagement/dist/test/integration/federated-events.js", import.meta.url),
    "utf8",
  );
  assert.ok(Buffer.byteLength(source) < 32768);
  // Production images ship source, not tests; the bounded verifier is evaluated from /app.
  const worker = source.replaceAll('"../../src/', '"./dist/src/');
  const output = await (active ? eventCompose : compose)(
    [
      "exec",
      "-T",
      "--env",
      "ASTER_FIXTURE_ID=" + project,
      "--env",
      "ASTER_EVENT_PROOF_MODE=" + mode,
      "--env",
      "ASTER_EVENT_DELETED_PROFILE=" + (eventControl.deletedProfile ?? ""),
      "--env",
      "ASTER_EVENT_ACTIVE_PROFILE=" + (eventControl.activeProfile ?? ""),
      "--env",
      "ASTER_EVENT_OUTAGE_DELETED_PROFILE=" + (eventControl.outageDeletedProfile ?? ""),
      "engagement",
      "node",
      "--input-type=module",
      "--eval",
      worker,
    ],
    120000,
  );
  for (const line of output.split("\n")) {
    const record = JSON.parse(line);
    if (record.event === "event_proof_control") {
      eventControl = { ...eventControl, ...record };
    } else {
      process.stdout.write(line + "\n");
    }
  }
}
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
    900000,
  );
  emit("engagement_runtime_build", { project, status: "completed" });
  stage = "base-runtime";
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
    privateOwnersRunning: 3,
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
  const fieldWorker = await readFile(
    new URL("../services/engagement/dist/test/integration/federated-fields.js", import.meta.url),
    "utf8",
  );
  assert.ok(Buffer.byteLength(fieldWorker) < 32768);
  process.stdout.write(
    (await docker(
      [
        "exec",
        "--env",
        "ASTER_FIXTURE_ID=" + project,
        engagement.Id,
        "node",
        "--input-type=module",
        "--eval",
        fieldWorker,
      ],
      45000,
    )) + "\n",
  );
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
  await eventWorker("prepare");
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
  await eventCompose(["config", "--quiet"]);
  await eventCompose(["up", "--no-build", "--wait", "--wait-timeout", "120", "broker"], 130000);
  await eventCompose(
    ["up", "--no-build", "--no-deps", "--exit-code-from", "broker-init", "broker-init"],
    60000,
  );
  await eventCompose(
    ["up", "--no-build", "--wait", "--wait-timeout", "120", "identity", "catalog", "engagement"],
    130000,
  );
  // Refresh upstream connections after Compose replaces the owner containers.
  await eventCompose(["restart", "--timeout", "15", "router"], 25000);
  await eventWorker("ready", true);
  await eventWorker("verify", true);
  for (const key of ["validId", "invalidId"]) {
    assert.match(
      eventControl[key] ?? "",
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u,
    );
    const args = [
      "exec",
      "-T",
      "--env",
      "ASTER_EVENT_REPLAY_ENABLED=true",
      "engagement",
      "node",
      "./dist/src/replay-identity-event.js",
      eventControl[key],
    ];
    if (key === "validId") {
      const output = await eventCompose(args, 10000);
      assert.equal(JSON.parse(output).status, "duplicate");
    } else {
      await assert.rejects(
        eventCompose(args, 10000),
        (error) => error.code === 1 && JSON.parse(error.stdout).status === "retry",
      );
    }
  }
  emit("event_replay_cli", { exactValidRecord: "duplicate-completed", invalidRecord: "retained" });
  const offsets = await eventCompose(
    [
      "exec",
      "-T",
      "--env",
      "KAFKA_HEAP_OPTS=-Xms16m -Xmx64m",
      "--env",
      "KAFKA_JVM_PERFORMANCE_OPTS=-XX:ActiveProcessorCount=1 -XX:TieredStopAtLevel=1",
      "broker",
      "/opt/kafka/bin/kafka-consumer-groups.sh",
      "--bootstrap-server",
      "broker:19092",
      "--describe",
      "--group",
      "aster-engagement-identity-v1",
    ],
    20000,
  );
  const committed = offsets
    .split("\n")
    .map((line) => line.trim().split(/\s+/u))
    .find(
      (columns) =>
        columns[0] === "aster-engagement-identity-v1" && columns[1] === "aster.identity.profile.v1",
    );
  assert.ok(
    committed &&
      committed[2] === "0" &&
      /^\d+$/u.test(committed[3] ?? "") &&
      Number(committed[3]) > 0 &&
      committed[3] === committed[4] &&
      committed[5] === "0",
  );
  emit("event_consumer_offsets", { durableQuarantine: true, committedThroughEnd: true, lag: 0 });
  await eventCompose(["stop", "--timeout", "10", "broker"], 20000);
  await eventWorker("outage", true);
  await eventCompose(
    ["up", "--no-build", "--no-recreate", "--no-deps", "--wait", "--wait-timeout", "120", "broker"],
    130000,
  );
  await eventWorker("recovered", true);
  stage = "events-shutdown";
  await eventCompose(["stop", "--timeout", "15", "identity", "catalog", "engagement"], 50000);
  const shutdowns = [];
  for (const owner of ["identity", "catalog", "engagement"]) {
    const [stopped] = JSON.parse(await docker(["inspect", project + "-" + owner + "-1"]));
    const status = {
      owner,
      running: stopped.State.Running,
      oomKilled: stopped.State.OOMKilled,
      exitCode: stopped.State.ExitCode,
    };
    shutdowns.push(status);
    emit("event_owner_shutdown", status);
  }
  const eventLogs = await eventCompose([
    "logs",
    "--no-color",
    "--tail",
    "100",
    "identity",
    "catalog",
    "engagement",
  ]);
  assert.ok(eventLogs.includes("aster.events.publication"));
  assert.ok(eventLogs.includes("aster.engagement.identity_event"));
  assert.doesNotMatch(
    eventLogs,
    /aster-test-only|aster-identity-event-signature|aster_local_session=/u,
  );
  const shutdownRecords = eventLogs.split("\n").flatMap((line) => {
    try {
      return [JSON.parse(line.slice(line.indexOf("{")))];
    } catch {
      return [];
    }
  });
  // SIGTERM preserves exit 143 even on a hard fallback; require completed lifecycle evidence too.
  assert.ok(eventShutdownComplete(shutdowns, shutdownRecords), "Owner event shutdown incomplete.");
  emit("event_runtime_shutdown", { ownerBackgroundStopped: true, sanitizedLogs: true });
} catch (error) {
  emit("engagement_runtime_failed", {
    stage,
    code: error.code ?? "assertion",
    killed: error.killed === true,
  });
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
  await eventCompose(["down", "--volumes"], 45000);
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
