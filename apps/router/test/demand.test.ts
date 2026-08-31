import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { buildSchema, Kind, OperationTypeNode, parse, type OperationDefinitionNode } from "graphql";
import {
  GRAPHQL_DEMAND_POLICY,
  analyzeOperationDemand,
  createOperationDemandManifest,
  type DemandOperation,
  type DemandPolicy,
} from "../src/demand.js";

const schemaSource = `
  directive @cost(weight: Int!) on FIELD_DEFINITION | OBJECT
  directive @listSize(
    assumedSize: Int
    slicingArguments: [String!]
    sizedFields: [String!]
    requireOneSlicingArgument: Boolean = true
  ) on FIELD_DEFINITION
  type Query {
    books(first: Int!): [Book!]!
      @cost(weight: 5)
      @listSize(assumedSize: 20, slicingArguments: ["first"])
  }
  type Mutation { addBook: Book! @cost(weight: 7) }
  type Book @cost(weight: 2) {
    author: Author!
    tags: [String!]! @cost(weight: 1) @listSize(assumedSize: 3)
  }
  type Author { name: String! }
`;

function demandOperation(body: string): DemandOperation {
  const definitions = parse(body).definitions.filter(
    (definition): definition is OperationDefinitionNode =>
      definition.kind === Kind.OPERATION_DEFINITION,
  );
  const definition = definitions[0];
  assert.equal(definitions.length, 1);
  assert.ok(definition?.name);
  return {
    body,
    id: createHash("sha256").update(body).digest("hex"),
    name: definition.name.value,
    type: definition.operation,
  };
}

function policy(overrides: Partial<DemandPolicy>): DemandPolicy {
  return Object.freeze({ ...GRAPHQL_DEMAND_POLICY, ...overrides });
}

test("variables use the owner maximum while bounded literals lower the exact estimate", () => {
  const schema = buildSchema(schemaSource);
  const variable = demandOperation(`
    query Books($first: Int! = 1) {
      a: books(first: $first) { ...BookFields }
    }
    fragment BookFields on Book { author { name } tags }
  `);
  const variableProfile = analyzeOperationDemand(schema, schema, variable);
  assert.deepEqual(
    {
      aliases: variableProfile.aliases,
      cost: variableProfile.cost,
      depth: variableProfile.depth,
      listExpansion: variableProfile.listExpansion,
      rootFields: variableProfile.rootFields,
      selections: variableProfile.selections,
    },
    { aliases: 1, cost: 180, depth: 3, listExpansion: 60, rootFields: 1, selections: 4 },
  );

  const literal = demandOperation(
    `query BooksLiteral { books(first: 2) { author { name } tags } }`,
  );
  const literalProfile = analyzeOperationDemand(schema, schema, literal);
  assert.equal(literalProfile.cost, 18);
  assert.equal(literalProfile.listExpansion, 6);
  assert.equal(literalProfile.aliases, 0);
});

test("missing root cost, list maximum and excessive literal fail closed", () => {
  const operation = demandOperation(`query Books { books(first: 2) { author { name } } }`);
  assert.throws(
    () =>
      analyzeOperationDemand(
        buildSchema(schemaSource.replace("@cost(weight: 5)", "")),
        buildSchema(schemaSource.replace("@cost(weight: 5)", "")),
        operation,
      ),
    /Query\.books requires @cost/u,
  );
  assert.throws(
    () =>
      analyzeOperationDemand(
        buildSchema(
          schemaSource.replace('@listSize(assumedSize: 20, slicingArguments: ["first"])', ""),
        ),
        buildSchema(
          schemaSource.replace('@listSize(assumedSize: 20, slicingArguments: ["first"])', ""),
        ),
        operation,
      ),
    /Query\.books requires direct @listSize/u,
  );
  const excessive = demandOperation(`query BooksLarge { books(first: 21) { author { name } } }`);
  const schema = buildSchema(schemaSource);
  assert.throws(
    () => analyzeOperationDemand(schema, schema, excessive),
    /literal first exceeds its owner list maximum/u,
  );
  const invalidMetadata = buildSchema(
    schemaSource.replace('slicingArguments: ["first"]', 'slicingArguments: ["missing"]'),
  );
  assert.throws(
    () => analyzeOperationDemand(invalidMetadata, invalidMetadata, operation),
    /Query\.books has invalid list metadata/u,
  );
  const optionalSchema = buildSchema(schemaSource.replace("first: Int!", "first: Int = 1"));
  const omitted = demandOperation(`query BooksOmitted { books { author { name } } }`);
  assert.throws(
    () => analyzeOperationDemand(optionalSchema, optionalSchema, omitted),
    /exactly one slicing argument is required/u,
  );
});

