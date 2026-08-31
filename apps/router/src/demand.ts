import { createHash } from "node:crypto";
import {
  Kind,
  OperationTypeNode,
  getNamedType,
  isCompositeType,
  isInterfaceType,
  isListType,
  isNonNullType,
  isObjectType,
  parse,
  validate,
  valueFromASTUntyped,
  type DirectiveNode,
  type DocumentNode,
  type FieldNode,
  type FragmentDefinitionNode,
  type GraphQLCompositeType,
  type GraphQLOutputType,
  type GraphQLSchema,
  type OperationDefinitionNode,
  type SelectionSetNode,
} from "graphql";

export type DemandOperation = Readonly<{
  body: string;
  id: string;
  name: string;
  type: OperationDefinitionNode["operation"];
}>;

export type DemandPolicy = Readonly<{
  maximumAliases: number;
  maximumCost: number;
  maximumDepth: number;
  maximumListExpansion: number;
  maximumRootFields: number;
  maximumSelections: number;
}>;

export const GRAPHQL_DEMAND_POLICY: DemandPolicy = Object.freeze({
  maximumAliases: 8,
  maximumCost: 2_048,
  maximumDepth: 12,
  maximumListExpansion: 512,
  maximumRootFields: 4,
  maximumSelections: 256,
});

const MAXIMUM_PARSER_TOKENS = 2_000;
const MAXIMUM_REQUEST_BYTES = 32_768;

export type OperationDemandProfile = Readonly<{
  aliases: number;
  cost: number;
  depth: number;
  id: string;
  listExpansion: number;
  name: string;
  rootFields: number;
  selections: number;
  type: OperationDefinitionNode["operation"];
}>;

export type OperationDemandManifest = Readonly<{
  format: "aster-operation-demand-manifest";
  version: 1;
  policy: DemandPolicy;
  operations: readonly OperationDemandProfile[];
}>;

type MutableMetrics = {
  aliases: number;
  depth: number;
  listExpansion: number;
  rootFields: number;
  selections: number;
};

type AnalysisState = Readonly<{
  api: GraphQLSchema;
  fragments: ReadonlyMap<string, FragmentDefinitionNode>;
  metrics: MutableMetrics;
  operationName: string;
  policy: DemandPolicy;
  supergraph: GraphQLSchema;
  activeFragments: Set<string>;
}>;

function reject(operationName: string, reason: string): never {
  throw new Error(`GraphQL demand rejected ${operationName}: ${reason}.`);
}

function positivePolicy(policy: DemandPolicy): void {
  for (const [name, value] of Object.entries(policy)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`Invalid GraphQL demand policy ${name}.`);
    }
  }
}

function safeAdd(left: number, right: number, operationName: string): number {
  const value = left + right;
  return Number.isSafeInteger(value) && value >= 0
    ? value
    : reject(operationName, "numeric cost overflow");
}

function safeMultiply(left: number, right: number, operationName: string): number {
  const value = left * right;
  return Number.isSafeInteger(value) && value >= 0
    ? value
    : reject(operationName, "numeric cost overflow");
}

function directiveArguments(
  directives: readonly DirectiveNode[] | undefined,
  name: string,
): Readonly<Record<string, unknown>> | undefined {
  const matches = (directives ?? []).filter((directive) => directive.name.value === name);
  if (matches.length === 0) {
    return undefined;
  }
  if (matches.length !== 1) {
    throw new Error(`GraphQL demand metadata repeats @${name}.`);
  }
  return Object.freeze(
    Object.fromEntries(
      (matches[0]?.arguments ?? []).map((argument) => [
        argument.name.value,
        valueFromASTUntyped(argument.value),
      ]),
    ),
  );
}

function metadataField(schema: GraphQLSchema, parentName: string, fieldName: string) {
  const parent = schema.getType(parentName);
  if (!parent || (!isObjectType(parent) && !isInterfaceType(parent))) {
    return undefined;
  }
  return parent.getFields()[fieldName];
}

function explicitWeight(
  schema: GraphQLSchema,
  parentName: string,
  fieldName: string,
  operationName: string,
): number | undefined {
  const field = metadataField(schema, parentName, fieldName);
  const argumentsByName = directiveArguments(field?.astNode?.directives, "cost");
  if (!argumentsByName) {
    return undefined;
  }
  const weight = argumentsByName["weight"];
  if (!Number.isSafeInteger(weight) || typeof weight !== "number" || weight < 0) {
    return reject(operationName, `${parentName}.${fieldName} has an invalid cost weight`);
  }
  return weight;
}

