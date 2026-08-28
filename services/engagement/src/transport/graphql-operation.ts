import {
  Kind,
  OperationTypeNode,
  parse,
  valueFromASTUntyped,
  type FragmentDefinitionNode,
  type SelectionSetNode,
} from "graphql";
import { normalizeProgressInput, progressIdentifier, progressRecord } from "../domain/progress.js";
import { normalizeProgressPageInput } from "../domain/progress-page.js";
import { normalizeWatchlistInput, normalizeWatchlistPageInput } from "../domain/watchlist.js";

export const ENGAGEMENT_GRAPHQL_LIMITS = Object.freeze({
  bodyBytes: 16384,
  sourceBytes: 4096,
  tokens: 512,
  fields: 40,
  depth: 6,
  aliases: 4,
  cost: 384,
  concurrent: 4,
  deadlineMs: 2700,
  rateBurst: 32,
  ratePerSecond: 4,
});
export type EngagementOperation = "mutation" | "query";
type Decision =
  | Readonly<{ status: "accepted"; operation: EngagementOperation }>
  | Readonly<{ status: "rejected"; code: "INVALID_INPUT" | "LIMIT_EXCEEDED" }>;
type Scope =
  | "Query"
  | "Mutation"
  | "Payload"
  | "Progress"
  | "Service"
  | "PagePayload"
  | "Connection"
  | "Edge"
  | "PageInfo"
  | "WatchlistPayload"
  | "WatchlistChange"
  | "WatchlistPage"
  | "WatchlistConnection"
  | "WatchlistEdge"
  | "WatchlistEntry"
  | "Title"
  | "Profile"
  | "Entities";
const FIELDS: Readonly<Record<Scope, Readonly<Record<string, Scope | null>>>> = {
  Query: {
    _entities: "Entities",
    _service: "Service",
    progressHistory: "PagePayload",
    continueWatching: "PagePayload",
    watchlist: "WatchlistPage",
  },
  Mutation: { recordProgress: "Payload", setWatchlist: "WatchlistPayload" },
  WatchlistPayload: { code: null, correlationId: null, change: "WatchlistChange" },
  WatchlistChange: {
    id: null,
    profileId: null,
    titleId: null,
    present: null,
    version: null,
    updatedAt: null,
  },
  WatchlistPage: { code: null, correlationId: null, connection: "WatchlistConnection" },
  WatchlistConnection: { edges: "WatchlistEdge", pageInfo: "PageInfo" },
  WatchlistEdge: { cursor: null, node: "WatchlistEntry" },
  WatchlistEntry: { id: null, profileId: null, titleId: null, addedAt: null, title: "Title" },
  Payload: { code: null, correlationId: null, progress: "Progress" },
  Progress: {
    id: null,
    profileId: null,
    titleId: null,
    sequence: null,
    version: null,
    positionMs: null,
    durationMs: null,
    status: null,
    occurredAt: null,
    updatedAt: null,
    title: "Title",
  },
  Title: { id: null, progress: "Progress", inWatchlist: null },
  Profile: { id: null, progress: "Progress", inWatchlist: null },
  Entities: {},
  PagePayload: { code: null, correlationId: null, connection: "Connection" },
  Connection: { edges: "Edge", pageInfo: "PageInfo" },
  Edge: { cursor: null, node: "Progress" },
  PageInfo: { endCursor: null, hasNextPage: null },
  Service: { sdl: null },
};
class Rejected extends Error {
  constructor(readonly code: "INVALID_INPUT" | "LIMIT_EXCEEDED" = "INVALID_INPUT") {
    super("Engagement operation rejected.");
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function scalar(value: unknown): boolean {
  return (
    representations(value) ||
    normalizeProgressInput(value) !== undefined ||
    normalizeWatchlistInput(value) !== undefined ||
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "string" && value.length <= 128) ||
    (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 20)
  );
}

function representations(
  value: unknown,
): value is readonly Readonly<{ __typename: "Title" | "Profile"; id: string }>[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 20 &&
    value.every((raw: unknown) => {
      const row = progressRecord(raw, ["__typename", "id"]);
      return (
        row &&
        ["Title", "Profile"].includes(String(row["__typename"])) &&
        progressIdentifier(row["id"])
      );
    })
  );
}

const TYPE_NAMES: Readonly<Record<Scope, string>> = {
  Query: "Query",
  Mutation: "Mutation",
  Payload: "ProgressPayload",
  Progress: "Progress",
  Service: "_Service",
  PagePayload: "ProgressPagePayload",
  Connection: "ProgressConnection",
  Edge: "ProgressEdge",
  PageInfo: "ProgressPageInfo",
  WatchlistPayload: "WatchlistPayload",
  WatchlistChange: "WatchlistChange",
  WatchlistPage: "WatchlistPagePayload",
  WatchlistConnection: "WatchlistConnection",
  WatchlistEdge: "WatchlistEdge",
  WatchlistEntry: "WatchlistEntry",
  Title: "Title",
  Profile: "Profile",
  Entities: "_Entity",
};
function fragmentScope(scope: Scope, condition: string | undefined): Scope {
  if (condition === undefined || TYPE_NAMES[scope] === condition) {
    return scope;
  }
  if (scope === "Entities" && (condition === "Title" || condition === "Profile")) {
    return condition;
  }
  throw new Rejected();
}

