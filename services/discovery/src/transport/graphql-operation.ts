import {
  Kind,
  OperationTypeNode,
  parse,
  valueFromASTUntyped,
  type FragmentDefinitionNode,
  type SelectionSetNode,
} from "graphql";
import { normalizeHomeRailInput } from "../domain/home-rail.js";
import { normalizeSearchInput } from "../domain/search-input.js";

export const DISCOVERY_GRAPHQL_LIMITS = Object.freeze({
  bodyBytes: 16_384,
  sourceBytes: 4_096,
  tokens: 512,
  fields: 96,
  depth: 6,
  aliases: 4,
  cost: 1_024,
  concurrent: 4,
  deadlineMs: 1_500,
  rateBurst: 32,
  ratePerSecond: 4,
});

export type DiscoveryOperation = "home_rails" | "search_titles" | "service_schema";
type Decision =
  | Readonly<{ status: "accepted"; operation: DiscoveryOperation }>
  | Readonly<{ status: "rejected"; code: "INVALID_INPUT" | "LIMIT_EXCEEDED" }>;
type Scope =
  | "Query"
  | "Payload"
  | "Connection"
  | "Edge"
  | "PageInfo"
  | "HomePayload"
  | "RailResult"
  | "GenreResult"
  | "Rail"
  | "RailEdge"
  | "Title"
  | "Service";

const FIELDS: Readonly<Record<Scope, Readonly<Record<string, Scope | null>>>> = {
  Query: { homeRails: "HomePayload", searchTitles: "Payload", _service: "Service" },
  Payload: { code: null, correlationId: null, connection: "Connection" },
  Connection: { generation: null, edges: "Edge", pageInfo: "PageInfo" },
  Edge: {
    cursor: null,
    node: "Title",
    sourceVersion: null,
    indexedAt: null,
    visibleUntil: null,
  },
  PageInfo: { endCursor: null, hasNextPage: null },
  HomePayload: {
    code: null,
    correlationId: null,
    generation: null,
    generatedAt: null,
    featured: "RailResult",
    recentlyAdded: "RailResult",
    trending: "RailResult",
    genres: "GenreResult",
  },
  RailResult: { code: null, rail: "Rail" },
  GenreResult: { code: null, rails: "Rail" },
  Rail: {
    key: null,
    kind: null,
    genre: null,
    source: null,
    oldestIndexedAt: null,
    freshUntil: null,
    edges: "RailEdge",
  },
  RailEdge: { node: "Title", sourceVersion: null, indexedAt: null, visibleUntil: null },
  Title: { id: null },
  Service: { sdl: null },
};
const TYPE_NAMES: Readonly<Record<Scope, string>> = {
  Query: "Query",
  Payload: "DiscoverySearchPayload",
  Connection: "DiscoverySearchConnection",
  Edge: "DiscoverySearchEdge",
  PageInfo: "DiscoveryPageInfo",
  HomePayload: "DiscoveryHomePayload",
  RailResult: "DiscoveryRailResult",
  GenreResult: "DiscoveryGenreRailResult",
  Rail: "DiscoveryRail",
  RailEdge: "DiscoveryRailEdge",
  Title: "Title",
  Service: "_Service",
};
const CURSOR_GENERATION = "00000000-0000-4000-8000-000000090001";

