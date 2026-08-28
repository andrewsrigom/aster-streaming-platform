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
  type AsterExpressGraphqlMiddleware,
  type AsterLocalRouterTrust,
} from "@aster/http-express";
import { GraphQLError, type GraphQLFormattedError } from "graphql";

import type { CatalogPublicQueries } from "../application/public-queries.js";
import type { CatalogPlaybackQueries } from "../application/playback-queries.js";
import type { CatalogEngagementQueries } from "../application/engagement-queries.js";
import { inspectCatalogEngagementOperation } from "./engagement-operation.js";
import { inspectCatalogPlaybackOperation } from "./playback-operation.js";
import {
  CATALOG_GRAPHQL_LIMITS,
  inspectCatalogOperation,
  type CatalogOperation,
} from "./graphql-operation.js";
import {
  createCatalogGraphqlContext,
  createCatalogSchema,
  CatalogGraphqlError,
  type CatalogGraphqlContext,
} from "./catalog-schema.js";

const OUTCOMES = new Set([
  "COMPLETED",
  "UNAVAILABLE",
  "CANCELLED",
  "LIMIT_EXCEEDED",
  "INVALID_INPUT",
  "FORBIDDEN",
]);

export interface CatalogOperationTrace {
  readonly correlationId: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly operation: CatalogOperation | "rejected";
  readonly code: string;
  readonly durationMs: number;
}

export interface CatalogSubgraphOptions {
  readonly routerTrust?: AsterLocalRouterTrust;
  readonly queries: CatalogPublicQueries;
  readonly playback?: Readonly<{
    trust: AsterLocalRouterTrust;
    queries: CatalogPlaybackQueries;
  }>;
  readonly engagement?: Readonly<{
    trust: AsterLocalRouterTrust;
    queries: CatalogEngagementQueries;
  }>;
  readonly monotonicNow?: () => number;
  readonly onOperation?: (trace: CatalogOperationTrace) => void;
  readonly onDiagnostic?: (code: "graphql_engine_error" | "graphql_engine_warning") => void;
}

export async function createCatalogSubgraph(options: CatalogSubgraphOptions) {
  if ((options.playback || options.engagement) && !options.routerTrust) {
    throw new Error("Catalog owner reads require protected transport.");
  }
  const schema = createCatalogSchema();
  const contexts = new WeakMap<IncomingMessage, CatalogGraphqlContext>();
  const errorCorrelations = new WeakMap<object, string>();
  const now = options.monotonicNow ?? (() => performance.now());
  let credit: number = CATALOG_GRAPHQL_LIMITS.rateBurst;
  let refreshedAt = now();
  let engagementCredit = 32;
  let engagementRefreshedAt = now();
  let closed = false;
  let stopping: Promise<void> | undefined;
  const controllers = new Set<AbortController>();
  const engagementControllers = new Set<AbortController>();
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
      original instanceof CatalogGraphqlError && OUTCOMES.has(String(original.extensions["code"]))
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
      message: "Catalog operation rejected.",
      extensions: { code, ...(correlationId ? { correlationId } : {}) },
    };
  };
  const server = new ApolloServer<CatalogGraphqlContext>({
    schema,
    introspection: false,
    documentStore: null,
    persistedQueries: false,
    allowBatchedHttpRequests: false,
    stopOnTerminationSignals: false,
    includeStacktraceInErrorResponses: false,
    hideSchemaDetailsFromClientErrors: true,
    maxRecursiveSelections: CATALOG_GRAPHQL_LIMITS.fields,
    parseOptions: { maxTokens: CATALOG_GRAPHQL_LIMITS.tokens },
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
        throw new CatalogGraphqlError("UNAVAILABLE");
      }
      return Promise.resolve(context);
    },
  });

  const middleware: AsterExpressGraphqlMiddleware = async (request, response, onError) => {
    const routerContext = options.routerTrust?.accept(request);
    const playbackContext = options.playback?.trust.accept(request);
    const engagementContext = options.engagement?.trust.accept(request);
    const startedAt = now();
    const correlationId = engagementContext?.correlationId ?? randomUUID();
    const traceId =
      routerContext?.traceId ??
      playbackContext?.traceId ??
      engagementContext?.traceId ??
      randomUUID().replaceAll("-", "");
    const spanId = randomUUID().replaceAll("-", "").slice(0, 16);
    let operation: CatalogOperation | "rejected" = "rejected";
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
          errors: [{ message: "Catalog operation rejected.", extensions: { code, correlationId } }],
        });
      }
    };
    response.set("X-Request-Id", correlationId);
    response.set("Cache-Control", "no-store");
    if (options.routerTrust && !routerContext && !playbackContext && !engagementContext) {
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
    const lane = engagementContext ? engagementControllers : controllers;
    if (closed || lane.size >= (engagementContext ? 1 : CATALOG_GRAPHQL_LIMITS.concurrent)) {
      reject(503, "UNAVAILABLE");
      record();
      return;
    }
    if (engagementContext) {
      engagementCredit = Math.min(
        32,
        engagementCredit + (Math.max(0, startedAt - engagementRefreshedAt) * 4) / 1000,
      );
      engagementRefreshedAt = startedAt;
    } else {
      credit = Math.min(
        CATALOG_GRAPHQL_LIMITS.rateBurst,
        credit +
          (Math.max(0, startedAt - refreshedAt) * CATALOG_GRAPHQL_LIMITS.ratePerSecond) / 1_000,
      );
      refreshedAt = startedAt;
    }
    if ((engagementContext ? engagementCredit : credit) < 1) {
      response.set("Retry-After", "1");
      reject(429, "LIMIT_EXCEEDED");
      record();
      return;
    }
    if (engagementContext) {
      engagementCredit -= 1;
    } else {
      credit -= 1;
    }
    const decision = engagementContext
      ? inspectCatalogEngagementOperation(request.body as unknown)
      : playbackContext
        ? inspectCatalogPlaybackOperation(request.body as unknown)
        : inspectCatalogOperation(request.body as unknown, schema);
    if (decision.status !== "accepted") {
      reject(400, decision.code);
      record();
      return;
    }
    operation = decision.operation;
    const controller = new AbortController();
    lane.add(controller);
    const signal = AbortSignal.any([getExpressRequestAbortSignal(response), controller.signal]);
    const context = createCatalogGraphqlContext(
      options.queries,
      signal,
      correlationId,
      playbackContext ? options.playback?.queries : undefined,
      engagementContext ? options.engagement?.queries : undefined,
    );
    contexts.set(request, context);
    const timer = setTimeout(
      () => {
        controller.abort();
        reject(503, "CANCELLED");
      },
      engagementContext ? 2000 : CATALOG_GRAPHQL_LIMITS.deadlineMs,
    );
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
      lane.delete(controller);
      pending.delete(execution);
      context.titles.clearAll();
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
        for (const controller of [...controllers, ...engagementControllers]) {
          controller.abort();
        }
        stopping = Promise.allSettled([...pending]).then(() => server.stop());
      }
      return stopping;
    },
  });
}
