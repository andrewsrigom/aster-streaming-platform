import type { RequestListener } from "node:http";

import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";

const ABSENT = Symbol("absent");
const ASTER_GRAPHQL_BODY_LIMIT_MIN_BYTES = 1_024;

export const ASTER_GRAPHQL_BODY_LIMIT_BYTES = 65_536;
export const ASTER_GRAPHQL_BODY_LIMIT_MAX_BYTES = 262_144;

const responseAbortSignals = new WeakMap<Response, AbortSignal>();

export type AsterExpressGraphqlMiddleware = RequestHandler;

export interface AsterExpressHttpAdapterOptions {
  readonly bodyLimitBytes?: number;
}

export interface AsterExpressHttpAdapter {
  readonly requestListener: RequestListener;
  mountGraphql(middleware: AsterExpressGraphqlMiddleware): void;
}

export interface AsterExpressAdapterIssue {
  readonly option: "<options>" | "bodyLimitBytes" | "graphqlMiddleware" | "requestContext";
  readonly reason: "already_mounted" | "internal" | "invalid" | "missing";
}

export class AsterExpressAdapterError extends Error {
  readonly code = "ASTER_EXPRESS_ADAPTER_INVALID";
  readonly issues: readonly AsterExpressAdapterIssue[];

  constructor(issues: readonly AsterExpressAdapterIssue[]) {
    super(
      `Express transport adapter is invalid (${issues.length} issue${issues.length === 1 ? "" : "s"}).`,
    );
    this.name = "AsterExpressAdapterError";
    this.issues = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
  }
}

class InvalidAdapterError extends Error {
  readonly option: AsterExpressAdapterIssue["option"];
  readonly reason: AsterExpressAdapterIssue["reason"];

  constructor(
    option: AsterExpressAdapterIssue["option"],
    reason: AsterExpressAdapterIssue["reason"],
  ) {
    super("Invalid Express transport adapter input.");
    this.name = "InvalidAdapterError";
    this.option = option;
    this.reason = reason;
  }
}

interface NormalizedAdapterOptions {
  readonly bodyLimitBytes: number;
}

function isObject(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function ownDataValue(object: object, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor) {
    return ABSENT;
  }
  if (!("value" in descriptor)) {
    throw new InvalidAdapterError("<options>", "invalid");
  }
  return descriptor.value;
}

function normalizeOptions(
  input: AsterExpressHttpAdapterOptions | undefined,
): NormalizedAdapterOptions {
  if (input === undefined) {
    return { bodyLimitBytes: ASTER_GRAPHQL_BODY_LIMIT_BYTES };
  }
  if (!isObject(input) || Array.isArray(input)) {
    throw new InvalidAdapterError("<options>", "invalid");
  }
  const candidate = ownDataValue(input, "bodyLimitBytes");
  if (candidate === ABSENT) {
    return { bodyLimitBytes: ASTER_GRAPHQL_BODY_LIMIT_BYTES };
  }
  if (
    typeof candidate !== "number" ||
    !Number.isSafeInteger(candidate) ||
    candidate < ASTER_GRAPHQL_BODY_LIMIT_MIN_BYTES ||
    candidate > ASTER_GRAPHQL_BODY_LIMIT_MAX_BYTES
  ) {
    throw new InvalidAdapterError("bodyLimitBytes", "invalid");
  }
  return { bodyLimitBytes: candidate };
}

function requestCancellationMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const controller = new AbortController();
  responseAbortSignals.set(response, controller.signal);

  const cleanup = (): void => {
    request.removeListener("aborted", abort);
    response.removeListener("close", close);
    response.removeListener("finish", finish);
    responseAbortSignals.delete(response);
  };
  const abort = (): void => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
    cleanup();
  };
  const close = (): void => {
    if (!response.writableFinished) {
      abort();
      return;
    }
    cleanup();
  };
  const finish = (): void => {
    cleanup();
  };

  request.once("aborted", abort);
  response.once("close", close);
  response.once("finish", finish);
  next();
}

