import { gql, type TypedDocumentNode } from "@apollo/client";

type Locale = "en" | "pt-BR";
type RailKind = "FEATURED" | "RECENTLY_ADDED" | "TRENDING" | "GENRE";
type RailSource = RailKind;
type RailCode = "COMPLETED" | "EMPTY" | "FALLBACK" | "UNAVAILABLE" | "CANCELLED" | "INDETERMINATE";

interface DiscoveryTitle {
  readonly __typename?: "Title";
  readonly id: string;
  readonly localized: { readonly locale: string; readonly title: string };
}
export interface HomeRail {
  readonly key: string;
  readonly kind: RailKind;
  readonly genre: string | null;
  readonly source: RailSource;
  readonly oldestIndexedAt: number | null;
  readonly freshUntil: number | null;
  readonly edges: readonly {
    readonly sourceVersion: number;
    readonly indexedAt: number;
    readonly visibleUntil: number;
    readonly node: DiscoveryTitle | null;
  }[];
}
interface HomeRailResult {
  readonly code: RailCode;
  readonly rail: HomeRail | null;
}
export interface HomePublicData {
  readonly homeRails: {
    readonly code:
      | "COMPLETED"
      | "PARTIAL"
      | "INVALID_INPUT"
      | "STALE"
      | "UNAVAILABLE"
      | "CANCELLED"
      | "INDETERMINATE";
    readonly correlationId: string;
    readonly generation: string | null;
    readonly generatedAt: number | null;
    readonly featured: HomeRailResult | null;
    readonly recentlyAdded: HomeRailResult | null;
    readonly trending: HomeRailResult | null;
    readonly genres: {
      readonly code: Exclude<RailCode, "FALLBACK">;
      readonly rails: readonly HomeRail[];
    } | null;
  };
}
export interface HomeVariables {
  readonly first: 10;
  readonly locale: Locale;
}

export const HOME_PUBLIC: TypedDocumentNode<HomePublicData, HomeVariables> = gql`
  query HomePublic($first: Int! = 10, $locale: String! = "en") {
    homeRails(first: $first) {
      code
      correlationId
      generation
      generatedAt
      featured {
        code
        rail {
          key
          kind
          source
          oldestIndexedAt
          freshUntil
          edges {
            sourceVersion
            indexedAt
            visibleUntil
            node {
              id
              localized(locale: $locale) {
                locale
                title
              }
            }
          }
        }
      }
      recentlyAdded {
        code
        rail {
          key
          kind
          source
          oldestIndexedAt
          freshUntil
          edges {
            sourceVersion
            indexedAt
            visibleUntil
            node {
              id
              localized(locale: $locale) {
                locale
                title
              }
            }
          }
        }
      }
      trending {
        code
        rail {
          key
          kind
          source
          oldestIndexedAt
          freshUntil
          edges {
            sourceVersion
            indexedAt
            visibleUntil
            node {
              id
              localized(locale: $locale) {
                locale
                title
              }
            }
          }
        }
      }
      genres {
        code
        rails {
          key
          kind
          genre
          source
          oldestIndexedAt
          freshUntil
          edges {
            sourceVersion
            indexedAt
            visibleUntil
            node {
              id
              localized(locale: $locale) {
                locale
                title
              }
            }
          }
        }
      }
    }
  }
`;

