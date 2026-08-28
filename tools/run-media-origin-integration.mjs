import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, URL } from "node:url";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

const execute = promisify(execFile);
assert.equal(process.argv.length, 2);
for (const key of ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]) {
  assert.ok(!process.env[key], "Docker endpoint overrides are not supported.");
}
const root = fileURLToPath(new URL("../", import.meta.url));
const source = await readFile(new URL("../infra/compose/media.yml", import.meta.url), "utf8");
const image = source.match(
  /image: (docker\.io\/versity\/versitygw:v1\.7\.0@sha256:[a-f0-9]{64})/,
)?.[1];
assert.ok(image, "Expected pinned media origin image.");
const name = "aster-origin-test-" + randomUUID();
const label = "com.aster.origin-fixture=" + name;
const volume = name + "-data";
const docker = async (args, timeout = 10000) => {
  const result = await execute("docker", args, {
    cwd: root,
    timeout,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  return result.stdout.trim();
};
const options = [
  "--detach",
  "--pull=never",
  "--label",
  label,
  "--read-only",
  "--cpus=1",
  "--memory=128m",
  "--pids-limit=64",
  "--cap-drop=ALL",
  "--security-opt=no-new-privileges:true",
  "--tmpfs=/tmp:rw,size=16m",
  "--env=ROOT_ACCESS_KEY=aster-test-access",
  "--env=ROOT_SECRET_KEY=aster-test-only",
  "--entrypoint=/usr/local/bin/versitygw",
];
let failure;
let volumeCreated = false;
const expected = new Map();
const clientTag = "aster-media-origin-test:local";
let clientImage;
try {
  const context = await docker(["context", "show"]);
  assert.match(context, /^[a-zA-Z0-9_.-]{1,128}$/);
  const host = await docker([
    "context",
    "inspect",
    context,
    "--format",
    "{{.Endpoints.docker.Host}}",
  ]);
  assert.ok(
    host.startsWith("unix:///") || host.startsWith("npipe:////./pipe/"),
    "A local Docker endpoint is required.",
  );
  assert.equal(await docker(["info", "--format", "{{.OSType}}"]), "linux");
  const existingImages = await docker(["image", "ls", "--quiet", "--no-trunc", clientTag]);
  if (existingImages) {
    const existing = JSON.parse(await docker(["image", "inspect", clientTag]))[0];
    assert.equal(existing.Config.Labels?.["com.aster.scope"], "media-origin-test");
  }
  await docker(
    [
      "build",
      "--file",
      "infra/docker/catalog.Dockerfile",
      "--target",
      "build",
      "--label=com.aster.scope=media-origin-test",
      "--tag",
      clientTag,
      ".",
    ],
    180000,
  );
  clientImage = JSON.parse(await docker(["image", "inspect", clientTag]))[0].Id;
  assert.match(clientImage, /^sha256:[a-f0-9]{64}$/);
  await docker([
    "volume",
    "create",
    "--driver=local",
    "--opt=type=tmpfs",
    "--opt=device=tmpfs",
    "--opt=o=size=16m,mode=0700",
    "--label",
    label,
    volume,
  ]);
  volumeCreated = true;
  const writer = await docker(
    [
      "run",
      ...options,
      "--name",
      name + "-writer",
      "--network=none",
      "--mount",
      "type=volume,source=" + volume + ",target=/data",
      image,
      "--port=:9000",
      "--health=/health",
      "--quiet",
      "--max-connections=64",
      "--max-requests=16",
      "posix",
      "--concurrency=1",
      "/data",
    ],
    30000,
  );
  assert.match(writer, /^[a-f0-9]{64}$/);
  expected.set(name + "-writer", writer);
  const origin = await docker(
    [
      "run",
      ...options,
      "--name",
      name + "-origin",
      "--network=container:" + writer,
      "--mount",
      "type=volume,source=" + volume + ",target=/data,readonly",
      image,
      "--port=:9001",
      "--health=/health",
      "--quiet",
      "--readonly",
      "--max-connections=64",
      "--max-requests=16",
      "posix",
      "--concurrency=8",
      "/data",
    ],
    30000,
  );
  assert.match(origin, /^[a-f0-9]{64}$/);
  expected.set(name + "-origin", origin);
  const until = performance.now() + 10000;
  for (const [id, port] of [
    [writer, 9000],
    [origin, 9001],
  ]) {
    for (;;) {
      try {
        await docker(
          ["exec", id, "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:" + port + "/health"],
          2000,
        );
        break;
      } catch (error) {
        if (performance.now() >= until) {
          throw error;
        }
        await delay(200);
      }
    }
  }
  const result = await docker(
    [
      "run",
      "--rm",
      "--name",
      name + "-client",
      "--label",
      label,
      "--network=container:" + writer,
      "--read-only",
      "--user=node",
      "--cpus=1",
      "--memory=256m",
      "--pids-limit=64",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges:true",
      "--tmpfs=/tmp:rw,size=16m",
      "--entrypoint=node",
      clientImage,
      "services/catalog/dist/test/integration/media-origin.js",
      "9000",
      "9001",
    ],
    30000,
  );
  process.stdout.write(result + "\n");
} catch (error) {
  if (error?.stdout) {
    process.stdout.write(error.stdout);
  }
  if (error?.stderr) {
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
      "label=" + label,
    ])
  )
    .split("\n")
    .filter(Boolean);
  assert.ok(ids.length <= 3);
  const containers = ids.length ? JSON.parse(await docker(["container", "inspect", ...ids])) : [];
  const rank = (info) =>
    info.Name.endsWith("-client") ? 0 : info.Name.endsWith("-origin") ? 1 : 2;
  containers.sort((a, b) => rank(a) - rank(b));
  for (const info of containers) {
    const actualName = info.Name.slice(1);
    assert.ok([name + "-client", name + "-origin", name + "-writer"].includes(actualName));
    assert.match(info.Id, /^[a-f0-9]{64}$/);
    if (expected.has(actualName)) {
      assert.equal(info.Id, expected.get(actualName));
    }
    assert.equal(info.Config.Labels["com.aster.origin-fixture"], name);
    assert.equal(info.Config.Image, actualName.endsWith("-client") ? clientImage : image);
    assert.ok(
      info.Mounts.every(
        (mount) =>
          mount.Type === "tmpfs" ||
          (mount.Type === "volume" && mount.Name === volume && mount.Destination === "/data"),
      ),
    );
    if (actualName.endsWith("-origin")) {
      assert.equal(info.Mounts.find((mount) => mount.Destination === "/data")?.RW, false);
    }
    await docker(["container", "rm", "--force", info.Id], 15000);
  }
  if (volumeCreated) {
    const info = JSON.parse(await docker(["volume", "inspect", volume]))[0];
    assert.equal(info.Name, volume);
    assert.equal(info.Labels["com.aster.origin-fixture"], name);
    assert.equal(info.Options.type, "tmpfs");
    assert.equal(info.Options.device, "tmpfs");
    await docker(["volume", "rm", volume]);
  }
  assert.equal(
    await docker(["container", "ls", "--all", "--quiet", "--filter", "label=" + label]),
    "",
  );
  process.stdout.write(
    JSON.stringify({ event: "media_origin_fixture_cleaned", remaining: 0 }) + "\n",
  );
}
if (failure) {
  throw new Error("Media origin integration failed.", { cause: failure });
}