export function inspectEngagementOperation(body: unknown): Decision {
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
    if (Buffer.byteLength(body["query"]) > ENGAGEMENT_GRAPHQL_LIMITS.sourceBytes) {
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
      maxTokens: ENGAGEMENT_GRAPHQL_LIMITS.tokens,
      noLocation: true,
    });
    const operations = document.definitions.filter(
      (definition) => definition.kind === Kind.OPERATION_DEFINITION,
    );
    const operation = operations[0];
    if (
      operations.length !== 1 ||
      !operation?.name ||
      (body["operationName"] !== undefined && body["operationName"] !== operation.name.value) ||
      (operation.operation !== OperationTypeNode.MUTATION &&
        operation.operation !== OperationTypeNode.QUERY) ||
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
    let fields = 0,
      aliases = 0,
      cost = 0,
      expansions = 0,
      roots = 0,
      pageSize = 1;
    const walk = (
      selection: SelectionSetNode,
      scope: Scope,
      depth: number,
      ancestors: ReadonlySet<string>,
      multiplicity = 1,
    ): void => {
      if (++expansions > 16 || depth > ENGAGEMENT_GRAPHQL_LIMITS.depth) {
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
        const name = item.name.value;
        let childrenMultiplicity = multiplicity;
        const child = name === "__typename" ? null : FIELDS[scope][name];
        if (child === undefined) {
          throw new Rejected();
        }
        if (name !== "__typename" && (scope === "Query" || scope === "Mutation")) {
          if (++roots > 1) {
            throw new Rejected("LIMIT_EXCEEDED");
          }
          if (scope === "Mutation") {
            // Two private owner reads plus bounded persistence; no mutation fan-out.
            cost += 96;
            const args = item.arguments ?? [];
            if (
              args.length !== 1 ||
              args[0]?.name.value !== "input" ||
              !(name === "setWatchlist" ? normalizeWatchlistInput : normalizeProgressInput)(
                valueFromASTUntyped(args[0].value, variables),
              )
            ) {
              throw new Rejected();
            }
          } else if (name === "_entities") {
            const args = item.arguments ?? [];
            const values: unknown = args[0]
              ? valueFromASTUntyped(args[0].value, variables)
              : undefined;
            if (
              args.length !== 1 ||
              args[0]?.name.value !== "representations" ||
              !representations(values)
            ) {
              throw new Rejected();
            }
            childrenMultiplicity = values.length;
            cost += 32;
          } else if (name !== "_service") {
            const args = item.arguments ?? [];
            if (new Set(args.map((arg) => arg.name.value)).size !== args.length) {
              throw new Rejected();
            }
            const values: Record<string, unknown> = Object.fromEntries(
              args.map((arg) => [arg.name.value, valueFromASTUntyped(arg.value, variables)]),
            );
            const page = {
              ...values,
              first: values["first"] ?? 20,
              after: values["after"] ?? null,
            };
            const input =
              name === "watchlist"
                ? normalizeWatchlistPageInput(page)
                : normalizeProgressPageInput(
                    page,
                    name === "progressHistory" ? "history" : "continue",
                  );
            if (!input) {
              throw new Rejected();
            }
            pageSize = input.first;
            // Continue-watching can inspect thirteen owner batches even for a small visible page.
            cost += name === "progressHistory" ? 32 : 128;
          }
        }
        if (
          (scope === "Title" || scope === "Profile") &&
          ["progress", "inWatchlist"].includes(name)
        ) {
          const args = item.arguments ?? [];
          if (
            args.length !== 1 ||
            args[0]?.name.value !== (scope === "Title" ? "profileId" : "titleId") ||
            !progressIdentifier(valueFromASTUntyped(args[0].value, variables))
          ) {
            throw new Rejected();
          }
          cost += 2 * multiplicity;
        }
        if (
          fields > ENGAGEMENT_GRAPHQL_LIMITS.fields ||
          aliases > ENGAGEMENT_GRAPHQL_LIMITS.aliases ||
          cost > ENGAGEMENT_GRAPHQL_LIMITS.cost
        ) {
          throw new Rejected("LIMIT_EXCEEDED");
        }
        if (child === null ? item.selectionSet !== undefined : item.selectionSet === undefined) {
          throw new Rejected();
        }
        if (child !== null && item.selectionSet) {
          walk(
            item.selectionSet,
            child,
            depth + 1,
            ancestors,
            (scope === "Connection" || scope === "WatchlistConnection") && name === "edges"
              ? multiplicity * pageSize
              : childrenMultiplicity,
          );
        }
      }
    };
    walk(
      operation.selectionSet,
      operation.operation === OperationTypeNode.MUTATION ? "Mutation" : "Query",
      1,
      new Set(),
    );
    if (roots !== 1) {
      throw new Rejected();
    }
    return { status: "accepted", operation: operation.operation };
  } catch (error) {
    return { status: "rejected", code: error instanceof Rejected ? error.code : "INVALID_INPUT" };
  }
}