function safeOwnValue(value: unknown, key: PropertyKey): unknown {
  if (!isObject(value)) {
    return ABSENT;
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) {
      return ABSENT;
    }
    return descriptor.value;
  } catch {
    return ABSENT;
  }
}

function writeError(response: Response, status: number, code: string): void {
  response
    .status(status)
    .type("application/json")
    .send(JSON.stringify({ error: { code } }));
}

const terminalErrorHandler: ErrorRequestHandler = (
  _error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
): void => {
  void _next;
  if (response.headersSent) {
    response.destroy();
    return;
  }
  writeError(response, 500, "INTERNAL_HTTP_ERROR");
};

const jsonParserErrorHandler: ErrorRequestHandler = (
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
): void => {
  void _next;
  if (response.headersSent) {
    response.destroy();
    return;
  }
  const type = safeOwnValue(error, "type");
  if (type === "entity.too.large") {
    writeError(response, 413, "REQUEST_BODY_TOO_LARGE");
    return;
  }
  if (type === "entity.parse.failed") {
    writeError(response, 400, "INVALID_JSON_BODY");
    return;
  }
  writeError(response, 500, "INTERNAL_HTTP_ERROR");
};

const notFoundHandler: RequestHandler = (_request: Request, response: Response): void => {
  writeError(response, 404, "HTTP_NOT_FOUND");
};

const requireJsonContentType: RequestHandler = (
  request: Request,
  response: Response,
  next: NextFunction,
): void => {
  if (request.method !== "POST") {
    next();
    return;
  }
  try {
    if (request.is("application/json") === "application/json") {
      next();
      return;
    }
  } catch {
    // Treat malformed media-type input as unsupported without reflecting it.
  }
  writeError(response, 415, "UNSUPPORTED_MEDIA_TYPE");
};

export function getExpressRequestAbortSignal(response: Response): AbortSignal {
  const signal = responseAbortSignals.get(response);
  if (!signal) {
    throw new AsterExpressAdapterError([{ option: "requestContext", reason: "missing" }]);
  }
  return signal;
}

export function createExpressHttpAdapter(
  options?: AsterExpressHttpAdapterOptions,
): AsterExpressHttpAdapter {
  let normalized: NormalizedAdapterOptions;
  try {
    normalized = normalizeOptions(options);
  } catch (error) {
    if (error instanceof InvalidAdapterError) {
      throw new AsterExpressAdapterError([{ option: error.option, reason: error.reason }]);
    }
    throw new AsterExpressAdapterError([{ option: "<options>", reason: "internal" }]);
  }

  const application = express();
  application.disable("etag");
  application.disable("x-powered-by");
  let mounted = false;
  application.use((_request: Request, response: Response, next: NextFunction): void => {
    if (!mounted) {
      writeError(response, 503, "HTTP_ADAPTER_NOT_READY");
      return;
    }
    next();
  });
  const requestListener: RequestListener = (request, response): void => {
    application(request, response);
  };

  const mountGraphql = (middleware: AsterExpressGraphqlMiddleware): void => {
    if (mounted) {
      throw new AsterExpressAdapterError([
        { option: "graphqlMiddleware", reason: "already_mounted" },
      ]);
    }
    if (typeof middleware !== "function") {
      throw new AsterExpressAdapterError([{ option: "graphqlMiddleware", reason: "invalid" }]);
    }
    try {
      application.all(
        "/graphql",
        requestCancellationMiddleware,
        requireJsonContentType,
        express.json({
          limit: normalized.bodyLimitBytes,
          strict: true,
          type: "application/json",
        }),
        jsonParserErrorHandler,
        middleware,
      );
      application.use(notFoundHandler);
      application.use(terminalErrorHandler);
      mounted = true;
    } catch {
      throw new AsterExpressAdapterError([{ option: "graphqlMiddleware", reason: "internal" }]);
    }
  };

  return Object.freeze({ requestListener, mountGraphql });
}
