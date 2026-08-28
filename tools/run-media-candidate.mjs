import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { setTimeout, clearTimeout } from "node:timers";
import { promisify } from "node:util";
import { fileURLToPath, URL } from "node:url";

const execute = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const [project, attemptId, ...options] = process.argv.slice(2);
const artwork = options[0] === "--artwork";
if (artwork) {
  options.shift();
}
const [reuse, manifestHash, reportChecksum] = options;
assert.ok(options.length === 0 || (options.length === 3 && reuse === "--reuse"));
if (reuse) {
  assert.match(manifestHash, /^[a-f0-9]{64}$/u);
  assert.match(reportChecksum, /^[a-f0-9]{64}$/u);
}
assert.match(project, /^aster(?:-[a-z0-9]+)*$/u);
assert.ok(project.length <= 64);
assert.match(attemptId, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u);
assert.ok(
  !["DOCKER_HOST", "DOCKER_CONTEXT", "CI"].some((key) => process.env[key]),
  "Media candidates require a local Docker context without overrides or CI.",
);
const runId = randomUUID();
const label = "com.aster.media-run";
const controller = new globalThis.AbortController();
const stop = () => controller.abort();
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
const deadline = setTimeout(stop, 1800000);
const docker = async (args, timeout = 15000, signal = controller.signal) => {
  const result = await execute("docker", args, {
    cwd: root,
    timeout,
    ...(signal ? { signal } : {}),
    maxBuffer: 2 * 1024 * 1024,
    killSignal: "SIGKILL",
    windowsHide: true,
    env: { ...process.env, ASTER_MEDIA_RUN_SUFFIX: "-" + runId },
  });
  return (result.stdout + (args[0] === "logs" ? result.stderr : "")).trim();
};
const compose = [
  "compose",
  "-p",
  project,
  "-f",
  "infra/compose/compose.yml",
  "-f",
  "infra/compose/media.yml",
  "--profile",
  "integration",
  "--profile",
  "media",
];
const owner = project + "-media-owner";
const decoder = project + "-media-decoder";
const volumes = [
  project + "_media-decoder-input-" + runId,
  project + "_media-decoder-output-" + runId,
];
const created = [];
let allocated = false;
async function state(name) {
  const [info] = JSON.parse(await docker(["container", "inspect", name]));
  assert.equal(info.Config.Labels[label], runId);
  return info;
}
function records(logs) {
  return logs
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line));
}
try {
  const endpoint = JSON.parse(
    await docker(["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"]),
  );
  assert.ok(
    typeof endpoint === "string" && /^(?:unix:\/\/|npipe:\/\/)/u.test(endpoint),
    "Media candidates require a local Docker endpoint.",
  );
  for (const name of [owner, decoder]) {
    assert.equal(
      await docker(["container", "ls", "-a", "-q", "--filter", "name=^/" + name + "$"]),
      "",
      "A media candidate already owns this project; inspect it before retry.",
    );
  }
  for (const volume of volumes) {
    assert.equal(
      await docker(["volume", "ls", "-q", "--filter", "name=^" + volume + "$"]),
      "",
      "Previous candidate scratch exists; inspect it before retry.",
    );
  }
  process.stdout.write(JSON.stringify({ event: "media_images_building", project, runId }) + "\n");
  await docker([...compose, "build", "media-prepare"], 360000);
  process.stdout.write(JSON.stringify({ event: "media_images_ready", project, runId }) + "\n");
  allocated = true;
  for (const [index, volume] of volumes.entries()) {
    const localName = index === 0 ? "media-decoder-input" : "media-decoder-output";
    await docker([
      "volume",
      "create",
      "--driver",
      "local",
      "--opt",
      "type=tmpfs",
      "--opt",
      "device=tmpfs",
      "--opt",
      "o=size=" + (index === 0 ? "300m" : "520m") + ",uid=1000,gid=1000,mode=0700",
      "--label",
      "com.docker.compose.project=" + project,
      "--label",
      "com.docker.compose.volume=" + localName,
      "--label",
      "com.aster.owner=catalog-media",
      "--label",
      "com.aster.authority=disposable-local",
      "--label",
      label + "=" + runId,
      volume,
    ]);
    const [info] = JSON.parse(await docker(["volume", "inspect", volume]));
    assert.equal(info.Labels[label], runId);
  }
  await docker([
    ...compose,
    "run",
    "-d",
    "--no-deps",
    "--name",
    owner,
    "--label",
    label + "=" + runId,
    "media-prepare",
    attemptId,
    ...(reuse
      ? [artwork ? "--reuse-artwork" : "--reuse-decoder", manifestHash, reportChecksum]
      : [artwork ? "--prepare-artwork" : "--prepare-decoder"]),
  ]);
  created.push(owner);
  process.stdout.write(
    JSON.stringify({
      event: "media_owner_image",
      ownerImage: (await state(owner)).Image,
      runId,
    }) + "\n",
  );
  let reused = false;
  for (;;) {
    const info = await state(owner);
    const logs = records(await docker(["logs", "--tail", "5", owner]));
    const replay = logs.find((record) => record.event === "decoder_candidate_reused");
    if (replay) {
      assert.equal(replay.status, "completed");
      if (!info.State.Running) {
        assert.equal(info.State.ExitCode, 0);
        process.stdout.write(JSON.stringify(replay) + "\n");
        reused = true;
        break;
      }
      await delay(1000, undefined, { signal: controller.signal });
      continue;
    }
    if (logs.some((record) => record.event === "decoder_input_ready")) {
      break;
    }
    assert.equal(info.State.Running, true, "Source handoff failed.");
    await delay(1000, undefined, { signal: controller.signal });
  }
  if (!reused) {
    await docker([...compose, "build", "media-decoder"], 360000);
    process.stdout.write(
      JSON.stringify({ event: "media_candidate_started", project, attemptId, runId }) + "\n",
    );
    await docker([
      ...compose,
      "run",
      "-d",
      "--no-deps",
      "--name",
      decoder,
      "--label",
      label + "=" + runId,
      "media-decoder",
      ...(artwork ? ["--artwork"] : []),
    ]);
    created.push(decoder);
    const decoderInfo = await state(decoder);
    const ownerInfo = await state(owner);
    process.stdout.write(
      JSON.stringify({
        event: "media_candidate_images",
        decoderImage: decoderInfo.Image,
        ownerImage: ownerInfo.Image,
      }) + "\n",
    );
    let last = "";
    for (;;) {
      const info = await state(decoder);
      const ownerInfo = await state(owner);
      const output = await docker(["logs", "--tail", "5", decoder]);
      if (output !== last) {
        const items = records(output);
        for (const item of items) {
          if (!last.includes(JSON.stringify(item))) {
            process.stdout.write(JSON.stringify(item) + "\n");
          }
        }
        last = output;
      }
      if (!info.State.Running) {
        assert.equal(info.State.ExitCode, 0, "Decoder failed; no publication was made.");
        assert.equal(info.State.OOMKilled, false);
        break;
      }
      assert.equal(ownerInfo.State.Running, true, "Owner rights check failed; stop the decoder.");
      await delay(1000, undefined, { signal: controller.signal });
    }
    for (;;) {
      const info = await state(owner);
      if (!info.State.Running) {
        const logs = records(await docker(["logs", "--tail", "5", owner]));
        const result = logs.find((record) => record.event === "decoder_candidate_retained");
        assert.equal(info.State.ExitCode, 0);
        assert.equal(result?.status, "completed", "Private candidate retention failed.");
        process.stdout.write(JSON.stringify(result) + "\n");
        break;
      }
      await delay(1000, undefined, { signal: controller.signal });
    }
  }
} finally {
  clearTimeout(deadline);
  controller.abort();
  for (const name of created.reverse()) {
    const [info] = JSON.parse(await docker(["container", "inspect", name], 15000, null));
    assert.equal(info.Config.Labels[label], runId);
    assert.equal(info.Config.Labels["com.docker.compose.project"], project);
    if (info.State.Running) {
      await docker(["container", "stop", "--time", "5", info.Id], 10000, null);
    }
    await docker(["container", "rm", "--force", info.Id], 15000, null);
  }
  if (allocated) {
    for (const volume of volumes) {
      const found = await docker(
        ["volume", "ls", "-q", "--filter", "name=^" + volume + "$"],
        15000,
        null,
      );
      if (!found) {
        continue;
      }
      const [info] = JSON.parse(await docker(["volume", "inspect", volume], 15000, null));
      assert.equal(info.Name, volume);
      if (info.Labels[label] !== runId) {
        continue;
      }
      assert.equal(info.Labels["com.docker.compose.project"], project);
      assert.equal(info.Labels["com.aster.owner"], "catalog-media");
      assert.equal(info.Labels["com.aster.authority"], "disposable-local");
      assert.equal(info.Options.type, "tmpfs");
      await docker(["volume", "rm", volume], 15000, null);
    }
  }
  process.off("SIGTERM", stop);
  process.off("SIGINT", stop);
}
