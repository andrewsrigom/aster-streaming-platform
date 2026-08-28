import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, URL } from "node:url";
import { setTimeout, clearTimeout } from "node:timers";
import { recoverMediaScratch, scratchIdentity } from "./media/scratch-cleanup.mjs";

const execute = promisify(execFile);
const controller = new globalThis.AbortController();
const stop = () => controller.abort();
const timeout = setTimeout(stop, 60000);
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
try {
  const [project, runId, mode, ...extra] = process.argv.slice(2);
  scratchIdentity(project, runId);
  assert.ok(extra.length === 0 && (mode === undefined || mode === "--apply"));
  assert.ok(
    !["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "CI"].some(
      (key) => process.env[key],
    ),
  );
  const docker = async (args) => {
    controller.signal.throwIfAborted();
    const result = await execute("docker", args, {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      timeout: 8000,
      signal: controller.signal,
      maxBuffer: 2 * 1024 * 1024,
      killSignal: "SIGKILL",
      windowsHide: true,
    });
    return result.stdout.trim();
  };
  const endpoint = JSON.parse(
    await docker(["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"]),
  );
  assert.ok(typeof endpoint === "string" && /^(?:unix:\/\/|npipe:\/\/)/u.test(endpoint));
  await recoverMediaScratch(project, runId, {
    docker,
    now: Date.now,
    apply: mode === "--apply",
    signal: controller.signal,
    output: (value) => process.stdout.write(JSON.stringify(value) + "\n"),
  });
} catch {
  process.stdout.write(
    JSON.stringify({
      event: "media_scratch_rejected",
      code: controller.signal.aborted ? "CANCELLED" : "UNSAFE_OR_UNAVAILABLE",
    }) + "\n",
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  process.off("SIGTERM", stop);
  process.off("SIGINT", stop);
}
