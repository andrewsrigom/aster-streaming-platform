import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import type { AsterObservationOutcome } from "@aster/telemetry";

import {
  AsterKafkaBrokerConfigurationError,
  AsterKafkaBrokerLifecycleError,
  type AsterKafkaBrokerOptions,
  type AsterKafkaBrokerTelemetry,
} from "../src/index.js";
import {
  createAsterKafkaBrokerAdapterWithClientFactory,
  type AsterKafkaClientBundle,
  type AsterKafkaClientConfiguration,
  type AsterKafkaConsumerClient,
  type AsterKafkaProducerClient,
  type AsterKafkaRawRecord,
} from "../src/infrastructure/kafka-adapter.js";

function deferred<T>(): {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((error: unknown) => void) | undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {
    promise,
    resolve: (value) => resolve?.(value),
    reject: (error) => reject?.(error),
  };
}

class RecordingTelemetry implements AsterKafkaBrokerTelemetry {
  readonly attempts: Array<{
    input: Readonly<{ dependency: string; operation: string }>;
    outcome?: AsterObservationOutcome;
  }> = [];

  startDependencyOperation(input: Readonly<{ dependency: string; operation: string }>) {
    const attempt: (typeof this.attempts)[number] = { input };
    this.attempts.push(attempt);
    return {
      status: "started" as const,
      observation: {
        complete: ({ outcome }: { outcome: AsterObservationOutcome }) => {
          attempt.outcome = outcome;
          return { status: "completed" as const };
        },
      },
    };
  }
}

class FakeProducer implements AsterKafkaProducerClient {
  connectCalls = 0;
  metadataCalls = 0;
  publishCalls = 0;
  disconnectCalls = 0;
  lastTopic: string | undefined;
  lastPublish: Readonly<{ topic: string; key: Uint8Array; value: Uint8Array }> | undefined;
  connectHandler: () => Promise<void> = () => Promise.resolve();
  metadataHandler: (topic: string) => Promise<void> = () => Promise.resolve();
  publishHandler: AsterKafkaProducerClient["publish"] = () => Promise.resolve();
  disconnectHandler: () => Promise<void> = () => Promise.resolve();

  connect(): Promise<void> {
    this.connectCalls += 1;
    return this.connectHandler();
  }

  metadata(topic: string): Promise<void> {
    this.metadataCalls += 1;
    this.lastTopic = topic;
    return this.metadataHandler(topic);
  }

  publish(input: Readonly<{ topic: string; key: Uint8Array; value: Uint8Array }>): Promise<void> {
    this.publishCalls += 1;
    this.lastPublish = input;
    return this.publishHandler(input);
  }

  disconnect(): Promise<void> {
    this.disconnectCalls += 1;
    return this.disconnectHandler();
  }
}

class FakeConsumer implements AsterKafkaConsumerClient {
  startCalls = 0;
  disconnectCalls = 0;
  topic: string | undefined;
  onMessage: ((record: AsterKafkaRawRecord) => Promise<void>) | undefined;
  onCrash: (() => void) | undefined;
  startHandler: () => Promise<void> = () => Promise.resolve();
  disconnectHandler: () => Promise<void> = () => Promise.resolve();

  start(
    topic: string,
    onMessage: (record: AsterKafkaRawRecord) => Promise<void>,
    onCrash: () => void,
  ): Promise<void> {
    this.startCalls += 1;
    this.topic = topic;
    this.onMessage = onMessage;
    this.onCrash = onCrash;
    return this.startHandler();
  }

  disconnect(): Promise<void> {
    this.disconnectCalls += 1;
    return this.disconnectHandler();
  }

  emit(record: AsterKafkaRawRecord): Promise<void> {
    return this.onMessage?.(record) ?? Promise.reject(new Error("consumer-not-started"));
  }
}

class FakeBundle implements AsterKafkaClientBundle {
  readonly producer: FakeProducer;
  readonly consumers: FakeConsumer[];
  createConsumerCalls = 0;

