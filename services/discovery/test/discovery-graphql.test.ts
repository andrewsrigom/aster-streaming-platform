import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { composeServices } from "@apollo/composition";
import {
  buildSchema,
  findBreakingChanges,
  graphql,
  parse,
  validate,
  type GraphQLObjectType,
} from "graphql";
import { createTitleSearch } from "../src/application/search-titles.js";
import type { SearchUnitOfWork } from "../src/application/search-ports.js";
import { searchCursor } from "../src/domain/search-input.js";
import {
  createDiscoveryGraphqlContext,
  createDiscoverySchema,
  DISCOVERY_TYPE_DEFS,
} from "../src/transport/discovery-schema.js";
import { inspectDiscoveryOperation } from "../src/transport/graphql-operation.js";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const now = 1_700_000_000;
const generation = id(90);
export const SEARCH_TITLES =
  "query SearchTitles($query: String!, $locale: String!, $first: Int! = 20, $after: String) { searchTitles(query: $query, locale: $locale, first: $first, after: $after) { code correlationId connection { generation edges { cursor sourceVersion indexedAt visibleUntil node { id } } pageInfo { endCursor hasNextPage } } } }";
const variables = { query: "Café", locale: "pt-BR", first: 2, after: null };

function search(stale = false) {
  const transactions: SearchUnitOfWork = {
    async run(work, signal) {
      return signal.aborted
        ? { status: "cancelled" }
        : {
            status: "completed",
            value: await work({
              activeGeneration: () => Promise.resolve(generation),
              projectionStale: () => Promise.resolve(stale),
              find: () =>
                Promise.resolve([
                  {
                    titleId: id(1),
                    rank: 900_000,
                    sourceVersion: 7,
                    indexedAt: now,
                    visibleUntil: now + 300,
                  },
                ]),
            }),
          };
    },
  };
  return createTitleSearch({ transactions });
}

test("Discovery composes additively and contributes search plus Catalog Title references only", () => {
  const root = new URL("../../../../", import.meta.url);
  const previous = readFileSync(new URL("infra/router/generated/api.graphql", root), "utf8");
  const known = readFileSync(new URL("infra/router/known-operations.graphql", root), "utf8");
  const owners = ["identity", "catalog", "playback", "engagement"].map((name) => ({
    name,
    url: `http://${name}:${name === "identity" ? 3100 : name === "catalog" ? 3200 : name === "playback" ? 3300 : 3400}/graphql`,
    typeDefs: parse(readFileSync(new URL(`infra/router/generated/${name}.graphql`, root), "utf8")),
  }));
  const result = composeServices([
    ...owners,
    { name: "discovery", url: "http://discovery:3500/graphql", typeDefs: DISCOVERY_TYPE_DEFS },
  ]);
  assert.equal(result.errors, undefined);
  const api = result.schema.toAPISchema().toGraphQLJSSchema();
  assert.deepEqual(findBreakingChanges(buildSchema(previous), api), []);
  assert.deepEqual(validate(api, parse(known)), []);
  assert.deepEqual(validate(api, parse(SEARCH_TITLES)), []);
  assert.match(result.supergraphSdl, /http:\/\/discovery:3500\/graphql/u);
  assert.equal(api.getType("DiscoverySourceSnapshot"), undefined);
  assert.equal(api.getQueryType()?.getFields()["_discoveryExport"], undefined);
  assert.equal(
    String((api.getType("DiscoverySearchEdge") as GraphQLObjectType).getFields()["node"]?.type),
    "Title",
  );
});