test("shape and numeric bounds stop amplification before publication", () => {
  const schema = buildSchema(schemaSource);
  const aliases = demandOperation(`
    query Aliases {
      first: books(first: 1) { author { name } }
      second: books(first: 1) { author { name } }
    }
  `);
  assert.throws(
    () => analyzeOperationDemand(schema, schema, aliases, policy({ maximumAliases: 1 })),
    /maximumAliases exceeded/u,
  );
  const deep = demandOperation(`query Deep { books(first: 1) { author { name } } }`);
  assert.throws(
    () => analyzeOperationDemand(schema, schema, deep, policy({ maximumDepth: 2 })),
    /maximumDepth exceeded/u,
  );
  const roots = demandOperation(`
    query Roots {
      books(first: 1) { author { name } }
      booksAgain: books(first: 1) { author { name } }
    }
  `);
  assert.throws(
    () => analyzeOperationDemand(schema, schema, roots, policy({ maximumRootFields: 1 })),
    /maximumRootFields exceeded/u,
  );
  const bounded = demandOperation(`query Bounded { books(first: 2) { author { name } tags } }`);
  assert.throws(
    () => analyzeOperationDemand(schema, schema, bounded, policy({ maximumSelections: 3 })),
    /maximumSelections exceeded/u,
  );
  assert.throws(
    () => analyzeOperationDemand(schema, schema, bounded, policy({ maximumListExpansion: 5 })),
    /maximumListExpansion exceeded/u,
  );
  assert.throws(
    () => analyzeOperationDemand(schema, schema, bounded, policy({ maximumCost: 17 })),
    /maximumCost exceeded/u,
  );

  const overflowSchema = buildSchema(`
    directive @cost(weight: Int!) on FIELD_DEFINITION | OBJECT
    directive @listSize(assumedSize: Int) on FIELD_DEFINITION
    type Query {
      rows: [Row!]! @cost(weight: 1) @listSize(assumedSize: 2147483647)
    }
    type Row { children: [Leaf!]! @listSize(assumedSize: 2147483647) }
    type Leaf { value: String! }
  `);
  const overflow = demandOperation(`query Overflow { rows { children { value } } }`);
  assert.throws(
    () =>
      analyzeOperationDemand(
        overflowSchema,
        overflowSchema,
        overflow,
        policy({
          maximumCost: Number.MAX_SAFE_INTEGER,
          maximumListExpansion: Number.MAX_SAFE_INTEGER,
        }),
      ),
    /numeric cost overflow/u,
  );
});

test("mutation base, fragment cycles and repeated metadata remain explicit", () => {
  const schema = buildSchema(schemaSource);
  const mutation = demandOperation(`mutation AddBook { addBook { author { name } } }`);
  const mutationProfile = analyzeOperationDemand(schema, schema, mutation);
  assert.deepEqual(
    {
      cost: mutationProfile.cost,
      depth: mutationProfile.depth,
      listExpansion: mutationProfile.listExpansion,
      rootFields: mutationProfile.rootFields,
      selections: mutationProfile.selections,
      type: mutationProfile.type,
    },
    {
      cost: 18,
      depth: 3,
      listExpansion: 1,
      rootFields: 1,
      selections: 3,
      type: OperationTypeNode.MUTATION,
    },
  );

  const cyclic = demandOperation(`
    query Cyclic { books(first: 1) { ...First } }
    fragment First on Book { ...Second }
    fragment Second on Book { ...First }
  `);
  assert.throws(
    () => analyzeOperationDemand(schema, schema, cyclic),
    /body is incompatible with the public schema/u,
  );

  const repeatedMetadataSource = schemaSource
    .replace("directive @cost(weight: Int!)", "directive @cost(weight: Int!) repeatable")
    .replace("@cost(weight: 5)", "@cost(weight: 5) @cost(weight: 6)");
  const repeatedMetadata = buildSchema(repeatedMetadataSource);
  const books = demandOperation(`query RepeatedMetadata { books(first: 1) { author { name } } }`);
  assert.throws(
    () => analyzeOperationDemand(repeatedMetadata, repeatedMetadata, books),
    /metadata repeats @cost/u,
  );
});

test("trusted operation analysis uses the same parser-token ceiling as Router", () => {
  const body = `query TokenHeavy(${Array.from(
    { length: 600 },
    (_, index) => `$v${String(index)}:Int`,
  ).join(" ")}) { books(first: 1) { author { name } } }`;
  const operation = demandOperation(body);
  const schema = buildSchema(schemaSource);
  assert.throws(
    () => analyzeOperationDemand(schema, schema, operation),
    /body exceeds parser token limit or is malformed/u,
  );
});

test("trusted operation analysis includes the GraphQL envelope in the Router body limit", () => {
  const name = "OversizedRequest";
  const base = `query ${name} { books(first: 1) { tags } }`;
  const envelopeBytes = Buffer.byteLength(
    JSON.stringify({ operationName: name, query: base, variables: {} }),
    "utf8",
  );
  const body = base + " ".repeat(32_768 - envelopeBytes + 1);
  assert.ok(Buffer.byteLength(body, "utf8") < 32_768);
  assert.ok(
    Buffer.byteLength(JSON.stringify({ operationName: name, query: body, variables: {} }), "utf8") >
      32_768,
  );
  const schema = buildSchema(schemaSource);
  assert.throws(
    () => analyzeOperationDemand(schema, schema, demandOperation(body)),
    /encoded request exceeds the Router body limit/u,
  );
});

test("the manifest preserves exact name, type and hash cardinality", () => {
  const schema = buildSchema(schemaSource);
  const operations = [
    demandOperation(`query Second { books(first: 2) { author { name } } }`),
    demandOperation(`query First { books(first: 1) { tags } }`),
  ];
  const manifest = createOperationDemandManifest(schema, schema, operations);
  assert.equal(manifest.format, "aster-operation-demand-manifest");
  assert.deepEqual(
    manifest.operations.map(({ name }) => name),
    ["First", "Second"],
  );
  for (const profile of manifest.operations) {
    assert.equal(profile.id, operations.find(({ name }) => name === profile.name)?.id);
  }
  const first = operations[0];
  assert.ok(first);
  assert.throws(
    () => createOperationDemandManifest(schema, schema, [first, first]),
    /hashes must be unique/u,
  );
});