  constructor(producer = new FakeProducer(), consumers = [new FakeConsumer()]) {
    this.producer = producer;
    this.consumers = consumers;
  }

  createConsumer(): AsterKafkaConsumerClient {
    const consumer = this.consumers[this.createConsumerCalls];
    this.createConsumerCalls += 1;
    if (!consumer) {
      throw new Error("no-consumer-fixture");
    }
    return consumer;
  }
}

function options(
  telemetry: AsterKafkaBrokerTelemetry,
  overrides: Partial<AsterKafkaBrokerOptions> = {},
): AsterKafkaBrokerOptions {
  return {
    brokers: ["127.0.0.1:9092"],
    clientId: "aster-test",
    groupId: "aster-test-group",
    telemetry,
    maxInFlightPublishes: 2,
    maxMessageBytes: 64,
    connectionTimeoutMs: 100,
    operationTimeoutMs: 100,
    closeTimeoutMs: 100,
    retryMaxAttempts: 2,
    retryBaseDelayMs: 25,
    ...overrides,
  };
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test("validates bounded own-data configuration without invoking accessors or exposing input", () => {
  const telemetry = new RecordingTelemetry();
  let accessorReads = 0;
  let factoryCalls = 0;
  const accessorOptions = options(telemetry);
  Object.defineProperty(accessorOptions, "clientId", {
    enumerable: true,
    get(): string {
      accessorReads += 1;
      return ["hidden", "-client"].join("");
    },
  });
  const hostile = new Proxy(
    {},
    {
      ownKeys(): never {
        throw new Error("hidden-never-emit");
      },
    },
  ) as AsterKafkaBrokerOptions;

  for (const input of [
    accessorOptions,
    hostile,
    options(telemetry, { brokers: ["user@127.0.0.1:9092"] }),
    options(telemetry, { brokers: ["127.0.0.1:9092", "127.0.0.1:9092"] }),
    options(telemetry, { retryMaxAttempts: 0 }),
  ]) {
    assert.throws(
      () =>
        createAsterKafkaBrokerAdapterWithClientFactory(input, () => {
          factoryCalls += 1;
          return new FakeBundle();
        }),
      (error: unknown) => {
        assert.equal(error instanceof AsterKafkaBrokerConfigurationError, true);
        const configurationError = error as AsterKafkaBrokerConfigurationError;
        assert.equal(configurationError.issues.length >= 1, true);
        assert.equal(configurationError.issues.length <= 12, true);
        assert.equal("cause" in configurationError, false);
        assert.equal(JSON.stringify(configurationError).includes("hidden-never-emit"), false);
        return true;
      },
    );
  }
  assert.equal(accessorReads, 0);
  assert.equal(factoryCalls, 0);
});

test("constructs one finite idempotent no-log client policy", async () => {
  const telemetry = new RecordingTelemetry();
  const bundle = new FakeBundle();
  let captured: AsterKafkaClientConfiguration | undefined;
  const adapter = createAsterKafkaBrokerAdapterWithClientFactory(
    options(telemetry),
    (configuration) => {
      captured = configuration;
      return bundle;
    },
  );

  assert.equal(Object.isFrozen(adapter), true);
  assert.deepEqual(await adapter.connect(), { status: "completed" });
  const configuration = captured as AsterKafkaClientConfiguration;
  assert.deepEqual(configuration.brokers, ["127.0.0.1:9092"]);
  assert.equal(Object.isFrozen(configuration.brokers), true);
  assert.equal(configuration.clientId, "aster-test");
  assert.equal(configuration.groupId, "aster-test-group");
  assert.equal(configuration.maxInFlightRequests, 1);
  assert.equal(configuration.allowAutoTopicCreation, false);
  assert.equal(configuration.idempotent, true);
  assert.equal(configuration.logLevel, "nothing");
  assert.equal(configuration.retryMaxAttempts, 2);
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("connect, metadata, and publish emit only finite telemetry and copied bytes", async () => {
  const telemetry = new RecordingTelemetry();
  const bundle = new FakeBundle();
  const adapter = createAsterKafkaBrokerAdapterWithClientFactory(options(telemetry), () => bundle);
  const key = Uint8Array.from([1, 2]);
  const value = Uint8Array.from([3, 4]);

  assert.deepEqual(await adapter.connect(), { status: "completed" });
  assert.deepEqual(await adapter.metadata({ topic: "aster.probe" }), { status: "completed" });
  assert.deepEqual(await adapter.publish({ topic: "aster.probe", key, value }), {
    status: "completed",
  });
  key[0] = 9;
  value[0] = 9;
  assert.equal(bundle.producer.lastTopic, "aster.probe");
  const published = bundle.producer.lastPublish as Readonly<{
    topic: string;
    key: Uint8Array;
    value: Uint8Array;
  }>;
  assert.deepEqual(published.key, Uint8Array.from([1, 2]));
  assert.deepEqual(published.value, Uint8Array.from([3, 4]));
  assert.deepEqual(
    telemetry.attempts.map(({ input, outcome }) => ({ operation: input.operation, outcome })),
    [
      { operation: "connect", outcome: "success" },
      { operation: "probe", outcome: "success" },
      { operation: "publish", outcome: "success" },
    ],
  );
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("rejects invalid operations before vendor work and requires an explicit connection", async () => {
  const telemetry = new RecordingTelemetry();
  const bundle = new FakeBundle();
  const adapter = createAsterKafkaBrokerAdapterWithClientFactory(options(telemetry), () => bundle);

  assert.deepEqual(
    await adapter.publish({
      topic: "aster.probe",
      key: Uint8Array.from([1]),
      value: Uint8Array.from([2]),
    }),
    { status: "rejected", reason: "not_connected" },
  );
  assert.deepEqual(
    await adapter.publish({
      topic: "../unsafe",
      key: Uint8Array.from([1]),
      value: Uint8Array.from([2]),
    }),
    { status: "rejected", reason: "invalid_request" },
  );
  assert.deepEqual(
    await adapter.publish({
      topic: "aster.probe",
      key: Uint8Array.from([1]),
      value: new Uint8Array(64),
    }),
    { status: "rejected", reason: "invalid_request" },
  );
  assert.equal(bundle.producer.publishCalls, 0);
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("rejects excess publishes before extending producer work", async () => {
  const telemetry = new RecordingTelemetry();
  const bundle = new FakeBundle();
  const publish = deferred<undefined>();
  bundle.producer.publishHandler = () => publish.promise;
  const adapter = createAsterKafkaBrokerAdapterWithClientFactory(
    options(telemetry, { maxInFlightPublishes: 1 }),
    () => bundle,
  );
  assert.deepEqual(await adapter.connect(), { status: "completed" });
  const first = adapter.publish({
    topic: "aster.probe",
    key: Uint8Array.from([1]),
    value: Uint8Array.from([2]),
  });
  await nextTurn();

  assert.deepEqual(
    await adapter.publish({
      topic: "aster.probe",
      key: Uint8Array.from([3]),
      value: Uint8Array.from([4]),
    }),
    { status: "rejected", reason: "capacity_exceeded" },
  );
  assert.equal(bundle.producer.publishCalls, 1);
  publish.resolve(undefined);
  assert.deepEqual(await first, { status: "completed" });
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("publish abort retires the ambiguous generation and allows explicit recovery", async () => {
  const telemetry = new RecordingTelemetry();
  const first = new FakeBundle();
  const second = new FakeBundle();
  const publish = deferred<undefined>();
  first.producer.publishHandler = () => publish.promise;
  const bundles = [first, second];
  const adapter = createAsterKafkaBrokerAdapterWithClientFactory(
    options(telemetry),
    () => bundles.shift() as FakeBundle,
  );
  assert.deepEqual(await adapter.connect(), { status: "completed" });
  const controller = new AbortController();
  const pending = adapter.publish(
    { topic: "aster.probe", key: Uint8Array.from([1]), value: Uint8Array.from([2]) },
    controller.signal,
  );
  await nextTurn();
  controller.abort();

  assert.deepEqual(await pending, { status: "aborted" });
  assert.equal(first.producer.disconnectCalls, 1);
  assert.equal(adapter.snapshot().state, "degraded");
  assert.deepEqual(await adapter.connect(), { status: "completed" });
  assert.equal(second.producer.connectCalls, 1);
  publish.resolve(undefined);
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("a timed-out connect retires its generation and remains recoverable", async () => {
  const telemetry = new RecordingTelemetry();
  const first = new FakeBundle();
  const second = new FakeBundle();
  const connect = deferred<undefined>();
  first.producer.connectHandler = () => connect.promise;
  const bundles = [first, second];
  const adapter = createAsterKafkaBrokerAdapterWithClientFactory(
    options(telemetry, { connectionTimeoutMs: 20 }),
    () => bundles.shift() as FakeBundle,
  );

  assert.deepEqual(await adapter.connect(), { status: "timed_out" });
  assert.equal(first.producer.disconnectCalls, 1);
  assert.deepEqual(await adapter.connect(), { status: "completed" });
  connect.resolve(undefined);
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("consumer handles one bounded copied record with an adapter-owned signal", async () => {
  const telemetry = new RecordingTelemetry();
  const consumer = new FakeConsumer();
  const bundle = new FakeBundle(new FakeProducer(), [consumer]);
  const seen: Array<{
    key: number[] | null;
    value: number[];
    partition: number;
    offset: string;
    aborted: boolean;
  }> = [];
  const adapter = createAsterKafkaBrokerAdapterWithClientFactory(options(telemetry), () => bundle);
  assert.deepEqual(await adapter.connect(), { status: "completed" });
  assert.deepEqual(
    await adapter.startConsumer({
      topic: "aster.events",
      handle(record): Promise<void> {
        seen.push({
          key: record.key ? [...record.key] : null,
          value: [...record.value],
          partition: record.partition,
          offset: record.offset,
          aborted: record.signal.aborted,
        });
        return Promise.resolve();
      },
    }),
    { status: "completed" },
  );
  const rawKey = Uint8Array.from([1]);
  const rawValue = Uint8Array.from([2, 3]);
  await consumer.emit({ key: rawKey, value: rawValue, partition: 0, offset: "42" });
  rawKey[0] = 9;
  rawValue[0] = 9;

  assert.deepEqual(seen, [{ key: [1], value: [2, 3], partition: 0, offset: "42", aborted: false }]);
  assert.equal(adapter.snapshot().consumerState, "running");
  assert.deepEqual(await adapter.stopConsumer(), { status: "completed" });
  assert.equal(consumer.disconnectCalls, 1);
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("a stalled consumer start times out and retires the partial consumer", async () => {
  const telemetry = new RecordingTelemetry();
  const consumer = new FakeConsumer();
  const started = deferred<undefined>();
  consumer.startHandler = () => started.promise;
  const bundle = new FakeBundle(new FakeProducer(), [consumer]);
  const adapter = createAsterKafkaBrokerAdapterWithClientFactory(
    options(telemetry, { operationTimeoutMs: 20 }),
    () => bundle,
  );
  assert.deepEqual(await adapter.connect(), { status: "completed" });

  assert.deepEqual(
    await adapter.startConsumer({ topic: "aster.events", handle: () => Promise.resolve() }),
    { status: "timed_out" },
  );
  assert.equal(consumer.disconnectCalls, 1);
  assert.equal(adapter.snapshot().consumerState, "degraded");
  started.resolve(undefined);
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("consumer failure remains uncommitted, degrades, and retires the consumer", async () => {
  const telemetry = new RecordingTelemetry();
  const consumer = new FakeConsumer();
  const bundle = new FakeBundle(new FakeProducer(), [consumer]);
  const adapter = createAsterKafkaBrokerAdapterWithClientFactory(options(telemetry), () => bundle);
  assert.deepEqual(await adapter.connect(), { status: "completed" });
  assert.deepEqual(
    await adapter.startConsumer({
      topic: "aster.events",
      handle: () => Promise.reject(new Error("handler-secret-never-emit")),
    }),
    { status: "completed" },
  );

  await assert.rejects(
    consumer.emit({ key: null, value: Uint8Array.from([1]), partition: 0, offset: "1" }),
    (error: unknown) => {
      assert.equal(String(error).includes("secret-never-emit"), false);
      return true;
    },
  );
  await nextTurn();
  assert.equal(adapter.snapshot().consumerState, "degraded");
  assert.equal(consumer.disconnectCalls, 1);
  assert.deepEqual(await adapter.stopConsumer(), { status: "completed" });
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("rejects a second consumer and retires malformed broker records", async () => {
  const telemetry = new RecordingTelemetry();
  const consumer = new FakeConsumer();
  const bundle = new FakeBundle(new FakeProducer(), [consumer]);
  const adapter = createAsterKafkaBrokerAdapterWithClientFactory(options(telemetry), () => bundle);
  assert.deepEqual(await adapter.connect(), { status: "completed" });
  const input = { topic: "aster.events", handle: () => Promise.resolve() };
  assert.deepEqual(await adapter.startConsumer(input), { status: "completed" });
  assert.deepEqual(await adapter.startConsumer(input), {
    status: "rejected",
    reason: "consumer_already_running",
  });

  await assert.rejects(consumer.emit({ key: null, value: null, partition: -1, offset: "invalid" }));
  await nextTurn();
  assert.equal(consumer.disconnectCalls, 1);
  assert.equal(adapter.snapshot().consumerState, "degraded");
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("a client crash signal degrades and retires the active consumer", async () => {
  const telemetry = new RecordingTelemetry();
  const consumer = new FakeConsumer();
  const bundle = new FakeBundle(new FakeProducer(), [consumer]);
  const adapter = createAsterKafkaBrokerAdapterWithClientFactory(options(telemetry), () => bundle);
  assert.deepEqual(await adapter.connect(), { status: "completed" });
  assert.deepEqual(
    await adapter.startConsumer({ topic: "aster.events", handle: () => Promise.resolve() }),
    { status: "completed" },
  );

  consumer.onCrash?.();
  await nextTurn();
  assert.equal(consumer.disconnectCalls, 1);
  assert.equal(adapter.snapshot().consumerState, "degraded");
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("consumer stop is shared while caller cancellation remains local", async () => {
  const telemetry = new RecordingTelemetry();
  const consumer = new FakeConsumer();
  const stopped = deferred<undefined>();
  consumer.disconnectHandler = () => stopped.promise;
  const bundle = new FakeBundle(new FakeProducer(), [consumer]);
  const adapter = createAsterKafkaBrokerAdapterWithClientFactory(options(telemetry), () => bundle);
  assert.deepEqual(await adapter.connect(), { status: "completed" });
  assert.deepEqual(
    await adapter.startConsumer({ topic: "aster.events", handle: () => Promise.resolve() }),
    { status: "completed" },
  );
  const owner = adapter.stopConsumer();
  const controller = new AbortController();
  const waiter = adapter.stopConsumer(controller.signal);
  controller.abort();

  assert.deepEqual(await waiter, { status: "aborted" });
  assert.equal(consumer.disconnectCalls, 1);
  stopped.resolve(undefined);
  assert.deepEqual(await owner, { status: "completed" });
  assert.deepEqual(await adapter.stopConsumer(), { status: "completed" });
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("close is concurrent, caller-local, idempotent, and finite on later vendor drain", async () => {
  const telemetry = new RecordingTelemetry();
  const producer = new FakeProducer();
  const disconnected = deferred<undefined>();
  producer.disconnectHandler = () => disconnected.promise;
  const adapter = createAsterKafkaBrokerAdapterWithClientFactory(
    options(telemetry, { closeTimeoutMs: 20 }),
    () => new FakeBundle(producer),
  );
  assert.deepEqual(await adapter.connect(), { status: "completed" });
  const owner = adapter.close();
  const controller = new AbortController();
  const waiter = adapter.close(controller.signal);
  controller.abort();

  assert.deepEqual(await waiter, { status: "aborted" });
  assert.deepEqual(await owner, { status: "timed_out" });
  assert.equal(producer.disconnectCalls, 1);
  assert.equal(adapter.snapshot().state, "closing");
  disconnected.resolve(undefined);
  await nextTurn();
  assert.equal(adapter.snapshot().state, "closed");
  assert.deepEqual(await adapter.close(), { status: "already_completed" });
});

test("close remains finite while a consumer handler ignores cancellation", async () => {
  const telemetry = new RecordingTelemetry();
  const consumer = new FakeConsumer();
  const handled = deferred<undefined>();
  const bundle = new FakeBundle(new FakeProducer(), [consumer]);
  const adapter = createAsterKafkaBrokerAdapterWithClientFactory(
    options(telemetry, { closeTimeoutMs: 20 }),
    () => bundle,
  );
  assert.deepEqual(await adapter.connect(), { status: "completed" });
  assert.deepEqual(
    await adapter.startConsumer({ topic: "aster.events", handle: () => handled.promise }),
    { status: "completed" },
  );
  const delivery = consumer.emit({
    key: null,
    value: Uint8Array.from([1]),
    partition: 0,
    offset: "1",
  });
  await nextTurn();

  assert.deepEqual(await adapter.close(), { status: "timed_out" });
  assert.equal(adapter.snapshot().state, "closing");
  handled.resolve(undefined);
  await assert.rejects(delivery);
  await nextTurn();
  assert.equal(adapter.snapshot().state, "closed");
  assert.deepEqual(await adapter.close(), { status: "already_completed" });
});

test("pre-aborted close is side-effect free and lifecycle failure is cause-free", async () => {
  const telemetry = new RecordingTelemetry();
  const producer = new FakeProducer();
  producer.disconnectHandler = () => Promise.reject(new Error("vendor-secret-never-emit"));
  const adapter = createAsterKafkaBrokerAdapterWithClientFactory(
    options(telemetry),
    () => new FakeBundle(producer),
  );
  assert.deepEqual(await adapter.connect(), { status: "completed" });
  const controller = new AbortController();
  controller.abort();
  assert.deepEqual(await adapter.close(controller.signal), { status: "aborted" });
  assert.equal(producer.disconnectCalls, 0);

  await assert.rejects(
    adapter.lifecycleHooks().closeDependencies(new AbortController().signal),
    (error: unknown) => {
      assert.equal(error instanceof AsterKafkaBrokerLifecycleError, true);
      const lifecycleError = error as AsterKafkaBrokerLifecycleError;
      assert.equal(lifecycleError.message.includes("secret-never-emit"), false);
      assert.equal("cause" in lifecycleError, false);
      return true;
    },
  );
  assert.equal(producer.disconnectCalls, 1);
  assert.equal(adapter.snapshot().state, "degraded");
});

test("runs an unavailable-endpoint diagnostic and keeps KafkaJS types private", async () => {
  const diagnosticPath = fileURLToPath(new URL("../src/check-broker.js", import.meta.url));
  const diagnostic = spawnSync(process.execPath, [diagnosticPath], {
    encoding: "utf8",
    env: {},
    timeout: 3_000,
  });
  assert.equal(diagnostic.status, 0, diagnostic.stderr);
  assert.equal(diagnostic.stderr, "");
  const output = JSON.parse(diagnostic.stdout) as Record<string, unknown>;
  assert.equal(output["event"], "broker_diagnostic_passed");
  assert.equal(["unavailable", "timed_out"].includes(String(output["unavailableOutcome"])), true);
  assert.equal(output["close"], "completed");

  const declaration = await readFile(new URL("../src/index.d.ts", import.meta.url), "utf8");
  const publicContract = declaration.toLowerCase();
  for (const vendor of ["kafkajs", "producerrecord", "consumerconfig", "kafkajserror"] as const) {
    assert.equal(publicContract.includes(vendor), false);
  }
});