function explicitTypeWeight(
  schema: GraphQLSchema,
  typeName: string,
  operationName: string,
): number | undefined {
  const type = schema.getType(typeName);
  const argumentsByName = directiveArguments(type?.astNode?.directives, "cost");
  if (!argumentsByName) {
    return undefined;
  }
  const weight = argumentsByName["weight"];
  if (!Number.isSafeInteger(weight) || typeof weight !== "number" || weight < 0) {
    return reject(operationName, `${typeName} has an invalid cost weight`);
  }
  return weight;
}

function fieldWeight(
  state: AnalysisState,
  parentName: string,
  fieldName: string,
  returnTypeName: string,
  returnComposite: boolean,
  root: boolean,
): number {
  const weight = explicitWeight(state.supergraph, parentName, fieldName, state.operationName);
  if (root && weight === undefined) {
    return reject(state.operationName, `${parentName}.${fieldName} requires @cost`);
  }
  const parentWeight = explicitTypeWeight(state.supergraph, parentName, state.operationName);
  if (!root && parentWeight !== undefined && weight === undefined) {
    return reject(state.operationName, `${parentName}.${fieldName} requires @cost`);
  }
  return (
    weight ??
    explicitTypeWeight(state.supergraph, returnTypeName, state.operationName) ??
    (returnComposite ? 1 : 0)
  );
}

function listType(type: GraphQLOutputType): boolean {
  const nullable = isNonNullType(type) ? type.ofType : type;
  return isListType(nullable);
}

type ListMetadata = Readonly<{
  assumedSize: number;
  requireOneSlicingArgument: boolean;
  slicingArguments: readonly string[];
}>;

function listMetadata(state: AnalysisState, parentName: string, fieldName: string): ListMetadata {
  const field = metadataField(state.supergraph, parentName, fieldName);
  const argumentsByName = directiveArguments(field?.astNode?.directives, "listSize");
  if (!field || !listType(field.type) || !argumentsByName) {
    return reject(state.operationName, `${parentName}.${fieldName} requires direct @listSize`);
  }
  const assumedSize = argumentsByName["assumedSize"];
  const slicingArguments = argumentsByName["slicingArguments"] ?? [];
  const sizedFields = argumentsByName["sizedFields"];
  const requireOneSlicingArgument = argumentsByName["requireOneSlicingArgument"] ?? true;
  if (
    typeof assumedSize !== "number" ||
    !Number.isSafeInteger(assumedSize) ||
    assumedSize < 1 ||
    assumedSize > 2_147_483_647 ||
    !Array.isArray(slicingArguments) ||
    slicingArguments.some(
      (value) => typeof value !== "string" || !/^[_A-Za-z][_0-9A-Za-z]*$/u.test(value),
    ) ||
    new Set(slicingArguments).size !== slicingArguments.length ||
    slicingArguments.some((value) => !field.args.some(({ name }) => name === value)) ||
    typeof requireOneSlicingArgument !== "boolean" ||
    sizedFields !== undefined
  ) {
    return reject(state.operationName, `${parentName}.${fieldName} has invalid list metadata`);
  }
  return Object.freeze({
    assumedSize,
    requireOneSlicingArgument,
    slicingArguments: Object.freeze(slicingArguments as string[]),
  });
}

function literalSliceSize(node: FieldNode, metadata: ListMetadata, operationName: string): number {
  const supplied = metadata.slicingArguments.filter((name) =>
    node.arguments?.some((candidate) => candidate.name.value === name),
  );
  if (
    metadata.requireOneSlicingArgument &&
    metadata.slicingArguments.length > 0 &&
    supplied.length !== 1
  ) {
    return reject(operationName, "exactly one slicing argument is required");
  }
  const sizes: number[] = [];
  for (const name of metadata.slicingArguments) {
    const argument = node.arguments?.find((candidate) => candidate.name.value === name);
    if (!argument || argument.value.kind === Kind.VARIABLE) {
      sizes.push(metadata.assumedSize);
      continue;
    }
    let value: number | undefined;
    if (argument.value.kind === Kind.INT) {
      value = Number(argument.value.value);
    } else if (argument.value.kind === Kind.LIST) {
      value = argument.value.values.length;
    }
    if (value === undefined) {
      sizes.push(metadata.assumedSize);
      continue;
    }
    if (!Number.isSafeInteger(value) || value < 1 || value > metadata.assumedSize) {
      return reject(operationName, `literal ${name} exceeds its owner list maximum`);
    }
    sizes.push(value);
  }
  return sizes.length === 0 ? metadata.assumedSize : Math.max(...sizes);
}

