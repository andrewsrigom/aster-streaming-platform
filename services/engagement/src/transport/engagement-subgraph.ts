import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";

import { ApolloServer } from "@apollo/server";
import {
  ApolloServerPluginCacheControlDisabled,
  ApolloServerPluginInlineTraceDisabled,
  ApolloServerPluginLandingPageDisabled,
  ApolloServerPluginSchemaReportingDisabled,
  ApolloServerPluginUsageReportingDisabled,
} from "@apollo/server/plugin/disabled";
import { unwrapResolverError } from "@apollo/server/errors";
import { expressMiddleware } from "@as-integrations/express5";
import {
  getExpressRequestAbortSignal,
  parseLocalSessionCookie,
  type AsterExpressGraphqlMiddleware,
  type AsterLocalRouterTrust,
} from "@aster/http-express";
import { GraphQLError, type GraphQLFormattedError } from "graphql";

import type { createProgressRecorder } from "../application/record-progress.js";
import type { createProgressQueries } from "../application/read-progress.js";
import {
  ENGAGEMENT_GRAPHQL_LIMITS,
  inspectEngagementOperation,
  type EngagementOperation,
} from "./graphql-operation.js";
import {
  createEngagementGraphqlContext,
  createEngagementSchema,
  EngagementGraphqlError,
  type EngagementGraphqlContext,
} from "./engagement-schema.js";

const OUTCOMES = new Set([
  "COMPLETED",
  "STALE",
  "CONFLICT",
  "NOT_FOUND",
  "UNAUTHENTICATED",
  "BACKPRESSURE",
  "UNAVAILABLE",
  "CANCELLED",
  "LIMIT_EXCEEDED",
  "INVALID_INPUT",
  "FORBIDDEN",
  "NOT_PLAYABLE",
  "INDETERMINATE",
]);

interface EngagementOperationTrace {
  readonly correlationId: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly operation: EngagementOperation | "rejected";
  readonly code: string;
  readonly durationMs: number;
}

export interface EngagementSubgraphOptions {
  readonly routerTrust: AsterLocalRouterTrust;
  readonly recorder: ReturnType<typeof createProgressRecorder>;
  readonly queries?: ReturnType<typeof createProgressQueries>;
  readonly monotonicNow?: () => number;
  readonly onOperation?: (trace: EngagementOperationTrace) => void;
  readonly onDiagnostic?: (code: "graphql_engine_error" | "graphql_engine_warning") => void;
}