test("search resolver returns bounded Title references and explicit freshness metadata", async () => {
  const result = await graphql({
    schema: createDiscoverySchema(),
    source: SEARCH_TITLES,
    variableValues: variables,
    contextValue: createDiscoveryGraphqlContext(
      search(),
      () => now,
      AbortSignal.timeout(1000),
      id(99),
    ),
  });
  assert.equal(result.errors, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(result.data)), {
    searchTitles: {
      code: "COMPLETED",
      correlationId: id(99),
      connection: {
        generation,
        edges: [
          {
            cursor: searchCursor(
              { query: "cafe", locale: "pt-BR", generation },
              { rank: 900_000, titleId: id(1) },
            ),
            sourceVersion: 7,
            indexedAt: now,
            visibleUntil: now + 300,
            node: { id: id(1) },
          },
        ],
        pageInfo: {
          endCursor: searchCursor(
            { query: "cafe", locale: "pt-BR", generation },
            { rank: 900_000, titleId: id(1) },
          ),
          hasNextPage: false,
        },
      },
    },
  });
});

test("stale projection is explicit and a forged context cannot invoke search", async () => {
  const stale = await graphql({
    schema: createDiscoverySchema(),
    source: SEARCH_TITLES,
    variableValues: variables,
    contextValue: createDiscoveryGraphqlContext(
      search(true),
      () => now,
      AbortSignal.timeout(1000),
      id(99),
    ),
  });
  assert.deepEqual(JSON.parse(JSON.stringify(stale.data)), {
    searchTitles: { code: "STALE", correlationId: id(99), connection: null },
  });
  let calls = 0;
  const forged = await graphql({
    schema: createDiscoverySchema(),
    source: SEARCH_TITLES,
    variableValues: variables,
    contextValue: {
      search: {
        execute: () => {
          calls++;
          return Promise.resolve({ status: "unavailable" });
        },
      },
    },
  });
  assert.equal(forged.errors?.[0]?.extensions["code"], "UNAVAILABLE");
  assert.equal(calls, 0);
});

test("operation guard accepts bounded search/service documents and rejects amplification", () => {
  for (const [query, supplied, operation] of [
    [SEARCH_TITLES, variables, "search_titles"],
    [
      SEARCH_TITLES.replace("SearchTitles", "SearchTitles__discovery__0"),
      variables,
      "search_titles",
    ],
    ['query Search { searchTitles(query: "Signal", locale: "en") { code } }', {}, "search_titles"],
    ["query Service { _service { sdl } }", {}, "service_schema"],
  ] as const) {
    assert.deepEqual(inspectDiscoveryOperation({ query, variables: supplied }), {
      status: "accepted",
      operation,
    });
  }

  const previousCursor = searchCursor(
    { query: "cafe", locale: "pt-BR", generation: id(89) },
    { rank: 1, titleId: id(1) },
  );
  assert.equal(
    inspectDiscoveryOperation({
      query: SEARCH_TITLES,
      variables: { ...variables, after: previousCursor },
    }).status,
    "accepted",
  );

  for (const query of [
    SEARCH_TITLES + " query Other { __typename }",
    SEARCH_TITLES.replace("query SearchTitles", "mutation SearchTitles"),
    'query Search { a: searchTitles(query: "a", locale: "en") { code } b: searchTitles(query: "b", locale: "en") { code } }',
    'query Search { searchTitles(query: "Signal", locale: "en", first: 21) { code } }',
    'query Search { searchTitles(query: "Signal", locale: "bad locale") { code } }',
    'query Search { searchTitles(query: "Signal", locale: "en") { connection { edges { node { synopsis } } } } }',
    "query Search { __schema { types { name } } }",
    "query Search { ...F } fragment F on Query { ...F }",
    SEARCH_TITLES.replace(
      "cursor sourceVersion indexedAt visibleUntil",
      "a:cursor b:cursor c:cursor d:cursor e:cursor",
    ),
    SEARCH_TITLES + " ".repeat(4096),
  ]) {
    assert.equal(
      inspectDiscoveryOperation({ query, variables }).status,
      "rejected",
      query.slice(0, 80),
    );
  }
  for (const value of [
    null,
    [],
    {},
    { query: SEARCH_TITLES, variables: [] },
    { query: SEARCH_TITLES, variables: { ...variables, query: ["Signal"] } },
    { query: SEARCH_TITLES, variables, extensions: {} },
    { query: SEARCH_TITLES, variables, operationName: "Wrong" },
  ]) {
    assert.equal(inspectDiscoveryOperation(value).status, "rejected");
  }
});
