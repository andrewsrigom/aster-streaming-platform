import { buildSubgraphSchema } from "@apollo/subgraph";
import { GraphQLError, parse } from "graphql";
import type { createProgressRecorder } from "../application/record-progress.js";
import type { createProgressQueries } from "../application/read-progress.js";
import type { ProgressState } from "../domain/progress.js";
import type { ProgressListKind } from "../domain/progress-page.js";
import type { createWatchlistWriter } from "../application/set-watchlist.js";
import type { createWatchlistQueries } from "../application/read-watchlist.js";

const ENGAGEMENT_TYPE_DEFS = parse(`
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])
  enum ProgressStatus { NOT_STARTED IN_PROGRESS COMPLETED }
  enum ProgressCode {
    COMPLETED INVALID_INPUT UNAUTHENTICATED NOT_FOUND NOT_PLAYABLE
    STALE CONFLICT BACKPRESSURE UNAVAILABLE CANCELLED INDETERMINATE
  }
  input RecordProgressInput {
    profileId: ID! titleId: ID! playbackSessionId: ID! idempotencyKey: ID!
    sequence: Int! positionMs: Int! durationMs: Int! occurredAt: Float!
  }
  type Progress {
    id: ID! profileId: ID! titleId: ID! sequence: Int! version: Int!
    positionMs: Int! durationMs: Int! status: ProgressStatus! occurredAt: Float! updatedAt: Float!
    title: Title
  }
  type Title @key(fields: "id", resolvable: false) { id: ID! }
  type ProgressEdge { cursor: String! node: Progress! }
  type ProgressPageInfo { endCursor: String hasNextPage: Boolean! }
  type ProgressConnection { edges: [ProgressEdge!]! pageInfo: ProgressPageInfo! }
  type ProgressPagePayload { code: ProgressCode! correlationId: ID! connection: ProgressConnection }
  type Query {
    progressHistory(profileId: ID!, first: Int! = 20, after: String): ProgressPagePayload!
    continueWatching(profileId: ID!, first: Int! = 20, after: String): ProgressPagePayload!
    watchlist(profileId: ID!, first: Int! = 20, after: String): WatchlistPagePayload!
  }
  type ProgressPayload { code: ProgressCode! correlationId: ID! progress: Progress }
  enum WatchlistCode {
    COMPLETED INVALID_INPUT UNAUTHENTICATED NOT_FOUND NOT_VISIBLE
    CONFLICT BACKPRESSURE UNAVAILABLE CANCELLED INDETERMINATE
  }
  input SetWatchlistInput { profileId: ID! titleId: ID! idempotencyKey: ID! present: Boolean! }
  type WatchlistChange {
    id: ID! profileId: ID! titleId: ID! present: Boolean! version: Int! updatedAt: Float!
  }
  type WatchlistEntry { id: ID! profileId: ID! titleId: ID! addedAt: Float! title: Title }
  type WatchlistEdge { cursor: String! node: WatchlistEntry! }
  type WatchlistConnection { edges: [WatchlistEdge!]! pageInfo: ProgressPageInfo! }
  type WatchlistPagePayload { code: WatchlistCode! correlationId: ID! connection: WatchlistConnection }
  type WatchlistPayload { code: WatchlistCode! correlationId: ID! change: WatchlistChange }
  type Mutation {
    recordProgress(input: RecordProgressInput!): ProgressPayload!
    setWatchlist(input: SetWatchlistInput!): WatchlistPayload!
  }
`);
export interface EngagementWatchlist {
  readonly writer: ReturnType<typeof createWatchlistWriter>;
  readonly queries: ReturnType<typeof createWatchlistQueries>;
}
export class EngagementGraphqlError extends GraphQLError {
  constructor(code: string) {
    super("Engagement operation rejected.", { extensions: { code } });
  }
}
export interface EngagementGraphqlContext {
  readonly signal: AbortSignal;
  readonly credential: string | undefined;
  readonly correlationId: string;
  readonly traceparent?: string;
  readonly recorder: ReturnType<typeof createProgressRecorder>;
  readonly queries?: ReturnType<typeof createProgressQueries>;
  readonly watchlist?: EngagementWatchlist;
  readonly outcome: { code: string };
}
const OWNER = Symbol("engagement-request-owner");
const contexts = new WeakSet<object>();
function owned(value: unknown): EngagementGraphqlContext {
  const context: unknown =
    typeof value === "object" && value !== null
      ? Object.getOwnPropertyDescriptor(value, OWNER)?.value
      : undefined;
  if (typeof context !== "object" || context === null || !contexts.has(context)) {
    throw new EngagementGraphqlError("UNAVAILABLE");
  }
  const result = context as EngagementGraphqlContext;
  if (result.signal.aborted) {
    throw new EngagementGraphqlError("CANCELLED");
  }
  return result;
}
export function createEngagementGraphqlContext(
  recorder: ReturnType<typeof createProgressRecorder>,
  signal: AbortSignal,
  correlationId: string,
  credential: string | undefined,
  traceparent?: string,
  queries?: ReturnType<typeof createProgressQueries>,
  watchlist?: EngagementWatchlist,
): EngagementGraphqlContext {
  const context: EngagementGraphqlContext = {
    recorder,
    signal,
    correlationId,
    credential,
    ...(traceparent ? { traceparent } : {}),
    ...(queries ? { queries } : {}),
    ...(watchlist ? { watchlist } : {}),
    outcome: { code: "COMPLETED" },
  };
  contexts.add(context);
  Object.defineProperty(context, OWNER, { value: context, enumerable: true });
  return context;
}

