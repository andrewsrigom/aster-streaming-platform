import { createHash } from "node:crypto";
import { composeServices } from "@apollo/composition";
import {
  Kind,
  buildSchema,
  findBreakingChanges,
  lexicographicSortSchema,
  parse,
  print,
  printSchema,
  validate,
  type DocumentNode,
} from "graphql";

const SUBGRAPHS = Object.freeze({
  catalog: "http://catalog:3200/graphql",
  identity: "http://identity:3100/graphql",
  playback: "http://playback:3300/graphql",
});
export type SubgraphName = keyof typeof SUBGRAPHS;
export type ArtifactSet = Readonly<Record<string, string>>;
const MAX_SOURCE_BYTES = 131_072;
const MAX_ARTIFACT_BYTES = 1_048_576;

function document(source: string, label: string): DocumentNode {
  if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES || source.trim().length === 0) {
    throw new Error(label + " exceeds the source bound or is empty.");
  }
  return parse(source, { maxTokens: 20_000 });
}

export function sha256(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function ownership(source: DocumentNode) {
  return source.definitions
    .flatMap((definition) => {
      if (
        definition.kind !== Kind.OBJECT_TYPE_DEFINITION &&
        definition.kind !== Kind.INTERFACE_TYPE_DEFINITION &&
        definition.kind !== Kind.INPUT_OBJECT_TYPE_DEFINITION &&
        definition.kind !== Kind.ENUM_TYPE_DEFINITION &&
        definition.kind !== Kind.SCALAR_TYPE_DEFINITION &&
        definition.kind !== Kind.UNION_TYPE_DEFINITION
      ) {
        return [];
      }
      return [
        {
          type: definition.name.value,
          kind: definition.kind,
          fields:
            "fields" in definition
              ? (definition.fields ?? []).map((field) => field.name.value).sort()
              : [],
          keys: (definition.directives ?? [])
            .filter((directive) => directive.name.value === "key")
            .flatMap((directive) =>
              (directive.arguments ?? []).flatMap((argument) =>
                argument.name.value === "fields" && argument.value.kind === Kind.STRING
                  ? [argument.value.value]
                  : [],
              ),
            ),
        },
      ];
    })
    .sort((a, b) => a.type.localeCompare(b.type, "en"));
}

export function composeLocalSupergraph(
  sources: Readonly<Record<SubgraphName, string>>,
  knownOperations: string,
  baselineApi?: string,
  baselineOperations?: string,
): ArtifactSet {
  const names = Object.keys(SUBGRAPHS) as SubgraphName[];
  const subgraphs = names.map((name) => ({
    name,
    url: SUBGRAPHS[name],
    typeDefs: document(sources[name], name),
  }));
  const result = composeServices(subgraphs);
  if (result.errors) {
    throw new Error(
      "Composition failed: " +
        result.errors
          .slice(0, 10)
          .map((e) => e.message)
          .join("; "),
    );
  }
  const api = result.schema.toAPISchema().toGraphQLJSSchema();
  const operations = document(knownOperations, "Known operations");
  const definitions = operations.definitions.filter(
    (entry) => entry.kind === Kind.OPERATION_DEFINITION,
  );
  if (
    definitions.length < 1 ||
    definitions.length > 32 ||
    definitions.some((entry) => !entry.name) ||
    operations.definitions.some((entry) => entry.kind !== Kind.OPERATION_DEFINITION)
  ) {
    throw new Error("Known operations require 1–32 named operations without external fragments.");
  }
  const errors = validate(api, operations, undefined, { maxErrors: 20 });
  if (errors.length > 0) {
    throw new Error("Known operation incompatible: " + errors.map((e) => e.message).join("; "));
  }
  if (baselineOperations !== undefined) {
    const previousErrors = validate(
      api,
      document(baselineOperations, "Baseline operations"),
      undefined,
      { maxErrors: 20 },
    );
    if (previousErrors.length > 0) {
      throw new Error(
        "Baseline operation incompatible: " + previousErrors.map((e) => e.message).join("; "),
      );
    }
  }
  if (baselineApi !== undefined) {
    if (Buffer.byteLength(baselineApi) > MAX_ARTIFACT_BYTES) {
      throw new Error("API baseline exceeds its bound.");
    }
    const changes = findBreakingChanges(buildSchema(baselineApi), api);
    if (changes.length > 0) {
      throw new Error(
        "Breaking API change: " +
          changes
            .slice(0, 20)
            .map((change) => change.description)
            .join("; "),
      );
    }
  }
  const artifacts: Record<string, string> = {
    "api.graphql": printSchema(lexicographicSortSchema(api)) + "\n",
    "supergraph.graphql": print(parse(result.supergraphSdl)) + "\n",
  };
  for (const subgraph of subgraphs) {
    artifacts[subgraph.name + ".graphql"] = print(subgraph.typeDefs) + "\n";
  }
  artifacts["manifest.json"] =
    JSON.stringify(
      {
        formatVersion: 1,
        composerVersion: "2.14.4",
        graphqlVersion: "16.14.2",
        files: Object.fromEntries(
          Object.entries(artifacts).map(([name, source]) => [name, sha256(source)]),
        ),
        subgraphs: subgraphs.map((subgraph) => ({
          name: subgraph.name,
          routingUrl: subgraph.url,
          ownership: ownership(subgraph.typeDefs),
        })),
        operations: definitions
          .map((entry) => ({
            name: entry.name?.value,
            sha256: sha256(print(entry)),
          }))
          .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "en")),
      },
      null,
      2,
    ) + "\n";
  for (const source of Object.values(artifacts)) {
    if (Buffer.byteLength(source) > MAX_ARTIFACT_BYTES) {
      throw new Error("Composed artifact exceeds its bound.");
    }
  }
  return Object.freeze(artifacts);
}
