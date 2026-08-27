import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";

import { Kafka, logLevel } from "kafkajs";

import { createAsterKafkaBrokerAdapter, type AsterKafkaConsumedRecord } from "@aster/broker-kafka";
import { createAsterTelemetry } from "@aster/telemetry";

import { eventually } from "./docker-fixture.js";
import { change } from "./worker-control.js";

const port = Number(process.argv[3]);
assert.ok(Number.isSafeInteger(port) && port >= 1024 && port <= 65535);
const brokers = [`127.0.0.1:${port}`];
const topic = "aster.integration.p01-r09";
const groupId = "aster-integration-p01-r09";
const key = Buffer.from("synthetic-ordering-key");
const telemetry = createAsterTelemetry({
  serviceName: "integration-broker",
  serviceVersion: "0.0.0",
  environment: "test",
  export: { mode: "none" },
});
const broker = createAsterKafkaBrokerAdapter({
  brokers,
  clientId: "aster-integration",
  groupId,
  telemetry,
  maxInFlightPublishes: 1,
  maxMessageBytes: 1024,
  connectionTimeoutMs: 1_500,
  operationTimeoutMs: 2_000,
  closeTimeoutMs: 4_000,
  retryMaxAttempts: 2,
});
const inspectorKafka = new Kafka({
  brokers,
  clientId: "aster-integration-inspector",
  connectionTimeout: 1_000,
  requestTimeout: 2_000,
  enforceRequestTimeout: true,
  retry: { retries: 0 },
  logLevel: logLevel.NOTHING,
  logCreator: () => () => {},
});
const admin = inspectorKafka.admin();
const initializer = inspectorKafka.consumer({ groupId, maxWaitTimeInMs: 100 });

function protocolCode(error: unknown): number | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }
  const code: unknown = Object.getOwnPropertyDescriptor(error, "code")?.value;
  const cause: unknown = Object.getOwnPropertyDescriptor(error, "cause")?.value;
  const causeCode: unknown =
    cause instanceof Error ? Object.getOwnPropertyDescriptor(cause, "code")?.value : undefined;
  return typeof code === "number" ? code : typeof causeCode === "number" ? causeCode : undefined;
}

