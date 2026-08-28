import { buildSubgraphSchema } from "@apollo/subgraph";
import DataLoader from "dataloader";
import { GraphQLError, parse } from "graphql";
import type { CatalogPublicQueries, CatalogReadResult } from "../application/public-queries.js";
import type { CatalogPlaybackQueries } from "../application/playback-queries.js";
import type { CatalogEngagementQueries } from "../application/engagement-queries.js";
import type { PublicCatalogTitle } from "../domain/public-title.js";
import { catalogIdentifier, catalogRecord } from "../domain/values.js";

export const CATALOG_TYPE_DEFS = parse(`
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key", "@inaccessible"])
  enum CatalogAccessibility { CAPTIONS AUDIO_DESCRIPTION TRANSCRIPT }
  type CatalogAttribution {
    workTitle: String!
    creator: String!
    copyrightHolder: String!
    sourceUrl: String!
    licenseName: String!
    licenseVersion: String!
    licenseUrl: String!
    attributionText: String!
    modificationNotice: String!
  }
  type CatalogArtwork { url: String! altText: String! attribution: CatalogAttribution! }
  type CatalogCredit { name: String! role: String! }
  type LocalizedTitle { locale: String! title: String! synopsis: String! }
  type Title @key(fields: "id") {
    id: ID!
    localized(locale: String! = "en"): LocalizedTitle!
    releaseYear: Int
    runtimeSeconds: Int
    genres: [String!]!
    languages: [String!]!
    accessibility: [CatalogAccessibility!]!
    editorialLabels: [String!]!
    credits: [CatalogCredit!]!
    artwork: CatalogArtwork
    attribution: CatalogAttribution!
  }
  type CatalogTitleEdge { cursor: String! node: Title! }
  type CatalogPageInfo { endCursor: String hasNextPage: Boolean! }
  type CatalogTitleConnection { edges: [CatalogTitleEdge!]! pageInfo: CatalogPageInfo! }
  type CurrentPlaybackPublication @inaccessible {
    titleId: ID!
    publicationId: ID!
    titleVersion: Int!
    manifestUrl: String!
    checkedAt: Float!
    validUntil: Float
  }
  type Query {
    titles(first: Int!, after: String): CatalogTitleConnection!
    title(id: ID!): Title
    _playbackPublications(ids: [ID!]!): [CurrentPlaybackPublication]! @inaccessible
    _engagementTitles(ids: [ID!]!): EngagementTitleVisibility! @inaccessible
  }
  type EngagementVisibleTitle @inaccessible { titleId: ID! visible: Boolean! }
  type EngagementTitleVisibility @inaccessible {
    code: String!
    checkedAt: Float!
    expiresAt: Float!
    titles: [EngagementVisibleTitle!]!
  }
`);

