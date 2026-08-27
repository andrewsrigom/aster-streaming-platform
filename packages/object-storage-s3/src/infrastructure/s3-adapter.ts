import { Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  ChecksumAlgorithm,
  ChecksumMode,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { NodeHttpHandler } from "@smithy/node-http-handler";

import type {
  AsterDependencyObservation,
  AsterDependencyOperation,
  AsterObservationOutcome,
} from "@aster/telemetry";

import {
  ASTER_OBJECT_STORAGE_DEFAULTS,
  type AsterObjectKeyInput,
  type AsterObjectReadInput,
  type AsterObjectStorageAdapter,
  type AsterObjectStorageCloseResult,
  AsterObjectStorageConfigurationError,
  type AsterObjectStorageConfigurationIssue,
  AsterObjectStorageLifecycleError,
  type AsterObjectStorageOperationResult,
  type AsterObjectStorageOptions,
  type AsterObjectStorageSnapshot,
  type AsterObjectStorageTelemetry,
  type AsterObjectWriteInput,
} from "../object-storage-contract.js";

const MAXIMUM_OPTION_COUNT = 15;
const MAXIMUM_TEXT_LENGTH = 2_048;
const MAXIMUM_KEY_BYTES = 1_024;
const MAXIMUM_IN_FLIGHT_OPERATIONS = 32;
const MAXIMUM_OBJECT_BYTES = 4 * 1024 * 1024 * 1024;
const MAXIMUM_TIMEOUT_MS = 300_000;
const MINIMUM_PART_SIZE_BYTES = 5 * 1024 * 1024;
const MAXIMUM_PART_SIZE_BYTES = 64 * 1024 * 1024;
const MAXIMUM_UPLOAD_QUEUE_SIZE = 4;
const MAXIMUM_BUFFER_BUDGET_BYTES = 256 * 1024 * 1024;
const KNOWN_OPTIONS = new Set([
  "endpoint",
  "region",
  "bucket",
  "accessKeyId",
  "secretAccessKey",
  "sessionToken",
  "telemetry",
  "maxInFlightOperations",
  "maxObjectBytes",
  "connectionTimeoutMs",
  "operationTimeoutMs",
  "closeTimeoutMs",
  "uploadQueueSize",
  "uploadPartSizeBytes",
  "fixtureKeyPrefix",
]);

const COMPLETED = Object.freeze({ status: "completed" } as const);
const NOT_FOUND = Object.freeze({ status: "not_found" } as const);
const TIMED_OUT = Object.freeze({ status: "timed_out" } as const);
const ABORTED = Object.freeze({ status: "aborted" } as const);
const UNAVAILABLE = Object.freeze({ status: "unavailable" } as const);
const FAILED = Object.freeze({ status: "failed" } as const);
const INVALID_REQUEST = Object.freeze({
  status: "rejected",
  reason: "invalid_request",
} as const);
const OBJECT_TOO_LARGE = Object.freeze({
  status: "rejected",
  reason: "object_too_large",
} as const);
const UNSAFE_FIXTURE_TARGET = Object.freeze({
  status: "rejected",
  reason: "unsafe_fixture_target",
} as const);
const CAPACITY_REJECTED = Object.freeze({
  status: "rejected",
  reason: "capacity_exceeded",
} as const);
const CLOSED_REJECTED = Object.freeze({
  status: "rejected",
  reason: "adapter_closed",
} as const);
const INVALID_SIGNAL_REJECTED = Object.freeze({
  status: "rejected",
  reason: "invalid_signal",
} as const);

type ValidatedOptions = Readonly<{
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string | undefined;
  telemetry: Readonly<{
    target: AsterObjectStorageTelemetry;
    start: AsterObjectStorageTelemetry["startDependencyOperation"];
  }>;
  maxInFlightOperations: number;
  maxObjectBytes: number;
  connectionTimeoutMs: number;
  operationTimeoutMs: number;
  closeTimeoutMs: number;
  uploadQueueSize: number;
  uploadPartSizeBytes: number;
  fixtureKeyPrefix: string;
}>;

export type AsterS3ClientConfiguration = Readonly<{
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string | undefined;
  connectionTimeoutMs: number;
  requestTimeoutMs: number;
  maxAttempts: 1;
  forcePathStyle: true;
}>;

export interface AsterS3ReadResponse {
  readonly body: Readable;
  readonly contentLength: number | undefined;
}

export interface AsterS3Client {
  probe(bucket: string, signal: AbortSignal): Promise<void>;
  head(bucket: string, key: string, signal: AbortSignal): Promise<void>;
  write(
    input: Readonly<{
      bucket: string;
      key: string;
      source: Readable;
      contentLength: number;
      contentType: string | undefined;
      queueSize: number;
      partSizeBytes: number;
    }>,
    signal: AbortSignal,
  ): Promise<void>;
  read(bucket: string, key: string, signal: AbortSignal): Promise<AsterS3ReadResponse>;
  delete(bucket: string, key: string, signal: AbortSignal): Promise<void>;
  destroy(): void;
}

type ClientFactory = (configuration: AsterS3ClientConfiguration) => AsterS3Client;

type WaitResult<T> =
  | Readonly<{ status: "completed"; value: T }>
  | Readonly<{ status: "timed_out" }>
  | Readonly<{ status: "aborted" }>
  | Readonly<{ status: "failed"; error: unknown }>;

class AsterObjectLimitError extends Error {
  constructor() {
    super("Object exceeds the configured byte limit.");
    this.name = "AsterObjectLimitError";
  }
}

class AsterObjectProtocolError extends Error {
  constructor() {
    super("Object-storage response violated the streaming contract.");
    this.name = "AsterObjectProtocolError";
  }
}

class AsterObjectLengthError extends Error {
  constructor() {
    super("Object stream length differs from its declared length.");
    this.name = "AsterObjectLengthError";
  }
}

function issue(
  option: AsterObjectStorageConfigurationIssue["option"],
  reason: AsterObjectStorageConfigurationIssue["reason"],
): AsterObjectStorageConfigurationIssue {
  return Object.freeze({ option, reason });
}

function ownDataValue(source: object, key: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (!descriptor || "get" in descriptor) {
      return undefined;
    }
    return descriptor.value as unknown;
  } catch {
    return undefined;
  }
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) {
      return true;
    }
  }
  return false;
}

