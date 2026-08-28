import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { composeServices } from "@apollo/composition";
import { buildSchema, findBreakingChanges, graphql, parse, validate } from "graphql";
import { createPlaybackSchema, PLAYBACK_TYPE_DEFS } from "../src/transport/playback-schema.js";
import { inspectPlaybackOperation } from "../src/transport/graphql-operation.js";

const titleId = "00000000-0000-4000-8000-000000000001";
export const START_PLAYBACK =
  "mutation StartPlayback($titleId: ID!) { createPlaybackSession(titleId: $titleId) { code correlationId session { id titleId manifestUrl expiresAt } } }";
const schema = createPlaybackSchema();
const inspect = (query: string, variables: Record<string, unknown> = { titleId }) =>
  inspectPlaybackOperation({ query, variables });

test("Playback composes additively, preserves existing operations and does not expose stored audit or caller authority", () => {
  const root = new URL("../../../../", import.meta.url);
  const previous = readFileSync(new URL("infra/router/generated/api.graphql", root), "utf8");
  const known = readFileSync(new URL("infra/router/known-operations.graphql", root), "utf8");
  const result = composeServices([
    ...["identity", "catalog"].map((name) => ({
      name,
      url: `http://${name}:${name === "identity" ? 3100 : 3200}/graphql`,
      typeDefs: parse(
        readFileSync(new URL(`infra/router/generated/${name}.graphql`, root), "utf8"),
      ),
    })),
    { name: "playback", url: "http://playback:3300/graphql", typeDefs: PLAYBACK_TYPE_DEFS },
  ]);
  assert.equal(result.errors, undefined);
  const api = result.schema.toAPISchema().toGraphQLJSSchema();
  assert.deepEqual(findBreakingChanges(buildSchema(previous), api), []);
  assert.deepEqual(validate(api, parse(known)), []);
  assert.deepEqual(validate(api, parse(START_PLAYBACK)), []);
  assert.equal(api.getType("CurrentPlaybackPublication"), undefined);
  assert.equal(api.getQueryType()?.getFields()["_playbackPublications"], undefined);
  assert.match(result.supergraphSdl, /http:\/\/playback:3300\/graphql/u);
  const mutation = api.getMutationType()?.getFields()["createPlaybackSession"];
  assert.deepEqual(
    mutation?.args.map((argument) => argument.name),
    ["titleId"],
  );
  const publicSession = api.getType("PlaybackSession");
  assert.ok(publicSession && "getFields" in publicSession);
  assert.deepEqual(Object.keys(publicSession.getFields()).sort(), [
    "expiresAt",
    "id",
    "manifestUrl",
    "titleId",
  ]);
});

test("bounded realistic mutation, Router naming, typename and finite fragments pass", () => {
  for (const query of [
    START_PLAYBACK,
    START_PLAYBACK.replace("StartPlayback", "StartPlayback__playback__0"),
    "mutation Start($titleId: ID!) { createPlaybackSession(titleId: $titleId) { __typename code session { ...Fields } } } fragment Fields on PlaybackSession { id manifestUrl expiresAt }",
    `mutation Start { createPlaybackSession(titleId: "${titleId}") { code } }`,
    `mutation Start($titleId: ID! = "${titleId}") { createPlaybackSession(titleId: $titleId) { code } }`,
  ]) {
    assert.equal(inspect(query).status, "accepted", query);
  }
  assert.equal(inspect("query Service { _service { sdl } }", {}).status, "accepted");
});

test("malformed, amplified, introspective and caller-authority operations reject before any mutation", () => {
  for (const query of [
    START_PLAYBACK + " mutation Other { __typename }",
    START_PLAYBACK.replace("mutation StartPlayback", "query StartPlayback"),
    START_PLAYBACK.replace("mutation StartPlayback", "subscription StartPlayback"),
    `mutation M { a: createPlaybackSession(titleId: "${titleId}") { code } b: createPlaybackSession(titleId: "${titleId}") { code } }`,
    `mutation M { createPlaybackSession(titleId: "bad") { code } }`,
    `mutation M { createPlaybackSession(titleId: "${titleId}", profileId: "${titleId}") { code } }`,
    "query Q { __schema { types { name } } }",
    'query Q { __type(name: "PlaybackSession") { name } }',
    "mutation M { ...F } fragment F on Mutation { ...F }",
    "mutation M { ...Missing }",
    START_PLAYBACK.replace("id titleId manifestUrl expiresAt", "id ".repeat(17)),
    START_PLAYBACK.replace("id titleId manifestUrl expiresAt", "a:id b:id c:id d:id e:id"),
    START_PLAYBACK.replace("manifestUrl", "profileId"),
    START_PLAYBACK + " ".repeat(4096),
    "mutation M { " + "__typename ".repeat(513) + " }",
  ]) {
    assert.equal(inspect(query).status, "rejected", query.slice(0, 80));
  }
  for (const value of [
    [],
    null,
    {},
    { query: START_PLAYBACK, variables: [] },
    { query: START_PLAYBACK, variables: { titleId: [titleId] } },
    { query: START_PLAYBACK, variables: { titleId }, extensions: {} },
    { query: START_PLAYBACK, variables: { titleId }, operationName: "Wrong" },
    { query: START_PLAYBACK, variables: { titleId, a: true, b: true, c: true, d: true } },
  ]) {
    assert.equal(inspectPlaybackOperation(value).status, "rejected");
  }
});

test("a forged GraphQL context cannot supply a session application or authority", async () => {
  let calls = 0;
  const result = await graphql({
    schema,
    source: START_PLAYBACK,
    variableValues: { titleId },
    contextValue: {
      sessions: {
        create() {
          calls++;
          return Promise.resolve({ status: "completed" });
        },
      },
    },
  });
  assert.equal(result.errors?.[0]?.extensions["code"], "UNAVAILABLE");
  assert.equal(calls, 0);
});