export interface SearchVariables {
  readonly query: string;
  readonly locale: Locale;
  readonly first: 20;
  readonly after: string | null;
}
export interface SearchData {
  readonly searchTitles: {
    readonly code:
      | "COMPLETED"
      | "CURSOR_EXPIRED"
      | "INVALID_INPUT"
      | "STALE"
      | "UNAVAILABLE"
      | "CANCELLED"
      | "INDETERMINATE";
    readonly correlationId: string;
    readonly connection: {
      readonly generation: string;
      readonly edges: readonly {
        readonly cursor: string;
        readonly sourceVersion: number;
        readonly indexedAt: number;
        readonly visibleUntil: number;
        readonly node: DiscoveryTitle | null;
      }[];
      readonly pageInfo: { readonly endCursor: string | null; readonly hasNextPage: boolean };
    } | null;
  };
}
export const SEARCH_TITLES: TypedDocumentNode<SearchData, SearchVariables> = gql`
  query SearchTitles($query: String!, $locale: String!, $first: Int! = 20, $after: String) {
    searchTitles(query: $query, locale: $locale, first: $first, after: $after) {
      code
      correlationId
      connection {
        generation
        edges {
          cursor
          sourceVersion
          indexedAt
          visibleUntil
          node {
            id
            localized(locale: $locale) {
              locale
              title
            }
          }
        }
        pageInfo {
          endCursor
          hasNextPage
        }
      }
    }
  }
`;

interface PersonalizedTitle {
  readonly id: string;
  readonly localized: { readonly title: string };
}
interface HomeProgressEntry {
  readonly titleId: string;
  readonly positionMs: number;
  readonly durationMs: number;
  readonly status: "IN_PROGRESS";
  readonly title: PersonalizedTitle | null;
}
export interface HomePersonalizedData {
  readonly homeRails: unknown;
  readonly homeContinueWatching: {
    readonly code: string;
    readonly correlationId: string;
    readonly connection: {
      readonly edges: readonly { readonly node: HomeProgressEntry }[];
      readonly pageInfo: { readonly hasNextPage: boolean };
    } | null;
  } | null;
}
export interface HomePersonalizedVariables extends HomeVariables {
  readonly profileId: string;
}
export const HOME_PERSONALIZED: TypedDocumentNode<HomePersonalizedData, HomePersonalizedVariables> =
  gql`
    query HomePersonalized($profileId: ID!, $first: Int! = 10, $locale: String! = "en") {
      homeRails(first: $first) {
        code
        featured {
          code
          rail {
            key
            source
            edges {
              node {
                id
                localized(locale: $locale) {
                  title
                }
              }
            }
          }
        }
        recentlyAdded {
          code
          rail {
            key
            edges {
              node {
                id
                localized(locale: $locale) {
                  title
                }
              }
            }
          }
        }
      }
      homeContinueWatching(profileId: $profileId, first: $first) {
        code
        correlationId
        connection {
          edges {
            node {
              titleId
              positionMs
              durationMs
              status
              title {
                id
                localized(locale: $locale) {
                  title
                }
              }
            }
          }
          pageInfo {
            hasNextPage
          }
        }
      }
    }
  `;

const identifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const safeCursorPattern = /^[A-Za-z0-9._~%+-]+$/u;
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid discovery response.");
  }
  return value as Record<string, unknown>;
};
const identifier = (value: unknown): string => {
  if (typeof value !== "string" || !identifierPattern.test(value)) {
    throw new Error("Invalid discovery identifier.");
  }
  return value;
};
const text = (value: unknown, maximum = 512): string => {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    Array.from(value).length > maximum ||
    /[\p{Cc}\p{Cs}\u202a-\u202e\u2066-\u2069]/u.test(value)
  ) {
    throw new Error("Invalid discovery text.");
  }
  return value;
};
const integer = (value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error("Invalid discovery number.");
  }
  return value;
};
const cursor = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 1280 ||
    !safeCursorPattern.test(value)
  ) {
    throw new Error("Invalid discovery cursor.");
  }
  return value;
};

function discoveryLocale(value: unknown): Locale {
  return value === "pt-BR" ? "pt-BR" : "en";
}

export function homeVariables(input: Record<string, string | string[] | undefined>): HomeVariables {
  return Object.freeze({ first: 10, locale: discoveryLocale(input["locale"]) });
}

