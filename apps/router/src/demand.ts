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

export type OperationAuthorizationScope = "public" | "account" | "profile";
export type OperationRateClass =
  | "global"
  | "discovery_search"
  | "engagement_progress"
  | "engagement_watchlist"
  | "profile_mutation"
  | "profile_selection";

export type OperationRuntimePolicy = Readonly<{
  authorizationScope: OperationAuthorizationScope;
  cacheControl: "no-store";
  executionDeadlineMs: 3_000;
  maximumConcurrentRequests: 8;
  rateClass: OperationRateClass;
}>;

const defineOperationRuntimePolicy = (
  authorizationScope: OperationAuthorizationScope,
  rateClass: OperationRateClass = "global",
): OperationRuntimePolicy =>
  Object.freeze({
    authorizationScope,
    cacheControl: "no-store",
    executionDeadlineMs: 3_000,
    maximumConcurrentRequests: 8,
    rateClass,
  });

const GRAPHQL_OPERATION_RUNTIME_POLICIES = Object.freeze({
  Browse: defineOperationRuntimePolicy("public"),
  ContinueWatching: defineOperationRuntimePolicy("profile"),
  CreateProfile: defineOperationRuntimePolicy("account", "profile_mutation"),
  DeleteProfile: defineOperationRuntimePolicy("account", "profile_mutation"),
  DemoSignIn: defineOperationRuntimePolicy("public"),
  HomePersonalized: defineOperationRuntimePolicy("profile"),
  HomePublic: defineOperationRuntimePolicy("public"),
  PlayerProgress: defineOperationRuntimePolicy("profile"),
  Profile: defineOperationRuntimePolicy("account"),
  Profiles: defineOperationRuntimePolicy("account"),
  ProfileWithEngagement: defineOperationRuntimePolicy("profile"),
  ProgressHistory: defineOperationRuntimePolicy("profile"),
  RecordProgress: defineOperationRuntimePolicy("profile", "engagement_progress"),
  SearchTitles: defineOperationRuntimePolicy("public", "discovery_search"),
  SelectProfile: defineOperationRuntimePolicy("account", "profile_selection"),
  SetWatchlist: defineOperationRuntimePolicy("profile", "engagement_watchlist"),
  SignOut: defineOperationRuntimePolicy("account"),
  StartPlayback: defineOperationRuntimePolicy("public"),
  TitleDetail: defineOperationRuntimePolicy("public"),
  TitlesWithEngagement: defineOperationRuntimePolicy("profile"),
  UpdateProfile: defineOperationRuntimePolicy("account", "profile_mutation"),
  Viewer: defineOperationRuntimePolicy("account"),
  ViewerAndTitle: defineOperationRuntimePolicy("account"),
  Watchlist: defineOperationRuntimePolicy("profile"),
  WatchlistMembership: defineOperationRuntimePolicy("profile"),
}) satisfies Readonly<Record<string, OperationRuntimePolicy>>;

export function trustedOperationAuthorizationScope(name: string): OperationAuthorizationScope {
  const policy = (
    GRAPHQL_OPERATION_RUNTIME_POLICIES as Readonly<
      Record<string, OperationRuntimePolicy | undefined>
    >
  )[name];
  if (!policy) {
    throw new Error(`GraphQL runtime policy is missing trusted operation ${name}.`);
  }
  return policy.authorizationScope;
}

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

const ACCOUNT_SCOPED_FIELDS = new Set([
  "Mutation.createProfile",
  "Mutation.deleteProfile",
  "Mutation.selectProfile",
  "Mutation.signOut",
  "Mutation.updateProfile",
  "Query.activeProfile",
  "Query.me",
  "Query.profile",
  "Query.profiles",
]);
const PROFILE_SCOPED_FIELDS = new Set([
  "Mutation.recordProgress",
  "Mutation.setWatchlist",
  "Profile.inWatchlist",
  "Profile.progress",
  "Query.continueWatching",
  "Query.homeContinueWatching",
  "Query.progressHistory",
  "Query.watchlist",
  "Title.inWatchlist",
  "Title.progress",
]);

function requiredAuthorizationScope(
  current: OperationAuthorizationScope,
  coordinate: string,
): OperationAuthorizationScope {
  if (PROFILE_SCOPED_FIELDS.has(coordinate)) {
    return "profile";
  }
  if (current === "public" && ACCOUNT_SCOPED_FIELDS.has(coordinate)) {
    return "account";
  }
  return current;
}

