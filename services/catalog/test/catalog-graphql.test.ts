import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { composeServices } from "@apollo/composition";
import { printSubgraphSchema } from "@apollo/subgraph";
import { findBreakingChanges, parse, print, validate } from "graphql";
import { CATALOG_TYPE_DEFS, createCatalogSchema } from "../src/transport/catalog-schema.js";
import { inspectCatalogOperation } from "../src/transport/graphql-operation.js";
import { catalogTestId as id } from "./rights-fixture.js";

const schema = createCatalogSchema();
const browse =
  'query Browse($first: Int! = 20, $after: String) { titles(first: $first, after: $after) { edges { cursor node { id localized(locale: "pt-BR") { locale title synopsis } releaseYear runtimeSeconds languages genres accessibility editorialLabels credits { name role } artwork { url altText attribution { creator } } attribution { workTitle creator copyrightHolder sourceUrl licenseName licenseVersion licenseUrl attributionText modificationNotice } } } pageInfo { endCursor hasNextPage } } }';
const entities =
  "query Entities($items: [_Any!]!) { _entities(representations: $items) { ... on Title { id localized { title } } } }";
const inspect = (query: string, variables?: Record<string, unknown>) =>
  inspectCatalogOperation({ query, ...(variables ? { variables } : {}) }, schema);

test("Catalog composes with the released Identity schema without breaking its API or representative operations", () => {
  const recorded = readFileSync(
    new URL("../../../../evidence/phase-03/catalog-schema.graphql", import.meta.url),
    "utf8",
  );
  assert.equal(print(parse(recorded)), print(parse(printSubgraphSchema(schema))));
  // Identity's own contract test checks that this released artifact equals its live source schema.
  const identity = {
    name: "identity",
    url: "http://identity:3100/graphql",
    typeDefs: parse(
      readFileSync(
        new URL("../../../../evidence/phase-02/identity-schema.graphql", import.meta.url),
        "utf8",
      ),
    ),
  };
  const before = composeServices([identity]);
  const after = composeServices([
    identity,
    { name: "catalog", typeDefs: CATALOG_TYPE_DEFS, url: "http://catalog:3200/graphql" },
  ]);
  assert.equal(before.errors, undefined);
  assert.equal(after.errors, undefined);
  const baseline = before.schema.toAPISchema().toGraphQLJSSchema();
  const api = after.schema.toAPISchema().toGraphQLJSSchema();
  assert.deepEqual(findBreakingChanges(baseline, api), []);
  assert.ok(after.supergraphSdl.includes('@join__type(graph: CATALOG, key: "id")'));
  for (const query of [
    browse,
    "query Detail($id: ID!) { title(id: $id) { id localized { title synopsis } attribution { creator licenseUrl } } }",
    "query Viewer { me { accountId expiresAt } profiles { profiles { id displayName } activeProfileId } }",
    "mutation SignIn { demoSignIn { code correlationId viewer { accountId } } }",
  ]) {
    assert.deepEqual(validate(api, parse(query)), []);
  }
  assert.equal(schema.getMutationType(), undefined);
  for (const type of Object.values(schema.getTypeMap())) {
    if ("getFields" in type) {
      for (const field of Object.keys(type.getFields())) {
        assert.doesNotMatch(
          field,
          /reviewedBy|evidenceLocations|sourceChecksum|assetSourceUrl|manifestUrl|publicationId|rightsRevision/u,
        );
      }
    }
  }
});

test("realistic browse, detail and twenty Title references pass bounded preflight", () => {
  assert.equal(inspect(browse).status, "accepted");
  assert.equal(
    inspect(entities, {
      items: Array.from({ length: 20 }, (_, n) => ({ __typename: "Title", id: id(n) })),
    }).status,
    "accepted",
  );
  assert.equal(
    inspect(
      'query Q { ...F } fragment F on Query { title(id: "' +
        id(1) +
        '") { ... on Title { localized { title } } } }',
    ).status,
    "accepted",
  );
  assert.equal(inspect("query Q { _service { sdl } }").status, "accepted");
});

test("public GraphQL rejects mutation, introspection, invalid entity references, body extensions and ambiguous documents", () => {
  for (const body of [
    [],
    {},
    null,
    { query: browse, extensions: {} },
    { query: browse, variables: [] },
    { query: browse, operationName: "Wrong" },
  ]) {
    assert.equal(inspectCatalogOperation(body, schema).status, "rejected");
  }
  for (const query of [
    "{ __typename }",
    "query A { __typename } query B { __typename }",
    "mutation M { publish { id } }",
    "subscription S { __typename }",
    "query Q { __schema { types { name } } }",
    'query Q { __type(name: "Title") { name } }',
    "query Q { ...F } fragment F on Query { ...F }",
    "query Q { ...Missing }",
    'query Q { title(id: "' + id(1) + '") { localized(locale: "not a locale") { title } } }',
    'query Q { title(id: "bad") { id } }',
  ]) {
    assert.equal(inspect(query).status, "rejected", query);
  }
  for (const reference of [
    { __typename: "Profile", id: id(1) },
    { __typename: "Title", id: "bad" },
    { __typename: "Title", id: id(1), attribution: "forged" },
  ]) {
    assert.equal(inspect(entities, { items: [reference] }).status, "rejected");
  }
});

test("page, source, tokens, aliases, fields, list expansion and literal/default input budgets reject before execution", () => {
  for (const first of [0, 21, -1, 1.5, null]) {
    assert.equal(inspect(browse, { first }).status, "rejected");
  }
  const aliases = Array.from({ length: 17 }, (_, n) => `a${n}: title(id: "${id(1)}") { id }`).join(
    " ",
  );
  const expensive = Array.from(
    { length: 4 },
    (_, n) =>
      `a${n}: titles(first: 20) { edges { node { credits { name role } attribution { workTitle creator copyrightHolder sourceUrl licenseName licenseVersion licenseUrl attributionText modificationNotice } } } }`,
  ).join(" ");
  for (const query of [
    "query Q { __typename }" + " ".repeat(16384),
    "query Q { " + "__typename ".repeat(2049) + " }",
    "query Q { " + aliases + " }",
    'query Q { title(id: "' + id(1) + '") { ' + "id ".repeat(129) + " } }",
    "query Q { " + expensive + " }",
    "query Q($first: Int! = 21) { titles(first: $first) { edges { node { id } } } }",
  ]) {
    assert.equal(inspect(query).status, "rejected");
  }
  const item = { __typename: "Title", id: id(1) };
  assert.equal(
    inspect(entities, { items: Array.from({ length: 21 }, () => item) }).status,
    "rejected",
  );
  let deep: unknown = "leaf";
  for (let n = 0; n < 10; n++) {
    deep = { child: deep };
  }
  assert.equal(inspect(entities, { items: [], deep }).status, "rejected");
});