export function searchVariables(
  input: Record<string, string | string[] | undefined>,
): SearchVariables | null {
  const value = input["q"];
  const after = input["after"];
  if (value === undefined || value === "") {
    if (after !== undefined) {
      throw new Error("Invalid search page.");
    }
    return null;
  }
  if (
    typeof value !== "string" ||
    value.length > 160 ||
    Array.from(value).length > 80 ||
    /[\p{Cc}\p{Cs}\u202a-\u202e\u2066-\u2069]/u.test(value)
  ) {
    throw new Error("Invalid search query.");
  }
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  if (!normalized || Array.from(normalized).length > 80 || normalized.split(" ").length > 8) {
    throw new Error("Invalid search query.");
  }
  if (
    after !== undefined &&
    (typeof after !== "string" || !after || after.length > 1280 || !safeCursorPattern.test(after))
  ) {
    throw new Error("Invalid search page.");
  }
  return Object.freeze({
    query: value,
    locale: discoveryLocale(input["locale"]),
    first: 20,
    after: after ?? null,
  });
}

function readTitle(value: unknown): DiscoveryTitle | null {
  if (value === null) {
    return null;
  }
  const data = record(value);
  const localized = record(data["localized"]);
  const locale = localized["locale"];
  if (locale !== "en" && locale !== "pt-BR") {
    throw new Error("Invalid discovery locale.");
  }
  return Object.freeze({
    id: identifier(data["id"]),
    localized: Object.freeze({ locale, title: text(localized["title"]) }),
  });
}

function readRail(value: unknown, expected: RailKind): HomeRail {
  const data = record(value);
  const kind = data["kind"];
  const source = data["source"];
  if (
    kind !== expected ||
    !["FEATURED", "RECENTLY_ADDED", "TRENDING", "GENRE"].includes(String(source))
  ) {
    throw new Error("Invalid discovery rail identity.");
  }
  const genre = typeof data["genre"] === "string" ? text(data["genre"], 80) : null;
  if ((kind === "GENRE") !== (genre !== null)) {
    throw new Error("Invalid discovery genre.");
  }
  if (!Array.isArray(data["edges"]) || data["edges"].length > 10) {
    throw new Error("Invalid discovery rail size.");
  }
  const edges = data["edges"].map((value: unknown) => {
    const edge = record(value);
    return Object.freeze({
      sourceVersion: integer(edge["sourceVersion"], 1),
      indexedAt: integer(edge["indexedAt"], 0, 253_402_300_799),
      visibleUntil: integer(edge["visibleUntil"], 0, 253_402_300_799),
      node: readTitle(edge["node"]),
    });
  });
  const key = text(data["key"], 128);
  const oldestIndexedAt =
    data["oldestIndexedAt"] === null ? null : integer(data["oldestIndexedAt"], 0, 253_402_300_799);
  const freshUntil =
    data["freshUntil"] === null ? null : integer(data["freshUntil"], 0, 253_402_300_799);
  if ((edges.length === 0) !== (oldestIndexedAt === null && freshUntil === null)) {
    throw new Error("Invalid discovery freshness.");
  }
  return Object.freeze({
    key,
    kind: expected,
    genre,
    source: source as RailSource,
    oldestIndexedAt,
    freshUntil,
    edges: Object.freeze(edges),
  });
}

function readRailResult(value: unknown, expected: Exclude<RailKind, "GENRE">): HomeRailResult {
  const data = record(value),
    code = data["code"];
  if (
    !["COMPLETED", "EMPTY", "FALLBACK", "UNAVAILABLE", "CANCELLED", "INDETERMINATE"].includes(
      String(code),
    )
  ) {
    throw new Error("Invalid discovery rail outcome.");
  }
  const rail = data["rail"] === null ? null : readRail(data["rail"], expected);
  const invalidSource =
    rail !== null &&
    (code === "FALLBACK"
      ? expected === "RECENTLY_ADDED" || rail.source !== "RECENTLY_ADDED"
      : rail.source !== expected);
  if (
    ((code === "COMPLETED" || code === "FALLBACK") && (!rail || rail.edges.length === 0)) ||
    (code === "EMPTY" && (!rail || rail.edges.length !== 0)) ||
    (!["COMPLETED", "EMPTY", "FALLBACK"].includes(String(code)) && rail !== null) ||
    invalidSource
  ) {
    throw new Error("Invalid discovery rail result.");
  }
  return Object.freeze({ code: code as RailCode, rail });
}

