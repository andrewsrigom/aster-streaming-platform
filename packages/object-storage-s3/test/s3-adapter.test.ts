import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { AsterDependencyObservationInput, AsterObservationOutcome } from "@aster/telemetry";

import {
  AsterObjectStorageConfigurationError,
  AsterObjectStorageLifecycleError,
  type AsterObjectStorageOptions,
  type AsterObjectStorageTelemetry,
  type AsterObjectWriteInput,
} from "../src/index.js";
import {
  type AsterS3Client,
  type AsterS3ClientConfiguration,
  type AsterS3ReadResponse,
  createAsterObjectStorageAdapterWithClientFactory,
} from "../src/infrastructure/s3-adapter.js";

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}>;

const LOCAL_SECRET = ["local", "-development"].join("");

function deferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | undefined;
  let rejectPromise: ((error: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve(value): void {
      resolvePromise?.(value);
    },
    reject(error): void {
      rejectPromise?.(error);
    },
  };
}

class RecordingTelemetry implements AsterObjectStorageTelemetry {
  readonly attempts: Array<{
    input: AsterDependencyObservationInput;
    outcome?: AsterObservationOutcome;
  }> = [];

  startDependencyOperation(input: AsterDependencyObservationInput) {
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

class FakeS3Client implements AsterS3Client {
  probeCalls = 0;
  headCalls = 0;
  writeCalls = 0;
  readCalls = 0;
  deleteCalls = 0;
  destroyCalls = 0;
  probeHandler: (bucket: string, signal: AbortSignal) => Promise<void> = () => Promise.resolve();
  headHandler: (bucket: string, key: string, signal: AbortSignal) => Promise<void> = () =>
    Promise.resolve();
  writeHandler: AsterS3Client["write"] = () => Promise.resolve();
  readHandler: (bucket: string, key: string, signal: AbortSignal) => Promise<AsterS3ReadResponse> =
    () => Promise.resolve({ body: Readable.from([]), contentLength: 0 });
  deleteHandler: (bucket: string, key: string, signal: AbortSignal) => Promise<void> = () =>
    Promise.resolve();
  destroyHandler: () => void = () => {};

  probe(bucket: string, signal: AbortSignal): Promise<void> {
    this.probeCalls += 1;
    return this.probeHandler(bucket, signal);
  }

  head(bucket: string, key: string, signal: AbortSignal): Promise<void> {
    this.headCalls += 1;
    return this.headHandler(bucket, key, signal);
  }

  write(input: Parameters<AsterS3Client["write"]>[0], signal: AbortSignal): Promise<void> {
    this.writeCalls += 1;
    return this.writeHandler(input, signal);
  }

  read(bucket: string, key: string, signal: AbortSignal): Promise<AsterS3ReadResponse> {
    this.readCalls += 1;
    return this.readHandler(bucket, key, signal);
  }

  delete(bucket: string, key: string, signal: AbortSignal): Promise<void> {
    this.deleteCalls += 1;
    return this.deleteHandler(bucket, key, signal);
  }

  destroy(): void {
    this.destroyCalls += 1;
    this.destroyHandler();
  }
}

class CollectingWritable extends Writable {
  readonly chunks: Buffer[] = [];

  override _write(
    chunk: Buffer | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }

  value(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

function options(
  telemetry: AsterObjectStorageTelemetry,
  overrides: Partial<AsterObjectStorageOptions> = {},
): AsterObjectStorageOptions {
  return {
    endpoint: "http://127.0.0.1:9000",
    region: "us-east-1",
    bucket: "aster-fixtures",
    accessKeyId: "local-access",
    secretAccessKey: LOCAL_SECRET,
    telemetry,
    maxInFlightOperations: 2,
    maxObjectBytes: 64,
    connectionTimeoutMs: 100,
    operationTimeoutMs: 100,
    closeTimeoutMs: 100,
    uploadQueueSize: 2,
    uploadPartSizeBytes: 5 * 1024 * 1024,
    fixtureKeyPrefix: "aster-fixtures/",
    ...overrides,
  };
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test("validates bounded own-data configuration without invoking accessors or leaking secrets", () => {
  const telemetry = new RecordingTelemetry();
  let factoryCalls = 0;
  let accessorReads = 0;
  const accessorOptions = options(telemetry);
  Object.defineProperty(accessorOptions, "endpoint", {
    enumerable: true,
    get(): string {
      accessorReads += 1;
      return ["http://local:", LOCAL_SECRET, "@127.0.0.1:9000"].join("");
    },
  });
  const hostileOptions = new Proxy(
    {},
    {
      ownKeys(): never {
        throw new Error("proxy-secret-never-emit");
      },
    },
  ) as AsterObjectStorageOptions;

  for (const input of [
    accessorOptions,
    hostileOptions,
    options(telemetry, { endpoint: ["http://user:", LOCAL_SECRET, "@host"].join("") }),
    options(telemetry, { bucket: "192.168.1.1" }),
    options(telemetry, { uploadPartSizeBytes: 1024 }),
    options(telemetry, { fixtureKeyPrefix: "../unsafe/" }),
  ]) {
    assert.throws(
      () =>
        createAsterObjectStorageAdapterWithClientFactory(input, () => {
          factoryCalls += 1;
          return new FakeS3Client();
        }),
      (error: unknown) => {
        assert.equal(error instanceof AsterObjectStorageConfigurationError, true);
        const configurationError = error as AsterObjectStorageConfigurationError;
        assert.equal(configurationError.issues.length >= 1, true);
        assert.equal(configurationError.issues.length <= 15, true);
        assert.equal("cause" in configurationError, false);
        assert.equal(JSON.stringify(configurationError).includes(LOCAL_SECRET), false);
        return true;
      },
    );
  }
  assert.equal(accessorReads, 0);
  assert.equal(factoryCalls, 0);
});

test("constructs one finite path-style no-retry client configuration", async () => {
  const telemetry = new RecordingTelemetry();
  const client = new FakeS3Client();
  let captured: AsterS3ClientConfiguration | undefined;
  const adapter = createAsterObjectStorageAdapterWithClientFactory(
    options(telemetry),
    (configuration) => {
      captured = configuration;
      return client;
    },
  );

  assert.equal(Object.isFrozen(adapter), true);
  assert.deepEqual(await adapter.probe(), { status: "completed" });
  assert.equal(captured?.endpoint, "http://127.0.0.1:9000");
  assert.equal(captured.region, "us-east-1");
  assert.equal(captured.accessKeyId, "local-access");
  assert.equal(captured.secretAccessKey, LOCAL_SECRET);
  assert.equal(captured.connectionTimeoutMs, 100);
  assert.equal(captured.requestTimeoutMs, 100);
  assert.equal(captured.maxAttempts, 1);
  assert.equal(captured.forcePathStyle, true);
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("a missing bucket degrades readiness while a missing object remains a normal result", async () => {
  const telemetry = new RecordingTelemetry();
  const client = new FakeS3Client();
  const missing = new Error("vendor-key-secret-never-emit");
  Object.defineProperty(missing, "$metadata", { value: { httpStatusCode: 404 } });
  client.probeHandler = () => Promise.reject(missing);
  client.headHandler = () => Promise.reject(missing);
  client.readHandler = () => Promise.reject(missing);
  const adapter = createAsterObjectStorageAdapterWithClientFactory(
    options(telemetry),
    () => client,
  );

  assert.deepEqual(await adapter.probe(), { status: "unavailable" });
  assert.equal(adapter.snapshot().state, "degraded");
  client.probeHandler = () => Promise.resolve();
  assert.deepEqual(await adapter.probe(), { status: "completed" });
  assert.deepEqual(await adapter.head({ key: "catalog/missing.m3u8" }), {
    status: "not_found",
  });
  assert.deepEqual(
    await adapter.read({ key: "catalog/missing.m4s", destination: new CollectingWritable() }),
    { status: "not_found" },
  );
  assert.equal(adapter.snapshot().state, "open");
  assert.deepEqual(
    telemetry.attempts.map(({ input, outcome }) => ({ operation: input.operation, outcome })),
    [
      { operation: "probe", outcome: "unavailable" },
      { operation: "probe", outcome: "success" },
      { operation: "read", outcome: "success" },
      { operation: "read", outcome: "success" },
    ],
  );
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("writes through a bounded multipart policy and owns an accepted source", async () => {
  const telemetry = new RecordingTelemetry();
  const client = new FakeS3Client();
  let captured: Parameters<AsterS3Client["write"]>[0] | undefined;
  client.writeHandler = async (input) => {
    captured = input;
    for await (const chunk of input.source) {
      assert.equal(chunk instanceof Uint8Array, true);
    }
  };
  const adapter = createAsterObjectStorageAdapterWithClientFactory(
    options(telemetry),
    () => client,
  );
  const source = Readable.from([Buffer.from("payload")]);

  assert.deepEqual(
    await adapter.write({
      key: "catalog/segment.ts",
      source,
      contentLength: 7,
      contentType: "video/mp2t",
    }),
    { status: "completed" },
  );
  assert.equal(captured?.bucket, "aster-fixtures");
  assert.equal(captured.key, "catalog/segment.ts");
  assert.equal(captured.contentLength, 7);
  assert.equal(captured.contentType, "video/mp2t");
  assert.equal(captured.queueSize, 2);
  assert.equal(captured.partSizeBytes, 5 * 1024 * 1024);
  assert.equal(source.destroyed, true);
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("conditional writes require a full checksum and classify early conflicts without stalling the source", async () => {
  const telemetry = new RecordingTelemetry();
  const client = new FakeS3Client();
  const adapter = createAsterObjectStorageAdapterWithClientFactory(
    options(telemetry),
    () => client,
  );
  const checksumSha256 = "a".repeat(64);
  client.writeHandler = (input) => {
    assert.equal(input.ifAbsent, true);
    assert.equal(input.checksumSha256, checksumSha256);
    return Promise.reject(
      Object.assign(new Error("Synthetic conditional conflict"), {
        $metadata: { httpStatusCode: 412 },
      }),
    );
  };
  const source = new Readable({ read() {} });
  assert.deepEqual(
    await adapter.write({
      key: "originals/hash",
      source,
      contentLength: 64,
      ifAbsent: true,
      checksumSha256,
    }),
    { status: "already_exists" },
  );
  assert.equal(source.destroyed, true);
  assert.equal(adapter.snapshot().inFlightOperations, 0);
  assert.equal(telemetry.attempts.at(-1)?.outcome, "success");
  for (const patch of [
    { ifAbsent: true },
    { checksumSha256 },
    { ifAbsent: false, checksumSha256 },
    { ifAbsent: true, checksumSha256: "bad" },
  ]) {
    const unowned = Readable.from([Buffer.from("a")]);
    assert.deepEqual(
      await adapter.write({
        key: "originals/hash",
        source: unowned,
        contentLength: 1,
        ...patch,
      } as AsterObjectWriteInput),
      { status: "rejected", reason: "invalid_request" },
    );
    assert.equal(unowned.destroyed, false);
    unowned.destroy();
  }
  assert.equal(client.writeCalls, 1);
  assert.equal((await adapter.close()).status, "completed");
});

test("an early ordinary storage rejection also releases the accepted pipeline", async () => {
  const client = new FakeS3Client();
  const adapter = createAsterObjectStorageAdapterWithClientFactory(
    options(new RecordingTelemetry()),
    () => client,
  );
  client.writeHandler = () => Promise.reject(new Error("Synthetic upstream rejection"));
  const source = new Readable({ read() {} });
  assert.deepEqual(await adapter.write({ key: "originals/hash", source, contentLength: 64 }), {
    status: "unavailable",
  });
  assert.equal(source.destroyed, true);
  assert.equal(adapter.snapshot().inFlightOperations, 0);
  assert.equal((await adapter.close()).status, "completed");
});

test("rejects invalid or oversized writes before taking source ownership", async () => {
  const telemetry = new RecordingTelemetry();
  let factoryCalls = 0;
  let accessorReads = 0;
  const adapter = createAsterObjectStorageAdapterWithClientFactory(options(telemetry), () => {
    factoryCalls += 1;
    return new FakeS3Client();
  });
  const oversized = new Readable({ read(): void {} });
  const accessorInput = Object.create(null) as {
    key: string;
    source: Readable;
    contentLength: number;
  };
  Object.defineProperty(accessorInput, "key", {
    enumerable: true,
    get(): string {
      accessorReads += 1;
      return "unsafe";
    },
  });

  assert.deepEqual(
    await adapter.write({ key: "catalog/large", source: oversized, contentLength: 65 }),
    { status: "rejected", reason: "object_too_large" },
  );
  assert.equal(oversized.destroyed, false);
  assert.deepEqual(await adapter.write(accessorInput), {
    status: "rejected",
    reason: "invalid_request",
  });
  assert.deepEqual(await adapter.write(null as unknown as AsterObjectWriteInput), {
    status: "rejected",
    reason: "invalid_request",
  });
  assert.equal(accessorReads, 0);
  assert.equal(factoryCalls, 0);
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("rejects an accepted source whose observed bytes differ from its declaration", async () => {
  const telemetry = new RecordingTelemetry();
  const client = new FakeS3Client();
  client.writeHandler = async (input) => {
    for await (const chunk of input.source) {
      assert.equal(chunk instanceof Uint8Array, true);
    }
  };
  const adapter = createAsterObjectStorageAdapterWithClientFactory(
    options(telemetry),
    () => client,
  );
  const source = Readable.from([Buffer.from("short")]);

  assert.deepEqual(await adapter.write({ key: "catalog/mismatch", source, contentLength: 6 }), {
    status: "rejected",
    reason: "invalid_request",
  });
  assert.equal(source.destroyed, true);
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("streams a bounded object into the caller destination", async () => {
  const telemetry = new RecordingTelemetry();
  const client = new FakeS3Client();
  client.readHandler = () =>
    Promise.resolve({
      body: Readable.from([Buffer.from("hello"), Buffer.from(" world")]),
      contentLength: 11,
    });
  const adapter = createAsterObjectStorageAdapterWithClientFactory(
    options(telemetry),
    () => client,
  );
  const destination = new CollectingWritable();

  assert.deepEqual(await adapter.read({ key: "catalog/object", destination }), {
    status: "completed",
  });
  assert.equal(destination.value(), "hello world");
  assert.equal(destination.writableFinished, true);
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("rejects declared and observed oversized reads while destroying owned streams", async () => {
  const telemetry = new RecordingTelemetry();
  const declaredClient = new FakeS3Client();
  const declaredBody = new Readable({ read(): void {} });
  declaredClient.readHandler = () => Promise.resolve({ body: declaredBody, contentLength: 65 });
  const declaredAdapter = createAsterObjectStorageAdapterWithClientFactory(
    options(telemetry),
    () => declaredClient,
  );
  const declaredDestination = new CollectingWritable();

  assert.deepEqual(
    await declaredAdapter.read({ key: "catalog/declared", destination: declaredDestination }),
    { status: "rejected", reason: "object_too_large" },
  );
  assert.equal(declaredBody.destroyed, true);
  assert.equal(declaredDestination.destroyed, true);
  assert.deepEqual(await declaredAdapter.close(), { status: "completed" });

  const observedClient = new FakeS3Client();
  observedClient.readHandler = () =>
    Promise.resolve({ body: Readable.from([Buffer.alloc(65)]), contentLength: undefined });
  const observedAdapter = createAsterObjectStorageAdapterWithClientFactory(
    options(telemetry),
    () => observedClient,
  );
  const observedDestination = new CollectingWritable();
  assert.deepEqual(
    await observedAdapter.read({ key: "catalog/observed", destination: observedDestination }),
    { status: "rejected", reason: "object_too_large" },
  );
  assert.equal(observedDestination.destroyed, true);
  assert.deepEqual(await observedAdapter.close(), { status: "completed" });
});

test("rejects excess operations before extending the client work queue", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const telemetry = new RecordingTelemetry();
  const client = new FakeS3Client();
  const probe = deferred<undefined>();
  client.probeHandler = () => probe.promise;
  const adapter = createAsterObjectStorageAdapterWithClientFactory(
    options(telemetry, { maxInFlightOperations: 1 }),
    () => client,
  );
  const first = adapter.probe();
  await nextTurn();
  assert.equal(adapter.snapshot().inFlightOperations, 1);

  assert.deepEqual(await adapter.probe(), {
    status: "rejected",
    reason: "capacity_exceeded",
  });
  assert.equal(client.probeCalls, 1);
  probe.resolve(undefined);
  assert.deepEqual(await first, { status: "completed" });
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("caller abort retires the active client generation and allows clean recovery", async () => {
  const telemetry = new RecordingTelemetry();
  const first = new FakeS3Client();
  const probe = deferred<undefined>();
  first.probeHandler = () => probe.promise;
  first.destroyHandler = () => {
    probe.reject(new Error("destroy-secret-never-emit"));
  };
  const second = new FakeS3Client();
  const clients = [first, second];
  const adapter = createAsterObjectStorageAdapterWithClientFactory(
    options(telemetry),
    () => clients.shift() as FakeS3Client,
  );
  const controller = new AbortController();
  const pending = adapter.probe(controller.signal);
  await nextTurn();
  controller.abort();

  assert.deepEqual(await pending, { status: "aborted" });
  assert.equal(first.destroyCalls, 0);
  assert.equal(adapter.snapshot().state, "degraded");
  assert.deepEqual(await adapter.probe(), { status: "completed" });
  assert.equal(second.probeCalls, 1);
  assert.deepEqual(await adapter.close(), { status: "completed" });
  assert.equal(first.destroyCalls, 1);
  assert.equal(second.destroyCalls, 1);
});

test("a stalled operation times out, destroys its generation, and remains closeable", async () => {
  const telemetry = new RecordingTelemetry();
  const client = new FakeS3Client();
  const probe = deferred<undefined>();
  client.probeHandler = () => probe.promise;
  client.destroyHandler = () => {
    probe.reject(new Error("destroyed"));
  };
  const adapter = createAsterObjectStorageAdapterWithClientFactory(
    options(telemetry, { operationTimeoutMs: 20 }),
    () => client,
  );
  const started = performance.now();

  assert.deepEqual(await adapter.probe(), { status: "timed_out" });
  assert.equal(performance.now() - started < 200, true);
  assert.equal(client.destroyCalls, 0);
  assert.equal(adapter.snapshot().inFlightOperations, 0);
  assert.deepEqual(await adapter.close(), { status: "completed" });
  assert.equal(client.destroyCalls, 1);
});

test("deletion accepts only one exact non-root key under the fixture prefix", async () => {
  const telemetry = new RecordingTelemetry();
  const client = new FakeS3Client();
  const adapter = createAsterObjectStorageAdapterWithClientFactory(
    options(telemetry),
    () => client,
  );

  for (const [key, reason] of [
    ["catalog/object", "unsafe_fixture_target"],
    ["aster-fixtures/", "unsafe_fixture_target"],
    ["aster-fixtures/../object", "invalid_request"],
  ] as const) {
    assert.deepEqual(await adapter.deleteFixture({ key }), { status: "rejected", reason });
  }
  assert.equal(client.deleteCalls, 0);
  assert.deepEqual(await adapter.deleteFixture({ key: "aster-fixtures/run-1/object" }), {
    status: "completed",
  });
  assert.equal(client.deleteCalls, 1);
  assert.deepEqual(await adapter.close(), { status: "completed" });
});

test("close aborts active work once, is caller-local, and is idempotent", async () => {
  const telemetry = new RecordingTelemetry();
  const client = new FakeS3Client();
  const probe = deferred<undefined>();
  client.probeHandler = (_bucket, signal) =>
    new Promise((resolve, reject) => {
      const onAbort = (): void => {
        reject(new Error("aborted"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      void probe.promise.then(resolve, reject);
    });
  const adapter = createAsterObjectStorageAdapterWithClientFactory(
    options(telemetry),
    () => client,
  );
  const pending = adapter.probe();
  await nextTurn();
  const owner = adapter.close();
  const waiterController = new AbortController();
  const waiter = adapter.close(waiterController.signal);
  waiterController.abort();

  assert.deepEqual(await waiter, { status: "aborted" });
  assert.deepEqual(await pending, { status: "aborted" });
  assert.deepEqual(await owner, { status: "completed" });
  assert.deepEqual(await adapter.close(), { status: "already_completed" });
  assert.equal(client.destroyCalls, 1);
});

test("close remains finite when retired vendor work ignores cancellation", async () => {
  const telemetry = new RecordingTelemetry();
  const client = new FakeS3Client();
  client.probeHandler = () => new Promise(() => {});
  const adapter = createAsterObjectStorageAdapterWithClientFactory(
    options(telemetry, { closeTimeoutMs: 40, operationTimeoutMs: 100 }),
    () => client,
  );
  const pending = adapter.probe();
  await nextTurn();
  const started = performance.now();
  const closing = adapter.close();

  assert.deepEqual(await pending, { status: "aborted" });
  assert.deepEqual(await closing, { status: "completed" });
  assert.equal(performance.now() - started < 200, true);
  assert.equal(client.destroyCalls, 1);
  assert.equal(adapter.snapshot().state, "closed");
});

test("pre-aborted close is side-effect free and vendor destroy failure is cause-free", async () => {
  const telemetry = new RecordingTelemetry();
  const client = new FakeS3Client();
  client.destroyHandler = () => {
    throw new Error("destroy-secret-never-emit");
  };
  const adapter = createAsterObjectStorageAdapterWithClientFactory(
    options(telemetry),
    () => client,
  );
  assert.deepEqual(await adapter.probe(), { status: "completed" });
  const controller = new AbortController();
  controller.abort();
  assert.deepEqual(await adapter.close(controller.signal), { status: "aborted" });
  assert.equal(client.destroyCalls, 0);

  await assert.rejects(
    adapter.lifecycleHooks().closeDependencies(new AbortController().signal),
    (error: unknown) => {
      assert.equal(error instanceof AsterObjectStorageLifecycleError, true);
      const lifecycleError = error as AsterObjectStorageLifecycleError;
      assert.equal(lifecycleError.message.includes("secret-never-emit"), false);
      assert.equal("cause" in lifecycleError, false);
      return true;
    },
  );
  assert.equal(client.destroyCalls, 1);
  assert.equal(adapter.snapshot().state, "degraded");
});

test("runs an unavailable-endpoint diagnostic and keeps AWS SDK types private", async () => {
  const diagnosticPath = fileURLToPath(new URL("../src/check-object-storage.js", import.meta.url));
  const diagnostic = spawnSync(process.execPath, [diagnosticPath], {
    encoding: "utf8",
    env: {},
    // Include cold SDK loading under parallel builds, not only the adapter's own deadline.
    timeout: 10_000,
  });
  assert.ifError(diagnostic.error);
  assert.equal(diagnostic.status, 0, diagnostic.stderr);
  assert.equal(diagnostic.stderr, "");
  const output = JSON.parse(diagnostic.stdout) as Record<string, unknown>;
  assert.equal(output["event"], "object_storage_diagnostic_passed");
  assert.equal(["unavailable", "timed_out"].includes(String(output["unavailableOutcome"])), true);
  assert.equal(output["close"], "completed");

  const declaration = await readFile(new URL("../src/index.d.ts", import.meta.url), "utf8");
  const publicContract = declaration.toLowerCase();
  for (const vendor of ["@aws-sdk", "@smithy", "s3client", "putobjectcommand", "upload"] as const) {
    assert.equal(publicContract.includes(vendor), false);
  }
});
