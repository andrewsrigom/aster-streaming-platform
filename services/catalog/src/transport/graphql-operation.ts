import {
  Kind,
  OperationTypeNode,
  getNamedType,
  isCompositeType,
  isListType,
  isNonNullType,
  isObjectType,
  isInterfaceType,
  parse,
  valueFromASTUntyped,
  type GraphQLCompositeType,
  type GraphQLSchema,
  type FragmentDefinitionNode,
  type SelectionSetNode,
} from "graphql";

import { catalogIdentifier, catalogRecord } from "../domain/values.js";
import { normalizeCatalogLocale } from "../domain/metadata.js";

export const CATALOG_GRAPHQL_LIMITS = Object.freeze({
  sourceBytes: 16_384,
  tokens: 2_048,
  depth: 10,
  aliases: 16,
  fields: 128,
  cost: 4096,
  inputDepth: 8,
  inputNodes: 256,
  listSize: 20,
  concurrent: 8,
  deadlineMs: 3_000,
  rateBurst: 64,
  ratePerSecond: 8,
});

export type CatalogOperation = "query";
export type OperationDecision =
  | Readonly<{ status: "accepted"; operation: CatalogOperation }>
  | Readonly<{ status: "rejected"; code: "INVALID_INPUT" | "LIMIT_EXCEEDED" }>;