function boundedText(value: unknown, minimum: number, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= minimum &&
    value.length <= maximum &&
    !containsControlCharacter(value)
  );
}

function validEndpoint(value: unknown): value is string {
  if (!boundedText(value, 1, MAXIMUM_TEXT_LENGTH)) {
    return false;
  }
  try {
    const endpoint = new URL(value);
    return (
      (endpoint.protocol === "http:" || endpoint.protocol === "https:") &&
      endpoint.hostname.length > 0 &&
      endpoint.username.length === 0 &&
      endpoint.password.length === 0 &&
      endpoint.search.length === 0 &&
      endpoint.hash.length === 0 &&
      (endpoint.pathname === "/" || endpoint.pathname.length === 0)
    );
  } catch {
    return false;
  }
}

function validRegion(value: unknown): value is string {
  return boundedText(value, 1, 64) && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(value);
}

function validBucket(value: unknown): value is string {
  return (
    boundedText(value, 3, 63) &&
    /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(value) &&
    !value.includes("..") &&
    !/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(value)
  );
}

function validKey(value: unknown): value is string {
  return (
    boundedText(value, 1, MAXIMUM_KEY_BYTES) &&
    Buffer.byteLength(value, "utf8") <= MAXIMUM_KEY_BYTES &&
    !value.startsWith("/") &&
    !value.split("/").includes("..")
  );
}

function validFixturePrefix(value: unknown): value is string {
  return validKey(value) && value.endsWith("/");
}

