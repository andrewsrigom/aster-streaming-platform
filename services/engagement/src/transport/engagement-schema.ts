import { buildSubgraphSchema } from "@apollo/subgraph";
import { parse } from "graphql";
import type { createProgressRecorder } from "../application/record-progress.js";
import type { createProgressQueries } from "../application/read-progress.js";
import { progressIdentifier, progressRecord, type ProgressState } from "../domain/progress.js";
import type { ProgressListKind } from "../domain/progress-page.js";
import type { createWatchlistWriter } from "../application/set-watchlist.js";
import type { createWatchlistQueries } from "../application/read-watchlist.js";
import type { createEngagementFieldQueries } from "../application/read-engagement-fields.js";
import { createEngagementFieldLoaders } from "./engagement-field-loaders.js";
import { EngagementGraphqlError } from "./engagement-error.js";
export { EngagementGraphqlError } from "./engagement-error.js";

const ENGAGEMENT_TYPE_DEFS = parse(`
  extend schema
    @link(
      url: "https://specs.apollo.dev/federation/v2.9"
      import: ["@key", "@cost", "@listSize"]
    )
  enum ProgressStatus { NOT_STARTED IN_PROGRESS COMPLETED }
  enum ProgressCode {
    COMPLETED INVALID_INPUT UNAUTHENTICATED NOT_FOUND NOT_PLAYABLE
    STALE CONFLICT BACKPRESSURE LIMIT_EXCEEDED UNAVAILABLE CANCELLED INDETERMINATE
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
  type Title @key(fields: "id") {
    id: ID!
    progress(profileId: ID!): Progress @cost(weight: 8)
    inWatchlist(profileId: ID!): Boolean @cost(weight: 6)
  }
  type Profile @key(fields: "id") {
    id: ID!
    progress(titleId: ID!): Progress @cost(weight: 8)
    inWatchlist(titleId: ID!): Boolean @cost(weight: 6)
  }
  type ProgressEdge { cursor: String! node: Progress! }
  type ProgressPageInfo { endCursor: String hasNextPage: Boolean! }
  type ProgressConnection {
    edges: [ProgressEdge!]! @listSize(assumedSize: 20)
    pageInfo: ProgressPageInfo!
  }
  type ProgressPagePayload { code: ProgressCode! correlationId: ID! connection: ProgressConnection }
  type Query {
    progressHistory(profileId: ID!, first: Int! = 20, after: String): ProgressPagePayload! @cost(weight: 12)
    continueWatching(profileId: ID!, first: Int! = 20, after: String): ProgressPagePayload! @cost(weight: 12)
    homeContinueWatching(profileId: ID!, first: Int! = 10, after: String): ProgressPagePayload @cost(weight: 12)
    watchlist(profileId: ID!, first: Int! = 20, after: String): WatchlistPagePayload! @cost(weight: 12)
  }
  type ProgressPayload {
    code: ProgressCode!
    correlationId: ID!
    retryAfterMs: Int
    progress: Progress
  }
  enum WatchlistCode {
    COMPLETED INVALID_INPUT UNAUTHENTICATED NOT_FOUND NOT_VISIBLE
    CONFLICT BACKPRESSURE LIMIT_EXCEEDED UNAVAILABLE CANCELLED INDETERMINATE
  }
  input SetWatchlistInput { profileId: ID! titleId: ID! idempotencyKey: ID! present: Boolean! }
  type WatchlistChange {
    id: ID! profileId: ID! titleId: ID! present: Boolean! version: Int! updatedAt: Float!
  }
  type WatchlistEntry { id: ID! profileId: ID! titleId: ID! addedAt: Float! title: Title }
  type WatchlistEdge { cursor: String! node: WatchlistEntry! }
  type WatchlistConnection {
    edges: [WatchlistEdge!]! @listSize(assumedSize: 20)
    pageInfo: ProgressPageInfo!
  }
  type WatchlistPagePayload { code: WatchlistCode! correlationId: ID! connection: WatchlistConnection }
  type WatchlistPayload {
    code: WatchlistCode!
    correlationId: ID!
    retryAfterMs: Int
    change: WatchlistChange
  }
  type Mutation {
    recordProgress(input: RecordProgressInput!): ProgressPayload! @cost(weight: 20)
    setWatchlist(input: SetWatchlistInput!): WatchlistPayload! @cost(weight: 18)
  }
`);
export interface EngagementWatchlist {
  readonly writer: ReturnType<typeof createWatchlistWriter>;
  readonly queries: ReturnType<typeof createWatchlistQueries>;
}
export interface EngagementGraphqlContext {
  readonly signal: AbortSignal;
  readonly credential: string | undefined;
  readonly correlationId: string;
  readonly traceparent?: string;
  readonly recorder: ReturnType<typeof createProgressRecorder>;
  readonly queries?: ReturnType<typeof createProgressQueries>;
  readonly watchlist?: EngagementWatchlist;
  readonly fields?: ReturnType<typeof createEngagementFieldLoaders>;
  readonly outcome: { code: string };
  readonly setRetryAfter: (retryAfterMs: number | undefined) => void;
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
  fields?: ReturnType<typeof createEngagementFieldQueries>,
  setRetryAfter: (retryAfterMs: number | undefined) => void = () => undefined,
): EngagementGraphqlContext {
  const context: EngagementGraphqlContext = {
    recorder,
    signal,
    correlationId,
    credential,
    ...(traceparent ? { traceparent } : {}),
    ...(queries ? { queries } : {}),
    ...(watchlist ? { watchlist } : {}),
    ...(fields
      ? {
          fields: createEngagementFieldLoaders(fields, {
            signal,
            credential,
            correlationId,
            ...(traceparent ? { traceparent } : {}),
          }),
        }
      : {}),
    outcome: { code: "COMPLETED" },
    setRetryAfter,
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

function publicRetryAfter(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(30_000, Math.max(1, Math.ceil(value)))
    : 1_000;
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
function entityResolvers(kind: "Title" | "Profile") {
  const reference = (value: unknown, raw: unknown) => {
    owned(raw);
    const key = progressRecord(value, ["__typename", "id"]);
    if (!key || key["__typename"] !== kind || !progressIdentifier(key["id"])) {
      throw new EngagementGraphqlError("INVALID_INPUT");
    }
    return { __typename: kind, id: key["id"] };
  };
  const resolve =
    (name: "progress" | "inWatchlist") =>
    async (parent: unknown, args: { profileId?: string; titleId?: string }, raw: unknown) => {
      const context = owned(raw);
      if (!context.fields) {
        throw new EngagementGraphqlError("UNAVAILABLE");
      }
      const key = reference(parent, raw);
      const pair =
        kind === "Title"
          ? { profileId: args.profileId ?? "", titleId: key.id }
          : { profileId: key.id, titleId: args.titleId ?? "" };
      if (name === "inWatchlist") {
        return context.fields.inWatchlist(pair);
      }
      const value = await context.fields.progress(pair);
      return value ? publicProgress(value) : null;
    };
  return {
    __resolveReference: reference,
    progress: resolve("progress"),
    inWatchlist: resolve("inWatchlist"),
  };
}

export function createEngagementSchema() {
  return buildSubgraphSchema({
    typeDefs: ENGAGEMENT_TYPE_DEFS,
    resolvers: {
      Title: entityResolvers("Title"),
      Profile: entityResolvers("Profile"),
      Query: {
        progressHistory: pageResolver("history"),
        continueWatching: pageResolver("continue"),
        homeContinueWatching: pageResolver("continue"),
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
          const retryAfterMs =
            result.status === "limit_exceeded" ? publicRetryAfter(result.retryAfterMs) : null;
          if (result.status === "limit_exceeded") {
            context.setRetryAfter(retryAfterMs ?? undefined);
          }
          const value = result.status === "completed" ? result.value : null;
          return {
            code: context.outcome.code,
            correlationId: context.correlationId,
            retryAfterMs,
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
          const retryAfterMs =
            result.status === "limit_exceeded" ? publicRetryAfter(result.retryAfterMs) : null;
          if (result.status === "limit_exceeded") {
            context.setRetryAfter(retryAfterMs ?? undefined);
          }
          return {
            code: context.outcome.code,
            correlationId: context.correlationId,
            retryAfterMs,
            progress: result.status === "completed" ? publicProgress(result.value) : null,
          };
        },
      },
    },
  });
}
