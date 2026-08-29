import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { ApolloServer } from "@apollo/server";
import { unwrapResolverError } from "@apollo/server/errors";
import {
  ApolloServerPluginCacheControlDisabled,
  ApolloServerPluginInlineTraceDisabled,
  ApolloServerPluginLandingPageDisabled,
  ApolloServerPluginSchemaReportingDisabled,
  ApolloServerPluginUsageReportingDisabled,
} from "@apollo/server/plugin/disabled";
import { expressMiddleware } from "@as-integrations/express5";
import {
  getExpressRequestAbortSignal,
  type AsterExpressGraphqlMiddleware,
  type AsterLocalRouterTrust,
} from "@aster/http-express";
import { GraphQLError, type GraphQLFormattedError } from "graphql";
import type { createHomeRails } from "../application/home-rails.js";
import type { createTitleSearch } from "../application/search-titles.js";
import type { AsterOperationLimitMetricInput } from "@aster/telemetry";
import {
  createDiscoveryGraphqlContext,
  createDiscoverySchema,
  DiscoveryGraphqlError,
  type DiscoveryGraphqlContext,
} from "./discovery-schema.js";
import {
  DISCOVERY_GRAPHQL_LIMITS,
  inspectDiscoveryOperation,
  type DiscoveryOperation,
} from "./graphql-operation.js";
import { createSearchConcurrencyLimiter } from "./search-concurrency.js";

const OUTCOMES = new Set([
  "COMPLETED",
  "PARTIAL",
  "INVALID_INPUT",
  "CURSOR_EXPIRED",
  "STALE",
  "UNAVAILABLE",
  "CANCELLED",
  "INDETERMINATE",
  "LIMIT_EXCEEDED",
  "FORBIDDEN",
]);

export interface DiscoveryOperationTrace {
  readonly correlationId: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly operation: DiscoveryOperation | "rejected";
  readonly code: string;
  readonly durationMs: number;
}

export interface DiscoverySubgraphOptions {
  readonly routerTrust: AsterLocalRouterTrust;
  readonly search: ReturnType<typeof createTitleSearch>;
  readonly home: ReturnType<typeof createHomeRails>;
  readonly now: () => number;
  readonly monotonicNow?: () => number;
  readonly onOperation?: (trace: DiscoveryOperationTrace) => void;
  readonly onDiagnostic?: (code: "graphql_engine_error" | "graphql_engine_warning") => void;
  readonly onLimit?: (metric: AsterOperationLimitMetricInput) => unknown;
}