function validContentType(value: unknown): value is string | undefined {
  return value === undefined || (boundedText(value, 1, 128) && /^[\x20-\x7e]+$/u.test(value));
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number | undefined {
  const selected = value === undefined ? fallback : value;
  if (
    typeof selected !== "number" ||
    !Number.isSafeInteger(selected) ||
    selected < minimum ||
    selected > maximum
  ) {
    return undefined;
  }
  return selected;
}

function telemetryBinding(value: unknown): ValidatedOptions["telemetry"] | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  try {
    let owner: object | null = value;
    for (let depth = 0; depth < 4 && owner; depth += 1) {
      const method = Object.getOwnPropertyDescriptor(owner, "startDependencyOperation");
      if (method) {
        if ("get" in method || typeof method.value !== "function") {
          return undefined;
        }
        return Object.freeze({
          target: value as AsterObjectStorageTelemetry,
          start: method.value as AsterObjectStorageTelemetry["startDependencyOperation"],
        });
      }
      const prototype: unknown = Object.getPrototypeOf(owner);
      owner = typeof prototype === "object" ? prototype : null;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function validateOptions(input: unknown): ValidatedOptions {
  const issues: AsterObjectStorageConfigurationIssue[] = [];
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      throw new AsterObjectStorageConfigurationError([issue("<options>", "invalid")]);
    }
    const prototype: unknown = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new AsterObjectStorageConfigurationError([issue("<options>", "invalid")]);
    }
    const keys = Reflect.ownKeys(input);
    if (keys.length > MAXIMUM_OPTION_COUNT) {
      throw new AsterObjectStorageConfigurationError([issue("<options>", "invalid")]);
    }
    for (const key of keys) {
      if (typeof key !== "string" || !KNOWN_OPTIONS.has(key)) {
        issues.push(issue("<options>", "unknown"));
        break;
      }
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || "get" in descriptor) {
        issues.push(
          issue(
            key as Exclude<AsterObjectStorageConfigurationIssue["option"], "<options>">,
            "invalid",
          ),
        );
      }
    }

    const endpoint = ownDataValue(input, "endpoint");
    const region = ownDataValue(input, "region");
    const bucket = ownDataValue(input, "bucket");
    const accessKeyId = ownDataValue(input, "accessKeyId");
    const secretAccessKey = ownDataValue(input, "secretAccessKey");
    const sessionToken = ownDataValue(input, "sessionToken");
    const telemetry = telemetryBinding(ownDataValue(input, "telemetry"));
    if (!validEndpoint(endpoint)) {
      issues.push(issue("endpoint", "invalid"));
    }
    if (!validRegion(region)) {
      issues.push(issue("region", "invalid"));
    }
    if (!validBucket(bucket)) {
      issues.push(issue("bucket", "invalid"));
    }
    if (!boundedText(accessKeyId, 3, 128)) {
      issues.push(issue("accessKeyId", "invalid"));
    }
    if (!boundedText(secretAccessKey, 8, 256)) {
      issues.push(issue("secretAccessKey", "invalid"));
    }
    if (sessionToken !== undefined && !boundedText(sessionToken, 1, MAXIMUM_TEXT_LENGTH)) {
      issues.push(issue("sessionToken", "invalid"));
    }
    if (!telemetry) {
      issues.push(issue("telemetry", "invalid"));
    }

    const maxInFlightOperations = boundedInteger(
      ownDataValue(input, "maxInFlightOperations"),
      ASTER_OBJECT_STORAGE_DEFAULTS.maxInFlightOperations,
      1,
      MAXIMUM_IN_FLIGHT_OPERATIONS,
    );
    const maxObjectBytes = boundedInteger(
      ownDataValue(input, "maxObjectBytes"),
      ASTER_OBJECT_STORAGE_DEFAULTS.maxObjectBytes,
      1,
      MAXIMUM_OBJECT_BYTES,
    );
    const connectionTimeoutMs = boundedInteger(
      ownDataValue(input, "connectionTimeoutMs"),
      ASTER_OBJECT_STORAGE_DEFAULTS.connectionTimeoutMs,
      1,
      MAXIMUM_TIMEOUT_MS,
    );
    const operationTimeoutMs = boundedInteger(
      ownDataValue(input, "operationTimeoutMs"),
      ASTER_OBJECT_STORAGE_DEFAULTS.operationTimeoutMs,
      1,
      MAXIMUM_TIMEOUT_MS,
    );
    const closeTimeoutMs = boundedInteger(
      ownDataValue(input, "closeTimeoutMs"),
      ASTER_OBJECT_STORAGE_DEFAULTS.closeTimeoutMs,
      1,
      MAXIMUM_TIMEOUT_MS,
    );
    const uploadQueueSize = boundedInteger(
      ownDataValue(input, "uploadQueueSize"),
      ASTER_OBJECT_STORAGE_DEFAULTS.uploadQueueSize,
      1,
      MAXIMUM_UPLOAD_QUEUE_SIZE,
    );
    const uploadPartSizeBytes = boundedInteger(
      ownDataValue(input, "uploadPartSizeBytes"),
      ASTER_OBJECT_STORAGE_DEFAULTS.uploadPartSizeBytes,
      MINIMUM_PART_SIZE_BYTES,
      MAXIMUM_PART_SIZE_BYTES,
    );
    const fixtureKeyPrefix =
      ownDataValue(input, "fixtureKeyPrefix") ?? ASTER_OBJECT_STORAGE_DEFAULTS.fixtureKeyPrefix;
    for (const [name, value] of [
      ["maxInFlightOperations", maxInFlightOperations],
      ["maxObjectBytes", maxObjectBytes],
      ["connectionTimeoutMs", connectionTimeoutMs],
      ["operationTimeoutMs", operationTimeoutMs],
      ["closeTimeoutMs", closeTimeoutMs],
      ["uploadQueueSize", uploadQueueSize],
      ["uploadPartSizeBytes", uploadPartSizeBytes],
    ] as const) {
      if (value === undefined) {
        issues.push(issue(name, "invalid"));
      }
    }
    if (!validFixturePrefix(fixtureKeyPrefix)) {
      issues.push(issue("fixtureKeyPrefix", "invalid"));
    }
    if (
      uploadQueueSize !== undefined &&
      uploadPartSizeBytes !== undefined &&
      uploadQueueSize * uploadPartSizeBytes > MAXIMUM_BUFFER_BUDGET_BYTES
    ) {
      issues.push(issue("uploadQueueSize", "invalid"));
    }
    if (issues.length > 0) {
      throw new AsterObjectStorageConfigurationError(issues.slice(0, MAXIMUM_OPTION_COUNT));
    }
    return Object.freeze({
      endpoint: endpoint as string,
      region: region as string,
      bucket: bucket as string,
      accessKeyId: accessKeyId as string,
      secretAccessKey: secretAccessKey as string,
      sessionToken: sessionToken as string | undefined,
      telemetry: telemetry as ValidatedOptions["telemetry"],
      maxInFlightOperations: maxInFlightOperations as number,
      maxObjectBytes: maxObjectBytes as number,
      connectionTimeoutMs: connectionTimeoutMs as number,
      operationTimeoutMs: operationTimeoutMs as number,
      closeTimeoutMs: closeTimeoutMs as number,
      uploadQueueSize: uploadQueueSize as number,
      uploadPartSizeBytes: uploadPartSizeBytes as number,
      fixtureKeyPrefix: fixtureKeyPrefix as string,
    });
  } catch (error) {
    if (error instanceof AsterObjectStorageConfigurationError) {
      throw error;
    }
    throw new AsterObjectStorageConfigurationError([issue("<options>", "internal")]);
  }
}