export function readHomePublicData(value: unknown): HomePublicData {
  const root = record(value),
    data = record(root["homeRails"]),
    code = data["code"];
  if (
    ![
      "COMPLETED",
      "PARTIAL",
      "INVALID_INPUT",
      "STALE",
      "UNAVAILABLE",
      "CANCELLED",
      "INDETERMINATE",
    ].includes(String(code))
  ) {
    throw new Error("Invalid home outcome.");
  }
  const correlationId = identifier(data["correlationId"]);
  if (code !== "COMPLETED" && code !== "PARTIAL") {
    if (
      ["generation", "generatedAt", "featured", "recentlyAdded", "trending", "genres"].some(
        (name) => data[name] !== null,
      )
    ) {
      throw new Error("Invalid unavailable home result.");
    }
    return {
      homeRails: {
        code: code as HomePublicData["homeRails"]["code"],
        correlationId,
        generation: null,
        generatedAt: null,
        featured: null,
        recentlyAdded: null,
        trending: null,
        genres: null,
      },
    };
  }
  const genreData = record(data["genres"]),
    genreCode = genreData["code"];
  if (
    !["COMPLETED", "EMPTY", "UNAVAILABLE", "CANCELLED", "INDETERMINATE"].includes(
      String(genreCode),
    ) ||
    !Array.isArray(genreData["rails"]) ||
    genreData["rails"].length > 3
  ) {
    throw new Error("Invalid discovery genre result.");
  }
  const rails = genreData["rails"].map((rail: unknown) => readRail(rail, "GENRE"));
  if (
    (genreCode === "COMPLETED") !== rails.length > 0 ||
    (genreCode !== "COMPLETED" && rails.length > 0)
  ) {
    throw new Error("Invalid discovery genre outcome.");
  }
  const featured = readRailResult(data["featured"], "FEATURED");
  const recentlyAdded = readRailResult(data["recentlyAdded"], "RECENTLY_ADDED");
  const trending = readRailResult(data["trending"], "TRENDING");
  const degraded =
    [featured, recentlyAdded, trending].some(
      (result) => result.code !== "COMPLETED" && result.code !== "EMPTY",
    ) ||
    (genreCode !== "COMPLETED" && genreCode !== "EMPTY");
  if ((code === "PARTIAL") !== degraded) {
    throw new Error("Invalid home aggregate outcome.");
  }
  return {
    homeRails: {
      code,
      correlationId,
      generation: identifier(data["generation"]),
      generatedAt: integer(data["generatedAt"], 0, 253_402_300_799),
      featured,
      recentlyAdded,
      trending,
      genres: { code: genreCode as Exclude<RailCode, "FALLBACK">, rails: Object.freeze(rails) },
    },
  };
}

