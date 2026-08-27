import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
export async function runGeneratedMediaFixture() {
  const docker = async (args, timeout = 15000) =>
    (
      await execute("docker", args, {
        cwd: root,
        timeout,
        killSignal: "SIGKILL",
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      })
    ).stdout.trim();
  await docker(
    [
      "build",
      "--file",
      "infra/docker/media-fixture.Dockerfile",
      "--tag",
      "aster-media-fixture:phase03",
      ".",
    ],
    180000,
  );
  const image = JSON.parse(await docker(["image", "inspect", "aster-media-fixture:phase03"]))[0].Id;
  assert.match(image, /^sha256:[a-f0-9]{64}$/);
  const name = "aster-generated-hls-" + randomUUID();
  const label = "aster.media.fixture=" + name;
  const started = performance.now();
  try {
    const result = await docker(
      [
        "run",
        "--name",
        name,
        "--label",
        label,
        "--network=none",
        "--read-only",
        "--user=1000:1000",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges:true",
        "--memory=384m",
        "--cpus=1",
        "--pids-limit=64",
        "--tmpfs=/work:size=32m,uid=1000,gid=1000,mode=0700",
        "--env=ASTER_MEDIA_FIXTURE=local",
        image,
      ],
      60000,
    );
    const report = JSON.parse(result);
    assert.equal(report.event, "generated_hls_verified");
    assert.equal(report.repeatable, true);
    assert.equal(report.files.length, 8);
    return { ...report, image, elapsedMs: Math.round(performance.now() - started) };
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
    assert.ok(ids.length <= 1);
    for (const id of ids) {
      const info = JSON.parse(await docker(["container", "inspect", id]))[0];
      assert.equal(info.Config.Labels["aster.media.fixture"], name);
      assert.equal(info.Name, "/" + name);
      assert.equal(info.Image, image);
      assert.equal(info.HostConfig.NetworkMode, "none");
      assert.ok(info.Mounts.every((mount) => mount.Type === "tmpfs"));
      await docker(["container", "rm", "--force", id]);
    }
    assert.equal(
      await docker(["container", "ls", "--all", "--quiet", "--filter", "label=" + label]),
      "",
    );
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runGeneratedMediaFixture();
  process.stdout.write(JSON.stringify({ ...report, cleaned: true }) + "\n");
}