class Rejected extends Error {
  constructor(readonly code: "INVALID_INPUT" | "LIMIT_EXCEEDED" = "INVALID_INPUT") {
    super("Discovery operation rejected.");
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scalar(value: unknown): boolean {
  return (
    value === null ||
    (typeof value === "string" && value.length <= 1_280) ||
    (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 20)
  );
}

function fragmentScope(scope: Scope, condition: string | undefined): Scope {
  if (condition === undefined || TYPE_NAMES[scope] === condition) {
    return scope;
  }
  throw new Rejected();
}

export function inspectDiscoveryOperation(body: unknown): Decision {
  try {
    if (
      !record(body) ||
      Object.keys(body).some((key) => !["query", "variables", "operationName"].includes(key)) ||
      typeof body["query"] !== "string" ||
      (body["operationName"] !== undefined && typeof body["operationName"] !== "string") ||
      (body["variables"] !== undefined && !record(body["variables"]))
    ) {
      throw new Rejected();
    }
    if (Buffer.byteLength(body["query"], "utf8") > DISCOVERY_GRAPHQL_LIMITS.sourceBytes) {
      throw new Rejected("LIMIT_EXCEEDED");
    }
    const variables = { ...(body["variables"] ?? {}) };
    if (
      Object.keys(variables).length > 4 ||
      Object.values(variables).some((value) => !scalar(value))
    ) {
      throw new Rejected();
    }
    const document = parse(body["query"], {
      maxTokens: DISCOVERY_GRAPHQL_LIMITS.tokens,
      noLocation: true,
    });
    const operations = document.definitions.filter(
      (definition) => definition.kind === Kind.OPERATION_DEFINITION,
    );
    const operation = operations[0];
    if (
      operations.length !== 1 ||
      !operation?.name ||
      operation.operation !== OperationTypeNode.QUERY ||
      (body["operationName"] !== undefined && body["operationName"] !== operation.name.value) ||
      (operation.variableDefinitions?.length ?? 0) > 4 ||
      document.definitions.length > 5
    ) {
      throw new Rejected();
    }
    for (const definition of operation.variableDefinitions ?? []) {
      if (definition.defaultValue !== undefined) {
        const value: unknown = valueFromASTUntyped(definition.defaultValue);
        if (!scalar(value)) {
          throw new Rejected();
        }
        if (!Object.hasOwn(variables, definition.variable.name.value)) {
          variables[definition.variable.name.value] = value;
        }
      }
    }
    const fragments = new Map<string, FragmentDefinitionNode>();
    for (const definition of document.definitions) {
      if (definition.kind === Kind.FRAGMENT_DEFINITION) {
        if (fragments.has(definition.name.value)) {
          throw new Rejected();
        }
        fragments.set(definition.name.value, definition);
      } else if (definition.kind !== Kind.OPERATION_DEFINITION) {
        throw new Rejected();
      }
    }
    let fields = 0;
    let aliases = 0;
    let cost = 0;
    let expansions = 0;
    let roots = 0;
    let pageSize = 20;
    let inspectedOperation: DiscoveryOperation | undefined;
    const walk = (
      selection: SelectionSetNode,
      scope: Scope,
      depth: number,
      ancestors: ReadonlySet<string>,
      multiplicity = 1,
    ): void => {
      if (++expansions > 32 || depth > DISCOVERY_GRAPHQL_LIMITS.depth) {
        throw new Rejected("LIMIT_EXCEEDED");
      }
      for (const item of selection.selections) {
        if (
          item.directives?.some((directive) => !["skip", "include"].includes(directive.name.value))
        ) {
          throw new Rejected();
        }
        if (item.kind === Kind.FRAGMENT_SPREAD || item.kind === Kind.INLINE_FRAGMENT) {
          const fragment =
            item.kind === Kind.FRAGMENT_SPREAD ? fragments.get(item.name.value) : item;
          if (!fragment || (item.kind === Kind.FRAGMENT_SPREAD && ancestors.has(item.name.value))) {
            throw new Rejected();
          }
          walk(
            fragment.selectionSet,
            fragmentScope(scope, fragment.typeCondition?.name.value),
            depth,
            item.kind === Kind.FRAGMENT_SPREAD
              ? new Set([...ancestors, item.name.value])
              : ancestors,
            multiplicity,
          );
          continue;
        }
        fields++;
        aliases += item.alias ? 1 : 0;
        cost += multiplicity;
        if (
          fields > DISCOVERY_GRAPHQL_LIMITS.fields ||
          aliases > DISCOVERY_GRAPHQL_LIMITS.aliases ||
          cost > DISCOVERY_GRAPHQL_LIMITS.cost
        ) {
          throw new Rejected("LIMIT_EXCEEDED");
        }
        const name = item.name.value;
        const child = name === "__typename" ? null : FIELDS[scope][name];
        if (child === undefined || (name.startsWith("__") && name !== "__typename")) {
          throw new Rejected();
        }
        if (scope === "Query" && name !== "__typename") {
          if (++roots > 1) {
            throw new Rejected("LIMIT_EXCEEDED");
          }
          const args = new Map<string, unknown>();
          for (const argument of item.arguments ?? []) {
            if (args.has(argument.name.value)) {
              throw new Rejected();
            }
            args.set(argument.name.value, valueFromASTUntyped(argument.value, variables));
          }
          if (name === "_service") {
            if (args.size !== 0) {
              throw new Rejected();
            }
            inspectedOperation = "service_schema";
          } else if (name === "searchTitles") {
            if (
              [...args.keys()].some(
                (argument) => !["query", "locale", "first", "after"].includes(argument),
              )
            ) {
              throw new Rejected();
            }
            const normalized = normalizeSearchInput(
              {
                query: args.get("query"),
                locale: args.get("locale"),
                first: args.get("first") ?? 20,
                after: args.get("after") ?? null,
              },
              CURSOR_GENERATION,
            );
            if (normalized.status === "invalid_input" || normalized.status === "invalid_state") {
              throw new Rejected();
            }
            pageSize = normalized.status === "completed" ? normalized.value.first : 20;
            cost += 32;
            inspectedOperation = "search_titles";
          } else {
            if ([...args.keys()].some((argument) => argument !== "first")) {
              throw new Rejected();
            }
            const normalized = normalizeHomeRailInput({ first: args.get("first") ?? 10 });
            if (!normalized) {
              throw new Rejected();
            }
            pageSize = normalized.first;
            cost += 64;
            inspectedOperation = "home_rails";
          }
        }
        if (item.selectionSet) {
          if (!child) {
            throw new Rejected();
          }
          walk(
            item.selectionSet,
            child,
            depth + 1,
            ancestors,
            (scope === "Connection" || scope === "Rail") && name === "edges"
              ? multiplicity * pageSize
              : scope === "GenreResult" && name === "rails"
                ? multiplicity * 3
                : multiplicity,
          );
        } else if (child) {
          throw new Rejected();
        }
      }
    };
    walk(operation.selectionSet, "Query", 1, new Set());
    if (roots !== 1 || !inspectedOperation) {
      throw new Rejected();
    }
    return { status: "accepted", operation: inspectedOperation };
  } catch (error) {
    return {
      status: "rejected",
      code: error instanceof Rejected ? error.code : "INVALID_INPUT",
    };
  }
}