export function readSearchData(value: unknown): SearchData {
  const root = record(value),
    data = record(root["searchTitles"]),
    code = data["code"];
  if (
    ![
      "COMPLETED",
      "CURSOR_EXPIRED",
      "INVALID_INPUT",
      "STALE",
      "UNAVAILABLE",
      "CANCELLED",
      "INDETERMINATE",
    ].includes(String(code))
  ) {
    throw new Error("Invalid search outcome.");
  }
  const correlationId = identifier(data["correlationId"]);
  if (code !== "COMPLETED") {
    if (data["connection"] !== null) {
      throw new Error("Invalid unavailable search result.");
    }
    return {
      searchTitles: {
        code: code as SearchData["searchTitles"]["code"],
        correlationId,
        connection: null,
      },
    };
  }
  const connection = record(data["connection"]),
    pageInfo = record(connection["pageInfo"]);
  if (
    !Array.isArray(connection["edges"]) ||
    connection["edges"].length > 20 ||
    typeof pageInfo["hasNextPage"] !== "boolean"
  ) {
    throw new Error("Invalid search page.");
  }
  const edges = connection["edges"].map((value: unknown) => {
    const edge = record(value);
    return Object.freeze({
      cursor: cursor(edge["cursor"]),
      sourceVersion: integer(edge["sourceVersion"], 1),
      indexedAt: integer(edge["indexedAt"], 0, 253_402_300_799),
      visibleUntil: integer(edge["visibleUntil"], 0, 253_402_300_799),
      node: readTitle(edge["node"]),
    });
  });
  const endCursor = pageInfo["endCursor"] === null ? null : cursor(pageInfo["endCursor"]);
  if (
    endCursor !== (edges.at(-1)?.cursor ?? null) ||
    (pageInfo["hasNextPage"] && !endCursor) ||
    new Set(edges.map((edge) => edge.cursor)).size !== edges.length
  ) {
    throw new Error("Invalid search traversal.");
  }
  return {
    searchTitles: {
      code,
      correlationId,
      connection: {
        generation: identifier(connection["generation"]),
        edges: Object.freeze(edges),
        pageInfo: { endCursor, hasNextPage: pageInfo["hasNextPage"] },
      },
    },
  };
}

export function readHomeContinueWatching(
  value: unknown,
): HomePersonalizedData["homeContinueWatching"] {
  if (value === null) {
    return null;
  }
  const data = record(value),
    code = data["code"];
  const allowed = [
    "COMPLETED",
    "INVALID_INPUT",
    "UNAUTHENTICATED",
    "NOT_FOUND",
    "STALE",
    "CONFLICT",
    "BACKPRESSURE",
    "UNAVAILABLE",
    "CANCELLED",
    "INDETERMINATE",
  ];
  if (!allowed.includes(String(code))) {
    throw new Error("Invalid home progress outcome.");
  }
  const correlationId = identifier(data["correlationId"]);
  if (code !== "COMPLETED") {
    if (data["connection"] !== null) {
      throw new Error("Invalid unavailable home progress.");
    }
    return { code: String(code), correlationId, connection: null };
  }
  const connection = record(data["connection"]),
    pageInfo = record(connection["pageInfo"]);
  if (
    !Array.isArray(connection["edges"]) ||
    connection["edges"].length > 10 ||
    typeof pageInfo["hasNextPage"] !== "boolean"
  ) {
    throw new Error("Invalid home progress page.");
  }
  const seen = new Set<string>();
  const edges = connection["edges"].map((value: unknown) => {
    const node = record(record(value)["node"]),
      titleId = identifier(node["titleId"]);
    if (seen.has(titleId) || node["status"] !== "IN_PROGRESS") {
      throw new Error("Invalid home progress entry.");
    }
    seen.add(titleId);
    const durationMs = integer(node["durationMs"], 1, 43_200_000),
      positionMs = integer(node["positionMs"], 0, durationMs);
    let title: PersonalizedTitle | null = null;
    if (node["title"] !== null) {
      const titleData = record(node["title"]),
        localized = record(titleData["localized"]);
      if (titleData["id"] !== titleId) {
        throw new Error("Invalid home progress title.");
      }
      title = { id: titleId, localized: { title: text(localized["title"]) } };
    }
    return Object.freeze({
      node: Object.freeze({
        titleId,
        positionMs,
        durationMs,
        status: "IN_PROGRESS" as const,
        title,
      }),
    });
  });
  return {
    code: "COMPLETED",
    correlationId,
    connection: { edges: Object.freeze(edges), pageInfo: { hasNextPage: pageInfo["hasNextPage"] } },
  };
}