function waitFor<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<WaitResult<T>> {
  if (signal?.aborted) {
    return Promise.resolve(ABORTED);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: WaitResult<T>): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onAbort = (): void => {
      finish(ABORTED);
    };
    const timer = setTimeout(() => {
      finish(TIMED_OUT);
    }, timeoutMs);
    timer.unref();
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        finish(Object.freeze({ status: "completed", value }));
      },
      (error: unknown) => {
        finish(Object.freeze({ status: "failed", error }));
      },
    );
  });
}

function validSignal(signal: AbortSignal | undefined): boolean {
  return signal === undefined || signal instanceof AbortSignal;
}

function observationFor(
  telemetry: ValidatedOptions["telemetry"],
  operation: AsterDependencyOperation,
): AsterDependencyObservation | undefined {
  try {
    const result = telemetry.start.call(telemetry.target, {
      dependency: "object_storage",
      operation,
    });
    return result.status === "started" ? result.observation : undefined;
  } catch {
    return undefined;
  }
}

function completeObservation(
  observation: AsterDependencyObservation | undefined,
  outcome: AsterObservationOutcome,
): void {
  try {
    observation?.complete({ outcome });
  } catch {
    // Telemetry degradation cannot change dependency behavior.
  }
}

function outcomeFor(result: AsterObjectStorageOperationResult): AsterObservationOutcome {
  switch (result.status) {
    case "completed":
      return "success";
    case "timed_out":
      return "timeout";
    case "aborted":
      return "cancelled";
    case "not_found":
      return "success";
    case "unavailable":
      return "unavailable";
    case "rejected":
      return "rejected";
    case "failed":
      return "error";
  }
}

function isNotFound(error: unknown): boolean {
  try {
    if (typeof error !== "object" || error === null) {
      return false;
    }
    const metadata = Object.getOwnPropertyDescriptor(error, "$metadata")?.value as
      object | undefined;
    return Object.getOwnPropertyDescriptor(metadata ?? {}, "httpStatusCode")?.value === 404;
  } catch {
    return false;
  }
}

