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

import type { LocalIdentityConfiguration } from "../infrastructure/identity/local-identity.js";

import { createLocalSessionTransport } from "./local-session.js";
import { inspectIdentityEngagementOperation } from "./engagement-operation.js";
import {
  IDENTITY_GRAPHQL_LIMITS,
  inspectIdentityOperation,
  type IdentityOperation,
} from "./graphql-operation.js";
import {
  createIdentityGraphqlContext,
  createIdentitySchema,
  IdentityGraphqlError,
  type IdentityGraphqlApplications,
  type IdentityGraphqlContext,
} from "./identity-schema.js";

const OUTCOMES = new Set([
  "COMPLETED",
  "UNAUTHENTICATED",
  "UNAVAILABLE",
  "CANCELLED",
  "INDETERMINATE",
  "LIMIT_EXCEEDED",
  "INVALID_INPUT",
  "NOT_FOUND",
  "CONFLICT",
  "BACKPRESSURE",
]);

export interface IdentityOperationTrace {
  readonly correlationId: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly operation: IdentityOperation | "rejected";
  readonly code: string;
  readonly durationMs: number;
}

export interface IdentitySubgraphOptions {
  readonly routerTrust?: AsterLocalRouterTrust;
  readonly engagementTrust?: AsterLocalRouterTrust;
  readonly configuration: LocalIdentityConfiguration;
  readonly applications: IdentityGraphqlApplications;
  readonly nowSeconds?: () => number;
  readonly monotonicNow?: () => number;
  readonly onOperation?: (trace: IdentityOperationTrace) => void;
  readonly onDiagnostic?: (code: "graphql_engine_error" | "graphql_engine_warning") => void;
}

export async function createIdentitySubgraph(options: IdentitySubgraphOptions) {
  const policy = createLocalSessionTransport(
    options.configuration,
    options.nowSeconds,
    options.routerTrust,
    options.engagementTrust,
  );
  const schema = createIdentitySchema();
  const contexts = new WeakMap<IncomingMessage, IdentityGraphqlContext>();
  const errorCorrelations = new WeakMap<object, string>();
  const now = options.monotonicNow ?? (() => performance.now());
  let credit: number = IDENTITY_GRAPHQL_LIMITS.rateBurst;
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
      original instanceof IdentityGraphqlError && OUTCOMES.has(String(original.extensions["code"]))
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
      message: "Identity operation rejected.",
      extensions: { code, ...(correlationId ? { correlationId } : {}) },
    };
  };
  const server = new ApolloServer<IdentityGraphqlContext>({
    schema,
    introspection: false,
    documentStore: null,
    persistedQueries: false,
    allowBatchedHttpRequests: false,
    stopOnTerminationSignals: false,
    includeStacktraceInErrorResponses: false,
    hideSchemaDetailsFromClientErrors: true,
    maxRecursiveSelections: IDENTITY_GRAPHQL_LIMITS.fields,
    parseOptions: { maxTokens: IDENTITY_GRAPHQL_LIMITS.tokens },
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
                errorCorrelations.set(error, contextValue.request.context.correlationId);
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
        throw new IdentityGraphqlError("UNAVAILABLE");
      }
      return Promise.resolve(context);
    },
  });

  const middleware: AsterExpressGraphqlMiddleware = policy.wrap(
    async (request, response, onError) => {
      const startedAt = now();
      const correlationId = policy.correlationId(request) ?? randomUUID();
      const traceId = policy.traceId(request) ?? randomUUID().replaceAll("-", "");
      const spanId = randomUUID().replaceAll("-", "").slice(0, 16);
      let operation: IdentityOperation | "rejected" = "rejected";
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
              { message: "Identity operation rejected.", extensions: { code, correlationId } },
            ],
          });
        }
      };
      response.set("X-Request-Id", correlationId);
      if (closed || controllers.size >= IDENTITY_GRAPHQL_LIMITS.concurrent) {
        reject(503, "UNAVAILABLE");
        record();
        return;
      }
      credit = Math.min(
        IDENTITY_GRAPHQL_LIMITS.rateBurst,
        credit +
          (Math.max(0, startedAt - refreshedAt) * IDENTITY_GRAPHQL_LIMITS.ratePerSecond) / 1_000,
      );
      refreshedAt = startedAt;
      if (credit < 1) {
        response.set("Retry-After", "1");
        reject(429, "LIMIT_EXCEEDED");
        record();
        return;
      }
      credit -= 1;
      const engagement = policy.isEngagement(request);
      const decision = engagement
        ? inspectIdentityEngagementOperation(request.body as unknown)
        : inspectIdentityOperation(request.body as unknown, schema);
      if (decision.status !== "accepted") {
        reject(400, decision.code);
        record();
        return;
      }
      operation = decision.operation;
      const controller = new AbortController();
      controllers.add(controller);
      const signal = AbortSignal.any([getExpressRequestAbortSignal(response), controller.signal]);
      const assertWritable = (): void => {
        if (signal.aborted || response.headersSent || response.destroyed) {
          throw new IdentityGraphqlError("CANCELLED");
        }
      };
      const context = createIdentityGraphqlContext(
        options.applications,
        {
          credential: policy.credential(request),
          signal,
          context: {
            correlationId,
            causationId: correlationId,
            traceparent: `00-${traceId}-${spanId}-01`,
          },
        },
        {
          issueCookie: (credential, expiresAt) => {
            assertWritable();
            response.set("Set-Cookie", policy.issueCookie(credential, expiresAt));
          },
          clearCookie: () => {
            assertWritable();
            response.set("Set-Cookie", policy.clearCookie());
          },
        },
        engagement,
      );
      contexts.set(request, context);
      const timer = setTimeout(() => {
        controller.abort();
        reject(503, "CANCELLED");
      }, IDENTITY_GRAPHQL_LIMITS.deadlineMs);
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
        context.profile.clearAll();
        // Keep admission until work actually settles, including after a timeout response.
        record();
      }
    },
  );

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