function count(
  state: AnalysisState,
  name: keyof Pick<MutableMetrics, "aliases" | "rootFields" | "selections">,
  maximum: keyof Pick<DemandPolicy, "maximumAliases" | "maximumRootFields" | "maximumSelections">,
): void {
  state.metrics[name] = safeAdd(state.metrics[name], 1, state.operationName);
  if (state.metrics[name] > state.policy[maximum]) {
    reject(state.operationName, `${maximum} exceeded`);
  }
}

function compositeType(
  state: AnalysisState,
  typeName: string,
  context: string,
): GraphQLCompositeType {
  const type = state.api.getType(typeName);
  return type && isCompositeType(type)
    ? type
    : reject(state.operationName, `${context} has no composite type`);
}

function selectionCost(
  state: AnalysisState,
  parent: GraphQLCompositeType,
  selectionSet: SelectionSetNode,
  depth: number,
  expansion: number,
): number {
  let total = 0;
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.INLINE_FRAGMENT) {
      const fragmentParent = selection.typeCondition
        ? compositeType(state, selection.typeCondition.name.value, "inline fragment")
        : parent;
      total = safeAdd(
        total,
        selectionCost(state, fragmentParent, selection.selectionSet, depth, expansion),
        state.operationName,
      );
      continue;
    }
    if (selection.kind === Kind.FRAGMENT_SPREAD) {
      const name = selection.name.value;
      const fragment = state.fragments.get(name);
      if (!fragment || state.activeFragments.has(name) || state.activeFragments.size >= 32) {
        reject(state.operationName, `fragment ${name} is missing, cyclic or excessive`);
      }
      state.activeFragments.add(name);
      try {
        total = safeAdd(
          total,
          selectionCost(
            state,
            compositeType(state, fragment.typeCondition.name.value, `fragment ${name}`),
            fragment.selectionSet,
            depth,
            expansion,
          ),
          state.operationName,
        );
      } finally {
        state.activeFragments.delete(name);
      }
      continue;
    }

    count(state, "selections", "maximumSelections");
    if (selection.alias) {
      count(state, "aliases", "maximumAliases");
    }
    if (depth === 0) {
      count(state, "rootFields", "maximumRootFields");
    }
    const fieldDepth = depth + 1;
    state.metrics.depth = Math.max(state.metrics.depth, fieldDepth);
    if (fieldDepth > state.policy.maximumDepth) {
      reject(state.operationName, "maximumDepth exceeded");
    }
    if (selection.name.value === "__typename") {
      continue;
    }
    if (!isObjectType(parent) && !isInterfaceType(parent)) {
      reject(state.operationName, `${parent.name}.${selection.name.value} is not selectable`);
    }
    const field = parent.getFields()[selection.name.value];
    if (!field) {
      reject(state.operationName, `${parent.name}.${selection.name.value} is unknown`);
    }
    const namedReturn = getNamedType(field.type);
    const returnsComposite = isCompositeType(namedReturn);
    const weight = fieldWeight(
      state,
      parent.name,
      selection.name.value,
      namedReturn.name,
      returnsComposite,
      depth === 0,
    );
    const metadata = listType(field.type)
      ? listMetadata(state, parent.name, selection.name.value)
      : undefined;
    const size = metadata ? literalSliceSize(selection, metadata, state.operationName) : 1;
    const nextExpansion = safeMultiply(expansion, size, state.operationName);
    state.metrics.listExpansion = Math.max(state.metrics.listExpansion, nextExpansion);
    if (nextExpansion > state.policy.maximumListExpansion) {
      reject(state.operationName, "maximumListExpansion exceeded");
    }
    let children = 0;
    if (selection.selectionSet) {
      if (!returnsComposite) {
        reject(
          state.operationName,
          `${parent.name}.${selection.name.value} cannot have selections`,
        );
      }
      children = selectionCost(
        state,
        namedReturn,
        selection.selectionSet,
        fieldDepth,
        nextExpansion,
      );
    } else if (returnsComposite) {
      reject(state.operationName, `${parent.name}.${selection.name.value} requires selections`);
    }
    const unit = safeAdd(weight, children, state.operationName);
    total = safeAdd(total, safeMultiply(size, unit, state.operationName), state.operationName);
    if (total > state.policy.maximumCost) {
      reject(state.operationName, "maximumCost exceeded");
    }
  }
  return total;
}