function validPlainInput(
  input: unknown,
  keys: readonly string[],
): input is Record<string, unknown> {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return false;
    }
    const prototype: unknown = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) {
      return false;
    }
    const ownKeys = Reflect.ownKeys(input);
    if (ownKeys.length > keys.length) {
      return false;
    }
    for (const key of ownKeys) {
      if (typeof key !== "string" || !keys.includes(key)) {
        return false;
      }
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || "get" in descriptor) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function keyFrom(input: unknown): string | undefined {
  if (!validPlainInput(input, ["key"])) {
    return undefined;
  }
  const key = ownDataValue(input, "key");
  return validKey(key) ? key : undefined;
}

function writeInputFrom(input: unknown, maximumBytes: number): AsterObjectWriteInput | undefined {
  if (!validPlainInput(input, ["key", "source", "contentLength", "contentType"])) {
    return undefined;
  }
  const key = ownDataValue(input, "key");
  const source = ownDataValue(input, "source");
  const contentLength = ownDataValue(input, "contentLength");
  const contentType = ownDataValue(input, "contentType");
  if (
    !validKey(key) ||
    !(source instanceof Readable) ||
    typeof contentLength !== "number" ||
    !Number.isSafeInteger(contentLength) ||
    contentLength < 0 ||
    contentLength > maximumBytes ||
    !validContentType(contentType)
  ) {
    return undefined;
  }
  return {
    key,
    source: source,
    contentLength,
    ...(contentType === undefined ? {} : { contentType }),
  };
}

function readInputFrom(input: unknown): AsterObjectReadInput | undefined {
  if (!validPlainInput(input, ["key", "destination"])) {
    return undefined;
  }
  const key = ownDataValue(input, "key");
  const destination = ownDataValue(input, "destination");
  if (!validKey(key) || !(destination instanceof Writable)) {
    return undefined;
  }
  return { key, destination: destination };
}

function byteLimiter(maximumBytes: number): Transform {
  let total = 0;
  return new Transform({
    transform(chunk: unknown, _encoding, callback): void {
      const bytes = Buffer.isBuffer(chunk)
        ? chunk.length
        : chunk instanceof Uint8Array
          ? chunk.byteLength
          : undefined;
      if (bytes === undefined || total + bytes > maximumBytes) {
        callback(new AsterObjectLimitError());
        return;
      }
      total += bytes;
      callback(undefined, chunk);
    },
  });
}

function exactLengthValidator(expectedBytes: number): Transform {
  let total = 0;
  return new Transform({
    transform(chunk: unknown, _encoding, callback): void {
      const bytes = Buffer.isBuffer(chunk)
        ? chunk.length
        : chunk instanceof Uint8Array
          ? chunk.byteLength
          : undefined;
      if (bytes === undefined || total + bytes > expectedBytes) {
        callback(new AsterObjectLengthError());
        return;
      }
      total += bytes;
      callback(undefined, chunk);
    },
    flush(callback): void {
      callback(total === expectedBytes ? undefined : new AsterObjectLengthError());
    },
  });
}

