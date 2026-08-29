import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryCache } from "@apollo/client";
import {
  HOME_PUBLIC,
  SEARCH_TITLES,
  readHomeContinueWatching,
  type HomeRail,
  type HomePublicData,
  type SearchData,
} from "../features/discovery/operations.ts";
import { publicCachePolicies } from "../lib/apollo/policies.ts";
import { projectPublicData } from "../lib/apollo/public-snapshot.ts";

const id = (n: number) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const emptyRail = (key: string, kind: HomeRail["kind"]): Omit<HomeRail, "genre"> => ({
  key,
  kind,
  source: kind,
  oldestIndexedAt: null,
  freshUntil: null,
  edges: [],
});
const home = (): HomePublicData => ({
  homeRails: {
    code: "COMPLETED",
    correlationId: id(1),
    generation: id(2),
    generatedAt: 1000,
    featured: { code: "EMPTY", rail: { ...emptyRail("featured", "FEATURED"), genre: null } },
    recentlyAdded: {
      code: "EMPTY",
      rail: { ...emptyRail("recently-added", "RECENTLY_ADDED"), genre: null },
    },
    trending: { code: "EMPTY", rail: { ...emptyRail("trending", "TRENDING"), genre: null } },
    genres: { code: "EMPTY", rails: [] },
  },
});
const search = (generation = id(3)): SearchData => ({
  searchTitles: {
    code: "COMPLETED",
    correlationId: id(4),
    connection: {
      generation,
      edges: [],
      pageInfo: { endCursor: null, hasNextPage: false },
    },
  },
});

test("public discovery projection preserves explicit empty results and strips extra data", () => {
  const selectedHome = projectPublicData(
    {
      homeRails: {
        ...home().homeRails,
        featured: {
          code: "EMPTY",
          rail: { ...emptyRail("featured", "FEATURED"), private: "canary" },
        },
        private: "canary",
      },
      viewer: { private: "canary" },
    },
    "HomePublic",
  );
  assert.equal(JSON.stringify(selectedHome).includes("canary"), false);
  assert.equal((selectedHome as HomePublicData).homeRails.featured?.code, "EMPTY");
  assert.deepEqual(projectPublicData(search(), "SearchTitles"), search());
});

test("discovery projection rejects malformed, unbounded and false-success responses", () => {
  const valid = home();
  for (const value of [
    { homeRails: { ...valid.homeRails, correlationId: "bad" } },
    { homeRails: { ...valid.homeRails, code: "UNAVAILABLE" } },
    {
      homeRails: {
        ...valid.homeRails,
        featured: {
          code: "EMPTY",
          rail: { ...emptyRail("featured", "FEATURED"), source: "TRENDING", genre: null },
        },
      },
    },
    {
      homeRails: {
        ...valid.homeRails,
        code: "PARTIAL",
      },
    },
    {
      homeRails: {
        ...valid.homeRails,
        code: "PARTIAL",
        featured: { code: "UNAVAILABLE", rail: null },
        recentlyAdded: { code: "CANCELLED", rail: null },
        trending: { code: "INDETERMINATE", rail: null },
        genres: { code: "UNAVAILABLE", rails: [] },
      },
    },
    {
      homeRails: {
        ...valid.homeRails,
        genres: {
          code: "COMPLETED",
          rails: Array.from({ length: 4 }, (_, index) => ({
            ...emptyRail(`genre:${index}`, "GENRE"),
            genre: `genre-${index}`,
          })),
        },
      },
    },
  ]) {
    assert.throws(() => projectPublicData(value, "HomePublic"));
  }
  assert.throws(() =>
    projectPublicData(
      {
        searchTitles: {
          ...search().searchTitles,
          connection: {
            ...search().searchTitles.connection,
            edges: Array.from({ length: 21 }, () => ({})),
          },
        },
      },
      "SearchTitles",
    ),
  );
});

test("home progress accepts bounded owned entries and rejects substitution", () => {
  const titleId = id(10);
  const value = {
    code: "COMPLETED",
    correlationId: id(11),
    connection: {
      edges: [
        {
          node: {
            titleId,
            positionMs: 15000,
            durationMs: 60000,
            status: "IN_PROGRESS",
            title: { id: titleId, localized: { title: "Synthetic title" } },
          },
        },
      ],
      pageInfo: { hasNextPage: false },
    },
  };
  assert.deepEqual(readHomeContinueWatching(value), value);
  assert.equal(readHomeContinueWatching(null), null);
  assert.throws(() =>
    readHomeContinueWatching({
      ...value,
      connection: {
        ...value.connection,
        edges: [
          {
            node: {
              ...value.connection.edges[0]?.node,
              title: { id: id(99), localized: { title: "Foreign" } },
            },
          },
        ],
      },
    }),
  );
});

test("public discovery cache retains only the current home and search snapshots", () => {
  const cache = new InMemoryCache({ typePolicies: publicCachePolicies });
  cache.writeQuery({ query: HOME_PUBLIC, variables: { first: 10, locale: "en" }, data: home() });
  cache.writeQuery({
    query: SEARCH_TITLES,
    variables: { query: "one", locale: "en", first: 20, after: null },
    data: search(),
  });
  cache.writeQuery({
    query: SEARCH_TITLES,
    variables: { query: "two", locale: "en", first: 20, after: null },
    data: search(id(20)),
  });
  assert.equal(
    cache.readQuery({
      query: SEARCH_TITLES,
      variables: { query: "one", locale: "en", first: 20, after: null },
    }),
    null,
  );
  assert.deepEqual(
    cache.readQuery({
      query: SEARCH_TITLES,
      variables: { query: "two", locale: "en", first: 20, after: null },
    }),
    search(id(20)),
  );
});
