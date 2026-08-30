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
import { createAsterDeadline } from "@aster/runtime";
import { GraphQLError, type GraphQLFormattedError } from "graphql";

import type { PlaybackSessions } from "../application/create-session.js";
import type { createPlaybackSessionInspector } from "../application/inspect-session.js";
import { inspectPlaybackEngagementOperation } from "./engagement-operation.js";
import {
  PLAYBACK_GRAPHQL_LIMITS,
  inspectPlaybackOperation,
  type PlaybackOperation,
} from "./graphql-operation.js";
import {
  createPlaybackGraphqlContext,
  createPlaybackSchema,
  PlaybackGraphqlError,
  type PlaybackGraphqlContext,
} from "./playback-schema.js";

const OUTCOMES = new Set([
  "COMPLETED",
  "UNAVAILABLE",
  "CANCELLED",
  "LIMIT_EXCEEDED",
  "INVALID_INPUT",
  "FORBIDDEN",
  "NOT_PLAYABLE",
  "INDETERMINATE",
]);

export interface PlaybackOperationTrace {
  readonly correlationId: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly operation: PlaybackOperation | "rejected";
  readonly code: string;
  readonly durationMs: number;
}

export interface PlaybackSubgraphOptions {
  readonly routerTrust: AsterLocalRouterTrust;
  readonly sessions: PlaybackSessions;
  readonly engagement?: Readonly<{
    trust: AsterLocalRouterTrust;
    inspector: ReturnType<typeof createPlaybackSessionInspector>;
  }>;
  readonly monotonicNow?: () => number;
  readonly onOperation?: (trace: PlaybackOperationTrace) => void;
  readonly onDiagnostic?: (code: "graphql_engine_error" | "graphql_engine_warning") => void;
}

export async function createPlaybackSubgraph(options: PlaybackSubgraphOptions) {
  const schema = createPlaybackSchema();
  const contexts = new WeakMap<IncomingMessage, PlaybackGraphqlContext>();
  const errorCorrelations = new WeakMap<object, string>();
  const now = options.monotonicNow ?? (() => performance.now());
  const publicLane = {
    credit: PLAYBACK_GRAPHQL_LIMITS.rateBurst as number,
    refreshedAt: now(),
    maximum: PLAYBACK_GRAPHQL_LIMITS.concurrent as number,
    controllers: new Set<AbortController>(),
  };
  // Optional reads cannot consume public admission or all four shared SQL connections.
  const privateLane = { ...publicLane, maximum: 1, controllers: new Set<AbortController>() };
  let closed = false;
  let stopping: Promise<void> | undefined;
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
      original instanceof PlaybackGraphqlError && OUTCOMES.has(String(original.extensions["code"]))
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
      message: "Playback operation rejected.",
      extensions: { code, ...(correlationId ? { correlationId } : {}) },
    };
  };
  const server = new ApolloServer<PlaybackGraphqlContext>({
    schema,
    introspection: false,
    documentStore: null,
    persistedQueries: false,
    allowBatchedHttpRequests: false,
    stopOnTerminationSignals: false,
    includeStacktraceInErrorResponses: false,
    hideSchemaDetailsFromClientErrors: true,
    maxRecursiveSelections: PLAYBACK_GRAPHQL_LIMITS.fields,
    parseOptions: { maxTokens: PLAYBACK_GRAPHQL_LIMITS.tokens },
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
        throw new PlaybackGraphqlError("UNAVAILABLE");
      }
      return Promise.resolve(context);
    },
  });

  const middleware: AsterExpressGraphqlMiddleware = async (request, response, onError) => {
    const routerContext = options.routerTrust.accept(request);
    const engagementContext = options.engagement?.trust.accept(request);
    const startedAt = now();
    const correlationId = engagementContext?.correlationId ?? randomUUID();
    const traceId =
      routerContext?.traceId ?? engagementContext?.traceId ?? randomUUID().replaceAll("-", "");
    const spanId = randomUUID().replaceAll("-", "").slice(0, 16);
    let operation: PlaybackOperation | "rejected" = "rejected";
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
            { message: "Playback operation rejected.", extensions: { code, correlationId } },
          ],
        });
      }
    };
    response.set("X-Request-Id", correlationId);
    response.set("Cache-Control", "no-store");
    if (!routerContext && !engagementContext) {
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
    const lane = engagementContext ? privateLane : publicLane;
    if (closed || lane.controllers.size >= lane.maximum) {
      reject(503, "UNAVAILABLE");
      record();
      return;
    }
    lane.credit = Math.min(
      PLAYBACK_GRAPHQL_LIMITS.rateBurst,
      lane.credit +
        (Math.max(0, startedAt - lane.refreshedAt) * PLAYBACK_GRAPHQL_LIMITS.ratePerSecond) / 1_000,
    );
    lane.refreshedAt = startedAt;
    if (lane.credit < 1) {
      response.set("Retry-After", "1");
      reject(429, "LIMIT_EXCEEDED");
      record();
      return;
    }
    lane.credit -= 1;
    const decision = engagementContext
      ? inspectPlaybackEngagementOperation(request.body as unknown)
      : inspectPlaybackOperation(request.body as unknown);
    if (decision.status !== "accepted") {
      reject(400, decision.code);
      record();
      return;
    }
    operation = decision.operation;
    const controller = new AbortController();
    lane.controllers.add(controller);
    const parentSignal = AbortSignal.any([
      getExpressRequestAbortSignal(response),
      controller.signal,
    ]);
    const deadline = createAsterDeadline({
      parentSignal,
      timeoutMs: PLAYBACK_GRAPHQL_LIMITS.deadlineMs,
    });
    const signal = deadline.signal;
    const context = createPlaybackGraphqlContext(
      options.sessions,
      signal,
      correlationId,
      typeof request.headers["traceparent"] === "string"
        ? request.headers["traceparent"]
        : undefined,
      engagementContext ? options.engagement?.inspector : undefined,
    );
    contexts.set(request, context);
    const deadlineReached = (): void => {
      if (!parentSignal.aborted) {
        reject(503, "CANCELLED");
      }
    };
    signal.addEventListener("abort", deadlineReached, { once: true });
    const execution = Promise.resolve().then(() => apollo(request, response, onError));
    pending.add(execution);
    try {
      await execution;
      code = signal.aborted ? "CANCELLED" : context.outcome.code;
    } catch {
      reject(503, signal.aborted ? "CANCELLED" : "UNAVAILABLE");
    } finally {
      signal.removeEventListener("abort", deadlineReached);
      deadline.dispose();
      contexts.delete(request);
      lane.controllers.delete(controller);
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
        for (const controller of [...publicLane.controllers, ...privateLane.controllers]) {
          controller.abort();
        }
        stopping = Promise.allSettled([...pending]).then(() => server.stop());
      }
      return stopping;
    },
  });
}