function rootType(
  schema: GraphQLSchema,
  definition: OperationDefinitionNode,
  operationName: string,
): GraphQLCompositeType {
  const root =
    definition.operation === OperationTypeNode.QUERY
      ? schema.getQueryType()
      : definition.operation === OperationTypeNode.MUTATION
        ? schema.getMutationType()
        : schema.getSubscriptionType();
  return root ?? reject(operationName, `${definition.operation} root is unavailable`);
}

export function analyzeOperationDemand(
  api: GraphQLSchema,
  supergraph: GraphQLSchema,
  operation: DemandOperation,
  policy: DemandPolicy = GRAPHQL_DEMAND_POLICY,
): OperationDemandProfile {
  positivePolicy(policy);
  const encodedRequestBytes = Buffer.byteLength(
    JSON.stringify({
      operationName: operation.name,
      query: operation.body,
      variables: {},
    }),
    "utf8",
  );
  if (
    encodedRequestBytes > MAXIMUM_REQUEST_BYTES ||
    !/^[a-f0-9]{64}$/u.test(operation.id) ||
    createHash("sha256").update(operation.body).digest("hex") !== operation.id
  ) {
    return reject(
      operation.name,
      "encoded request exceeds the Router body limit or hash is invalid",
    );
  }
  let source: DocumentNode;
  try {
    source = parse(operation.body, { maxTokens: MAXIMUM_PARSER_TOKENS });
  } catch {
    return reject(operation.name, "body exceeds parser token limit or is malformed");
  }
  const validation = validate(api, source, undefined, { maxErrors: 10 });
  if (validation.length > 0) {
    return reject(operation.name, "body is incompatible with the public schema");
  }
  const definitions = source.definitions.filter(
    (definition): definition is OperationDefinitionNode =>
      definition.kind === Kind.OPERATION_DEFINITION,
  );
  const fragmentDefinitions = source.definitions.filter(
    (definition): definition is FragmentDefinitionNode =>
      definition.kind === Kind.FRAGMENT_DEFINITION,
  );
  const definition = definitions[0];
  if (
    definitions.length !== 1 ||
    !definition?.name ||
    definition.name.value !== operation.name ||
    definition.operation !== operation.type ||
    source.definitions.length !== definitions.length + fragmentDefinitions.length ||
    fragmentDefinitions.length > 32
  ) {
    return reject(operation.name, "body identity or definition set is invalid");
  }
  const fragments = new Map(fragmentDefinitions.map((fragment) => [fragment.name.value, fragment]));
  if (fragments.size !== fragmentDefinitions.length) {
    return reject(operation.name, "fragment names are not unique");
  }
  const metrics: MutableMetrics = {
    aliases: 0,
    depth: 0,
    listExpansion: 1,
    rootFields: 0,
    selections: 0,
  };
  const state: AnalysisState = {
    api,
    supergraph,
    fragments,
    metrics,
    operationName: operation.name,
    policy,
    activeFragments: new Set(),
  };
  const operationBase = definition.operation === OperationTypeNode.MUTATION ? 10 : 0;
  const cost = safeAdd(
    operationBase,
    selectionCost(state, rootType(api, definition, operation.name), definition.selectionSet, 0, 1),
    operation.name,
  );
  if (cost > policy.maximumCost) {
    return reject(operation.name, "maximumCost exceeded");
  }
  return Object.freeze({
    aliases: metrics.aliases,
    cost,
    depth: metrics.depth,
    id: operation.id,
    listExpansion: metrics.listExpansion,
    name: operation.name,
    rootFields: metrics.rootFields,
    selections: metrics.selections,
    type: operation.type,
  });
}

export function createOperationDemandManifest(
  api: GraphQLSchema,
  supergraph: GraphQLSchema,
  operations: readonly DemandOperation[],
  policy: DemandPolicy = GRAPHQL_DEMAND_POLICY,
): OperationDemandManifest {
  if (operations.length < 1 || operations.length > 64) {
    throw new Error("GraphQL demand manifest requires 1–64 exact operations.");
  }
  const profiles = operations
    .map((operation) => analyzeOperationDemand(api, supergraph, operation, policy))
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name, "en") || left.id.localeCompare(right.id, "en"),
    );
  if (new Set(profiles.map(({ id }) => id)).size !== profiles.length) {
    throw new Error("GraphQL demand manifest operation hashes must be unique.");
  }
  return Object.freeze({
    format: "aster-operation-demand-manifest",
    version: 1,
    policy: Object.freeze({ ...policy }),
    operations: Object.freeze(profiles),
  });
}
