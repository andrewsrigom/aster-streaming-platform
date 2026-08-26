import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer, request as createClientRequest, type Server } from "node:http";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { expressMiddleware } from "@as-integrations/express5";
import type { RequestHandler, Response as ExpressResponse } from "express";

import {
  ASTER_GRAPHQL_BODY_LIMIT_BYTES,
  ASTER_GRAPHQL_BODY_LIMIT_MAX_BYTES,
  AsterExpressAdapterError,
  createExpressHttpAdapter,
  getExpressRequestAbortSignal,
  type AsterExpressHttpAdapterOptions,
} from "../src/index.js";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

interface ApolloTestContext {
  readonly signal: AbortSignal;
}

function deferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value: T): void {
      if (!resolvePromise) {
        throw new Error("Deferred resolver is unavailable.");
      }
      resolvePromise(value);
      resolvePromise = undefined;
    },
  };
}

function captureAdapterError(action: () => unknown): AsterExpressAdapterError {
  try {
    action();
  } catch (error) {
    assert.equal(error instanceof AsterExpressAdapterError, true);
    return error as AsterExpressAdapterError;
  }
  assert.fail("Expected Express adapter action to fail");
}

function localUrl(server: Server): string {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

async function listen(server: Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return localUrl(server);
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    server.closeAllConnections();
    return;
  }
  const closing = new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  server.closeAllConnections();
  await closing;
}

async function withTestDeadline<T>(promise: Promise<T>): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Test deadline exceeded."));
    }, 2_000);
    timer.unref();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error("Test promise rejected."));
      },
    );
  });
}

async function responsePayload(response: globalThis.Response): Promise<unknown> {
  const payload: unknown = await response.json();
  return payload;
}

test("validates bounded options, mount state, and request context without invoking accessors", () => {
  assert.equal(ASTER_GRAPHQL_BODY_LIMIT_BYTES, 65_536);
  assert.equal(ASTER_GRAPHQL_BODY_LIMIT_MAX_BYTES, 262_144);

  const invalidLimit = captureAdapterError(() =>
    createExpressHttpAdapter({ bodyLimitBytes: ASTER_GRAPHQL_BODY_LIMIT_MAX_BYTES + 1 }),
  );
  assert.deepEqual(invalidLimit.issues, [{ option: "bodyLimitBytes", reason: "invalid" }]);

  let reads = 0;
  const hostile = Object.create(null) as AsterExpressHttpAdapterOptions;
  Object.defineProperty(hostile, "bodyLimitBytes", {
    get(): number {
      reads += 1;
      return 1_024;
    },
  });
  const hostileError = captureAdapterError(() => createExpressHttpAdapter(hostile));
  assert.equal(reads, 0);
  assert.deepEqual(hostileError.issues, [{ option: "<options>", reason: "invalid" }]);

  const adapter = createExpressHttpAdapter();
  const invalidMiddleware = captureAdapterError(() => {
    adapter.mountGraphql(null as unknown as RequestHandler);
  });
  assert.deepEqual(invalidMiddleware.issues, [{ option: "graphqlMiddleware", reason: "invalid" }]);
  adapter.mountGraphql((_request, response) => response.status(204).end());
  const duplicate = captureAdapterError(() => {
    adapter.mountGraphql((_request, response) => {
      response.status(204).end();
    });
  });
  assert.deepEqual(duplicate.issues, [{ option: "graphqlMiddleware", reason: "already_mounted" }]);

  const missingContext = captureAdapterError(() =>
    getExpressRequestAbortSignal({} as ExpressResponse),
  );
  assert.deepEqual(missingContext.issues, [{ option: "requestContext", reason: "missing" }]);
});