export type OperationDemandAnalysis = Readonly<{
  aliases: number;
  authorizationScope: OperationAuthorizationScope;
  cost: number;
  depth: number;
  id: string;
  listExpansion: number;
  name: string;
  rootFields: number;
  selections: number;
  type: OperationDefinitionNode["operation"];
}>;

type OperationDemandProfile = OperationDemandAnalysis & OperationRuntimePolicy;

export type OperationDemandManifest = Readonly<{
  format: "aster-operation-demand-manifest";
  version: 2;
  policy: DemandPolicy;
  operations: readonly OperationDemandProfile[];
}>;

type MutableMetrics = {
  aliases: number;
  authorizationScope: OperationAuthorizationScope;
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

function rejectDemandAnalysis(operationName: string, reason: string): never {
  throw new Error(`GraphQL demand rejected ${operationName}: ${reason}.`);
}

function validateDemandPolicy(policy: DemandPolicy): void {
  for (const [name, value] of Object.entries(policy)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`Invalid GraphQL demand policy ${name}.`);
    }
  }
}

function addDemandValues(left: number, right: number, operationName: string): number {
  const value = left + right;
  return Number.isSafeInteger(value) && value >= 0
    ? value
    : rejectDemandAnalysis(operationName, "numeric cost overflow");
}

function multiplyDemandValues(left: number, right: number, operationName: string): number {
  const value = left * right;
  return Number.isSafeInteger(value) && value >= 0
    ? value
    : rejectDemandAnalysis(operationName, "numeric cost overflow");
}

function readDemandDirectiveArguments(
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

function demandMetadataField(schema: GraphQLSchema, parentName: string, fieldName: string) {
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
  const field = demandMetadataField(schema, parentName, fieldName);
  const argumentsByName = readDemandDirectiveArguments(field?.astNode?.directives, "cost");
  if (!argumentsByName) {
    return undefined;
  }
  const weight = argumentsByName["weight"];
  if (!Number.isSafeInteger(weight) || typeof weight !== "number" || weight < 0) {
    return rejectDemandAnalysis(
      operationName,
      `${parentName}.${fieldName} has an invalid cost weight`,
    );
  }
  return weight;
}

function explicitTypeWeight(
  schema: GraphQLSchema,
  typeName: string,
  operationName: string,
): number | undefined {
  const type = schema.getType(typeName);
  const argumentsByName = readDemandDirectiveArguments(type?.astNode?.directives, "cost");
  if (!argumentsByName) {
    return undefined;
  }
  const weight = argumentsByName["weight"];
  if (!Number.isSafeInteger(weight) || typeof weight !== "number" || weight < 0) {
    return rejectDemandAnalysis(operationName, `${typeName} has an invalid cost weight`);
  }
  return weight;
}

function resolveFieldWeight(
  state: AnalysisState,
  parentName: string,
  fieldName: string,
  returnTypeName: string,
  returnComposite: boolean,
  root: boolean,
): number {
  const weight = explicitWeight(state.supergraph, parentName, fieldName, state.operationName);
  if (root && weight === undefined) {
    return rejectDemandAnalysis(state.operationName, `${parentName}.${fieldName} requires @cost`);
  }
  const parentWeight = explicitTypeWeight(state.supergraph, parentName, state.operationName);
  if (!root && parentWeight !== undefined && weight === undefined) {
    return rejectDemandAnalysis(state.operationName, `${parentName}.${fieldName} requires @cost`);
  }
  return (
    weight ??
    explicitTypeWeight(state.supergraph, returnTypeName, state.operationName) ??
    (returnComposite ? 1 : 0)
  );
}

function isListOutputType(type: GraphQLOutputType): boolean {
  const nullable = isNonNullType(type) ? type.ofType : type;
  return isListType(nullable);
}

type ListMetadata = Readonly<{
  assumedSize: number;
  requireOneSlicingArgument: boolean;
  slicingArguments: readonly string[];
}>;

function readListMetadata(
  state: AnalysisState,
  parentName: string,
  fieldName: string,
): ListMetadata {
  const field = demandMetadataField(state.supergraph, parentName, fieldName);
  const argumentsByName = readDemandDirectiveArguments(field?.astNode?.directives, "listSize");
  if (!field || !isListOutputType(field.type) || !argumentsByName) {
    return rejectDemandAnalysis(
      state.operationName,
      `${parentName}.${fieldName} requires direct @listSize`,
    );
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
    return rejectDemandAnalysis(
      state.operationName,
      `${parentName}.${fieldName} has invalid list metadata`,
    );
  }
  return Object.freeze({
    assumedSize,
    requireOneSlicingArgument,
    slicingArguments: Object.freeze(slicingArguments as string[]),
  });
}

function resolveLiteralSliceSize(
  node: FieldNode,
  metadata: ListMetadata,
  operationName: string,
): number {
  const supplied = metadata.slicingArguments.filter((name) =>
    node.arguments?.some((candidate) => candidate.name.value === name),
  );
  if (
    metadata.requireOneSlicingArgument &&
    metadata.slicingArguments.length > 0 &&
    supplied.length !== 1
  ) {
    return rejectDemandAnalysis(operationName, "exactly one slicing argument is required");
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
      return rejectDemandAnalysis(operationName, `literal ${name} exceeds its owner list maximum`);
    }
    sizes.push(value);
  }
  return sizes.length === 0 ? metadata.assumedSize : Math.max(...sizes);
}

