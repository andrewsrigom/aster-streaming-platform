import { buildSubgraphSchema } from "@apollo/subgraph";
import { GraphQLError, parse } from "graphql";
import type { PlaybackSessions } from "../application/create-session.js";

export const PLAYBACK_TYPE_DEFS = parse(`
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.3")
  enum PlaybackSessionCode {
    COMPLETED INVALID_INPUT NOT_PLAYABLE UNAVAILABLE CANCELLED INDETERMINATE LIMIT_EXCEEDED
  }
  type PlaybackSession {
    id: ID!
    titleId: ID!
    manifestUrl: String!
    expiresAt: Float!
  }
  type PlaybackSessionPayload {
    code: PlaybackSessionCode!
    correlationId: ID!
    session: PlaybackSession
  }
  type Mutation {
    createPlaybackSession(titleId: ID!): PlaybackSessionPayload!
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
): PlaybackGraphqlContext {
  const context: PlaybackGraphqlContext = {
    sessions,
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