test("enforces parser-before-handler ordering and hides framework headers", async (context) => {
  const adapter = createExpressHttpAdapter({ bodyLimitBytes: 1_024 });
  const server = createServer(adapter.requestListener);
  context.after(async () => closeServer(server));
  const url = await listen(server);

  const unavailable = await fetch(`${url}/graphql`);
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await responsePayload(unavailable), {
    error: { code: "HTTP_ADAPTER_NOT_READY" },
  });

  let capturedResponse: ExpressResponse | undefined;
  const handler: RequestHandler = (request, response): void => {
    capturedResponse = response;
    const signal = getExpressRequestAbortSignal(response);
    const body = request.body as unknown;
    response.status(200).json({ parsed: body, aborted: signal.aborted });
  };
  adapter.mountGraphql(handler);

  const response = await fetch(`${url}/graphql`, {
    method: "POST",
    headers: {
      "content-type": 'application/json; profile="a;charset=utf-16le"; charset=UTF-8',
    },
    body: JSON.stringify({ operationName: "TransportCheck" }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.has("x-powered-by"), false);
  assert.equal(response.headers.has("etag"), false);
  assert.deepEqual(await responsePayload(response), {
    parsed: { operationName: "TransportCheck" },
    aborted: false,
  });
  const completedResponse = capturedResponse;
  assert.ok(completedResponse);
  await new Promise<void>((resolve) => setImmediate(resolve));
  const cleaned = captureAdapterError(() => getExpressRequestAbortSignal(completedResponse));
  assert.deepEqual(cleaned.issues, [{ option: "requestContext", reason: "missing" }]);

  const missing = await fetch(`${url}/not-found`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await responsePayload(missing), { error: { code: "HTTP_NOT_FOUND" } });

  const nested = await fetch(`${url}/graphql/nested`);
  assert.equal(nested.status, 404);
  assert.deepEqual(await responsePayload(nested), { error: { code: "HTTP_NOT_FOUND" } });

  const trailingSlash = await fetch(`${url}/graphql/`);
  assert.equal(trailingSlash.status, 404);
  assert.deepEqual(await responsePayload(trailingSlash), {
    error: { code: "HTTP_NOT_FOUND" },
  });

  const caseVariant = await fetch(`${url}/GRAPHQL`);
  assert.equal(caseVariant.status, 404);
  assert.deepEqual(await responsePayload(caseVariant), {
    error: { code: "HTTP_NOT_FOUND" },
  });
});

test("rejects malformed and oversized JSON before GraphQL middleware", async (context) => {
  const adapter = createExpressHttpAdapter({ bodyLimitBytes: 1_024 });
  let handlerCalls = 0;
  adapter.mountGraphql((_request, response) => {
    handlerCalls += 1;
    response.status(204).end();
  });
  const server = createServer(adapter.requestListener);
  context.after(async () => closeServer(server));
  const url = await listen(server);

  const malformed = await fetch(`${url}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await responsePayload(malformed), { error: { code: "INVALID_JSON_BODY" } });

  const wrongContentType = await fetch(`${url}/graphql`, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "{}",
  });
  assert.equal(wrongContentType.status, 415);
  assert.deepEqual(await responsePayload(wrongContentType), {
    error: { code: "UNSUPPORTED_MEDIA_TYPE" },
  });

  const unsupportedCharset = await fetch(`${url}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=iso-8859-1" },
    body: "{}",
  });
  assert.equal(unsupportedCharset.status, 415);
  assert.deepEqual(await responsePayload(unsupportedCharset), {
    error: { code: "UNSUPPORTED_MEDIA_TYPE" },
  });

  const validUtf16Json = Buffer.from("{}", "utf16le");
  const unsupportedUtf16 = await fetch(`${url}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-16le" },
    body: validUtf16Json,
  });
  assert.equal(unsupportedUtf16.status, 415);
  assert.deepEqual(await responsePayload(unsupportedUtf16), {
    error: { code: "UNSUPPORTED_MEDIA_TYPE" },
  });

  const duplicateCharset = await fetch(`${url}/graphql`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8; charset=utf-16le",
    },
    body: validUtf16Json,
  });
  assert.equal(duplicateCharset.status, 415);
  assert.deepEqual(await responsePayload(duplicateCharset), {
    error: { code: "UNSUPPORTED_MEDIA_TYPE" },
  });

  const encodingCanary = "unsupported-secret-canary";
  const unsupportedEncoding = await fetch(`${url}/graphql`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-encoding": encodingCanary,
    },
    body: "{}",
  });
  assert.equal(unsupportedEncoding.status, 415);
  const unsupportedEncodingPayload = await unsupportedEncoding.text();
  assert.equal(unsupportedEncodingPayload.includes(encodingCanary), false);
  const parsedUnsupportedEncoding: unknown = JSON.parse(unsupportedEncodingPayload);
  assert.deepEqual(parsedUnsupportedEncoding, {
    error: { code: "UNSUPPORTED_MEDIA_TYPE" },
  });

  const oversized = await fetch(`${url}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: "x".repeat(2_048) }),
  });
  assert.equal(oversized.status, 413);
  assert.deepEqual(await responsePayload(oversized), {
    error: { code: "REQUEST_BODY_TOO_LARGE" },
  });
  assert.equal(handlerCalls, 0);
});