function defaultClientFactory(configuration: AsterS3ClientConfiguration): AsterS3Client {
  const requestHandler = new NodeHttpHandler({
    connectionTimeout: configuration.connectionTimeoutMs,
    requestTimeout: configuration.requestTimeoutMs,
  });
  const credentials = configuration.sessionToken
    ? {
        accessKeyId: configuration.accessKeyId,
        secretAccessKey: configuration.secretAccessKey,
        sessionToken: configuration.sessionToken,
      }
    : {
        accessKeyId: configuration.accessKeyId,
        secretAccessKey: configuration.secretAccessKey,
      };
  const client = new S3Client({
    endpoint: configuration.endpoint,
    region: configuration.region,
    credentials,
    forcePathStyle: configuration.forcePathStyle,
    maxAttempts: configuration.maxAttempts,
    requestHandler,
    followRegionRedirects: false,
    requestChecksumCalculation: "WHEN_SUPPORTED",
    responseChecksumValidation: "WHEN_SUPPORTED",
  });
  return {
    async probe(bucket, signal): Promise<void> {
      await client.send(new HeadBucketCommand({ Bucket: bucket }), { abortSignal: signal });
    },
    async head(bucket, key, signal): Promise<void> {
      await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key, ChecksumMode: ChecksumMode.ENABLED }),
        { abortSignal: signal },
      );
    },
    async write(input, signal): Promise<void> {
      const abortController = new AbortController();
      const onAbort = (): void => {
        abortController.abort();
      };
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
      try {
        const upload = new Upload({
          client,
          params: {
            Bucket: input.bucket,
            Key: input.key,
            Body: input.source,
            ContentLength: input.contentLength,
            ...(input.contentType ? { ContentType: input.contentType } : {}),
            ChecksumAlgorithm: ChecksumAlgorithm.SHA256,
          },
          queueSize: input.queueSize,
          partSize: input.partSizeBytes,
          leavePartsOnError: false,
          abortController,
        });
        await upload.done();
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
    },
    async read(bucket, key, signal): Promise<AsterS3ReadResponse> {
      const response = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key, ChecksumMode: ChecksumMode.ENABLED }),
        { abortSignal: signal },
      );
      if (!response.Body || typeof response.Body !== "object" || !("pipe" in response.Body)) {
        throw new AsterObjectProtocolError();
      }
      return {
        body: response.Body,
        contentLength: response.ContentLength,
      };
    },
    async delete(bucket, key, signal): Promise<void> {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: signal,
      });
    },
    destroy(): void {
      client.destroy();
    },
  };
}

