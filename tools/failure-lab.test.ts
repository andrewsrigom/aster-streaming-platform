import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { glob, readFile, stat } from "node:fs/promises";
import { request } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import { setTimeout as wait } from "node:timers/promises";
import { promisify } from "node:util";

import {
  ASTER_FAILURE_LAB_MAX_BODY_BYTES,
  ASTER_FAILURE_LAB_TAG,
  AsterFailureLabConfigurationError,
  AsterFailureLabDeliveryError,
  createAsterFailureLabHttpAdapter,
  injectAsterDuplicateDelivery,
  type AsterFailureLabHttpOptions,
  type AsterFailureLabObservation,
} from "./failure-lab.ts";

const execute = promisify(execFile);

interface HttpResult {
  body: string;
  headers: Record<string, string | string[] | undefined>;
  status: number;
}

function call(
  origin: string,
  options: { headers?: Record<string, string>; path?: string; signal?: AbortSignal } = {},
): Promise<HttpResult> {
  const target = new URL(options.path ?? "/", origin);
  return new Promise<HttpResult>((resolveResult, reject) => {
    let settled = false;
    const settleError = (error: Error): void => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    const outgoing = request(
      target,
      { headers: options.headers, signal: options.signal },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        incoming.once("aborted", () => {
          settleError(
            Object.assign(new Error("response aborted"), {
              partialBody: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        });
        incoming.once("error", settleError);
        incoming.once("end", () => {
          if (!settled) {
            settled = true;
            resolveResult({
              body: Buffer.concat(chunks).toString("utf8"),
              headers: incoming.headers,
              status: incoming.statusCode ?? 0,
            });
          }
        });
      },
    );
    outgoing.once("error", settleError);
    outgoing.end();
  });
}

async function withAdapter<T>(
  options: AsterFailureLabHttpOptions,
  execute: (origin: string) => Promise<T>,
): Promise<T> {
  const adapter = createAsterFailureLabHttpAdapter(options);
  const address = await adapter.start();
  assert.equal(address.host, "127.0.0.1");
  assert.match(address.origin, /^http:\/\/127\.0\.0\.1:\d+$/u);
  try {
    return await execute(address.origin);
  } finally {
    await adapter.close();
    await adapter.close();
  }
}

test("laboratory refuses production and invalid or unbounded construction", () => {
  const valid = {
    environment: "local",
    mode: "latency",
    scenario: "catalog-latency",
  } satisfies AsterFailureLabHttpOptions;

  assert.throws(
    () => createAsterFailureLabHttpAdapter({ ...valid, environment: "production" }),
    (error: unknown) =>
      error instanceof AsterFailureLabConfigurationError && error.issue === "environment",
  );
  assert.throws(
    () => createAsterFailureLabHttpAdapter({ ...valid, scenario: "PUBLIC/path" }),
    (error: unknown) =>
      error instanceof AsterFailureLabConfigurationError && error.issue === "scenario",
  );
  assert.throws(
    () => createAsterFailureLabHttpAdapter({ ...valid, delayMs: 0 }),
    (error: unknown) =>
      error instanceof AsterFailureLabConfigurationError && error.issue === "delay",
  );
  assert.throws(
    () =>
      createAsterFailureLabHttpAdapter({
        ...valid,
        responseBody: "x".repeat(ASTER_FAILURE_LAB_MAX_BODY_BYTES + 1),
      }),
    (error: unknown) =>
      error instanceof AsterFailureLabConfigurationError && error.issue === "body",
  );
  assert.throws(
    () =>
      createAsterFailureLabHttpAdapter({
        ...valid,
        mode: "error",
        responseStatus: 418,
      }),
    (error: unknown) =>
      error instanceof AsterFailureLabConfigurationError && error.issue === "status",
  );
  assert.throws(
    () =>
      createAsterFailureLabHttpAdapter({
        ...valid,
        mode: "unknown" as AsterFailureLabHttpOptions["mode"],
      }),
    (error: unknown) =>
      error instanceof AsterFailureLabConfigurationError && error.issue === "mode",
  );
});

test("close waits for pending startup and concurrent close calls share complete cleanup", async () => {
  const moduleUrl = new URL("./failure-lab.ts", import.meta.url).href;
  const source = `
    import assert from "node:assert/strict";
    const module = await import(${JSON.stringify(moduleUrl)});
    const adapter = module.createAsterFailureLabHttpAdapter({
      environment: "local",
      mode: "latency",
      scenario: "startup-close-race"
    });
    const starting = adapter.start();
    const closing = adapter.close();
    const closingAgain = adapter.close();
    const [startResult, closeResult, secondCloseResult] = await Promise.allSettled([
      starting,
      closing,
      closingAgain
    ]);
    assert.equal(startResult.status, "rejected");
    assert.ok(startResult.reason instanceof module.AsterFailureLabConfigurationError);
    assert.equal(startResult.reason.issue, "state");
    assert.equal(closeResult.status, "fulfilled");
    assert.equal(secondCloseResult.status, "fulfilled");
    await adapter.close();
    await assert.rejects(adapter.start(), (error) =>
      error instanceof module.AsterFailureLabConfigurationError && error.issue === "state"
    );
    process.stdout.write(JSON.stringify({ cleanup: "complete", listener: "closed" }));
  `;
  const result = await execute(process.execPath, ["--input-type=module", "--eval", source], {
    timeout: 3_000,
  });
  assert.deepEqual(JSON.parse(result.stdout), { cleanup: "complete", listener: "closed" });
});

test("latency is real, visibly tagged and immutable against request or option mutation", async () => {
  const observations: AsterFailureLabObservation[] = [];
  const options: AsterFailureLabHttpOptions = {
    delayMs: 35,
    environment: "local",
    mode: "latency",
    observe: (entry) => {
      observations.push(entry);
    },
    responseBody: '{"ok":true}',
    scenario: "catalog-latency",
  };
  const adapter = createAsterFailureLabHttpAdapter(options);
  options.mode = "reset";
  options.scenario = "mutated-after-construction";
  const address = await adapter.start();
  try {
    let settled = false;
    const resultPromise = call(address.origin, {
      headers: { "x-aster-failure-mode": "reset" },
      path: "/graphql?mode=error&status=500",
    });
    void resultPromise.then(() => {
      settled = true;
    });
    await wait(5);
    assert.equal(settled, false);
    const result = await resultPromise;
    assert.equal(result.status, 200);
    assert.equal(result.body, '{"ok":true}');
    assert.equal(result.headers["x-aster-failure-injection"], "true");
    assert.equal(result.headers["x-aster-failure-mode"], "latency");
    assert.equal(result.headers["x-aster-failure-scenario"], "catalog-latency");
    assert.deepEqual(
      observations.map(({ event, injection, mode, scenario }) => ({
        event,
        injection,
        mode,
        scenario,
      })),
      [
        {
          event: "activated",
          injection: ASTER_FAILURE_LAB_TAG,
          mode: "latency",
          scenario: "catalog-latency",
        },
        {
          event: "completed",
          injection: ASTER_FAILURE_LAB_TAG,
          mode: "latency",
          scenario: "catalog-latency",
        },
      ],
    );
  } finally {
    await adapter.close();
  }
});

test("timeout cancels with the client and also terminates at the finite lab deadline", async () => {
  const activated = Promise.withResolvers<undefined>();
  const cancelled = Promise.withResolvers<undefined>();
  await withAdapter(
    {
      environment: "integration",
      holdMs: 500,
      mode: "timeout",
      observe: ({ event }) => {
        if (event === "activated") {
          activated.resolve(undefined);
        }
        if (event === "cancelled") {
          cancelled.resolve(undefined);
        }
      },
      scenario: "catalog-timeout",
    },
    async (origin) => {
      const controller = new AbortController();
      const pending = call(origin, { signal: controller.signal });
      await activated.promise;
      controller.abort();
      await assert.rejects(pending, (error: unknown) => error instanceof Error);
      await cancelled.promise;
    },
  );

  await withAdapter(
    {
      environment: "local",
      holdMs: 15,
      mode: "timeout",
      scenario: "bounded-timeout",
    },
    async (origin) => {
      const result = await call(origin);
      assert.equal(result.status, 504);
      assert.equal(result.headers["x-aster-failure-injection"], "true");
      assert.equal(result.body, '{"injected":"deadline"}');
    },
  );
});

test("selected error and malformed response remain fixed and tagged", async () => {
  await withAdapter(
    {
      environment: "integration",
      mode: "error",
      responseBody: '{"error":"selected"}',
      responseStatus: 502,
      scenario: "catalog-error",
    },
    async (origin) => {
      const result = await call(origin, {
        headers: { "x-aster-failure-mode": "latency" },
        path: "/?mode=latency",
      });
      assert.equal(result.status, 502);
      assert.equal(result.body, '{"error":"selected"}');
      assert.equal(result.headers["x-aster-failure-mode"], "error");
    },
  );

  await withAdapter(
    { environment: "local", mode: "malformed", scenario: "catalog-malformed" },
    async (origin) => {
      const result = await call(origin);
      assert.equal(result.status, 200);
      assert.equal(result.body, "{");
      assert.throws(() => JSON.parse(result.body));
      assert.equal(result.headers["x-aster-failure-mode"], "malformed");
    },
  );
});

test("connection reset and partial stream close the exact loopback socket", async () => {
  for (const mode of ["reset", "partial_stream"] as const) {
    const events: string[] = [];
    await withAdapter(
      {
        environment: "local",
        mode,
        observe: ({ event }) => {
          events.push(event);
        },
        scenario: `catalog-${mode.replace("_", "-")}`,
      },
      async (origin) => {
        await assert.rejects(call(origin), (error: unknown) => {
          if (!(error instanceof Error)) {
            return false;
          }
          if (mode === "partial_stream") {
            return (
              "partialBody" in error &&
              (error as Error & { partialBody: string }).partialBody === '{"injected":'
            );
          }
          return true;
        });
      },
    );
    assert.deepEqual(events, ["activated", mode === "reset" ? "reset" : "partial_stream"]);
  }
});

test("saturation admits a finite active set and rejects overflow without a queue", async () => {
  const firstActivated = Promise.withResolvers<undefined>();
  const observations: AsterFailureLabObservation[] = [];
  await withAdapter(
    {
      activeLimit: 1,
      environment: "integration",
      holdMs: 40,
      mode: "saturation",
      observe: (entry) => {
        observations.push(entry);
        if (entry.event === "activated") {
          firstActivated.resolve(undefined);
        }
      },
      responseBody: '{"ok":"released"}',
      scenario: "catalog-saturation",
    },
    async (origin) => {
      const admitted = call(origin);
      await firstActivated.promise;
      const overflow = await call(origin);
      assert.equal(overflow.status, 503);
      assert.equal(overflow.body, '{"injected":"saturation"}');
      assert.equal(overflow.headers["x-aster-failure-mode"], "saturation");
      const released = await admitted;
      assert.equal(released.status, 200);
      assert.equal(released.body, '{"ok":"released"}');
      assert.equal(released.headers["x-aster-failure-injection"], "true");
    },
  );
  assert.equal(observations.filter(({ event }) => event === "activated").length, 1);
  assert.equal(observations.filter(({ event }) => event === "rejected_saturation").length, 1);
});

test("activation budget rejects later calls and observer failure cannot alter outcomes", async () => {
  await withAdapter(
    {
      environment: "local",
      maxActivations: 1,
      mode: "error",
      observe: () => {
        throw new Error("observer failure");
      },
      scenario: "bounded-activations",
    },
    async (origin) => {
      assert.equal((await call(origin)).status, 503);
      const rejected = await call(origin);
      assert.equal(rejected.status, 503);
      assert.equal(rejected.body, '{"injected":"budget"}');
      assert.equal(rejected.headers["x-aster-failure-injection"], "true");
    },
  );
});

test("duplicate delivery uses one synthetic payload exactly twice with visible ordered tags", async () => {
  const event = Object.freeze({ eventId: "synthetic-event", version: 1 });
  const received: Array<{ context: unknown; event: unknown }> = [];
  const observations: AsterFailureLabObservation[] = [];
  assert.deepEqual(
    await injectAsterDuplicateDelivery({
      deliver: (value, context) => {
        received.push({ context, event: value });
      },
      environment: "integration",
      event,
      observe: (entry) => {
        observations.push(entry);
      },
      scenario: "discovery-duplicate",
    }),
    { deliveries: 2 },
  );
  assert.equal(received.length, 2);
  assert.equal(received[0]?.event, event);
  assert.equal(received[1]?.event, event);
  assert.deepEqual(
    received.map(({ context }) => context),
    [
      {
        deliveryIndex: 1,
        injection: ASTER_FAILURE_LAB_TAG,
        mode: "duplicate_event",
        scenario: "discovery-duplicate",
      },
      {
        deliveryIndex: 2,
        injection: ASTER_FAILURE_LAB_TAG,
        mode: "duplicate_event",
        scenario: "discovery-duplicate",
      },
    ],
  );
  assert.deepEqual(
    observations.map(({ activation, event: observedEvent }) => [activation, observedEvent]),
    [
      [1, "delivery_started"],
      [1, "delivery_completed"],
      [2, "delivery_started"],
      [2, "delivery_completed"],
    ],
  );
});

test("duplicate delivery refuses production and exposes the exact failing delivery", async () => {
  await assert.rejects(
    injectAsterDuplicateDelivery({
      deliver: () => undefined,
      environment: "production",
      event: {},
      scenario: "production-duplicate",
    }),
    (error: unknown) =>
      error instanceof AsterFailureLabConfigurationError && error.issue === "environment",
  );

  let calls = 0;
  await assert.rejects(
    injectAsterDuplicateDelivery({
      deliver: () => {
        calls += 1;
        if (calls === 2) {
          throw new Error("synthetic handler failure");
        }
      },
      environment: "local",
      event: {},
      observe: () => {
        throw new Error("observer failure");
      },
      scenario: "failing-duplicate",
    }),
    (error: unknown) => error instanceof AsterFailureLabDeliveryError && error.deliveryIndex === 2,
  );
  assert.equal(calls, 2);
});

test("production source trees cannot import the tools-only failure laboratory", async () => {
  const repositoryRoot = resolve(import.meta.dirname, "..");
  const violations: string[] = [];
  let scannedFiles = 0;
  for (const pattern of [
    "apps/**/*.{js,mjs,ts,tsx}",
    "packages/**/*.{js,mjs,ts,tsx}",
    "services/**/*.{js,mjs,ts,tsx}",
    "workers/**/*.{js,mjs,ts,tsx}",
  ]) {
    for await (const file of glob(pattern, { cwd: repositoryRoot, exclude: ["**/dist/**"] })) {
      const absoluteFile = resolve(repositoryRoot, file);
      if (!(await stat(absoluteFile)).isFile()) {
        continue;
      }
      scannedFiles += 1;
      const source = await readFile(absoluteFile, "utf8");
      if (source.includes("failure-lab") || source.includes("ASTER_FAILURE_LAB")) {
        violations.push(file);
      }
    }
  }
  assert.ok(scannedFiles > 100, `expected a production source scan, got ${scannedFiles} files`);
  assert.deepEqual(violations, []);
});
