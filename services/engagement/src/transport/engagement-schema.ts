import { buildSubgraphSchema } from "@apollo/subgraph";
import { GraphQLError, parse } from "graphql";
import type { createProgressRecorder } from "../application/record-progress.js";

const ENGAGEMENT_TYPE_DEFS = parse(`
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.3")
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
  }
  type ProgressPayload { code: ProgressCode! correlationId: ID! progress: Progress }
  type Mutation { recordProgress(input: RecordProgressInput!): ProgressPayload! }
`);
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
): EngagementGraphqlContext {
  const context: EngagementGraphqlContext = {
    recorder,
    signal,
    correlationId,
    credential,
    ...(traceparent ? { traceparent } : {}),
    outcome: { code: "COMPLETED" },
  };
  contexts.add(context);
  Object.defineProperty(context, OWNER, { value: context, enumerable: true });
  return context;
}
export function createEngagementSchema() {
  return buildSubgraphSchema({
    typeDefs: ENGAGEMENT_TYPE_DEFS,
    resolvers: {
      Mutation: {
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
            progress:
              result.status === "completed"
                ? {
                    id: result.value.id,
                    profileId: result.value.profileId,
                    titleId: result.value.titleId,
                    sequence: result.value.sequence,
                    version: result.value.version,
                    positionMs: result.value.positionMs,
                    durationMs: result.value.durationMs,
                    status: result.value.status,
                    occurredAt: result.value.occurredAt,
                    updatedAt: result.value.updatedAt,
                  }
                : null,
          };
        },
      },
    },
  });
}
