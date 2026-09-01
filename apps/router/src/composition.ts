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
  visit,
  type DocumentNode,
  type OperationDefinitionNode,
} from "graphql";
import { createOperationDemandManifest, type DemandOperation } from "./demand.js";
import { validateGraphqlExecutionPathAudit } from "./execution-audit.js";

const SUBGRAPHS = Object.freeze({
  catalog: "http://catalog:3200/graphql",
  discovery: "http://discovery:3500/graphql",
  engagement: "http://engagement:3400/graphql",
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

type TrustedOperation = DemandOperation;

type RetainedOperation = Readonly<{
  body: string;
  definition: OperationDefinitionNode;
}>;

function trustedOperations(definitions: readonly OperationDefinitionNode[]): TrustedOperation[] {
  return definitions
    .map((entry) => {
      const body = print(
        visit(entry, {
          SelectionSet: {
            enter(node, _key, parent) {
              if (
                (parent && "kind" in parent && parent.kind === Kind.OPERATION_DEFINITION) ||
                !node.selections.length
              ) {
                return;
              }
              if (
                node.selections.some(
                  (selection) =>
                    selection.kind === Kind.FIELD &&
                    (selection.name.value === "__typename" ||
                      selection.name.value.startsWith("__")),
                )
              ) {
                return;
              }
              if (
                parent &&
                "kind" in parent &&
                parent.kind === Kind.FIELD &&
                parent.directives?.some((directive) => directive.name.value === "export")
              ) {
                return;
              }
              return {
                ...node,
                selections: [
                  ...node.selections,
                  { kind: Kind.FIELD, name: { kind: Kind.NAME, value: "__typename" } },
                ],
              };
            },
          },
        }),
      );
      return {
        body,
        id: sha256(body),
        name: entry.name?.value ?? "",
        type: entry.operation,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id, "en"));
}

function retainedTrustedOperations(operations: readonly RetainedOperation[]): TrustedOperation[] {
  return operations.map(({ body, definition: entry }) => {
    return {
      body,
      id: sha256(body),
      name: entry.name?.value ?? "",
      type: entry.operation,
    };
  });
}

function parseRetainedOperations(source: string): RetainedOperation[] {
  if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES || source.trim().length === 0) {
    throw new Error("Retained operations source exceeds its bound or is empty.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("Retained operations source must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Retained operations require version 1 and 0–32 exact bodies.");
  }
  const envelope = parsed as Record<string, unknown>;
  if (
    Object.keys(envelope).toSorted().join(",") !== "operations,version" ||
    envelope["version"] !== 1 ||
    !Array.isArray(envelope["operations"]) ||
    envelope["operations"].length > 32
  ) {
    throw new Error("Retained operations require version 1 and 0–32 exact bodies.");
  }
  return (envelope["operations"] as unknown[]).map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Retained operation entries require exactly one string body.");
    }
    const entry = value as Record<string, unknown>;
    if (Object.keys(entry).join(",") !== "body" || typeof entry["body"] !== "string") {
      throw new Error("Retained operation entries require exactly one string body.");
    }
    const parsedBody = document(entry["body"], `Retained operation ${index + 1}`);
    if (
      parsedBody.definitions.length !== 1 ||
      parsedBody.definitions[0]?.kind !== Kind.OPERATION_DEFINITION ||
      !parsedBody.definitions[0].name
    ) {
      throw new Error("Each retained body requires exactly one named operation.");
    }
    return { body: entry["body"], definition: parsedBody.definitions[0] };
  });
}

function trustedOperationsRhai(operations: readonly TrustedOperation[]): string {
  const grouped = Map.groupBy(operations, ({ name }) => name);
  const names = [...grouped.keys()].sort((a, b) => a.localeCompare(b, "en"));
  const labels = names.map((name) => `    if name == "${name}" { return "${name}"; }`);
  const branches = names.map((name) => {
    const hashes = (grouped.get(name) ?? []).map(({ id }) => `hash == "${id}"`).join(" || ");
    return `    if name == "${name}" { return if ${hashes} { "matched" } else { "unknown" }; }`;
  });
  return [
    "// Generated by pnpm schema:update. Do not edit.",
    "fn operation_label(name) {",
    ...labels,
    '    "other"',
    "}",
    "",
    "fn match_operation(name, hash) {",
    ...branches,
    '    "unknown"',
    "}",
    "",
  ].join("\n");
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
  retainedOperations = '{"operations":[],"version":1}',
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
  const supergraph = buildSchema(result.supergraphSdl);
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
  const retained = parseRetainedOperations(retainedOperations);
  const errors = validate(api, operations, undefined, { maxErrors: 20 });
  if (errors.length > 0) {
    throw new Error("Known operation incompatible: " + errors.map((e) => e.message).join("; "));
  }
  for (const { definition: retainedDefinition } of retained) {
    const retainedErrors = validate(
      api,
      { kind: Kind.DOCUMENT, definitions: [retainedDefinition] },
      undefined,
      { maxErrors: 20 },
    );
    if (retainedErrors.length > 0) {
      throw new Error(
        "Retained operation incompatible: " + retainedErrors.map((e) => e.message).join("; "),
      );
    }
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
  const currentTrusted = trustedOperations(definitions).sort(
    (a, b) => a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id, "en"),
  );
  const trusted = [...currentTrusted, ...retainedTrustedOperations(retained)].sort(
    (a, b) => a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id, "en"),
  );
  const operationVersions = Map.groupBy(trusted, ({ name }) => name);
  if (
    trusted.length > 64 ||
    [...operationVersions.values()].some(
      (entries) =>
        entries.length > 2 || new Set(entries.map(({ id }) => id)).size !== entries.length,
    )
  ) {
    throw new Error("Trusted operations allow at most two distinct reviewed bodies per name.");
  }
  artifacts["persisted-query-manifest.json"] =
    JSON.stringify(
      {
        format: "apollo-persisted-query-manifest",
        version: 1,
        operations: trusted,
      },
      null,
      2,
    ) + "\n";
  artifacts["trusted-operations.rhai"] = trustedOperationsRhai(trusted);
  const demandManifest = createOperationDemandManifest(api, supergraph, trusted);
  validateGraphqlExecutionPathAudit(api, sources, trusted);
  artifacts["operation-demand-manifest.json"] = JSON.stringify(demandManifest, null, 2) + "\n";
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
        operations: currentTrusted.map(({ id, name }) => ({ name, sha256: id })),
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
