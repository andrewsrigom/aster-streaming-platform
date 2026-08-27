import assert from "node:assert/strict";
import { fork } from "node:child_process";

import { DockerFixture } from "./docker-fixture.js";

assert.notEqual(process.platform, "win32", "Run this POSIX signal laboratory inside Linux or WSL.");
const selected = process.argv[2];
const fixture = new DockerFixture(
  selected === "storage" || selected === "broker" ? selected : "core",
);
assert.ok(
  selected === undefined ||
    selected === "protocol" ||
    selected === "adapters" ||
    selected === "identity" ||
    selected === "http-drain" ||
    selected === "storage" ||
    selected === "broker",
  "Unknown integration scenario",
);
const started = performance.now();
const interruption = new AbortController();
const interrupt = (): void => {
  interruption.abort();
};
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);

function output(value: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function worker(mode: string, primaryPort: number, redisPort: number): Promise<void> {
  const workerFile =
    mode === "storage" ? "storage-worker" : mode === "broker" ? "broker-worker" : "core-worker";
  const child = fork(
    new URL(`./${workerFile}.js`, import.meta.url),
    [mode, String(primaryPort), String(redisPort)],
    {
      execArgv: [],
      env: {},
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      signal: interruption.signal,
      killSignal: "SIGKILL",
      timeout: 150_000,
    },
  );
  let captured = "";
  let stderr = "";
  let outputExceeded = false;
  const capture = (chunk: Buffer): void => {
    if (outputExceeded) {
      return;
    }
    captured += chunk.toString("utf8");
    if (Buffer.byteLength(captured) + Buffer.byteLength(stderr) > 128 * 1_024) {
      outputExceeded = true;
      child.kill("SIGKILL");
      captured = "Integration output limit exceeded.";
    }
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", (chunk: Buffer) => {
    if (!outputExceeded) {
      stderr += chunk.toString("utf8");
      capture(Buffer.alloc(0));
    }
  });
  let requests = 0;
  let pending = Promise.resolve();
  let requestError: unknown;
  let processError: unknown;
  child.on("error", (error: unknown) => {
    processError = error;
  });
  child.on("message", (message: unknown) => {
    pending = pending
      .then(async () => {
        interruption.signal.throwIfAborted();
        assert.ok(typeof message === "object" && message !== null);
        const request = message as Record<string, unknown>;
        assert.ok(++requests <= 32);
        assert.ok(fixture.hasService(request["service"]));
        const action = request["action"];
        assert.ok(
          action === "start" || action === "stop" || action === "pause" || action === "unpause",
        );
        assert.ok(Number.isSafeInteger(request["id"]));
        const actionStarted = performance.now();
        await fixture.change(request["service"], action);
        output({
          event: "fixture_action",
          service: request["service"],
          action,
          durationMs: Math.round(performance.now() - actionStarted),
        });
        if (child.connected) {
          child.send({ id: request["id"], status: "completed" });
        }
      })
      .catch((error: unknown) => {
        requestError = error;
        child.kill("SIGKILL");
      });
  });
  const result = await new Promise<{ code: number | null; signal: string | null }>((resolve) => {
    child.once("close", (code, signal) => {
      resolve({ code, signal });
    });
  });
  await pending;
  if (processError) {
    throw new Error("Integration worker could not finish", { cause: processError });
  }
  const safeOutput = captured
    .replace(/(?:postgres(?:ql)?|redis):\/\/\S+/g, "[fixture endpoint]")
    .replaceAll("aster-test-only", "[fixture credential]");
  process.stdout.write(safeOutput);
  if (requestError) {
    throw new Error("Fixture control failed", { cause: requestError });
  }
  const expectedCode = mode === "identity" || mode === "http-drain" ? 143 : 0;
  if (result.code !== expectedCode || result.signal !== null) {
    // Unhandled vendor errors may carry client objects, including connection secrets.
    output({
      event: "worker_failed",
      mode,
      ...result,
      unhandledError: stderr.includes("Unhandled 'error' event"),
      outputExceeded,
    });
  }
  assert.deepEqual(
    result,
    { code: expectedCode, signal: null },
    `${mode} worker failed; natural exit required`,
  );
  assert.ok(captured.includes('"event":"natural_exit"'), "Worker left no natural-exit evidence");
}

try {
  output({ event: "fixture_start", project: fixture.project, node: process.version });
  await fixture.start();
  output({ event: "fixture_ready", durationMs: Math.round(performance.now() - started) });
  interruption.signal.throwIfAborted();
  output({
    event: "fixture_resource_sample",
    stage: "before-workload",
    services: await fixture.sampleResources(),
  });
  const primaryPort = await fixture.port(fixture.profile === "core" ? "postgres" : fixture.profile);
  const redisPort = fixture.profile === "core" ? await fixture.port("redis") : 0;
  for (const mode of selected ? [selected] : ["protocol", "adapters", "identity", "http-drain"]) {
    output({ event: "scenario_start", mode });
    await worker(mode, primaryPort, redisPort);
  }
  output({
    event: `${fixture.profile}_integration`,
    outcome: "passed",
    scenarios: selected ? [selected] : ["protocol", "adapters", "identity", "http-drain"],
    durationMs: Math.round(performance.now() - started),
  });
} finally {
  const cleanupStarted = performance.now();
  await fixture.cleanup();
  await fixture.cleanup();
  output({
    event: "fixture_cleanup",
    project: fixture.project,
    remaining: 0,
    durationMs: Math.round(performance.now() - cleanupStarted),
  });
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
}
