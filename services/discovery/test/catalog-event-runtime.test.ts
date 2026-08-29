import assert from "node:assert/strict";
import test from "node:test";
import type { AsterKafkaBrokerAdapter } from "@aster/broker-kafka";
import { createCatalogEventRuntime } from "../src/infrastructure/catalog-event-runtime.js";

async function settled(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100 && !predicate(); attempt++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(predicate(), "expected bounded fake runtime progress");
}

function fixture() {
  const calls: string[] = [];
  const logs: unknown[] = [];
  const waits: Array<() => void> = [];
  let state: ReturnType<AsterKafkaBrokerAdapter["snapshot"]>["state"] = "idle";
  let consumer: ReturnType<AsterKafkaBrokerAdapter["snapshot"]>["consumerState"] = "idle";
  const broker = {
    connect: () => {
      calls.push("connect");
      state = "ready";
      return Promise.resolve({ status: "completed" } as const);
    },
    offsets: () => Promise.resolve({ status: "completed", value: { 2: "11", 0: "9" } } as const),
    startConsumer: (input: Parameters<AsterKafkaBrokerAdapter["startConsumer"]>[0]) => {
      calls.push(`${input.topic}:${String(input.fromBeginning)}`);
      consumer = "running";
      return Promise.resolve({ status: "completed" } as const);
    },
    stopConsumer: () => {
      calls.push("stop");
      consumer = "idle";
      return Promise.resolve({ status: "completed" } as const);
    },
    close: () => {
      calls.push("close");
      state = "closed";
      return Promise.resolve({ status: "completed" } as const);
    },
    snapshot: () => ({
      state,
      consumerState: consumer,
      inFlightPublishes: 0,
      inFlightHandlers: 0,
    }),
  };
  const runtime = createCatalogEventRuntime({
    broker,
    handle: () => Promise.resolve(),
    random: () => 0,
    wait: (_milliseconds, signal) =>
      new Promise<void>((resolve) => {
        const finish = () => {
          signal.removeEventListener("abort", finish);
          resolve();
        };
        waits.push(finish);
        signal.addEventListener("abort", finish, { once: true });
      }),
    logger: {
      info: (entry) => {
        logs.push(entry);
        return "written";
      },
    },
  });
  return {
    runtime,
    broker,
    calls,
    logs,
    waits,
    degrade() {
      consumer = "degraded";
    },
  };
}

test("runtime starts earliest Catalog consumption, recovers once and owns bounded shutdown", async () => {
  const f = fixture();
  f.runtime.start();
  await settled(() => f.calls.includes("aster.catalog.publication.v1:true"));
  assert.deepEqual(f.runtime.snapshot(), { state: "ready" });
  f.degrade();
  f.waits.shift()?.();
  await settled(() => f.calls.filter((call) => call.includes("publication")).length === 2);
  await f.runtime.close(AbortSignal.timeout(1000));
  assert.deepEqual(f.calls.slice(-2), ["stop", "close"]);
  assert.deepEqual(f.runtime.snapshot(), { state: "stopped" });
  assert.doesNotMatch(JSON.stringify(f.logs), /credential|payload|title/u);
});

test("runtime captures one canonical broker barrier only while connected", async () => {
  const f = fixture();
  assert.deepEqual(await f.runtime.barrier(AbortSignal.timeout(1000)), {
    status: "unavailable",
  });
  f.runtime.start();
  await settled(() => f.runtime.snapshot().state === "ready");
  assert.deepEqual(await f.runtime.barrier(AbortSignal.timeout(1000)), {
    status: "completed",
    value: { 0: "9", 2: "11" },
  });
  assert.deepEqual(await f.runtime.barrier(AbortSignal.abort()), { status: "cancelled" });
  await f.runtime.close(AbortSignal.timeout(1000));
});