function publicProgress(value: ProgressState) {
  return {
    id: value.id,
    profileId: value.profileId,
    titleId: value.titleId,
    sequence: value.sequence,
    version: value.version,
    positionMs: value.positionMs,
    durationMs: value.durationMs,
    status: value.status,
    occurredAt: value.occurredAt,
    updatedAt: value.updatedAt,
    title: { __typename: "Title", id: value.titleId },
  };
}

function pageResolver(kind: ProgressListKind) {
  return async (
    _: unknown,
    args: { profileId: string; first: number; after?: string | null },
    raw: unknown,
  ) => {
    const context = owned(raw);
    if (!context.queries) {
      throw new EngagementGraphqlError("UNAVAILABLE");
    }
    const result = await context.queries.page(
      kind,
      { ...args, after: args.after ?? null },
      context,
    );
    if (context.signal.aborted) {
      throw new EngagementGraphqlError("CANCELLED");
    }
    context.outcome.code = result.status.toUpperCase();
    return {
      code: context.outcome.code,
      correlationId: context.correlationId,
      connection:
        result.status === "completed"
          ? {
              edges: result.value.edges.map((edge) => ({
                cursor: edge.cursor,
                node: publicProgress(edge.node),
              })),
              pageInfo: result.value.pageInfo,
            }
          : null,
    };
  };
}
export function createEngagementSchema() {
  return buildSubgraphSchema({
    typeDefs: ENGAGEMENT_TYPE_DEFS,
    resolvers: {
      Query: {
        progressHistory: pageResolver("history"),
        continueWatching: pageResolver("continue"),
        watchlist: async (
          _: unknown,
          args: { profileId: string; first: number; after?: string | null },
          raw: unknown,
        ) => {
          const context = owned(raw);
          if (!context.watchlist) {
            throw new EngagementGraphqlError("UNAVAILABLE");
          }
          const result = await context.watchlist.queries.page(
            { ...args, after: args.after ?? null },
            context,
          );
          if (context.signal.aborted) {
            throw new EngagementGraphqlError("CANCELLED");
          }
          context.outcome.code = result.status.toUpperCase();
          return {
            code: context.outcome.code,
            correlationId: context.correlationId,
            connection:
              result.status === "completed"
                ? {
                    edges: result.value.edges.map(({ cursor, node }) => ({
                      cursor,
                      node: {
                        id: node.id,
                        profileId: node.profileId,
                        titleId: node.titleId,
                        addedAt: node.addedAt,
                        title: { __typename: "Title", id: node.titleId },
                      },
                    })),
                    pageInfo: result.value.pageInfo,
                  }
                : null,
          };
        },
      },
      Mutation: {
        setWatchlist: async (_: unknown, args: { input: unknown }, raw: unknown) => {
          const context = owned(raw);
          if (!context.watchlist) {
            throw new EngagementGraphqlError("UNAVAILABLE");
          }
          const result = await context.watchlist.writer.set(args.input, context);
          if (context.signal.aborted) {
            throw new EngagementGraphqlError("CANCELLED");
          }
          context.outcome.code = result.status.toUpperCase();
          const value = result.status === "completed" ? result.value : null;
          return {
            code: context.outcome.code,
            correlationId: context.correlationId,
            change: value
              ? {
                  id: value.id,
                  profileId: value.profileId,
                  titleId: value.titleId,
                  present: value.present,
                  version: value.version,
                  updatedAt: value.updatedAt,
                }
              : null,
          };
        },
        recordProgress: async (_: unknown, args: { input: unknown }, raw: unknown) => {
          const context = owned(raw);
          const result = await context.recorder.record(args.input, context);
          if (context.signal.aborted) {
            throw new EngagementGraphqlError("CANCELLED");
          }
          context.outcome.code = result.status.toUpperCase();
          return {
            code: context.outcome.code,
            correlationId: context.correlationId,
            progress: result.status === "completed" ? publicProgress(result.value) : null,
          };
        },
      },
    },
  });
}
