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

import { profileIdentifier } from "../domain/profile.js";

export const IDENTITY_GRAPHQL_LIMITS = Object.freeze({
  sourceBytes: 16_384,
  tokens: 2_048,
  depth: 8,
  aliases: 16,
  fields: 128,
  cost: 512,
  inputDepth: 8,
  inputNodes: 256,
  listSize: 16,
  concurrent: 8,
  deadlineMs: 3_000,
  rateBurst: 64,
  ratePerSecond: 8,
});

export type IdentityOperation = "query" | "mutation";
export type OperationDecision =
  | Readonly<{ status: "accepted"; operation: IdentityOperation }>
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
    if (nodes > IDENTITY_GRAPHQL_LIMITS.inputNodes || depth > IDENTITY_GRAPHQL_LIMITS.inputDepth) {
      throw new OperationRejected("LIMIT_EXCEEDED");
    }
    if (Array.isArray(item)) {
      if (item.length > IDENTITY_GRAPHQL_LIMITS.listSize) {
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

export function inspectIdentityOperation(body: unknown, schema: GraphQLSchema): OperationDecision {
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
    if (Buffer.byteLength(body["query"], "utf8") > IDENTITY_GRAPHQL_LIMITS.sourceBytes) {
      throw new OperationRejected("LIMIT_EXCEEDED");
    }
    const variables = body["variables"] ?? {};
    inspectInput(variables);
    const document = parse(body["query"], {
      maxTokens: IDENTITY_GRAPHQL_LIMITS.tokens,
      noLocation: true,
    });
    const operations = document.definitions.filter(
      (item) => item.kind === Kind.OPERATION_DEFINITION,
    );
    const operation = operations[0];
    if (
      operations.length !== 1 ||
      !operation?.name ||
      operation.operation === OperationTypeNode.SUBSCRIPTION ||
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
        effectiveVariables[definition.variable.name.value] ??= value;
      }
    }
    inspectInput(effectiveVariables);
    let fields = 0;
    let aliases = 0;
    let cost = 0;
    let expansion = 0;
    let rootFields = 0;
    const walk = (
      selection: SelectionSetNode,
      parent: GraphQLCompositeType,
      depth: number,
      weight: number,
      ancestors: ReadonlySet<string>,
    ): void => {
      expansion += 1;
      if (depth > IDENTITY_GRAPHQL_LIMITS.depth || expansion > IDENTITY_GRAPHQL_LIMITS.fields) {
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
          );
          continue;
        }
        fields += 1;
        aliases += item.alias ? 1 : 0;
        cost += weight;
        if (depth === 1) {
          rootFields += 1;
        }
        if (
          fields > IDENTITY_GRAPHQL_LIMITS.fields ||
          aliases > IDENTITY_GRAPHQL_LIMITS.aliases ||
          cost > IDENTITY_GRAPHQL_LIMITS.cost
        ) {
          throw new OperationRejected("LIMIT_EXCEEDED");
        }
        if (item.name.value === "__typename") {
          continue;
        }
        if (item.name.value.startsWith("__") || item.name.value === "_engagementProfile") {
          throw new OperationRejected("INVALID_INPUT");
        }
        const field =
          isObjectType(parent) || isInterfaceType(parent)
            ? parent.getFields()[item.name.value]
            : undefined;
        if (!field) {
          throw new OperationRejected("INVALID_INPUT");
        }
        for (const argument of item.arguments ?? []) {
          const value: unknown = valueFromASTUntyped(argument.value, effectiveVariables);
          inspectInput(value);
          if (
            item.name.value === "_entities" &&
            argument.name.value === "representations" &&
            (!Array.isArray(value) ||
              (value as unknown[]).some(
                (reference) =>
                  !record(reference) ||
                  reference["__typename"] !== "Profile" ||
                  !profileIdentifier(reference["id"]),
              ))
          ) {
            throw new OperationRejected("INVALID_INPUT");
          }
        }
        if (item.selectionSet) {
          const childType = getNamedType(field.type);
          if (!isCompositeType(childType)) {
            throw new OperationRejected("INVALID_INPUT");
          }
          const nullable = isNonNullType(field.type) ? field.type.ofType : field.type;
          walk(
            item.selectionSet,
            childType,
            depth + 1,
            isListType(nullable) ? weight * IDENTITY_GRAPHQL_LIMITS.listSize : weight,
            ancestors,
          );
        }
      }
    };
    const root =
      operation.operation === OperationTypeNode.QUERY
        ? schema.getQueryType()
        : schema.getMutationType();
    if (!root) {
      throw new OperationRejected("INVALID_INPUT");
    }
    walk(operation.selectionSet, root, 1, 1, new Set());
    if (operation.operation === OperationTypeNode.MUTATION && rootFields !== 1) {
      throw new OperationRejected("INVALID_INPUT");
    }
    return { status: "accepted", operation: operation.operation };
  } catch (error) {
    return {
      status: "rejected",
      code: error instanceof OperationRejected ? error.code : "INVALID_INPUT",
    };
  }
}
