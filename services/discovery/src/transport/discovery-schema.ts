import { buildSubgraphSchema } from "@apollo/subgraph";
import { GraphQLError, parse } from "graphql";
import type { createTitleSearch } from "../application/search-titles.js";

export const DISCOVERY_TYPE_DEFS = parse(`
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])
  enum DiscoverySearchCode {
    COMPLETED INVALID_INPUT CURSOR_EXPIRED STALE UNAVAILABLE CANCELLED INDETERMINATE
  }
  type Title @key(fields: "id") { id: ID! }
  type DiscoverySearchEdge {
    cursor: String!
    node: Title
    sourceVersion: Int!
    indexedAt: Float!
    visibleUntil: Float!
  }
  type DiscoveryPageInfo { endCursor: String hasNextPage: Boolean! }
  type DiscoverySearchConnection {
    generation: ID!
    edges: [DiscoverySearchEdge!]!
    pageInfo: DiscoveryPageInfo!
  }
  type DiscoverySearchPayload {
    code: DiscoverySearchCode!
    correlationId: ID!
    connection: DiscoverySearchConnection
  }
  type Query {
    searchTitles(query: String!, locale: String!, first: Int! = 20, after: String): DiscoverySearchPayload!
  }
`);

export class DiscoveryGraphqlError extends GraphQLError {
  constructor(code: string) {
    super("Discovery operation rejected.", { extensions: { code } });
  }
}

export interface DiscoveryGraphqlContext {
  readonly signal: AbortSignal;
  readonly correlationId: string;
  readonly traceparent?: string;
  readonly search: ReturnType<typeof createTitleSearch>;
  readonly now: () => number;
  readonly outcome: { code: string };
}

const OWNER = Symbol("discovery-request-owner");
const contexts = new WeakSet<object>();

function owned(raw: unknown): DiscoveryGraphqlContext {
  const value: unknown =
    typeof raw === "object" && raw !== null
      ? Object.getOwnPropertyDescriptor(raw, OWNER)?.value
      : undefined;
  if (typeof value !== "object" || value === null || !contexts.has(value)) {
    throw new DiscoveryGraphqlError("UNAVAILABLE");
  }
  const context = value as DiscoveryGraphqlContext;
  if (context.signal.aborted) {
    throw new DiscoveryGraphqlError("CANCELLED");
  }
  return context;
}

export function createDiscoveryGraphqlContext(
  search: ReturnType<typeof createTitleSearch>,
  now: () => number,
  signal: AbortSignal,
  correlationId: string,
  traceparent?: string,
): DiscoveryGraphqlContext {
  const context: DiscoveryGraphqlContext = {
    search,
    now,
    signal,
    correlationId,
    ...(traceparent ? { traceparent } : {}),
    outcome: { code: "COMPLETED" },
  };
  Object.defineProperty(context, OWNER, { value: context, enumerable: true });
  contexts.add(context);
  return context;
}

function publicCode(value: string): string {
  return value === "invalid_state" ? "UNAVAILABLE" : value.toUpperCase();
}

export function createDiscoverySchema() {
  return buildSubgraphSchema({
    typeDefs: DISCOVERY_TYPE_DEFS,
    resolvers: {
      Query: {
        searchTitles: async (
          _: unknown,
          args: { query: unknown; locale: unknown; first: unknown; after?: unknown },
          raw: unknown,
        ) => {
          const context = owned(raw);
          const result = await context.search.execute(
            {
              query: args.query,
              locale: args.locale,
              first: args.first,
              after: args.after ?? null,
            },
            context.now(),
            context.signal,
          );
          if (context.signal.aborted) {
            throw new DiscoveryGraphqlError("CANCELLED");
          }
          const outcome = result.status === "completed" ? result.value.status : result.status;
          context.outcome.code = publicCode(outcome);
          const page =
            result.status === "completed" && result.value.status === "completed"
              ? result.value.value
              : undefined;
          return {
            code: context.outcome.code,
            correlationId: context.correlationId,
            connection: page
              ? {
                  generation: page.generation,
                  edges: page.edges.map((edge) => ({
                    cursor: edge.cursor,
                    node: { __typename: "Title", id: edge.titleId },
                    sourceVersion: edge.sourceVersion,
                    indexedAt: edge.indexedAt,
                    visibleUntil: edge.visibleUntil,
                  })),
                  pageInfo: {
                    endCursor: page.endCursor,
                    hasNextPage: page.hasNextPage,
                  },
                }
              : null,
          };
        },
      },
    },
  });
}