function output(event: string, details: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({ event, ...details })}\n`);
}

async function inspect<T>(work: () => Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          // KafkaJS has no AbortSignal API; disconnect cancels this test-only client generation.
          void Promise.allSettled([admin.disconnect(), initializer.disconnect()]);
          reject(new Error("Broker inspector deadline exceeded"));
        }, 5_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function committedOffset(): Promise<string> {
  const offsets = await inspect(() => admin.fetchOffsets({ groupId, topics: [topic] }));
  assert.equal(offsets.length, 1);
  assert.equal(offsets[0]?.partitions.length, 1);
  return offsets[0].partitions[0]?.offset ?? "missing";
}

function publish(value: string, signal?: AbortSignal) {
  return broker.publish({ topic, key, value: Buffer.from(value) }, signal);
}

async function consume(handle: (record: AsterKafkaConsumedRecord) => Promise<void>): Promise<void> {
  assert.deepEqual(await broker.startConsumer({ topic, handle }), { status: "completed" });
}

async function consumerDelivery(): Promise<void> {
  const seen: Array<{ offset: string; value: string }> = [];
  let hold = false;
  let cancelled = false;
  const handle = async (record: AsterKafkaConsumedRecord): Promise<void> => {
    assert.ok(seen.length < 8);
    assert.deepEqual(record.key, Uint8Array.from(key));
    assert.equal(record.partition, 0);
    assert.equal(record.signal.aborted, false);
    seen.push({ offset: record.offset, value: Buffer.from(record.value).toString("utf8") });
    if (hold) {
      await new Promise<void>((resolve) => {
        record.signal.addEventListener(
          "abort",
          () => {
            cancelled = true;
            resolve();
          },
          { once: true },
        );
      });
    }
  };
  await consume(handle);
  assert.equal((await publish("first")).status, "completed");
  await eventually(
    "first message durably committed",
    async () => (await committedOffset()) === "1",
  );
  assert.deepEqual(seen, [{ offset: "0", value: "first" }]);
  hold = true;
  assert.equal((await publish("cancel-and-replay")).status, "completed");
  await eventually("second handler owns work", () => broker.snapshot().inFlightHandlers === 1);
  const stopping = performance.now();
  assert.equal((await broker.stopConsumer()).status, "completed");
  assert.ok(performance.now() - stopping < 4_000);
  assert.equal(cancelled, true);
  assert.equal(broker.snapshot().inFlightHandlers, 0);
  assert.equal(await committedOffset(), "1", "Cancelled work must remain uncommitted");
  hold = false;
  await consume(handle);
  await eventually(
    "cancelled message replay committed",
    async () => (await committedOffset()) === "2",
  );
  assert.deepEqual(seen.slice(1), [
    { offset: "1", value: "cancel-and-replay" },
    { offset: "1", value: "cancel-and-replay" },
  ]);
  assert.equal((await broker.stopConsumer()).status, "completed");

  await consume(() => Promise.reject(new Error("synthetic-handler-failure")));
  assert.equal((await publish("failed-and-replayed")).status, "completed");
  await eventually(
    "failed handler degrades consumer",
    () => broker.snapshot().consumerState === "degraded",
  );
  assert.equal(await committedOffset(), "2", "Failed handler must not commit");
  await consume(handle);
  await eventually(
    "failed message replay committed",
    async () => (await committedOffset()) === "3",
  );
  assert.deepEqual(seen.at(-1), { offset: "2", value: "failed-and-replayed" });
  assert.equal((await broker.stopConsumer()).status, "completed");
  output("broker_keyed_delivery", {
    committed: 3,
    cancelledReplay: "passed",
    failedReplay: "passed",
  });
}

async function faultRecovery(): Promise<void> {
  await change("broker", "pause");
  const controller = new AbortController();
  const pending = publish("ambiguous-cancel", controller.signal);
  await nextTurn();
  assert.equal(broker.snapshot().inFlightPublishes, 1);
  assert.deepEqual(await publish("capacity-rejected"), {
    status: "rejected",
    reason: "capacity_exceeded",
  });
  controller.abort();
  assert.deepEqual(await pending, { status: "delivery_ambiguous", reason: "aborted" });
  await change("broker", "unpause");
  assert.equal((await broker.connect()).status, "completed");
  assert.equal((await broker.metadata({ topic })).status, "completed");

  await change("broker", "pause");
  const started = performance.now();
  assert.deepEqual(await publish("ambiguous-timeout"), {
    status: "delivery_ambiguous",
    reason: "timed_out",
  });
  assert.ok(performance.now() - started < 3_000);
  await change("broker", "unpause");
  assert.equal((await broker.connect()).status, "completed");
  assert.equal((await broker.metadata({ topic })).status, "completed");
  // Neither ambiguous message is retried. Exact delivery is deliberately not asserted.
  await change("broker", "stop");
  assert.notEqual((await broker.metadata({ topic })).status, "completed");
  await change("broker", "start");
  assert.equal((await broker.connect()).status, "completed");
  assert.equal((await broker.metadata({ topic })).status, "completed");
  assert.equal(await committedOffset(), "3", "Committed progress survives broker restart");
  output("broker_fault_recovery", {
    capacity: "passed",
    ambiguousAbort: "passed",
    ambiguousTimeout: "passed",
    restart: "passed",
  });
}

async function main(): Promise<void> {
  try {
    await inspect(() => admin.connect());
    await inspect(() =>
      admin.createTopics({
        topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
        timeout: 2_000,
        waitForLeaders: true,
      }),
    );
    output("broker_topic_ready");
    // The first group request initializes the coordinator after the broker accepts metadata.
    // Only this read-only fixture probe retries that finite startup condition.
    await eventually(
      "group coordinator initialized",
      async () => {
        try {
          await inspect(() => admin.describeGroups([groupId]));
          return true;
        } catch (error) {
          const code = protocolCode(error);
          if (code === 69) {
            return true;
          }
          if (
            (code !== undefined && [14, 15, 16].includes(code)) ||
            (error instanceof Error && error.name === "KafkaJSGroupCoordinatorNotFound")
          ) {
            return false;
          }
          throw error;
        }
      },
      10_000,
    );
    output("broker_coordinator_ready");
    // KafkaJS admin.setOffsets creates a hidden consumer with a five-second fetch wait.
    // Own a bounded initializer explicitly so it cannot outlive this test's request budget.
    await inspect(() => initializer.connect());
    await inspect(() => initializer.subscribe({ topics: [topic], fromBeginning: true }));
    await inspect(() =>
      initializer.run({
        autoCommit: false,
        eachMessage: () =>
          Promise.reject(new Error("Unexpected fixture message before initialization")),
      }),
    );
    await inspect(() => initializer.commitOffsets([{ topic, partition: 0, offset: "0" }]));
    await inspect(() => initializer.disconnect());
    output("broker_initial_offset_ready");
    assert.equal((await broker.connect()).status, "completed");
    assert.equal((await broker.metadata({ topic })).status, "completed");
    await consumerDelivery();
    await faultRecovery();
    assert.equal((await broker.close()).status, "completed");
    await inspect(() => admin.deleteGroups([groupId]));
    await inspect(() => admin.deleteTopics({ topics: [topic], timeout: 2_000 }));
    await eventually(
      "fixture topic removed",
      async () => !(await inspect(() => admin.listTopics())).includes(topic),
    );
    output("broker_fixture_empty", { topics: 0, groups: 0 });
  } finally {
    const started = performance.now();
    const closing = await broker.close();
    assert.ok(
      closing.status === "completed" || closing.status === "already_completed",
      closing.status,
    );
    assert.equal((await broker.close()).status, "already_completed");
    assert.equal(broker.snapshot().inFlightHandlers, 0);
    assert.equal(broker.snapshot().inFlightPublishes, 0);
    await inspect(() => initializer.disconnect());
    await inspect(() => admin.disconnect());
    assert.equal((await telemetry.shutdown()).status, "completed");
    output("broker_handles_closed", { durationMs: Math.round(performance.now() - started) });
  }
}

await main().catch((error: unknown) => {
  if (error instanceof assert.AssertionError) {
    output("assertion_failed", {
      message: error.message.slice(0, 2_048),
      stack: error.stack
        ?.split("\n")
        .filter((line) => line.includes("broker-worker.js"))
        .slice(0, 2),
    });
  } else {
    output("broker_scenario_failed", {
      name: error instanceof Error ? error.name : "unknown",
      protocolCode: protocolCode(error),
    });
  }
  throw new Error("Broker integration scenario failed.");
});
process.disconnect();
process.once("beforeExit", () => {
  output("natural_exit", { mode: "broker" });
});
