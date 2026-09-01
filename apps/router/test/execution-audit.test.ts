import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { buildSchema } from "graphql";

import {
  GRAPHQL_EXECUTION_PATH_AUDIT,
  validateGraphqlExecutionPathAudit,
} from "../src/execution-audit.js";

const root = new URL("../../../../", import.meta.url);
const source = (name: string) =>
  readFileSync(new URL(`infra/router/generated/${name}.graphql`, root), "utf8");
const api = buildSchema(source("api"));
const sources = Object.freeze({
  catalog: source("catalog"),
  discovery: source("discovery"),
  engagement: source("engagement"),
  identity: source("identity"),
  playback: source("playback"),
});
const operations = (
  JSON.parse(
    readFileSync(new URL("infra/router/generated/persisted-query-manifest.json", root), "utf8"),
  ) as {
    operations: { body: string; id: string; name: string }[];
  }
).operations;

test("every public list and entity path has an exact bounded execution audit", () => {
  assert.doesNotThrow(() => {
    validateGraphqlExecutionPathAudit(api, sources, operations);
  });
  assert.equal(Object.keys(GRAPHQL_EXECUTION_PATH_AUDIT.lists).length, 12);
  assert.equal(Object.keys(GRAPHQL_EXECUTION_PATH_AUDIT.entityReturns).length, 10);
  assert.equal(Object.keys(GRAPHQL_EXECUTION_PATH_AUDIT.entityContributors).length, 5);
  assert.equal(
    GRAPHQL_EXECUTION_PATH_AUDIT.entityContributors["identity.Profile"].maximumOwnerQueriesPerBatch,
    1,
  );
});

test("schema, list metadata and entity contributors cannot drift from the audit", () => {
  const extraList = buildSchema(
    source("api").replace("type Viewer {", "type Extra { values: [String!]! }\n\ntype Viewer {"),
  );
  assert.throws(() => {
    validateGraphqlExecutionPathAudit(extraList, sources, operations);
  }, /list path audit must exactly cover/u);
  assert.throws(() => {
    validateGraphqlExecutionPathAudit(
      api,
      {
        ...sources,
        catalog: sources.catalog.replace(
          "genres: [String!]! @cost(weight: 1) @listSize(assumedSize: 8)",
          "genres: [String!]! @cost(weight: 1) @listSize(assumedSize: 9)",
        ),
      },
      operations,
    );
  }, /Title\.genres list execution audit is invalid/u);
  assert.throws(() => {
    validateGraphqlExecutionPathAudit(
      api,
      {
        ...sources,
        discovery: sources.discovery.replace('@key(fields: "id")', ""),
      },
      operations,
    );
  }, /entity contributor audit must exactly cover/u);
});

test("authorization scope, request bounds and reference-only query budgets fail closed", () => {
  assert.throws(() => {
    validateGraphqlExecutionPathAudit(api, sources, operations, {
      ...GRAPHQL_EXECUTION_PATH_AUDIT,
      entityReturns: {
        ...GRAPHQL_EXECUTION_PATH_AUDIT.entityReturns,
        "Progress.title": {
          ...GRAPHQL_EXECUTION_PATH_AUDIT.entityReturns["Progress.title"],
          maximumParentItems: 21,
        },
      },
    });
  }, /Progress\.title entity-return audit is invalid/u);
  assert.throws(() => {
    validateGraphqlExecutionPathAudit(api, sources, operations, {
      ...GRAPHQL_EXECUTION_PATH_AUDIT,
      entityContributors: {
        ...GRAPHQL_EXECUTION_PATH_AUDIT.entityContributors,
        "discovery.Title": {
          ...GRAPHQL_EXECUTION_PATH_AUDIT.entityContributors["discovery.Title"],
          maximumOwnerQueriesPerBatch: 1,
        },
      },
    });
  }, /discovery\.Title entity-contributor audit is invalid/u);
});

test("owner, trusted-operation scope and loader resolution semantics fail closed", () => {
  assert.throws(() => {
    validateGraphqlExecutionPathAudit(api, sources, operations, {
      ...GRAPHQL_EXECUTION_PATH_AUDIT,
      lists: {
        ...GRAPHQL_EXECUTION_PATH_AUDIT.lists,
        "DiscoverySearchConnection.edges": {
          ...GRAPHQL_EXECUTION_PATH_AUDIT.lists["DiscoverySearchConnection.edges"],
          owner: "catalog",
        },
      },
    });
  }, /DiscoverySearchConnection\.edges list execution audit is invalid/u);
  assert.throws(() => {
    validateGraphqlExecutionPathAudit(api, sources, operations, {
      ...GRAPHQL_EXECUTION_PATH_AUDIT,
      entityReturns: {
        ...GRAPHQL_EXECUTION_PATH_AUDIT.entityReturns,
        "Progress.title": {
          ...GRAPHQL_EXECUTION_PATH_AUDIT.entityReturns["Progress.title"],
          authorizationScope: "public",
        },
      },
    });
  }, /Progress\.title entity-return audit is invalid/u);
  assert.throws(() => {
    validateGraphqlExecutionPathAudit(api, sources, operations, {
      ...GRAPHQL_EXECUTION_PATH_AUDIT,
      entityReturns: {
        ...GRAPHQL_EXECUTION_PATH_AUDIT.entityReturns,
        "Query.title": {
          ...GRAPHQL_EXECUTION_PATH_AUDIT.entityReturns["Query.title"],
          resolution: "materialized",
        },
      },
    });
  }, /Query\.title entity-return audit is invalid/u);
});

test("the owner authorization matrix points to executable exact negative tests", () => {
  const matrix = JSON.parse(
    readFileSync(new URL("evidence/phase-13/authorization-matrix.json", root), "utf8"),
  ) as {
    version: number;
    requirements: string[];
    cases: {
      id: string;
      category: string;
      owner: string;
      file: string;
      test: string;
      expected: string;
    }[];
  };
  assert.equal(matrix.version, 1);
  assert.deepEqual(matrix.requirements, ["P13-R09"]);
  assert.deepEqual([...new Set(matrix.cases.map(({ category }) => category))].sort(), [
    "cross_profile",
    "identifier_substitution",
    "role_escalation",
  ]);
  assert.deepEqual([...new Set(matrix.cases.map(({ owner }) => owner))].sort(), [
    "catalog",
    "discovery",
    "engagement",
    "identity",
    "playback",
  ]);
  assert.equal(new Set(matrix.cases.map(({ id }) => id)).size, matrix.cases.length);
  assert.ok(matrix.cases.length >= 12);
  for (const entry of matrix.cases) {
    assert.match(entry.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    assert.match(entry.file, /^services\/[a-z-]+\/test\/[a-z0-9-]+\.test\.ts$/u);
    assert.match(entry.expected, /^[a-z_]+$/u);
    const target = new URL(entry.file, root);
    assert.equal(existsSync(target), true, entry.file);
    const testSource = readFileSync(target, "utf8");
    assert.ok(testSource.includes(`test("${entry.test}"`), `${entry.id} test reference drifted.`);
  }
});
