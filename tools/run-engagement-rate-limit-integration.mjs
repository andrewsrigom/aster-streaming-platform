import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, URL } from "node:url";
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
const name = "aster-engagement-rate-test-" + randomUUID();
const label = "aster.engagement.rate.fixture=" + name;
const docker = async (args, timeout = 10_000) => {
  const { stdout } = await execute("docker", args, {
    cwd: root,
    timeout,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  return stdout.trim();
};
const prefix = "aster:test:engagement:rate:v1:set_watchlist:";
const keys = ["a", "b", "c", "d", "e", "f"].map((value) => prefix + value.repeat(64));
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
    await docker(["exec", ownedId, "redis-cli", "HSET", keys[1], "field", "value"]),
    "1",
  );
  assert.equal(
    await docker(["exec", ownedId, "redis-cli", "SET", keys[2], "malformed", "PX", "30000"]),
    "OK",
  );
  assert.equal(await docker(["exec", ownedId, "redis-cli", "SET", keys[3], "v1:4000:0"]), "OK");
  assert.equal(
    await docker([
      "exec",
      ownedId,
      "redis-cli",
      "SET",
      keys[4],
      "v1:4000:9999999999999",
      "PX",
      "30000",
    ]),
    "OK",
  );
  assert.equal(
    await docker(["exec", ownedId, "redis-cli", "SET", keys[5], "v1:4000:0", "PX", "60000"]),
    "OK",
  );
  const result = await execute(
    process.execPath,
    ["services/engagement/dist/test/integration/operation-limiter-redis.js", String(port)],
    { cwd: root, timeout: 20_000, maxBuffer: 1024 * 1024, windowsHide: true },
  );
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  for (const key of keys) {
    assert.equal(await docker(["exec", ownedId, "redis-cli", "TYPE", key]), "string");
    const ttl = Number(await docker(["exec", ownedId, "redis-cli", "PTTL", key]));
    assert.ok(ttl > 0 && ttl <= 30_000, key);
  }
} catch (error) {
  if (error?.stdout) {
    process.stdout.write(error.stdout);
  }
  if (error?.stderr) {
    process.stderr.write(error.stderr);
  }
  primaryError = error;
} finally {
  try {
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
    assert.ok(ids.length <= 1, "Unexpected Engagement rate fixture ownership.");
    for (const id of ids) {
      assert.equal(id, ownedId);
      const info = JSON.parse(await docker(["container", "inspect", id]))[0];
      assert.equal(info.Config.Labels["aster.engagement.rate.fixture"], name);
      assert.ok(info.Mounts.every((mount) => mount.Type === "tmpfs"));
      await docker(["container", "rm", "--force", id], 15_000);
    }
    assert.equal(
      await docker(["container", "ls", "--all", "--quiet", "--filter", "label=" + label]),
      "",
    );
    process.stdout.write(
      JSON.stringify({
        event: "engagement_rate_fixture_cleaned",
        remaining: 0,
        durationMs: Math.round(performance.now() - started),
      }) + "\n",
    );
  } catch (error) {
    primaryError ??= error;
  }
}
if (primaryError) {
  throw new Error("Engagement rate-limit integration failed.", { cause: primaryError });
}
