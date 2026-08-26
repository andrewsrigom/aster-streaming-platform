import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test(
  "a real SIGTERM drains the process and preserves the conventional exit code",
  { skip: process.platform === "win32", timeout: 5_000 },
  async () => {
    const fixture = fileURLToPath(new URL("./fixtures/process-signal-fixture.js", import.meta.url));
    const child = spawn(process.execPath, [fixture], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let signalSent = false;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (!signalSent && stdout.includes("READY\n")) {
        signalSent = true;
        child.kill("SIGTERM");
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code, signal) => {
          resolve({ code, signal });
        });
      },
    );

    assert.deepEqual(exit, { code: 143, signal: null });
    assert.equal(stderr, "");
    assert.match(stdout, /^READY\nSTOP_TRAFFIC\nCLOSE_DEPENDENCIES\n$/u);
    assert.doesNotMatch(stdout, /FORCE_CLOSE/u);
  },
);

test(
  "a real SIGTERM hard-exits when force close throws with a live handle",
  { skip: process.platform === "win32", timeout: 5_000 },
  async () => {
    const fixture = fileURLToPath(new URL("./fixtures/process-signal-fixture.js", import.meta.url));
    const child = spawn(process.execPath, [fixture, "--force-close-throws"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let signalSent = false;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (!signalSent && stdout.includes("READY\n")) {
        signalSent = true;
        child.kill("SIGTERM");
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    const forceKill = setTimeout(() => {
      child.kill("SIGKILL");
    }, 2_000);
    const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code, signal) => {
          resolve({ code, signal });
        });
      },
    );
    clearTimeout(forceKill);

    assert.deepEqual(exit, { code: 143, signal: null });
    assert.equal(stderr, "");
    assert.match(stdout, /^READY\n/u);
    assert.doesNotMatch(`${stdout}\n${stderr}`, /private-canary/u);
  },
);