export class CatalogGraphqlError extends GraphQLError {
  constructor(code: string) {
    super("Catalog operation rejected.", { extensions: { code } });
  }
}
const OWNER = Symbol("catalog-request-owner");
const contexts = new WeakSet<object>();
export interface CatalogGraphqlContext {
  readonly signal: AbortSignal;
  readonly correlationId: string;
  readonly queries: CatalogPublicQueries;
  readonly titles: DataLoader<string, PublicCatalogTitle | null>;
  readonly outcome: { code: string };
  readonly playback?: CatalogPlaybackQueries;
  readonly engagement?: CatalogEngagementQueries;
}
function owned(value: unknown): CatalogGraphqlContext {
  const owner: unknown =
    typeof value === "object" && value !== null
      ? Object.getOwnPropertyDescriptor(value, OWNER)?.value
      : undefined;
  if (typeof owner !== "object" || owner === null || !contexts.has(owner)) {
    throw new CatalogGraphqlError("UNAVAILABLE");
  }
  const context = owner as CatalogGraphqlContext;
  if (context.signal.aborted) {
    throw new CatalogGraphqlError("CANCELLED");
  }
  return context;
}
function completed<T>(result: CatalogReadResult<T>, context: CatalogGraphqlContext): T {
  if (context.signal.aborted) {
    throw new CatalogGraphqlError("CANCELLED");
  }
  if (result.status !== "completed") {
    context.outcome.code = result.status.toUpperCase();
    throw new CatalogGraphqlError(context.outcome.code);
  }
  return result.value;
}
export function createCatalogGraphqlContext(
  queries: CatalogPublicQueries,
  signal: AbortSignal,
  correlationId: string,
  playback?: CatalogPlaybackQueries,
  engagement?: CatalogEngagementQueries,
): CatalogGraphqlContext {
  const cache = new Map<string, Promise<PublicCatalogTitle | null>>();
  const context: CatalogGraphqlContext = {
    queries,
    signal,
    correlationId,
    ...(playback ? { playback } : {}),
    ...(engagement ? { engagement } : {}),
    outcome: { code: "COMPLETED" },
    titles: new DataLoader(async (ids) => completed(await queries.byIds(ids, signal), context), {
      maxBatchSize: 20,
      cacheMap: {
        get: (key) => cache.get(key),
        set(key, value) {
          if (!cache.has(key) && cache.size >= 128) {
            throw new CatalogGraphqlError("LIMIT_EXCEEDED");
          }
          cache.set(key, value);
        },
        delete: (key) => cache.delete(key),
        clear: () => {
          cache.clear();
        },
      },
    }),
  };
  Object.defineProperty(context, OWNER, { value: context, enumerable: true });
  contexts.add(context);
  return context;
}
async function loadTitle(context: CatalogGraphqlContext, id: unknown) {
  if (!catalogIdentifier(id)) {
    throw new CatalogGraphqlError("INVALID_INPUT");
  }
  const value = await context.titles.load(id);
  if (context.signal.aborted) {
    throw new CatalogGraphqlError("CANCELLED");
  }
  // Apollo adds entity metadata; never let it mutate the immutable owner DTO/cache.
  return value ? { ...value } : null;
}
export function createCatalogSchema() {
  return buildSubgraphSchema({
    typeDefs: CATALOG_TYPE_DEFS,
    resolvers: {
      Query: {
        _engagementTitles: async (_: unknown, args: { ids: readonly unknown[] }, raw: unknown) => {
          const context = owned(raw);
          if (!context.engagement) {
            throw new CatalogGraphqlError("FORBIDDEN");
          }
          return {
            code: "COMPLETED",
            ...completed(await context.engagement.byIds(args.ids, context.signal), context),
          };
        },
        _playbackPublications: async (
          _: unknown,
          args: { ids: readonly unknown[] },
          raw: unknown,
        ) => {
          const context = owned(raw);
          if (!context.playback) {
            throw new CatalogGraphqlError("FORBIDDEN");
          }
          return completed(await context.playback.byIds(args.ids, context.signal), context);
        },
        title: (_: unknown, args: { id: unknown }, raw: unknown) => loadTitle(owned(raw), args.id),
        titles: async (_: unknown, args: { first: unknown; after?: unknown }, raw: unknown) => {
          const context = owned(raw);
          const page = completed(
            await context.queries.browse(
              { first: args.first, after: args.after ?? null },
              context.signal,
            ),
            context,
          );
          for (const edge of page.edges) {
            context.titles.prime(edge.node.id, edge.node);
          }
          return page;
        },
      },
      Title: {
        __resolveReference: (value: unknown, raw: unknown) => {
          const reference = catalogRecord(value, ["__typename", "id"]);
          if (!reference || reference["__typename"] !== "Title") {
            throw new CatalogGraphqlError("INVALID_INPUT");
          }
          return loadTitle(owned(raw), reference["id"]);
        },
        localized: (title: PublicCatalogTitle, args: { locale: unknown }, raw: unknown) => {
          const context = owned(raw);
          return completed(context.queries.localized(title, args.locale), context);
        },
      },
    },
  });
}
