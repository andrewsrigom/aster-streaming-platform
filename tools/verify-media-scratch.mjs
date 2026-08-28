import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout, clearTimeout } from "node:timers";
import { promisify } from "node:util";
import { fileURLToPath, URL } from "node:url";
import { recoverMediaScratch, scratchIdentity, scratchGraceMs } from "./media/scratch-cleanup.mjs";
import { STORAGE_IMAGE } from "./verify-optional-platform.mjs";

const execute = promisify(execFile);
assert.equal(process.argv.length, 2);
assert.ok(
  !["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"].some(
    (key) => process.env[key],
  ),
);
const runId = randomUUID();
const project = "aster-scratch-" + runId.slice(0, 8);
const expected = scratchIdentity(project, runId);
const created = [];
const volumes = [];
const output = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const controller = new globalThis.AbortController();
const deadline = setTimeout(() => controller.abort(), 90000);
const docker = async (args, cleanup = false) => {
  const result = await execute("docker", args, {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    timeout: 10000,
    ...(cleanup ? {} : { signal: controller.signal }),
    maxBuffer: 2 * 1024 * 1024,
    killSignal: "SIGKILL",
    windowsHide: true,
    env: { ...process.env, ASTER_MEDIA_RUN_SUFFIX: "-" + runId },
  });
  return result.stdout.trim();
};
try {
  const endpoint = JSON.parse(
    await docker(["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"]),
  );
  assert.match(endpoint, /^(?:unix:\/\/|npipe:\/\/)/u);
  const config = JSON.parse(
    await docker([
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
      "config",
      "--format",
      "json",
    ]),
  );
  assert.equal(config.volumes["media-decoder-input"].name, expected.volumes[0]);
  assert.equal(config.volumes["media-decoder-output"].name, expected.volumes[1]);
  for (const [index, name] of expected.volumes.entries()) {
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
      "com.aster.scratch-fixture=" + runId,
      "--label",
      "com.aster.media-run=" + runId,
      "--label",
      "com.docker.compose.project=" + project,
      "--label",
      "com.docker.compose.volume=" + (index === 0 ? "media-decoder-input" : "media-decoder-output"),
      "--label",
      "com.aster.owner=catalog-media",
      "--label",
      "com.aster.authority=disposable-local",
      name,
    ]);
    volumes.push(name);
  }
  // Existing pinned media dependency; no build, download, decoder or film is needed.
  const create = async (name, service, tagged) => {
    const id = await docker([
      "create",
      "--pull",
      "never",
      "--name",
      name,
      "--network",
      "none",
      "--read-only",
      "--memory",
      "64m",
      "--pids-limit",
      "16",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges:true",
      "--label",
      "com.aster.scratch-fixture=" + runId,
      "--label",
      "com.docker.compose.project=" + project,
      "--label",
      "com.docker.compose.service=" + service,
      ...(tagged ? ["--label", "com.aster.media-run=" + runId] : []),
      "--mount",
      "type=volume,source=" + expected.volumes[0] + ",target=/input,readonly",
      "--mount",
      "type=volume,source=" + expected.volumes[1] + ",target=/output",
      "--entrypoint",
      "/usr/local/bin/versitygw",
      STORAGE_IMAGE,
      "--version",
    ]);
    created.push(id);
    return id;
  };
  await create(expected.containers[0], "media-prepare", true);
  const decoder = await create(expected.containers[1], "media-decoder", true);
  await docker(["start", decoder]);
  assert.equal(await docker(["wait", decoder]), "0");
  const options = { docker, now: Date.now, apply: true, signal: controller.signal, output };
  await assert.rejects(recoverMediaScratch(project, runId, options));
  const virtualNow = () => Date.now() + scratchGraceMs + 1000;
  await recoverMediaScratch(project, runId, { ...options, now: virtualNow, apply: false });
  const foreign = await create(project + "-foreign", "unrelated", false);
  await assert.rejects(recoverMediaScratch(project, runId, { ...options, now: virtualNow }));
  await docker(["rm", foreign]);
  created.splice(created.indexOf(foreign), 1);
  await recoverMediaScratch(project, runId, { ...options, now: virtualNow });
  created.length = 0;
  volumes.length = 0;
  await recoverMediaScratch(project, runId, { ...options, now: virtualNow });
  output({
    event: "media_scratch_fixture_verified",
    composeRunNames: true,
    youngRunRejected: true,
    foreignConsumerRejected: true,
    dryRunReadOnly: true,
    expiredScratchRemoved: true,
    emptyReplay: true,
    controlledClock: true,
    actualFilmTouched: false,
  });
} finally {
  clearTimeout(deadline);
  for (const id of created.reverse()) {
    const found = await docker(
      ["container", "ls", "-a", "-q", "--no-trunc", "--filter", "id=" + id],
      true,
    );
    if (!found) {
      continue;
    }
    const [item] = JSON.parse(await docker(["container", "inspect", id], true));
    assert.equal(item.Id, id);
    assert.equal(item.Config.Labels["com.aster.scratch-fixture"], runId);
    assert.ok(
      item.Mounts.every(
        (mount) => mount.Type === "volume" && expected.volumes.includes(mount.Name),
      ),
    );
    await docker(["rm", "-f", id], true);
  }
  for (const name of volumes) {
    const found = await docker(["volume", "ls", "-q", "--filter", "name=^" + name + "$"], true);
    if (!found) {
      continue;
    }
    const [item] = JSON.parse(await docker(["volume", "inspect", name], true));
    assert.equal(item.Name, name);
    assert.equal(item.Labels["com.aster.scratch-fixture"], runId);
    assert.equal(item.Options.type, "tmpfs");
    assert.equal(
      await docker(["container", "ls", "-a", "-q", "--filter", "volume=" + name], true),
      "",
    );
    await docker(["volume", "rm", name], true);
  }
}