function incrementBoundedMetric(
  state: AnalysisState,
  name: keyof Pick<MutableMetrics, "aliases" | "rootFields" | "selections">,
  maximum: keyof Pick<DemandPolicy, "maximumAliases" | "maximumRootFields" | "maximumSelections">,
): void {
  state.metrics[name] = addDemandValues(state.metrics[name], 1, state.operationName);
  if (state.metrics[name] > state.policy[maximum]) {
    rejectDemandAnalysis(state.operationName, `${maximum} exceeded`);
  }
}

function requireCompositeType(
  state: AnalysisState,
  typeName: string,
  context: string,
): GraphQLCompositeType {
  const type = state.api.getType(typeName);
  return type && isCompositeType(type)
    ? type
    : rejectDemandAnalysis(state.operationName, `${context} has no composite type`);
}

function calculateSelectionSetCost(
  state: AnalysisState,
  parentType: GraphQLCompositeType,
  selectionSet: SelectionSetNode,
  parentDepth: number,
  parentListExpansion: number,
): number {
  let selectionSetCost = 0;

  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.INLINE_FRAGMENT) {
      const fragmentParentType = selection.typeCondition
        ? requireCompositeType(state, selection.typeCondition.name.value, "inline fragment")
        : parentType;
      selectionSetCost = addDemandValues(
        selectionSetCost,
        calculateSelectionSetCost(
          state,
          fragmentParentType,
          selection.selectionSet,
          parentDepth,
          parentListExpansion,
        ),
        state.operationName,
      );
      continue;
    }

    if (selection.kind === Kind.FRAGMENT_SPREAD) {
      const fragmentName = selection.name.value;
      const fragment = state.fragments.get(fragmentName);
      if (
        !fragment ||
        state.activeFragments.has(fragmentName) ||
        state.activeFragments.size >= 32
      ) {
        rejectDemandAnalysis(
          state.operationName,
          `fragment ${fragmentName} is missing, cyclic or excessive`,
        );
      }
      state.activeFragments.add(fragmentName);
      try {
        selectionSetCost = addDemandValues(
          selectionSetCost,
          calculateSelectionSetCost(
            state,
            requireCompositeType(
              state,
              fragment.typeCondition.name.value,
              `fragment ${fragmentName}`,
            ),
            fragment.selectionSet,
            parentDepth,
            parentListExpansion,
          ),
          state.operationName,
        );
      } finally {
        state.activeFragments.delete(fragmentName);
      }
      continue;
    }

    incrementBoundedMetric(state, "selections", "maximumSelections");
    if (selection.alias) {
      incrementBoundedMetric(state, "aliases", "maximumAliases");
    }
    if (parentDepth === 0) {
      incrementBoundedMetric(state, "rootFields", "maximumRootFields");
    }

    const fieldDepth = parentDepth + 1;
    state.metrics.depth = Math.max(state.metrics.depth, fieldDepth);
    if (fieldDepth > state.policy.maximumDepth) {
      rejectDemandAnalysis(state.operationName, "maximumDepth exceeded");
    }
    if (selection.name.value === "__typename") {
      continue;
    }

    if (!isObjectType(parentType) && !isInterfaceType(parentType)) {
      rejectDemandAnalysis(
        state.operationName,
        `${parentType.name}.${selection.name.value} is not selectable`,
      );
    }

    const selectedField = parentType.getFields()[selection.name.value];
    if (!selectedField) {
      rejectDemandAnalysis(
        state.operationName,
        `${parentType.name}.${selection.name.value} is unknown`,
      );
    }

    state.metrics.authorizationScope = requiredAuthorizationScope(
      state.metrics.authorizationScope,
      `${parentType.name}.${selection.name.value}`,
    );

    const returnType = getNamedType(selectedField.type);
    const returnsCompositeType = isCompositeType(returnType);
    const selectedFieldWeight = resolveFieldWeight(
      state,
      parentType.name,
      selection.name.value,
      returnType.name,
      returnsCompositeType,
      parentDepth === 0,
    );
    const selectedListMetadata = isListOutputType(selectedField.type)
      ? readListMetadata(state, parentType.name, selection.name.value)
      : undefined;
    const selectedListSize = selectedListMetadata
      ? resolveLiteralSliceSize(selection, selectedListMetadata, state.operationName)
      : 1;
    const fieldListExpansion = multiplyDemandValues(
      parentListExpansion,
      selectedListSize,
      state.operationName,
    );
    state.metrics.listExpansion = Math.max(state.metrics.listExpansion, fieldListExpansion);
    if (fieldListExpansion > state.policy.maximumListExpansion) {
      rejectDemandAnalysis(state.operationName, "maximumListExpansion exceeded");
    }

    let nestedSelectionCost = 0;
    if (selection.selectionSet) {
      if (!returnsCompositeType) {
        rejectDemandAnalysis(
          state.operationName,
          `${parentType.name}.${selection.name.value} cannot have selections`,
        );
      }
      nestedSelectionCost = calculateSelectionSetCost(
        state,
        returnType,
        selection.selectionSet,
        fieldDepth,
        fieldListExpansion,
      );
    } else if (returnsCompositeType) {
      rejectDemandAnalysis(
        state.operationName,
        `${parentType.name}.${selection.name.value} requires selections`,
      );
    }

    const singleItemCost = addDemandValues(
      selectedFieldWeight,
      nestedSelectionCost,
      state.operationName,
    );
    selectionSetCost = addDemandValues(
      selectionSetCost,
      multiplyDemandValues(selectedListSize, singleItemCost, state.operationName),
      state.operationName,
    );
    if (selectionSetCost > state.policy.maximumCost) {
      rejectDemandAnalysis(state.operationName, "maximumCost exceeded");
    }
  }

  return selectionSetCost;
}

