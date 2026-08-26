import assert from "node:assert/strict";
import { createServer, get, type Server } from "node:http";
import test from "node:test";

import {
  AsterNodeHttpLifecycleError,
  createAsterNodeHttpLifecycleHooks,
  createAsterServiceLifecycle,
} from "../src/index.js";

interface Deferred {
  readonly promise: Promise<void>;
  resolve(): void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return address.port;
}

function requestText(port: number, path: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const request = get({ agent: false, host: "127.0.0.1", path, port }, (response) => {
      response.setEncoding("utf8");
      let body = "";
      response.on("data", (chunk: string) => {
        body += chunk;
      });
      response.on("end", () => {
        resolve(body);
      });
    });
    request.on("error", reject);
  });
}

test("rejects a server without data-backed close operations", () => {
  let getterReads = 0;
  const hostile = {
    closeAllConnections(): void {
      return undefined;
    },
  };
  Object.defineProperty(hostile, "close", {
    get(): () => void {
      getterReads += 1;
      return () => undefined;
    },
  });
  assert.throws(
    () => createAsterNodeHttpLifecycleHooks(hostile as never),
    (error: unknown) => {
      assert.equal(error instanceof AsterNodeHttpLifecycleError, true);
      assert.deepEqual((error as AsterNodeHttpLifecycleError).issues, [
        { option: "server", reason: "invalid" },
      ]);
      return true;
    },
  );
  assert.equal(getterReads, 0);
});

test("force close always starts server close first and each operation once", async () => {
  const events: string[] = [];
  let finishClose!: (error?: Error) => void;
  const hooks = createAsterNodeHttpLifecycleHooks({
    close(callback): void {
      events.push("close");
      finishClose = callback;
    },
    closeAllConnections(): void {
      events.push("close_all_connections");
    },
  });

  hooks.forceClose();
  hooks.forceClose();
  const stopping = hooks.stopTraffic(new AbortController().signal);
  assert.deepEqual(events, ["close", "close_all_connections"]);
  finishClose();
  await stopping;
});

test("an in-flight HTTP request finishes while new connections are refused", async () => {
  const requestStarted = deferred();
  const finishRequest = deferred();
  const server = createServer((_request, response) => {
    requestStarted.resolve();
    void finishRequest.promise.then(() => {
      response.end("completed");
    });
  });
  const port = await listen(server);
  const inFlightResponse = requestText(port, "/in-flight");
  await requestStarted.promise;

  const httpHooks = createAsterNodeHttpLifecycleHooks(server);
  const lifecycle = createAsterServiceLifecycle({
    ...httpHooks,
    shutdownDeadlineMs: 1_000,
  });
  lifecycle.markReady();
  const shutdown = lifecycle.shutdown("sigterm");
  await new Promise<void>((resolve) => setImmediate(resolve));

  await assert.rejects(requestText(port, "/new"), (error: unknown) => {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ECONNREFUSED" || code === "ECONNRESET";
  });
  finishRequest.resolve();
  assert.equal(await inFlightResponse, "completed");
  assert.deepEqual(await shutdown, {
    failedStages: [],
    outcome: "completed",
    trigger: "sigterm",
  });
  assert.equal(server.listening, false);
});

test("the deadline force-closes a stuck HTTP connection", async () => {
  const requestStarted = deferred();
  const server = createServer(() => {
    requestStarted.resolve();
  });
  const port = await listen(server);
  const connectionClosed = new Promise<void>((resolve) => {
    const request = get({ agent: false, host: "127.0.0.1", path: "/stuck", port });
    request.once("error", () => {
      resolve();
    });
    request.once("close", () => {
      resolve();
    });
  });
  await requestStarted.promise;

  const lifecycle = createAsterServiceLifecycle({
    ...createAsterNodeHttpLifecycleHooks(server),
    shutdownDeadlineMs: 100,
  });
  const startedAt = performance.now();
  const result = await lifecycle.shutdown("sigint");
  const elapsedMs = performance.now() - startedAt;

  assert.deepEqual(result, {
    failedStages: [],
    forceReason: "deadline",
    outcome: "forced",
    trigger: "sigint",
  });
  assert.ok(elapsedMs >= 80 && elapsedMs < 1_000, `unexpected shutdown time: ${elapsedMs}`);
  await connectionClosed;
  assert.equal(server.listening, false);
});