test("sanitizes rejected Express 5 async middleware", async (context) => {
  const canary = "async-handler-secret-never-emit";
  const adapter = createExpressHttpAdapter();
  const handler: RequestHandler = (): Promise<void> =>
    Promise.reject(Object.assign(new Error(canary), { type: "entity.too.large" }));
  adapter.mountGraphql(handler);
  const server = createServer(adapter.requestListener);
  context.after(async () => closeServer(server));
  const url = await listen(server);

  const response = await fetch(`${url}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const serialized = await response.text();
  assert.equal(response.status, 500);
  assert.equal(serialized.includes(canary), false);
  const payload: unknown = JSON.parse(serialized);
  assert.deepEqual(payload, {
    error: { code: "INTERNAL_HTTP_ERROR" },
  });
});

test("aborts request-local work when the client disconnects", async (context) => {
  const started = deferred<AbortSignal>();
  const aborted = deferred<undefined>();
  const adapter = createExpressHttpAdapter();
  adapter.mountGraphql((_request, response): void => {
    const signal = getExpressRequestAbortSignal(response);
    started.resolve(signal);
    signal.addEventListener(
      "abort",
      () => {
        aborted.resolve(undefined);
      },
      { once: true },
    );
  });
  const server = createServer(adapter.requestListener);
  context.after(async () => closeServer(server));
  const url = new URL(`${await listen(server)}/graphql`);

  const clientFinished = deferred<undefined>();
  const clientRequest = createClientRequest(
    {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "POST",
      headers: { "content-type": "application/json" },
    },
    () => {
      clientFinished.resolve(undefined);
    },
  );
  clientRequest.once("error", () => {
    clientFinished.resolve(undefined);
  });
  clientRequest.end("{}");

  const signal = await withTestDeadline(started.promise);
  assert.equal(signal.aborted, false);
  clientRequest.destroy();
  await withTestDeadline(aborted.promise);
  await withTestDeadline(clientFinished.promise);
  assert.equal(signal.aborted, true);
});

test("executes Apollo Server and drains an in-flight operation before closing HTTP", async (context) => {
  const resolverStarted = deferred<AbortSignal>();
  const releaseResolver = deferred<undefined>();
  const adapter = createExpressHttpAdapter();
  const httpServer = createServer(adapter.requestListener);
  let stopped = false;
  const apollo = new ApolloServer<ApolloTestContext>({
    typeDefs: "type Query { transportCheck: String! slowCheck: String! }",
    resolvers: {
      Query: {
        transportCheck: (): string => "ok",
        slowCheck: async (
          _parent: unknown,
          _arguments: Record<string, never>,
          requestContext: ApolloTestContext,
        ): Promise<string> => {
          resolverStarted.resolve(requestContext.signal);
          await releaseResolver.promise;
          return requestContext.signal.aborted ? "aborted" : "drained";
        },
      },
    },
    introspection: false,
    includeStacktraceInErrorResponses: false,
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer, stopGracePeriodMillis: 2_000 })],
  });
  context.after(async () => {
    if (stopped) {
      return;
    }
    try {
      await apollo.stop();
    } catch {
      await closeServer(httpServer);
    }
  });

  await apollo.start();
  adapter.mountGraphql(
    expressMiddleware(apollo, {
      context: ({ res }) => Promise.resolve({ signal: getExpressRequestAbortSignal(res) }),
    }),
  );
  const url = await listen(httpServer);

  const normal = await fetch(`${url}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "query TransportCheck { transportCheck }" }),
  });
  assert.equal(normal.status, 200);
  assert.deepEqual(await responsePayload(normal), { data: { transportCheck: "ok" } });

  const inFlight = fetch(`${url}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "query SlowCheck { slowCheck }" }),
  });
  let inFlightSettled = false;
  void inFlight.then(
    () => {
      inFlightSettled = true;
    },
    () => {
      inFlightSettled = true;
    },
  );
  const signal = await withTestDeadline(resolverStarted.promise);
  let stopSettled = false;
  const stopping = apollo.stop();
  void stopping.then(
    () => {
      stopSettled = true;
    },
    () => {
      stopSettled = true;
    },
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(httpServer.listening, false);
  assert.equal(stopSettled, false);
  assert.equal(inFlightSettled, false);
  await assert.rejects(fetch(`${url}/graphql`));

  releaseResolver.resolve(undefined);
  const drainedResponse = await withTestDeadline(inFlight);
  assert.equal(drainedResponse.status, 200);
  assert.deepEqual(await responsePayload(drainedResponse), { data: { slowCheck: "drained" } });
  await withTestDeadline(stopping);
  stopped = true;
  assert.equal(signal.aborted, false);
  await assert.rejects(fetch(`${url}/graphql`));
});

test("runs the Apollo compatibility diagnostic without framework disclosure", () => {
  const diagnosticPath = fileURLToPath(new URL("../src/check-http-express.js", import.meta.url));
  const result = spawnSync(process.execPath, [diagnosticPath], {
    encoding: "utf8",
    env: {},
    timeout: 5_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const output = JSON.parse(result.stdout.trim()) as Record<string, unknown>;
  assert.deepEqual(output, {
    check: "http-express",
    status: "ok",
    statusCode: 200,
    bodyLimitBytes: ASTER_GRAPHQL_BODY_LIMIT_BYTES,
    frameworkDisclosure: false,
  });
});

test("keeps Apollo and Fastify out of generated public declarations", async () => {
  const declaration = await readFile(
    new URL("../src/express-http-adapter.d.ts", import.meta.url),
    "utf8",
  );
  const normalized = declaration.toLowerCase();
  assert.equal(normalized.includes("apollo"), false);
  assert.equal(normalized.includes("fastify"), false);
});