function requireOperationRootType(
  schema: GraphQLSchema,
  definition: OperationDefinitionNode,
  operationName: string,
): GraphQLCompositeType {
  const operationRootType =
    definition.operation === OperationTypeNode.QUERY
      ? schema.getQueryType()
      : definition.operation === OperationTypeNode.MUTATION
        ? schema.getMutationType()
        : schema.getSubscriptionType();
  return (
    operationRootType ??
    rejectDemandAnalysis(operationName, `${definition.operation} root is unavailable`)
  );
}

export function analyzeOperationDemand(
  api: GraphQLSchema,
  supergraph: GraphQLSchema,
  operation: DemandOperation,
  policy: DemandPolicy = GRAPHQL_DEMAND_POLICY,
): OperationDemandAnalysis {
  validateDemandPolicy(policy);

  const requestEnvelopeBytes = Buffer.byteLength(
    JSON.stringify({
      operationName: operation.name,
      query: operation.body,
      variables: {},
    }),
    "utf8",
  );
  if (
    requestEnvelopeBytes > MAXIMUM_REQUEST_BYTES ||
    !/^[a-f0-9]{64}$/u.test(operation.id) ||
    createHash("sha256").update(operation.body).digest("hex") !== operation.id
  ) {
    return rejectDemandAnalysis(
      operation.name,
      "encoded request exceeds the Router body limit or hash is invalid",
    );
  }
  let parsedDocument: DocumentNode;
  try {
    parsedDocument = parse(operation.body, { maxTokens: MAXIMUM_PARSER_TOKENS });
  } catch {
    return rejectDemandAnalysis(operation.name, "body exceeds parser token limit or is malformed");
  }

  const schemaValidationErrors = validate(api, parsedDocument, undefined, { maxErrors: 10 });
  if (schemaValidationErrors.length > 0) {
    return rejectDemandAnalysis(operation.name, "body is incompatible with the public schema");
  }

  const operationDefinitions = parsedDocument.definitions.filter(
    (definition): definition is OperationDefinitionNode =>
      definition.kind === Kind.OPERATION_DEFINITION,
  );
  const fragmentDefinitions = parsedDocument.definitions.filter(
    (definition): definition is FragmentDefinitionNode =>
      definition.kind === Kind.FRAGMENT_DEFINITION,
  );
  const operationDefinition = operationDefinitions[0];
  if (
    operationDefinitions.length !== 1 ||
    !operationDefinition?.name ||
    operationDefinition.name.value !== operation.name ||
    operationDefinition.operation !== operation.type ||
    parsedDocument.definitions.length !==
      operationDefinitions.length + fragmentDefinitions.length ||
    fragmentDefinitions.length > 32
  ) {
    return rejectDemandAnalysis(operation.name, "body identity or definition set is invalid");
  }

  const fragmentsByName = new Map(
    fragmentDefinitions.map((fragment) => [fragment.name.value, fragment]),
  );
  if (fragmentsByName.size !== fragmentDefinitions.length) {
    return rejectDemandAnalysis(operation.name, "fragment names are not unique");
  }

  const demandMetrics: MutableMetrics = {
    aliases: 0,
    authorizationScope: "public",
    depth: 0,
    listExpansion: 1,
    rootFields: 0,
    selections: 0,
  };
  const analysisState: AnalysisState = {
    api,
    supergraph,
    fragments: fragmentsByName,
    metrics: demandMetrics,
    operationName: operation.name,
    policy,
    activeFragments: new Set(),
  };

  const operationBaseCost = operationDefinition.operation === OperationTypeNode.MUTATION ? 10 : 0;
  const operationCost = addDemandValues(
    operationBaseCost,
    calculateSelectionSetCost(
      analysisState,
      requireOperationRootType(api, operationDefinition, operation.name),
      operationDefinition.selectionSet,
      0,
      1,
    ),
    operation.name,
  );
  if (operationCost > policy.maximumCost) {
    return rejectDemandAnalysis(operation.name, "maximumCost exceeded");
  }

  return Object.freeze({
    aliases: demandMetrics.aliases,
    authorizationScope: demandMetrics.authorizationScope,
    cost: operationCost,
    depth: demandMetrics.depth,
    id: operation.id,
    listExpansion: demandMetrics.listExpansion,
    name: operation.name,
    rootFields: demandMetrics.rootFields,
    selections: demandMetrics.selections,
    type: operation.type,
  });
}

