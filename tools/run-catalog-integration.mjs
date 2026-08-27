import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { runGeneratedMediaFixture } from "./run-media-fixture.mjs";

const execute = promisify(execFile);
assert.ok(
  process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--generated"),
);
const generated = process.argv[2] === "--generated" ? await runGeneratedMediaFixture() : undefined;
if (generated) {
  process.stdout.write(JSON.stringify(generated) + "\n");
}
const root = fileURLToPath(new URL("../", import.meta.url));
const compose = await readFile(new URL("../infra/compose/compose.yml", import.meta.url), "utf8");
const image =
  /^x-postgres-image: &postgres-image (docker\.io\/library\/postgres:18\.6-[^\s]+@sha256:[a-f0-9]{64})$/m.exec(
    compose,
  )?.[1];
assert.ok(image, "Expected the repository-pinned PostgreSQL image.");
const name = "aster-catalog-test-" + randomUUID();
const label = "aster.catalog.fixture=" + name;
const docker = async (args, timeout = 10000) => {
  const { stdout } = await execute("docker", args, {
    cwd: root,
    timeout,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  return stdout.trim();
};
let ownedId;
let primaryError;
const started = performance.now();
try {
  ownedId = await docker(
    [
      "run",
      "--detach",
      "--pull=never",
      "--name",
      name,
      "--label",
      label,
      "--memory=384m",
      "--cpus=1",
      "--pids-limit=128",
      "--publish",
      "127.0.0.1::5432",
      "--tmpfs",
      "/var/lib/postgresql:rw,size=256m",
      "--env",
      "POSTGRES_USER=aster",
      "--env",
      "POSTGRES_DB=aster",
      "--env",
      "POSTGRES_PASSWORD=aster-test-only",
      image,
    ],
    30000,
  );
  assert.match(ownedId, /^[a-f0-9]{64}$/);
  const info = JSON.parse(await docker(["container", "inspect", ownedId]))[0];
  const port = Number(info.NetworkSettings.Ports["5432/tcp"]?.[0]?.HostPort);
  assert.equal(info.NetworkSettings.Ports["5432/tcp"]?.[0]?.HostIp, "127.0.0.1");
  assert.ok(Number.isSafeInteger(port) && port > 1023 && port < 65536);
  const deadline = performance.now() + 30000;
  for (;;) {
    try {
      await docker(
        ["exec", ownedId, "pg_isready", "-h", "127.0.0.1", "-U", "aster", "-d", "aster"],
        3000,
      );
      break;
    } catch (error) {
      if (performance.now() >= deadline) {
        throw error;
      }
      await delay(200);
    }
  }
  const result = await execute(
    process.execPath,
    ["services/catalog/dist/test/integration/rights-postgres.js", String(port)],
    {
      cwd: root,
      timeout: 60000,
      env: {
        ...process.env,
        ASTER_GENERATED_HLS_REPORT: generated ? JSON.stringify(generated) : "",
      },
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    },
  );
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
} catch (error) {
  if (error?.stdout) {
    process.stdout.write(error.stdout);
  }
  if (error?.stderr) {
    process.stderr.write(error.stderr);
  }
  primaryError = error;
} finally {
  // Resolve only this run's exact name after an uncertain docker-run result; never delete by prefix.
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
  assert.ok(ids.length <= 1, "Unexpected fixture ownership.");
  for (const id of ids) {
    assert.match(id, /^[a-f0-9]{64}$/);
    const info = JSON.parse(await docker(["container", "inspect", id]))[0];
    assert.equal(info.Id, id);
    if (ownedId) {
      assert.equal(id, ownedId);
    }
    assert.equal(info.Name, "/" + name);
    assert.equal(info.Config.Labels["aster.catalog.fixture"], name);
    assert.equal(info.Config.Image, image);
    assert.ok(
      info.Mounts.every((mount) => mount.Type === "tmpfs"),
      "Refuse cleanup of unexpected durable/bind mounts.",
    );
    await docker(["container", "rm", "--force", id], 15000);
  }
  assert.equal(
    await docker(["container", "ls", "--all", "--quiet", "--filter", "label=" + label]),
    "",
  );
  process.stdout.write(
    JSON.stringify({
      event: "catalog_fixture_cleaned",
      remaining: 0,
      durationMs: Math.round(performance.now() - started),
    }) + "\n",
  );
}
if (primaryError) {
  throw new Error("Catalog integration failed.", { cause: primaryError });
}