export async function createEngagementSubgraph(options: EngagementSubgraphOptions) {
  const schema = createEngagementSchema();
  const contexts = new WeakMap<IncomingMessage, EngagementGraphqlContext>();
  const errorCorrelations = new WeakMap<object, string>();
  const now = options.monotonicNow ?? (() => performance.now());
  let credit: number = ENGAGEMENT_GRAPHQL_LIMITS.rateBurst;
  let refreshedAt = now();
  let closed = false;
  let stopping: Promise<void> | undefined;
  const controllers = new Set<AbortController>();
  const pending = new Set<Promise<unknown>>();

  const diagnostic = (code: "graphql_engine_error" | "graphql_engine_warning"): void => {
    try {
      options.onDiagnostic?.(code);
    } catch {
      // Logging failure cannot alter an acknowledged owner operation.
    }
  };
  const sanitizedError = (
    _formatted: GraphQLFormattedError,
    error: unknown,
  ): GraphQLFormattedError => {
    const original = unwrapResolverError(error);
    const code =
      original instanceof EngagementGraphqlError &&
      OUTCOMES.has(String(original.extensions["code"]))
        ? String(original.extensions["code"])
        : error instanceof GraphQLError &&
            ["GRAPHQL_PARSE_FAILED", "GRAPHQL_VALIDATION_FAILED", "BAD_USER_INPUT"].includes(
              String(error.extensions["code"]),
            )
          ? "INVALID_INPUT"
          : "UNAVAILABLE";
    const correlationId =
      typeof error === "object" && error !== null ? errorCorrelations.get(error) : undefined;
    return {
      message: "Engagement operation rejected.",
      extensions: { code, ...(correlationId ? { correlationId } : {}) },
    };
  };
  const server = new ApolloServer<EngagementGraphqlContext>({
    schema,
    introspection: false,
    documentStore: null,
    persistedQueries: false,
    allowBatchedHttpRequests: false,
    stopOnTerminationSignals: false,
    includeStacktraceInErrorResponses: false,
    hideSchemaDetailsFromClientErrors: true,
    maxRecursiveSelections: ENGAGEMENT_GRAPHQL_LIMITS.fields,
    parseOptions: { maxTokens: ENGAGEMENT_GRAPHQL_LIMITS.tokens },
    csrfPrevention: { requestHeaders: ["x-aster-csrf"] },
    formatError: sanitizedError,
    logger: {
      debug: () => undefined,
      info: () => undefined,
      warn: () => {
        diagnostic("graphql_engine_warning");
      },
      error: () => {
        diagnostic("graphql_engine_error");
      },
    },
    plugins: [
      ApolloServerPluginCacheControlDisabled(),
      ApolloServerPluginInlineTraceDisabled(),
      ApolloServerPluginLandingPageDisabled(),
      ApolloServerPluginSchemaReportingDisabled(),
      ApolloServerPluginUsageReportingDisabled(),
      {
        requestDidStart: () =>
          Promise.resolve({
            didEncounterErrors: ({ errors, contextValue }) => {
              for (const error of errors) {
                errorCorrelations.set(error, contextValue.correlationId);
                const formatted = sanitizedError(error.toJSON(), error);
                contextValue.outcome.code = String(formatted.extensions?.["code"]);
              }
              return Promise.resolve();
            },
          }),
      },
    ],
  });
  await server.start();
  const apollo = expressMiddleware(server, {
    context: ({ req }) => {
      const context = contexts.get(req);
      if (!context) {
        throw new EngagementGraphqlError("UNAVAILABLE");
      }
      return Promise.resolve(context);
    },
  });

  const middleware: AsterExpressGraphqlMiddleware = async (request, response, onError) => {
    const routerContext = options.routerTrust.accept(request);
    const startedAt = now();
    const correlationId = randomUUID();
    const traceId = routerContext?.traceId ?? randomUUID().replaceAll("-", "");
    const spanId = randomUUID().replaceAll("-", "").slice(0, 16);
    let operation: EngagementOperation | "rejected" = "rejected";
    let code = "COMPLETED";
    const record = (): void => {
      try {
        options.onOperation?.({
          correlationId,
          traceId,
          spanId,
          operation,
          code,
          durationMs: Math.max(0, now() - startedAt),
        });
      } catch {
        diagnostic("graphql_engine_error");
      }
    };
    const reject = (httpStatus: number, outcome: string): void => {
      code = outcome;
      if (!response.destroyed && !response.headersSent) {
        response.removeHeader("Set-Cookie");
        response.status(httpStatus).json({
          errors: [
            { message: "Engagement operation rejected.", extensions: { code, correlationId } },
          ],
        });
      }
    };
    response.set("X-Request-Id", correlationId);
    response.set("Cache-Control", "no-store");
    if (!routerContext) {
      reject(403, "FORBIDDEN");
      record();
      return;
    }
    if (request.method !== "POST") {
      response.set("Allow", "POST");
      reject(405, "INVALID_INPUT");
      record();
      return;
    }
    const cookies = parseLocalSessionCookie(request.headers["cookie"]);
    if (!cookies) {
      reject(400, "INVALID_INPUT");
      record();
      return;
    }
    if (closed || controllers.size >= ENGAGEMENT_GRAPHQL_LIMITS.concurrent) {
      reject(503, "UNAVAILABLE");
      record();
      return;
    }
    credit = Math.min(
      ENGAGEMENT_GRAPHQL_LIMITS.rateBurst,
      credit +
        (Math.max(0, startedAt - refreshedAt) * ENGAGEMENT_GRAPHQL_LIMITS.ratePerSecond) / 1_000,
    );
    refreshedAt = startedAt;
    if (credit < 1) {
      response.set("Retry-After", "1");
      reject(429, "LIMIT_EXCEEDED");
      record();
      return;
    }
    credit -= 1;
    const decision = inspectEngagementOperation(request.body as unknown);
    if (decision.status !== "accepted") {
      reject(400, decision.code);
      record();
      return;
    }
    operation = decision.operation;
    const controller = new AbortController();
    controllers.add(controller);
    const signal = AbortSignal.any([getExpressRequestAbortSignal(response), controller.signal]);
    const context = createEngagementGraphqlContext(
      options.recorder,
      signal,
      correlationId,
      cookies.credential,
      typeof request.headers["traceparent"] === "string"
        ? request.headers["traceparent"]
        : undefined,
      options.queries,
    );
    contexts.set(request, context);
    const timer = setTimeout(() => {
      controller.abort();
      reject(503, "CANCELLED");
    }, ENGAGEMENT_GRAPHQL_LIMITS.deadlineMs);
    timer.unref();
    const execution = Promise.resolve().then(() => apollo(request, response, onError));
    pending.add(execution);
    try {
      await execution;
      code = signal.aborted ? "CANCELLED" : context.outcome.code;
    } catch {
      reject(503, signal.aborted ? "CANCELLED" : "UNAVAILABLE");
    } finally {
      clearTimeout(timer);
      contexts.delete(request);
      controllers.delete(controller);
      pending.delete(execution);
      // Keep admission until work actually settles, including after a timeout response.
      record();
    }
  };

  return Object.freeze({
    schema,
    middleware,
    stop(): Promise<void> {
      if (!stopping) {
        closed = true;
        for (const controller of controllers) {
          controller.abort();
        }
        stopping = Promise.allSettled([...pending]).then(() => server.stop());
      }
      return stopping;
    },
  });
}
