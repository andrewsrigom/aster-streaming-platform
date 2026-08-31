import { buildSubgraphSchema } from "@apollo/subgraph";
import { GraphQLError, parse } from "graphql";
import type { PlaybackSessions } from "../application/create-session.js";
import type { createPlaybackSessionInspector } from "../application/inspect-session.js";

export const PLAYBACK_TYPE_DEFS = parse(`
  extend schema
    @link(
      url: "https://specs.apollo.dev/federation/v2.9"
      import: ["@inaccessible", "@cost", "@listSize"]
    )
  enum PlaybackSessionCode {
    COMPLETED INVALID_INPUT NOT_PLAYABLE UNAVAILABLE CANCELLED INDETERMINATE LIMIT_EXCEEDED
  }
  type PlaybackSession {
    id: ID!
    titleId: ID!
    manifestUrl: String!
    expiresAt: Float!
  }
  type EngagementSessionAuthority @inaccessible {
    code: PlaybackSessionCode! sessionId: ID titleId: ID checkedAt: Float createdAt: Float expiresAt: Float
  }
  type Query {
    _engagementSession(sessionId: ID!, titleId: ID!): EngagementSessionAuthority! @inaccessible
  }
  type PlaybackSessionPayload {
    code: PlaybackSessionCode!
    correlationId: ID!
    session: PlaybackSession
  }
  type Mutation {
    createPlaybackSession(titleId: ID!): PlaybackSessionPayload! @cost(weight: 24)
  }
`);

export class PlaybackGraphqlError extends GraphQLError {
  constructor(code: string) {
    super("Playback operation rejected.", { extensions: { code } });
  }
}

export interface PlaybackGraphqlContext {
  readonly signal: AbortSignal;
  readonly correlationId: string;
  readonly traceparent?: string;
  readonly sessions: PlaybackSessions;
  readonly engagement?: ReturnType<typeof createPlaybackSessionInspector>;
  readonly outcome: { code: string };
}
const OWNER = Symbol("playback-request-owner");
const contexts = new WeakSet<object>();

function owned(raw: unknown): PlaybackGraphqlContext {
  const value: unknown =
    typeof raw === "object" && raw !== null
      ? Object.getOwnPropertyDescriptor(raw, OWNER)?.value
      : undefined;
  if (typeof value !== "object" || value === null || !contexts.has(value)) {
    throw new PlaybackGraphqlError("UNAVAILABLE");
  }
  const context = value as PlaybackGraphqlContext;
  if (context.signal.aborted) {
    throw new PlaybackGraphqlError("CANCELLED");
  }
  return context;
}

export function createPlaybackGraphqlContext(
  sessions: PlaybackSessions,
  signal: AbortSignal,
  correlationId: string,
  traceparent?: string,
  engagement?: ReturnType<typeof createPlaybackSessionInspector>,
): PlaybackGraphqlContext {
  const context: PlaybackGraphqlContext = {
    sessions,
    ...(engagement ? { engagement } : {}),
    signal,
    correlationId,
    ...(traceparent ? { traceparent } : {}),
    outcome: { code: "COMPLETED" },
  };
  Object.defineProperty(context, OWNER, { value: context, enumerable: true });
  contexts.add(context);
  return context;
}

export function createPlaybackSchema() {
  return buildSubgraphSchema({
    typeDefs: PLAYBACK_TYPE_DEFS,
    resolvers: {
      Query: {
        _engagementSession: async (
          _: unknown,
          args: { sessionId: unknown; titleId: unknown },
          raw: unknown,
        ) => {
          const context = owned(raw);
          if (!context.engagement) {
            throw new PlaybackGraphqlError("FORBIDDEN");
          }
          const result = await context.engagement.inspect(
            args.sessionId,
            args.titleId,
            context.signal,
          );
          context.outcome.code = result.status.toUpperCase();
          return {
            code: context.outcome.code,
            ...(result.status === "completed" ? result.value : {}),
          };
        },
      },
      Mutation: {
        createPlaybackSession: async (_: unknown, args: { titleId: unknown }, raw: unknown) => {
          const context = owned(raw);
          const result = await context.sessions.create(args.titleId, context);
          if (context.signal.aborted) {
            throw new PlaybackGraphqlError("CANCELLED");
          }
          context.outcome.code = result.status.toUpperCase();
          return {
            code: context.outcome.code,
            correlationId: context.correlationId,
            session:
              result.status === "completed"
                ? {
                    id: result.value.id,
                    titleId: result.value.titleId,
                    manifestUrl: result.value.manifestUrl,
                    expiresAt: result.value.expiresAt,
                  }
                : null,
          };
        },
      },
    },
  });
}
