import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { composeServices } from "@apollo/composition";
import { parse, findBreakingChanges } from "graphql";

import { inspectIdentityOperation } from "../src/transport/graphql-operation.js";
import { createIdentitySchema, IDENTITY_TYPE_DEFS } from "../src/transport/identity-schema.js";

const schema = createIdentitySchema();
const inspect = (query: string, variables?: Record<string, unknown>) =>
  inspectIdentityOperation({ query, ...(variables ? { variables } : {}) }, schema);

test("Identity composes as Federation v2 with an owned Profile entity and no credential fields", () => {
  // Historical evidence is immutable; compare its public contract, not additive private fields.
  const previous = composeServices([
    {
      name: "identity",
      url: "http://identity:3100/graphql",
      typeDefs: parse(
        readFileSync(
          new URL("../../../../evidence/phase-02/identity-schema.graphql", import.meta.url),
          "utf8",
        ),
      ),
    },
  ]);
  assert.equal(previous.errors, undefined);
  const composed = composeServices([
    { name: "identity", typeDefs: IDENTITY_TYPE_DEFS, url: "http://identity:3100/graphql" },
  ]);
  assert.equal(composed.errors, undefined);
  const api = composed.schema.toAPISchema().toGraphQLJSSchema();
  assert.deepEqual(findBreakingChanges(previous.schema.toAPISchema().toGraphQLJSSchema(), api), []);
  assert.equal(api.getType("EngagementProfileAuthority"), undefined);
  assert.equal(api.getQueryType()?.getFields()["_engagementProfile"], undefined);
  assert.ok(composed.supergraphSdl.includes('@join__type(graph: IDENTITY, key: "id")'));
  for (const type of Object.values(schema.getTypeMap())) {
    if ("getFields" in type) {
      for (const name of Object.keys(type.getFields())) {
        assert.equal(/credential|sessionId|password|token|signerId/iu.test(name), false);
      }
    }
  }
  assert.deepEqual(Object.keys(schema.getQueryType()?.getFields() ?? {}).sort(), [
    "_engagementProfile",
    "_entities",
    "_service",
    "activeProfile",
    "me",
    "profile",
    "profiles",
  ]);
});

test("bounded named queries, variables, inline fragments and one-field mutations pass preflight", () => {
  for (const query of [
    "query Viewer { me { accountId expiresAt } profiles { profiles { id displayName } activeProfileId } }",
    "query Viewer { ...Fields } fragment Fields on Query { me { accountId } }",
    "query Viewer { ... on Query { me { accountId } } }",
    "mutation SignIn { demoSignIn { code correlationId viewer { accountId } } }",
    'query Entities { _entities(representations: [{__typename: "Profile", id: "00000000-0000-4000-8000-000000000001"}]) { ... on Profile { id } } }',
  ]) {
    assert.equal(inspect(query).status, "accepted");
  }
});

test("reject batching, APQ, ambiguous operations, subscriptions and introspection", () => {
  const bodies: unknown[] = [
    [],
    [{ query: "query Q { __typename }" }],
    null,
    {},
    { query: "query Q { __typename }", extensions: { persistedQuery: {} } },
    { query: "query Q { __typename }", operationName: "Other" },
    { query: "query Q { __typename }", variables: [] },
    { query: "query Q { __typename }", operationName: 1 },
  ];
  for (const body of bodies) {
    assert.equal(inspectIdentityOperation(body, schema).status, "rejected");
  }
  for (const query of [
    "{ me { accountId } }",
    "query Q { me { accountId } } query Other { __typename }",
    "subscription Q { me { accountId } }",
    "query Q { __schema { types { name } } }",
    'query Q { __type(name: "Viewer") { name } }',
    "query Q { me @defer { accountId } }",
    "mutation Q { demoSignIn { code } signOut { code } }",
    "mutation Q { ...Both } fragment Both on Mutation { a: demoSignIn { code } b: demoSignIn { code } }",
    "query Q { ...Loop } fragment Loop on Query { ...Loop }",
    "query Q { ...A } fragment A on Query { ...B } fragment B on Query { ...A }",
    "query Q { ...Missing }",
  ]) {
    assert.equal(inspect(query).status, "rejected", query);
  }
});

test("source, parser, expanded aliases/fields, weighted list cost and fragment fanout are bounded", () => {
  const aliases = Array.from({ length: 17 }, (_, index) => `a${index}: me { accountId }`).join(" ");
  const fields = "id ".repeat(129);
  const listCost = Array.from(
    { length: 16 },
    (_, index) => `a${index}: profiles { profiles { id displayName locale } }`,
  ).join(" ");
  const fragments = Array.from({ length: 12 }, (_, index) =>
    index === 11
      ? "fragment F11 on Query { me { accountId } }"
      : `fragment F${index} on Query { ...F${index + 1} ...F${index + 1} }`,
  ).join(" ");
  for (const query of [
    "query Q { __typename }" + " ".repeat(16_384),
    "query Q { " + aliases + " }",
    "query Q { profiles { profiles { " + fields + " } } }",
    "query Q { " + listCost + " }",
    "query Q { ...F0 } " + fragments,
    "query Q { " + "__typename ".repeat(2_049) + " }",
  ]) {
    assert.equal(inspect(query).status, "rejected");
  }
});

test("variables, default values and literal representations share finite input budgets", () => {
  const query =
    "query Q($items: [_Any!]!) { _entities(representations: $items) { ... on Profile { id } } }";
  const item = { __typename: "Profile", id: "00000000-0000-4000-8000-000000000001" };
  assert.equal(
    inspect(query, { items: Array.from({ length: 16 }, () => item) }).status,
    "accepted",
  );
  assert.deepEqual(inspect(query, { items: Array.from({ length: 17 }, () => item) }), {
    status: "rejected",
    code: "LIMIT_EXCEEDED",
  });
  let deep: unknown = "end";
  for (let level = 0; level < 10; level++) {
    deep = { value: deep };
  }
  for (const variables of [
    { items: [], extra: deep },
    { items: [], extra: "x".repeat(4_097) },
    { items: [], extra: Object.fromEntries(Array.from({ length: 257 }, (_, i) => [String(i), i])) },
  ]) {
    assert.equal(inspect(query, variables).status, "rejected");
  }
  const literals = Array.from({ length: 17 }, () => '{__typename:"Profile",id:"test"}').join(",");
  assert.equal(
    inspect("query Q { _entities(representations: [" + literals + "]) { ... on Profile { id } } }")
      .status,
    "rejected",
  );
  assert.equal(
    inspect(
      "query Q($items:[_Any!]! = [" +
        literals +
        "]) { _entities(representations: $items) { ... on Profile { id } } }",
    ).status,
    "rejected",
  );
});