export async function createDiscoverySubgraph(options: DiscoverySubgraphOptions) {
  const schema = createDiscoverySchema();
  const contexts = new WeakMap<IncomingMessage, DiscoveryGraphqlContext>();
  const errorCorrelations = new WeakMap<object, string>();
  const now = options.monotonicNow ?? (() => performance.now());
  const searchConcurrency = createSearchConcurrencyLimiter({
    monotonicNow: now,
    ...(options.onLimit ? { recordMetric: options.onLimit } : {}),
  });
  const lane = {
    credit: DISCOVERY_GRAPHQL_LIMITS.rateBurst as number,
    refreshedAt: now(),
    controllers: new Set<AbortController>(),
  };
  const unavailable = (): boolean =>
    closed || lane.controllers.size >= DISCOVERY_GRAPHQL_LIMITS.concurrent;
  let closed = false;
  let stopping: Promise<void> | undefined;
  const pending = new Set<Promise<unknown>>();

  const diagnostic = (code: "graphql_engine_error" | "graphql_engine_warning"): void => {
    try {
      options.onDiagnostic?.(code);
    } catch {
      // Observation cannot alter a search result.
    }
  };
  const sanitizedError = (
    _formatted: GraphQLFormattedError,
    error: unknown,
  ): GraphQLFormattedError => {
    const original = unwrapResolverError(error);
    const code =
      original instanceof DiscoveryGraphqlError && OUTCOMES.has(String(original.extensions["code"]))
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
      message: "Discovery operation rejected.",
      extensions: { code, ...(correlationId ? { correlationId } : {}) },
    };
  };
  const server = new ApolloServer<DiscoveryGraphqlContext>({
    schema,
    introspection: false,
    documentStore: null,
    persistedQueries: false,
    allowBatchedHttpRequests: false,
    stopOnTerminationSignals: false,
    includeStacktraceInErrorResponses: false,
    hideSchemaDetailsFromClientErrors: true,
    maxRecursiveSelections: DISCOVERY_GRAPHQL_LIMITS.fields,
    parseOptions: { maxTokens: DISCOVERY_GRAPHQL_LIMITS.tokens },
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
        throw new DiscoveryGraphqlError("UNAVAILABLE");
      }
      return Promise.resolve(context);
    },
  });

  const middleware: AsterExpressGraphqlMiddleware = async (request, response, onError) => {
    const routerContext = options.routerTrust.accept(request);
    const startedAt = now();
    const correlationId = routerContext?.correlationId ?? randomUUID();
    const traceId = routerContext?.traceId ?? randomUUID().replaceAll("-", "");
    const spanId = randomUUID().replaceAll("-", "").slice(0, 16);
    let operation: DiscoveryOperation | "rejected" = "rejected";
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
            { message: "Discovery operation rejected.", extensions: { code, correlationId } },
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
    if (unavailable()) {
      reject(503, "UNAVAILABLE");
      record();
      return;
    }
    lane.credit = Math.min(
      DISCOVERY_GRAPHQL_LIMITS.rateBurst,
      lane.credit +
        (Math.max(0, startedAt - lane.refreshedAt) * DISCOVERY_GRAPHQL_LIMITS.ratePerSecond) /
          1_000,
    );
    lane.refreshedAt = startedAt;
    if (lane.credit < 1) {
      response.set("Retry-After", "1");
      reject(429, "LIMIT_EXCEEDED");
      record();
      return;
    }
    lane.credit -= 1;
    const decision = inspectDiscoveryOperation(request.body as unknown);
    if (decision.status !== "accepted") {
      reject(400, decision.code);
      record();
      return;
    }
    operation = decision.operation;
    const requestSignal = getExpressRequestAbortSignal(response);
    const searchPermit =
      operation === "search_titles" ? await searchConcurrency.acquire(requestSignal) : undefined;
    if (searchPermit && searchPermit.status !== "acquired") {
      if (searchPermit.status === "rejected") {
        response.set("Retry-After", "1");
        reject(429, "LIMIT_EXCEEDED");
      } else {
        reject(503, searchPermit.status === "cancelled" ? "CANCELLED" : "UNAVAILABLE");
      }
      record();
      return;
    }
    if (unavailable()) {
      searchPermit?.release();
      reject(503, "UNAVAILABLE");
      record();
      return;
    }
    const controller = new AbortController();
    lane.controllers.add(controller);
    const signal = AbortSignal.any([requestSignal, controller.signal]);
    const context = createDiscoveryGraphqlContext(
      options.search,
      options.home,
      options.now,
      signal,
      correlationId,
      typeof request.headers["traceparent"] === "string"
        ? request.headers["traceparent"]
        : undefined,
    );
    contexts.set(request, context);
    const timer = setTimeout(() => {
      controller.abort();
      reject(503, "CANCELLED");
    }, DISCOVERY_GRAPHQL_LIMITS.deadlineMs);
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
      lane.controllers.delete(controller);
      pending.delete(execution);
      searchPermit?.release();
      record();
    }
  };

  return Object.freeze({
    schema,
    middleware,
    stop(): Promise<void> {
      if (!stopping) {
        closed = true;
        searchConcurrency.close();
        for (const controller of lane.controllers) {
          controller.abort();
        }
        stopping = Promise.allSettled([...pending]).then(() => server.stop());
      }
      return stopping;
    },
  });
}