export function createOperationDemandManifest(
  api: GraphQLSchema,
  supergraph: GraphQLSchema,
  operations: readonly DemandOperation[],
  policy: DemandPolicy = GRAPHQL_DEMAND_POLICY,
  runtimePolicies: Readonly<
    Record<string, OperationRuntimePolicy>
  > = GRAPHQL_OPERATION_RUNTIME_POLICIES,
): OperationDemandManifest {
  if (operations.length < 1 || operations.length > 64) {
    throw new Error("GraphQL demand manifest requires 1–64 exact operations.");
  }
  const operationNames = [...new Set(operations.map(({ name }) => name))].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
  const policyNames = Object.keys(runtimePolicies).sort((left, right) =>
    left.localeCompare(right, "en"),
  );
  if (operationNames.join("\0") !== policyNames.join("\0")) {
    throw new Error(
      "GraphQL runtime policy requires every exact operation name and no stale entry.",
    );
  }
  const expectedOperationRateClass = (name: string): OperationRateClass => {
    if (["CreateProfile", "DeleteProfile", "UpdateProfile"].includes(name)) {
      return "profile_mutation";
    }
    if (name === "SelectProfile") {
      return "profile_selection";
    }
    if (name === "RecordProgress") {
      return "engagement_progress";
    }
    if (name === "SetWatchlist") {
      return "engagement_watchlist";
    }
    if (name === "SearchTitles") {
      return "discovery_search";
    }
    return "global";
  };
  const profiles = operations
    .map((operation) => {
      const analysis = analyzeOperationDemand(api, supergraph, operation, policy);
      const runtime = runtimePolicies[operation.name] as
        (Partial<OperationRuntimePolicy> & Record<string, unknown>) | undefined;
      if (
        !runtime ||
        runtime.authorizationScope !== analysis.authorizationScope ||
        runtime.cacheControl !== "no-store" ||
        runtime.executionDeadlineMs !== 3_000 ||
        runtime.maximumConcurrentRequests !== 8 ||
        runtime.rateClass !== expectedOperationRateClass(operation.name) ||
        Object.keys(runtime).toSorted().join(",") !==
          "authorizationScope,cacheControl,executionDeadlineMs,maximumConcurrentRequests,rateClass"
      ) {
        return rejectDemandAnalysis(
          operation.name,
          "runtime authorization, rate or cache scope is invalid",
        );
      }
      return Object.freeze({ ...analysis, ...(runtime as OperationRuntimePolicy) });
    })
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name, "en") || left.id.localeCompare(right.id, "en"),
    );
  if (new Set(profiles.map(({ id }) => id)).size !== profiles.length) {
    throw new Error("GraphQL demand manifest operation hashes must be unique.");
  }
  return Object.freeze({
    format: "aster-operation-demand-manifest",
    version: 2,
    policy: Object.freeze({ ...policy }),
    operations: Object.freeze(profiles),
  });
}