class OperationRejected extends Error {
  constructor(readonly code: "INVALID_INPUT" | "LIMIT_EXCEEDED") {
    super("Operation rejected.");
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inspectInput(value: unknown): void {
  let nodes = 0;
  const walk = (item: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > CATALOG_GRAPHQL_LIMITS.inputNodes || depth > CATALOG_GRAPHQL_LIMITS.inputDepth) {
      throw new OperationRejected("LIMIT_EXCEEDED");
    }
    if (Array.isArray(item)) {
      if (item.length > CATALOG_GRAPHQL_LIMITS.listSize) {
        throw new OperationRejected("LIMIT_EXCEEDED");
      }
      for (const child of item as unknown[]) {
        walk(child, depth + 1);
      }
    } else if (record(item)) {
      for (const child of Object.values(item)) {
        walk(child, depth + 1);
      }
    } else if (typeof item === "string" && item.length > 4_096) {
      throw new OperationRejected("LIMIT_EXCEEDED");
    }
  };
  walk(value, 0);
}

export function inspectCatalogOperation(body: unknown, schema: GraphQLSchema): OperationDecision {
  try {
    if (
      !record(body) ||
      Object.keys(body).some((key) => !["query", "variables", "operationName"].includes(key)) ||
      typeof body["query"] !== "string" ||
      (body["operationName"] !== undefined && typeof body["operationName"] !== "string") ||
      (body["variables"] !== undefined && !record(body["variables"]))
    ) {
      throw new OperationRejected("INVALID_INPUT");
    }
    if (Buffer.byteLength(body["query"], "utf8") > CATALOG_GRAPHQL_LIMITS.sourceBytes) {
      throw new OperationRejected("LIMIT_EXCEEDED");
    }
    const variables = body["variables"] ?? {};
    inspectInput(variables);
    const document = parse(body["query"], {
      maxTokens: CATALOG_GRAPHQL_LIMITS.tokens,
      noLocation: true,
    });
    const operations = document.definitions.filter(
      (item) => item.kind === Kind.OPERATION_DEFINITION,
    );
    const operation = operations[0];
    if (
      operations.length !== 1 ||
      !operation?.name ||
      operation.operation !== OperationTypeNode.QUERY ||
      (body["operationName"] !== undefined && body["operationName"] !== operation.name.value)
    ) {
      throw new OperationRejected("INVALID_INPUT");
    }
    const fragments = new Map<string, FragmentDefinitionNode>();
    for (const definition of document.definitions) {
      if (definition.kind === Kind.FRAGMENT_DEFINITION) {
        if (fragments.has(definition.name.value)) {
          throw new OperationRejected("INVALID_INPUT");
        }
        fragments.set(definition.name.value, definition);
      } else if (definition.kind !== Kind.OPERATION_DEFINITION) {
        throw new OperationRejected("INVALID_INPUT");
      }
    }
    const effectiveVariables = { ...variables };
    for (const definition of operation.variableDefinitions ?? []) {
      if (definition.defaultValue !== undefined) {
        const value: unknown = valueFromASTUntyped(definition.defaultValue);
        inspectInput(value);
        if (!Object.hasOwn(effectiveVariables, definition.variable.name.value)) {
          effectiveVariables[definition.variable.name.value] = value;
        }
      }
    }
    inspectInput(effectiveVariables);
    let fields = 0;
    let aliases = 0;
    let cost = 0;
    let expansion = 0;
    const walk = (
      selection: SelectionSetNode,
      parent: GraphQLCompositeType,
      depth: number,
      weight: number,
      ancestors: ReadonlySet<string>,
      pageSize = 20,
    ): void => {
      expansion += 1;
      if (depth > CATALOG_GRAPHQL_LIMITS.depth || expansion > CATALOG_GRAPHQL_LIMITS.fields) {
        throw new OperationRejected("LIMIT_EXCEEDED");
      }
      for (const item of selection.selections) {
        if (
          item.directives?.some((directive) => !["skip", "include"].includes(directive.name.value))
        ) {
          throw new OperationRejected("INVALID_INPUT");
        }
        if (item.kind === Kind.FRAGMENT_SPREAD || item.kind === Kind.INLINE_FRAGMENT) {
          const fragment =
            item.kind === Kind.FRAGMENT_SPREAD ? fragments.get(item.name.value) : item;
          if (!fragment || (item.kind === Kind.FRAGMENT_SPREAD && ancestors.has(item.name.value))) {
            throw new OperationRejected("INVALID_INPUT");
          }
          const type = fragment.typeCondition
            ? schema.getType(fragment.typeCondition.name.value)
            : parent;
          if (!type || !isCompositeType(type)) {
            throw new OperationRejected("INVALID_INPUT");
          }
          walk(
            fragment.selectionSet,
            type,
            depth,
            weight,
            item.kind === Kind.FRAGMENT_SPREAD
              ? new Set([...ancestors, item.name.value])
              : ancestors,
            pageSize,
          );
          continue;
        }
        fields += 1;
        aliases += item.alias ? 1 : 0;
        cost += weight;
        if (
          fields > CATALOG_GRAPHQL_LIMITS.fields ||
          aliases > CATALOG_GRAPHQL_LIMITS.aliases ||
          cost > CATALOG_GRAPHQL_LIMITS.cost
        ) {
          throw new OperationRejected("LIMIT_EXCEEDED");
        }
        if (item.name.value === "__typename") {
          continue;
        }
        if (
          item.name.value.startsWith("__") ||
          item.name.value === "_playbackPublications" ||
          item.name.value === "_engagementTitles"
        ) {
          throw new OperationRejected("INVALID_INPUT");
        }
        const field =
          isObjectType(parent) || isInterfaceType(parent)
            ? parent.getFields()[item.name.value]
            : undefined;
        if (!field) {
          throw new OperationRejected("INVALID_INPUT");
        }
        let listBound =
          item.name.value === "credits" ? 16 : item.name.value === "accessibility" ? 3 : 8;
        let nextPageSize = pageSize;
        if (item.name.value === "edges") {
          listBound = pageSize;
        }
        for (const argument of item.arguments ?? []) {
          const value: unknown = valueFromASTUntyped(argument.value, effectiveVariables);
          inspectInput(value);
          if (item.name.value === "titles" && argument.name.value === "first") {
            if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 20) {
              throw new OperationRejected("LIMIT_EXCEEDED");
            }
            nextPageSize = value;
          }
          if (
            item.name.value === "title" &&
            argument.name.value === "id" &&
            !catalogIdentifier(value)
          ) {
            throw new OperationRejected("INVALID_INPUT");
          }
          if (
            item.name.value === "localized" &&
            argument.name.value === "locale" &&
            !normalizeCatalogLocale(value)
          ) {
            throw new OperationRejected("INVALID_INPUT");
          }
          if (
            item.name.value === "_entities" &&
            argument.name.value === "representations" &&
            (!Array.isArray(value) ||
              (value as unknown[]).some(
                (reference) =>
                  !catalogRecord(reference, ["__typename", "id"]) ||
                  !record(reference) ||
                  reference["__typename"] !== "Title" ||
                  !catalogIdentifier(reference["id"]),
              ))
          ) {
            throw new OperationRejected("INVALID_INPUT");
          }
          if (
            item.name.value === "_entities" &&
            argument.name.value === "representations" &&
            Array.isArray(value)
          ) {
            listBound = Math.max(1, value.length);
          }
        }
        const nullable = isNonNullType(field.type) ? field.type.ofType : field.type;
        if (isListType(nullable)) {
          cost += weight * (listBound - 1);
          if (cost > CATALOG_GRAPHQL_LIMITS.cost) {
            throw new OperationRejected("LIMIT_EXCEEDED");
          }
        }
        if (item.selectionSet) {
          const childType = getNamedType(field.type);
          if (!isCompositeType(childType)) {
            throw new OperationRejected("INVALID_INPUT");
          }
          walk(
            item.selectionSet,
            childType,
            depth + 1,
            isListType(nullable) ? weight * listBound : weight,
            ancestors,
            nextPageSize,
          );
        }
      }
    };
    const root = schema.getQueryType();
    if (!root) {
      throw new OperationRejected("INVALID_INPUT");
    }
    walk(operation.selectionSet, root, 1, 1, new Set());
    return { status: "accepted", operation: operation.operation };
  } catch (error) {
    return {
      status: "rejected",
      code: error instanceof OperationRejected ? error.code : "INVALID_INPUT",
    };
  }
}
