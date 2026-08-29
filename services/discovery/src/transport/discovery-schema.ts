import { buildSubgraphSchema } from "@apollo/subgraph";
import { GraphQLError, parse } from "graphql";
import type { createHomeRails, HomeRail, HomeRailResult } from "../application/home-rails.js";
import type { createTitleSearch } from "../application/search-titles.js";

export const DISCOVERY_TYPE_DEFS = parse(`
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])
  enum DiscoverySearchCode {
    COMPLETED INVALID_INPUT CURSOR_EXPIRED STALE LIMIT_EXCEEDED UNAVAILABLE CANCELLED INDETERMINATE
  }
  enum DiscoveryHomeCode {
    COMPLETED PARTIAL INVALID_INPUT STALE UNAVAILABLE CANCELLED INDETERMINATE
  }
  enum DiscoveryRailCode { COMPLETED EMPTY FALLBACK UNAVAILABLE CANCELLED INDETERMINATE }
  enum DiscoveryRailKind { FEATURED RECENTLY_ADDED TRENDING GENRE }
  enum DiscoveryRailSource { FEATURED RECENTLY_ADDED TRENDING GENRE }
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
  type DiscoveryRailEdge {
    node: Title
    sourceVersion: Int!
    indexedAt: Float!
    visibleUntil: Float!
  }
  type DiscoveryRail {
    key: ID!
    kind: DiscoveryRailKind!
    genre: String
    source: DiscoveryRailSource!
    oldestIndexedAt: Float
    freshUntil: Float
    edges: [DiscoveryRailEdge!]!
  }
  type DiscoveryRailResult { code: DiscoveryRailCode! rail: DiscoveryRail }
  type DiscoveryGenreRailResult { code: DiscoveryRailCode! rails: [DiscoveryRail!]! }
  type DiscoveryHomePayload {
    code: DiscoveryHomeCode!
    correlationId: ID!
    generation: ID
    generatedAt: Float
    featured: DiscoveryRailResult
    recentlyAdded: DiscoveryRailResult
    trending: DiscoveryRailResult
    genres: DiscoveryGenreRailResult
  }
  type Query {
    searchTitles(query: String!, locale: String!, first: Int! = 20, after: String): DiscoverySearchPayload!
    homeRails(first: Int! = 10): DiscoveryHomePayload!
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
  readonly home: ReturnType<typeof createHomeRails>;
  readonly now: () => number;
  readonly searchAdmission: "admitted" | "limit_exceeded";
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
  home: ReturnType<typeof createHomeRails>,
  now: () => number,
  signal: AbortSignal,
  correlationId: string,
  traceparent?: string,
  searchAdmission: DiscoveryGraphqlContext["searchAdmission"] = "admitted",
): DiscoveryGraphqlContext {
  const context: DiscoveryGraphqlContext = {
    search,
    home,
    now,
    signal,
    correlationId,
    searchAdmission,
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

function sampleSearchQuality(correlationId: string): boolean {
  const compact = correlationId.replaceAll("-", "");
  return /^[0-9a-f]{32}$/iu.test(compact) && compact.endsWith("0");
}

function publicRail(value: HomeRail) {
  return {
    ...value,
    kind: value.kind.toUpperCase(),
    source: value.source.toUpperCase(),
    edges: value.edges.map((edge) => ({
      node: { __typename: "Title", id: edge.titleId },
      sourceVersion: edge.sourceVersion,
      indexedAt: edge.indexedAt,
      visibleUntil: edge.visibleUntil,
    })),
  };
}

function publicRailResult(value: HomeRailResult) {
  return { code: value.code.toUpperCase(), rail: value.rail ? publicRail(value.rail) : null };
}

export function createDiscoverySchema() {
  return buildSubgraphSchema({
    typeDefs: DISCOVERY_TYPE_DEFS,
    resolvers: {
      Query: {
        homeRails: async (_: unknown, args: { first: unknown }, raw: unknown) => {
          const context = owned(raw);
          const result = await context.home.execute(
            { first: args.first },
            context.now(),
            context.signal,
          );
          if (context.signal.aborted) {
            throw new DiscoveryGraphqlError("CANCELLED");
          }
          const outcome = result.status === "completed" ? result.value.status : result.status;
          const page =
            result.status === "completed" && result.value.status === "completed"
              ? result.value.value
              : undefined;
          context.outcome.code = page ? page.status.toUpperCase() : publicCode(outcome);
          return {
            code: context.outcome.code,
            correlationId: context.correlationId,
            generation: page?.generation ?? null,
            generatedAt: page?.generatedAt ?? null,
            featured: page ? publicRailResult(page.featured) : null,
            recentlyAdded: page ? publicRailResult(page.recentlyAdded) : null,
            trending: page ? publicRailResult(page.trending) : null,
            genres: page
              ? {
                  code: page.genres.code.toUpperCase(),
                  rails: page.genres.rails.map(publicRail),
                }
              : null,
          };
        },
        searchTitles: async (
          _: unknown,
          args: { query: unknown; locale: unknown; first: unknown; after?: unknown },
          raw: unknown,
        ) => {
          const context = owned(raw);
          if (context.searchAdmission === "limit_exceeded") {
            context.outcome.code = "LIMIT_EXCEEDED";
            return {
              code: context.outcome.code,
              correlationId: context.correlationId,
              connection: null,
            };
          }
          const result = await context.search.execute(
            {
              query: args.query,
              locale: args.locale,
              first: args.first,
              after: args.after ?? null,
            },
            context.now(),
            context.signal,
            sampleSearchQuality(context.correlationId),
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