export function createAsterObjectStorageAdapterWithClientFactory(
  input: AsterObjectStorageOptions,
  clientFactory: ClientFactory,
): AsterObjectStorageAdapter {
  const options = validateOptions(input);
  const configuration: AsterS3ClientConfiguration = Object.freeze({
    endpoint: options.endpoint,
    region: options.region,
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    sessionToken: options.sessionToken,
    connectionTimeoutMs: options.connectionTimeoutMs,
    requestTimeoutMs: options.operationTimeoutMs,
    maxAttempts: 1,
    forcePathStyle: true,
  });
  let state: AsterObjectStorageSnapshot["state"] = "idle";
  let client: AsterS3Client | undefined;
  let inFlightOperations = 0;
  let closeWork: Promise<AsterObjectStorageCloseResult> | undefined;
  const operationAborters = new Set<AbortController>();
  const activeOperations = new Set<Promise<void>>();
  const backgroundWork = new Set<Promise<unknown>>();
  let retirementFailed = false;
  const retirementTimeoutMs = Math.max(1, Math.floor(options.closeTimeoutMs / 2));

  const ensureClient = (): AsterS3Client | undefined => {
    if (client) {
      return client;
    }
    try {
      client = clientFactory(configuration);
      state = "open";
      return client;
    } catch {
      state = "degraded";
      return undefined;
    }
  };

  const destroyClient = (expected?: AsterS3Client): boolean => {
    if (!client || (expected && client !== expected)) {
      return true;
    }
    const owned = client;
    client = undefined;
    try {
      owned.destroy();
    } catch {
      if (state !== "closing" && state !== "closed") {
        state = "degraded";
      }
      return false;
    }
    if (state !== "closing" && state !== "closed") {
      state = "degraded";
    }
    return true;
  };

  const retireClient = (expected: AsterS3Client, work: Promise<unknown>): void => {
    if (client !== expected) {
      return;
    }
    client = undefined;
    if (state !== "closing" && state !== "closed") {
      state = "degraded";
    }
    const retirement = waitFor(work, undefined, retirementTimeoutMs).then(() => {
      try {
        expected.destroy();
      } catch {
        retirementFailed = true;
        throw new AsterObjectProtocolError();
      }
    });
    backgroundWork.add(retirement);
    const finishRetirement = (): void => {
      backgroundWork.delete(retirement);
    };
    void retirement.then(finishRetirement, finishRetirement);
  };

  const run = async (
    operation: AsterDependencyOperation,
    signal: AbortSignal | undefined,
    work: (owned: AsterS3Client, operationSignal: AbortSignal) => Promise<void>,
    onAccepted?: () => void,
  ): Promise<AsterObjectStorageOperationResult> => {
    const observation = observationFor(options.telemetry, operation);
    let finalResult: AsterObjectStorageOperationResult = FAILED;
    let completeOperation: (() => void) | undefined;
    let controller: AbortController | undefined;
    let owned: AsterS3Client | undefined;
    const settlement = new Promise<void>((resolve) => {
      completeOperation = resolve;
    });
    activeOperations.add(settlement);
    try {
      if (!validSignal(signal)) {
        finalResult = INVALID_SIGNAL_REJECTED;
        return finalResult;
      }
      if (signal?.aborted) {
        finalResult = ABORTED;
        return finalResult;
      }
      if (state === "closing" || state === "closed") {
        finalResult = CLOSED_REJECTED;
        return finalResult;
      }
      if (inFlightOperations >= options.maxInFlightOperations) {
        finalResult = CAPACITY_REJECTED;
        return finalResult;
      }
      owned = ensureClient();
      if (!owned) {
        finalResult = UNAVAILABLE;
        return finalResult;
      }
      onAccepted?.();
      inFlightOperations += 1;
      controller = new AbortController();
      operationAborters.add(controller);
      const operationSignal = signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal;
      let raw: Promise<void>;
      try {
        raw = Promise.resolve(work(owned, operationSignal));
      } catch {
        destroyClient(owned);
        finalResult = FAILED;
        return finalResult;
      }
      const result = await waitFor(raw, operationSignal, options.operationTimeoutMs);
      if (result.status === "completed") {
        state = "open";
        finalResult = COMPLETED;
        return finalResult;
      }
      if (result.status === "aborted" || result.status === "timed_out") {
        controller.abort();
        retireClient(owned, raw);
        finalResult = result.status === "aborted" ? ABORTED : TIMED_OUT;
        return finalResult;
      }
      if (result.error instanceof AsterObjectLimitError) {
        finalResult = OBJECT_TOO_LARGE;
        return finalResult;
      }
      if (result.error instanceof AsterObjectLengthError) {
        finalResult = INVALID_REQUEST;
        return finalResult;
      }
      if (result.error instanceof AsterObjectProtocolError) {
        destroyClient(owned);
        finalResult = FAILED;
        return finalResult;
      }
      if (isNotFound(result.error)) {
        state = operation === "read" ? "open" : "degraded";
        finalResult = operation === "read" ? NOT_FOUND : UNAVAILABLE;
      } else {
        state = "degraded";
        finalResult = UNAVAILABLE;
      }
      return finalResult;
    } catch {
      if (owned) {
        destroyClient(owned);
      }
      finalResult = FAILED;
      return finalResult;
    } finally {
      if (controller) {
        operationAborters.delete(controller);
        inFlightOperations -= 1;
      }
      completeObservation(observation, outcomeFor(finalResult));
      completeOperation?.();
      activeOperations.delete(settlement);
    }
  };

  const probe = (signal?: AbortSignal): Promise<AsterObjectStorageOperationResult> =>
    run("probe", signal, (owned, operationSignal) => owned.probe(options.bucket, operationSignal));

  const head = (
    input: AsterObjectKeyInput,
    signal?: AbortSignal,
  ): Promise<AsterObjectStorageOperationResult> => {
    const key = keyFrom(input);
    if (!key) {
      return Promise.resolve(INVALID_REQUEST);
    }
    return run("read", signal, (owned, operationSignal) =>
      owned.head(options.bucket, key, operationSignal),
    );
  };

  const write = async (
    input: AsterObjectWriteInput,
    signal?: AbortSignal,
  ): Promise<AsterObjectStorageOperationResult> => {
    const validated = writeInputFrom(input, options.maxObjectBytes);
    if (!validated) {
      const contentLength = ownDataValue(input, "contentLength");
      return typeof contentLength === "number" && contentLength > options.maxObjectBytes
        ? OBJECT_TOO_LARGE
        : INVALID_REQUEST;
    }
    const ownership = { accepted: false };
    try {
      return await run(
        "write",
        signal,
        async (owned, operationSignal) => {
          const validator = exactLengthValidator(validated.contentLength);
          const feed = pipeline(validated.source, validator, { signal: operationSignal });
          try {
            const settlements = await Promise.allSettled([
              feed,
              owned.write(
                {
                  bucket: options.bucket,
                  key: validated.key,
                  source: validator,
                  contentLength: validated.contentLength,
                  contentType: validated.contentType,
                  queueSize: options.uploadQueueSize,
                  partSizeBytes: options.uploadPartSizeBytes,
                },
                operationSignal,
              ),
            ]);
            const failure = settlements.find(
              (settlement): settlement is PromiseRejectedResult => settlement.status === "rejected",
            );
            if (failure) {
              throw failure.reason;
            }
          } finally {
            validator.destroy();
          }
        },
        () => {
          ownership.accepted = true;
        },
      );
    } finally {
      if (ownership.accepted) {
        try {
          validated.source.destroy();
        } catch {
          // The accepted source is adapter-owned and no stream error crosses the boundary.
        }
      }
    }
  };

  const read = (
    input: AsterObjectReadInput,
    signal?: AbortSignal,
  ): Promise<AsterObjectStorageOperationResult> => {
    const validated = readInputFrom(input);
    if (!validated) {
      return Promise.resolve(INVALID_REQUEST);
    }
    return run("read", signal, async (owned, operationSignal) => {
      const response = await owned.read(options.bucket, validated.key, operationSignal);
      if (
        response.contentLength !== undefined &&
        (!Number.isSafeInteger(response.contentLength) ||
          response.contentLength < 0 ||
          response.contentLength > options.maxObjectBytes)
      ) {
        response.body.destroy();
        validated.destination.destroy();
        throw new AsterObjectLimitError();
      }
      await pipeline(response.body, byteLimiter(options.maxObjectBytes), validated.destination, {
        signal: operationSignal,
      });
    });
  };

  const deleteFixture = (
    input: AsterObjectKeyInput,
    signal?: AbortSignal,
  ): Promise<AsterObjectStorageOperationResult> => {
    const key = keyFrom(input);
    if (!key) {
      return Promise.resolve(INVALID_REQUEST);
    }
    if (
      !key.startsWith(options.fixtureKeyPrefix) ||
      key.length === options.fixtureKeyPrefix.length
    ) {
      return Promise.resolve(UNSAFE_FIXTURE_TARGET);
    }
    return run("delete", signal, (owned, operationSignal) =>
      owned.delete(options.bucket, key, operationSignal),
    );
  };

  const snapshot = (): AsterObjectStorageSnapshot => Object.freeze({ state, inFlightOperations });

  const startClose = (): Promise<AsterObjectStorageCloseResult> => {
    if (closeWork) {
      return closeWork;
    }
    state = "closing";
    for (const controller of [...operationAborters]) {
      controller.abort();
    }
    const rawClose = (async (): Promise<boolean> => {
      await Promise.allSettled([...activeOperations]);
      const destroyed = destroyClient();
      const retirements = await Promise.allSettled([...backgroundWork]);
      const retirementSettled = retirements.every(
        (retirement) => retirement.status === "fulfilled",
      );
      const completed = destroyed && retirementSettled && !retirementFailed;
      state = completed ? "closed" : "degraded";
      return completed;
    })();
    closeWork = waitFor(rawClose, undefined, options.closeTimeoutMs).then((result) => {
      if (result.status === "completed") {
        return result.value ? COMPLETED : FAILED;
      }
      if (result.status === "timed_out") {
        return TIMED_OUT;
      }
      return FAILED;
    });
    return closeWork;
  };

  const close = async (signal?: AbortSignal): Promise<AsterObjectStorageCloseResult> => {
    if (!validSignal(signal)) {
      return FAILED;
    }
    if (signal?.aborted) {
      return ABORTED;
    }
    if (state === "closed") {
      return Object.freeze({ status: "already_completed" });
    }
    const result = await waitFor(startClose(), signal, options.closeTimeoutMs);
    if (result.status === "completed") {
      return result.value;
    }
    if (result.status === "aborted") {
      return ABORTED;
    }
    return Object.freeze({ status: result.status === "timed_out" ? "timed_out" : "failed" });
  };

  const lifecycleHooks = Object.freeze({
    async closeDependencies(signal: AbortSignal): Promise<void> {
      const result = await close(signal);
      if (result.status !== "completed" && result.status !== "already_completed") {
        throw new AsterObjectStorageLifecycleError();
      }
    },
  });

  return Object.freeze({
    probe,
    head,
    write,
    read,
    deleteFixture,
    snapshot,
    close,
    lifecycleHooks: () => lifecycleHooks,
  });
}

export function createAsterObjectStorageAdapter(
  input: AsterObjectStorageOptions,
): AsterObjectStorageAdapter {
  return createAsterObjectStorageAdapterWithClientFactory(input, defaultClientFactory);
}
