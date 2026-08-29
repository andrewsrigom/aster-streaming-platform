import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

const execute = promisify(execFile);
assert.equal(process.argv.length, 2);
const root = fileURLToPath(new URL("../", import.meta.url));
const compose = await readFile(new URL("../infra/compose/compose.yml", import.meta.url), "utf8");
const image =
  /^x-redis-image: &redis-image (docker\.io\/library\/redis:8\.10\.0-[^\s]+@sha256:[a-f0-9]{64})$/m.exec(
    compose,
  )?.[1];
assert.ok(image, "Expected the repository-pinned Redis image.");
const name = "aster-catalog-cache-test-" + randomUUID();
const label = "aster.catalog.cache.fixture=" + name;
const docker = async (args, timeout = 10_000) => {
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
      "--memory=128m",
      "--cpus=0.5",
      "--pids-limit=64",
      "--publish",
      "127.0.0.1::6379",
      "--tmpfs",
      "/data:rw,size=32m",
      image,
      "redis-server",
      "--save",
      "",
      "--appendonly",
      "no",
      "--maxmemory",
      "32mb",
      "--maxmemory-policy",
      "allkeys-lfu",
    ],
    30_000,
  );
  assert.match(ownedId, /^[a-f0-9]{64}$/u);
  const info = JSON.parse(await docker(["container", "inspect", ownedId]))[0];
  const port = Number(info.NetworkSettings.Ports["6379/tcp"]?.[0]?.HostPort);
  assert.equal(info.NetworkSettings.Ports["6379/tcp"]?.[0]?.HostIp, "127.0.0.1");
  assert.ok(Number.isSafeInteger(port) && port > 1_023 && port < 65_536);
  const deadline = performance.now() + 20_000;
  for (;;) {
    try {
      assert.equal(await docker(["exec", ownedId, "redis-cli", "--raw", "ping"], 3_000), "PONG");
      break;
    } catch (error) {
      if (performance.now() >= deadline) {
        throw error;
      }
      await delay(200);
    }
  }
  assert.equal(
    await docker(
      ["exec", ownedId, "redis-cli", "--raw", "SET", "aster:test:oversized", "x".repeat(16_385)],
      5_000,
    ),
    "OK",
  );
  assert.equal(
    await docker(
      ["exec", ownedId, "redis-cli", "--raw", "HSET", "aster:test:wrong-type", "field", "value"],
      5_000,
    ),
    "1",
  );
  assert.equal(
    await docker(
      [
        "exec",
        ownedId,
        "redis-cli",
        "--raw",
        "SET",
        "aster:test:catalog:public-title-absent:v1:00000000-0000-4000-8000-000000000097",
        '{"schema":1,"kind":"absent"}',
      ],
      5_000,
    ),
    "OK",
  );
  const result = await execute(
    process.execPath,
    ["services/catalog/dist/test/integration/cache-redis.js", String(port)],
    {
      cwd: root,
      timeout: 20_000,
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
  assert.ok(ids.length <= 1, "Unexpected cache fixture ownership.");
  for (const id of ids) {
    assert.match(id, /^[a-f0-9]{64}$/u);
    const info = JSON.parse(await docker(["container", "inspect", id]))[0];
    assert.equal(info.Id, id);
    assert.equal(id, ownedId);
    assert.equal(info.Name, "/" + name);
    assert.equal(info.Config.Labels["aster.catalog.cache.fixture"], name);
    assert.equal(info.Config.Image, image);
    assert.ok(info.Mounts.every((mount) => mount.Type === "tmpfs"));
    await docker(["container", "rm", "--force", id], 15_000);
  }
  assert.equal(
    await docker(["container", "ls", "--all", "--quiet", "--filter", "label=" + label]),
    "",
  );
  process.stdout.write(
    JSON.stringify({
      event: "catalog_cache_fixture_cleaned",
      remaining: 0,
      durationMs: Math.round(performance.now() - started),
    }) + "\n",
  );
}
if (primaryError) {
  throw new Error("Catalog cache integration failed.", { cause: primaryError });
}
