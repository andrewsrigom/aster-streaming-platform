import { createHash } from "node:crypto";
import { CATALOG_PUBLIC_ENTITY_OWNER_QUERY_PLAN } from "@aster/catalog/query-plan";
import {
  Kind,
  TypeInfo,
  getNamedType,
  isListType,
  isNonNullType,
  isObjectType,
  parse,
  visit,
  visitWithTypeInfo,
  type ConstDirectiveNode,
  type GraphQLOutputType,
  type GraphQLSchema,
} from "graphql";
import { trustedOperationAuthorizationScope } from "./demand.js";

type Owner = "catalog" | "discovery" | "engagement" | "identity" | "playback";
type AuthorizationScope = "public" | "account" | "profile";
type Resolution = "materialized" | "owner_page" | "reference_only" | "request_loader";

type OwnerQueryPlan = Readonly<{
  initial: readonly string[];
  retry: Readonly<{
    maximumAttempts: number;
    reason: string;
    sequence: readonly string[];
  }> | null;
}>;

type ListPathAudit = Readonly<{
  authorizationScope: AuthorizationScope;
  maximumItems: number;
  owner: Owner;
  resolution: Extract<Resolution, "materialized" | "owner_page">;
}>;

type EntityReturnAudit = Readonly<{
  authorizationScope: AuthorizationScope;
  maximumParentItems: number;
  owner: Owner;
  resolution: Extract<Resolution, "materialized" | "request_loader">;
}>;

type EntityContributorAudit = Readonly<{
  authorizationScope: AuthorizationScope;
  maximumBatchSize: number;
  maximumOwnerQueriesPerBatch: number;
  ownerQueryPlan: OwnerQueryPlan;
  resolution: Extract<Resolution, "reference_only" | "request_loader">;
}>;

const list = (
  owner: Owner,
  authorizationScope: AuthorizationScope,
  maximumItems: number,
  resolution: ListPathAudit["resolution"],
): ListPathAudit => Object.freeze({ owner, authorizationScope, maximumItems, resolution });

const entityReturn = (
  owner: Owner,
  authorizationScope: AuthorizationScope,
  maximumParentItems: number,
  resolution: EntityReturnAudit["resolution"],
): EntityReturnAudit =>
  Object.freeze({ owner, authorizationScope, maximumParentItems, resolution });

const contributor = (
  authorizationScope: AuthorizationScope,
  maximumBatchSize: number,
  ownerQueryPlan: OwnerQueryPlan,
  resolution: EntityContributorAudit["resolution"],
): EntityContributorAudit =>
  Object.freeze({
    authorizationScope,
    maximumBatchSize,
    maximumOwnerQueriesPerBatch: maximumOwnerQueriesPerBatch(ownerQueryPlan),
    ownerQueryPlan,
    resolution,
  });

const REFERENCE_ONLY_OWNER_QUERY_PLAN = Object.freeze({
  initial: Object.freeze([]),
  retry: null,
});

const SINGLE_OWNER_LOAD_QUERY_PLAN = Object.freeze({
  initial: Object.freeze(["findMany"]),
  retry: null,
});

export const GRAPHQL_EXECUTION_PATH_AUDIT = Object.freeze({
  lists: Object.freeze({
    "CatalogTitleConnection.edges": list("catalog", "public", 20, "owner_page"),
    "DiscoveryGenreRailResult.rails": list("discovery", "public", 3, "materialized"),
    "DiscoveryRail.edges": list("discovery", "public", 12, "materialized"),
    "DiscoverySearchConnection.edges": list("discovery", "public", 20, "owner_page"),
    "OwnedProfiles.profiles": list("identity", "account", 16, "owner_page"),
    "ProgressConnection.edges": list("engagement", "profile", 20, "owner_page"),
    "Title.accessibility": list("catalog", "public", 3, "materialized"),
    "Title.credits": list("catalog", "public", 16, "materialized"),
    "Title.editorialLabels": list("catalog", "public", 8, "materialized"),
    "Title.genres": list("catalog", "public", 8, "materialized"),
    "Title.languages": list("catalog", "public", 8, "materialized"),
    "WatchlistConnection.edges": list("engagement", "profile", 20, "owner_page"),
  }),
  entityReturns: Object.freeze({
    "CatalogTitleEdge.node": entityReturn("catalog", "public", 20, "materialized"),
    "DiscoveryRailEdge.node": entityReturn("catalog", "public", 12, "request_loader"),
    "DiscoverySearchEdge.node": entityReturn("catalog", "public", 20, "request_loader"),
    "OwnedProfiles.profiles": entityReturn("identity", "account", 16, "materialized"),
    "ProfileSelectionPayload.profile": entityReturn("identity", "account", 1, "materialized"),
    "Progress.title": entityReturn("catalog", "profile", 20, "request_loader"),
    "Query.activeProfile": entityReturn("identity", "account", 1, "request_loader"),
    "Query.profile": entityReturn("identity", "account", 1, "request_loader"),
    "Query.title": entityReturn("catalog", "public", 1, "request_loader"),
    "WatchlistEntry.title": entityReturn("catalog", "profile", 20, "request_loader"),
  }),
  entityContributors: Object.freeze({
    "catalog.Title": contributor(
      "public",
      20,
      CATALOG_PUBLIC_ENTITY_OWNER_QUERY_PLAN,
      "request_loader",
    ),
    "discovery.Title": contributor("public", 20, REFERENCE_ONLY_OWNER_QUERY_PLAN, "reference_only"),
    "engagement.Profile": contributor(
      "profile",
      20,
      SINGLE_OWNER_LOAD_QUERY_PLAN,
      "request_loader",
    ),
    "engagement.Title": contributor("profile", 20, SINGLE_OWNER_LOAD_QUERY_PLAN, "request_loader"),
    "identity.Profile": contributor("account", 16, SINGLE_OWNER_LOAD_QUERY_PLAN, "request_loader"),
  }),
});

export type ExecutionPathAudit = Readonly<{
  lists: Readonly<Record<string, ListPathAudit>>;
  entityReturns: Readonly<Record<string, EntityReturnAudit>>;
  entityContributors: Readonly<Record<string, EntityContributorAudit>>;
}>;

export type ExecutionAuditOperation = Readonly<{
  body: string;
  id: string;
  name: string;
}>;

const GRAPHQL_EXECUTION_IMPLEMENTATION_CONTRACT = Object.freeze({
  lists: Object.freeze({
    "CatalogTitleConnection.edges": "owner_page",
    "DiscoveryGenreRailResult.rails": "materialized",
    "DiscoveryRail.edges": "materialized",
    "DiscoverySearchConnection.edges": "owner_page",
    "OwnedProfiles.profiles": "owner_page",
    "ProgressConnection.edges": "owner_page",
    "Title.accessibility": "materialized",
    "Title.credits": "materialized",
    "Title.editorialLabels": "materialized",
    "Title.genres": "materialized",
    "Title.languages": "materialized",
    "WatchlistConnection.edges": "owner_page",
  }),
  entityReturns: Object.freeze({
    "CatalogTitleEdge.node": Object.freeze({ maximumParentItems: 20, resolution: "materialized" }),
    "DiscoveryRailEdge.node": Object.freeze({
      maximumParentItems: 12,
      resolution: "request_loader",
    }),
    "DiscoverySearchEdge.node": Object.freeze({
      maximumParentItems: 20,
      resolution: "request_loader",
    }),
    "OwnedProfiles.profiles": Object.freeze({ maximumParentItems: 16, resolution: "materialized" }),
    "ProfileSelectionPayload.profile": Object.freeze({
      maximumParentItems: 1,
      resolution: "materialized",
    }),
    "Progress.title": Object.freeze({ maximumParentItems: 20, resolution: "request_loader" }),
    "Query.activeProfile": Object.freeze({ maximumParentItems: 1, resolution: "request_loader" }),
    "Query.profile": Object.freeze({ maximumParentItems: 1, resolution: "request_loader" }),
    "Query.title": Object.freeze({ maximumParentItems: 1, resolution: "request_loader" }),
    "WatchlistEntry.title": Object.freeze({ maximumParentItems: 20, resolution: "request_loader" }),
  }),
  entityContributors: Object.freeze({
    "catalog.Title": Object.freeze({
      maximumBatchSize: 20,
      ownerQueryPlan: CATALOG_PUBLIC_ENTITY_OWNER_QUERY_PLAN,
      resolution: "request_loader",
    }),
    "discovery.Title": Object.freeze({
      maximumBatchSize: 20,
      ownerQueryPlan: REFERENCE_ONLY_OWNER_QUERY_PLAN,
      resolution: "reference_only",
    }),
    "engagement.Profile": Object.freeze({
      maximumBatchSize: 20,
      ownerQueryPlan: SINGLE_OWNER_LOAD_QUERY_PLAN,
      resolution: "request_loader",
    }),
    "engagement.Title": Object.freeze({
      maximumBatchSize: 20,
      ownerQueryPlan: SINGLE_OWNER_LOAD_QUERY_PLAN,
      resolution: "request_loader",
    }),
    "identity.Profile": Object.freeze({
      maximumBatchSize: 16,
      ownerQueryPlan: SINGLE_OWNER_LOAD_QUERY_PLAN,
      resolution: "request_loader",
    }),
  }),
} as const);

function ownerQueryPlanIdentity(plan: OwnerQueryPlan): string {
  const validSequence = (sequence: readonly string[]): boolean =>
    sequence.length <= 8 && sequence.every((entry) => /^[a-z][A-Za-z0-9]{0,63}$/u.test(entry));
  if (!validSequence(plan.initial)) {
    throw new Error("GraphQL owner-query initial sequence is invalid.");
  }
  if (plan.retry === null) {
    return `initial:${plan.initial.join(",")}|retry:none`;
  }
  if (
    !Number.isSafeInteger(plan.retry.maximumAttempts) ||
    plan.retry.maximumAttempts < 1 ||
    plan.retry.maximumAttempts > 2 ||
    !/^[a-z][a-z_]{0,63}$/u.test(plan.retry.reason) ||
    !validSequence(plan.retry.sequence) ||
    plan.retry.sequence.length === 0
  ) {
    throw new Error("GraphQL owner-query retry sequence is invalid.");
  }
  return `initial:${plan.initial.join(",")}|retry:${plan.retry.reason}:${String(plan.retry.maximumAttempts)}:${plan.retry.sequence.join(",")}`;
}

function maximumOwnerQueriesPerBatch(plan: OwnerQueryPlan): number {
  ownerQueryPlanIdentity(plan);
  return (
    plan.initial.length +
    (plan.retry === null ? 0 : plan.retry.maximumAttempts * plan.retry.sequence.length)
  );
}

function unwrapList(type: GraphQLOutputType): boolean {
  let current: GraphQLOutputType = type;
  if (isNonNullType(current)) {
    current = current.ofType;
  }
  return isListType(current);
}

function exactKeys(label: string, actual: readonly string[], expected: readonly string[]): void {
  const left = [...actual].sort((a, b) => a.localeCompare(b, "en"));
  const right = [...expected].sort((a, b) => a.localeCompare(b, "en"));
  if (left.join("\0") !== right.join("\0")) {
    throw new Error(`${label} audit must exactly cover the current public schema.`);
  }
}

function integerArgument(directive: ConstDirectiveNode | undefined, name: string): number {
  const value = directive?.arguments?.find((argument) => argument.name.value === name)?.value;
  if (!value || value.kind !== Kind.INT) {
    throw new Error("Every public list audit requires one integer @listSize assumedSize.");
  }
  return Number(value.value);
}

const OWNERS = new Set<Owner>(["catalog", "discovery", "engagement", "identity", "playback"]);

function keyFields(directive: ConstDirectiveNode | undefined): ReadonlySet<string> {
  const value = directive?.arguments?.find((argument) => argument.name.value === "fields")?.value;
  if (!value || value.kind !== Kind.STRING) {
    throw new Error("Every entity contributor requires one finite @key field set.");
  }
  const document = parse(`fragment EntityKey on Entity { ${value.value} }`, { maxTokens: 64 });
  const fragment = document.definitions[0];
  if (fragment?.kind !== Kind.FRAGMENT_DEFINITION) {
    throw new Error("Entity key metadata is invalid.");
  }
  const fields = fragment.selectionSet.selections.map((selection) => {
    if (selection.kind !== Kind.FIELD || selection.selectionSet) {
      throw new Error("Execution audit supports flat entity keys only.");
    }
    return selection.name.value;
  });
  return new Set(fields);
}

function sourceFacts(sources: Readonly<Record<string, string>>) {
  const listSizes = new Map<string, number>();
  const contributors: string[] = [];
  const entityTypes = new Set<string>();
  const coordinateOwners = new Map<string, Set<Owner>>();
  const contributorFields = new Map<string, Set<string>>();
  const authorityCandidates = new Map<string, Owner[]>();
  for (const [ownerName, source] of Object.entries(sources)) {
    if (!OWNERS.has(ownerName as Owner)) {
      throw new Error(`Unknown GraphQL source owner ${ownerName}.`);
    }
    const owner = ownerName as Owner;
    const document = parse(source, { maxTokens: 20_000 });
    for (const definition of document.definitions) {
      if (definition.kind !== Kind.OBJECT_TYPE_DEFINITION) {
        continue;
      }
      const entityKey = definition.directives?.find((directive) => directive.name.value === "key");
      if (entityKey) {
        entityTypes.add(definition.name.value);
        contributors.push(`${owner}.${definition.name.value}`);
        const keys = keyFields(entityKey);
        contributorFields.set(
          `${owner}.${definition.name.value}`,
          new Set(
            (definition.fields ?? [])
              .filter((field) => !keys.has(field.name.value))
              .map((field) => `${definition.name.value}.${field.name.value}`),
          ),
        );
        if (definition.directives?.some((directive) => directive.name.value === "cost")) {
          const candidates = authorityCandidates.get(definition.name.value) ?? [];
          candidates.push(owner);
          authorityCandidates.set(definition.name.value, candidates);
        }
      }
      for (const field of definition.fields ?? []) {
        const coordinate = `${definition.name.value}.${field.name.value}`;
        const owners = coordinateOwners.get(coordinate) ?? new Set<Owner>();
        owners.add(owner);
        coordinateOwners.set(coordinate, owners);
        const directive = field.directives?.find((entry) => entry.name.value === "listSize");
        if (directive) {
          const maximum = integerArgument(directive, "assumedSize");
          const previous = listSizes.get(coordinate);
          if ((previous !== undefined && previous !== maximum) || !Number.isSafeInteger(maximum)) {
            throw new Error(`${coordinate} has conflicting or invalid list metadata.`);
          }
          listSizes.set(coordinate, maximum);
        }
      }
    }
  }
  const entityAuthorities = new Map<string, Owner>();
  for (const entityType of entityTypes) {
    const candidates = authorityCandidates.get(entityType) ?? [];
    if (candidates.length !== 1) {
      throw new Error(`${entityType} requires exactly one cost-owning entity authority.`);
    }
    entityAuthorities.set(entityType, candidates[0] as Owner);
  }
  return {
    contributors,
    contributorFields,
    coordinateOwners,
    entityAuthorities,
    entityTypes,
    listSizes,
  };
}

function selectedCoordinateScopes(
  api: GraphQLSchema,
  operations: readonly ExecutionAuditOperation[],
): ReadonlyMap<string, ReadonlySet<AuthorizationScope>> {
  if (operations.length < 1 || operations.length > 64) {
    throw new Error("Execution audit requires 1–64 exact trusted operations.");
  }
  const result = new Map<string, Set<AuthorizationScope>>();
  for (const operation of operations) {
    if (
      !/^[a-f0-9]{64}$/u.test(operation.id) ||
      createHash("sha256").update(operation.body).digest("hex") !== operation.id
    ) {
      throw new Error(`${operation.name} execution-audit operation hash is invalid.`);
    }
    const document = parse(operation.body, { maxTokens: 2_000 });
    const definitions = document.definitions.filter(
      (definition) => definition.kind === Kind.OPERATION_DEFINITION,
    );
    if (definitions.length !== 1 || definitions[0]?.name?.value !== operation.name) {
      throw new Error(`${operation.name} execution-audit operation identity is invalid.`);
    }
    const scope = trustedOperationAuthorizationScope(operation.name);
    const typeInfo = new TypeInfo(api);
    visit(
      document,
      visitWithTypeInfo(typeInfo, {
        Field(node) {
          if (node.name.value === "__typename") {
            return;
          }
          const parent = typeInfo.getParentType();
          if (!parent) {
            throw new Error(`${operation.name} has an untyped selected field.`);
          }
          const coordinate = `${parent.name}.${node.name.value}`;
          const scopes = result.get(coordinate) ?? new Set<AuthorizationScope>();
          scopes.add(scope);
          result.set(coordinate, scopes);
        },
      }),
    );
  }
  return result;
}

function leastScope(scopes: ReadonlySet<AuthorizationScope> | undefined, label: string) {
  if (!scopes || scopes.size === 0) {
    throw new Error(`${label} is not selected by an exact trusted operation.`);
  }
  for (const scope of ["public", "account", "profile"] as const) {
    if (scopes.has(scope)) {
      return scope;
    }
  }
  throw new Error(`${label} has no valid trusted-operation authorization scope.`);
}

export function validateGraphqlExecutionPathAudit(
  api: GraphQLSchema,
  sources: Readonly<Record<string, string>>,
  operations: readonly ExecutionAuditOperation[],
  audit: ExecutionPathAudit = GRAPHQL_EXECUTION_PATH_AUDIT,
): void {
  const facts = sourceFacts(sources);
  const selectedScopes = selectedCoordinateScopes(api, operations);
  const publicLists: string[] = [];
  const entityReturns: string[] = [];
  for (const type of Object.values(api.getTypeMap())) {
    if (!isObjectType(type) || type.name.startsWith("__")) {
      continue;
    }
    for (const field of Object.values(type.getFields())) {
      const coordinate = `${type.name}.${field.name}`;
      if (unwrapList(field.type)) {
        publicLists.push(coordinate);
      }
      if (facts.entityTypes.has(getNamedType(field.type).name)) {
        entityReturns.push(coordinate);
      }
    }
  }
  exactKeys("GraphQL list path", publicLists, Object.keys(audit.lists));
  exactKeys("GraphQL entity return", entityReturns, Object.keys(audit.entityReturns));
  exactKeys(
    "GraphQL entity contributor",
    facts.contributors,
    Object.keys(audit.entityContributors),
  );
  exactKeys(
    "GraphQL list implementation",
    publicLists,
    Object.keys(GRAPHQL_EXECUTION_IMPLEMENTATION_CONTRACT.lists),
  );
  exactKeys(
    "GraphQL entity-return implementation",
    entityReturns,
    Object.keys(GRAPHQL_EXECUTION_IMPLEMENTATION_CONTRACT.entityReturns),
  );
  exactKeys(
    "GraphQL contributor implementation",
    facts.contributors,
    Object.keys(GRAPHQL_EXECUTION_IMPLEMENTATION_CONTRACT.entityContributors),
  );
  for (const [coordinate, entry] of Object.entries(audit.lists)) {
    const owners = facts.coordinateOwners.get(coordinate);
    const implementation =
      GRAPHQL_EXECUTION_IMPLEMENTATION_CONTRACT.lists[
        coordinate as keyof typeof GRAPHQL_EXECUTION_IMPLEMENTATION_CONTRACT.lists
      ];
    if (
      owners?.size !== 1 ||
      !owners.has(entry.owner) ||
      leastScope(selectedScopes.get(coordinate), coordinate) !== entry.authorizationScope ||
      facts.listSizes.get(coordinate) !== entry.maximumItems ||
      implementation !== entry.resolution
    ) {
      throw new Error(`${coordinate} list execution audit is invalid.`);
    }
  }
  for (const [coordinate, entry] of Object.entries(audit.entityReturns)) {
    const [parentName, fieldName] = coordinate.split(".");
    const parent = parentName ? api.getType(parentName) : undefined;
    const field =
      parent && isObjectType(parent) && fieldName ? parent.getFields()[fieldName] : undefined;
    const authority = field
      ? facts.entityAuthorities.get(getNamedType(field.type).name)
      : undefined;
    const implementation =
      GRAPHQL_EXECUTION_IMPLEMENTATION_CONTRACT.entityReturns[
        coordinate as keyof typeof GRAPHQL_EXECUTION_IMPLEMENTATION_CONTRACT.entityReturns
      ];
    if (
      authority !== entry.owner ||
      leastScope(selectedScopes.get(coordinate), coordinate) !== entry.authorizationScope ||
      implementation.maximumParentItems !== entry.maximumParentItems ||
      implementation.resolution !== entry.resolution
    ) {
      throw new Error(`${coordinate} entity-return audit is invalid.`);
    }
  }
  for (const [coordinate, entry] of Object.entries(audit.entityContributors)) {
    const separator = coordinate.indexOf(".");
    const owner = coordinate.slice(0, separator) as Owner;
    const typeName = coordinate.slice(separator + 1);
    const scopes = new Set<AuthorizationScope>();
    for (const fieldCoordinate of facts.contributorFields.get(coordinate) ?? []) {
      for (const scope of selectedScopes.get(fieldCoordinate) ?? []) {
        scopes.add(scope);
      }
    }
    if (scopes.size === 0) {
      for (const entityCoordinate of entityReturns) {
        const [parentName, fieldName] = entityCoordinate.split(".");
        const parent = parentName ? api.getType(parentName) : undefined;
        const field =
          parent && isObjectType(parent) && fieldName ? parent.getFields()[fieldName] : undefined;
        if (
          field &&
          getNamedType(field.type).name === typeName &&
          facts.coordinateOwners.get(entityCoordinate)?.has(owner)
        ) {
          for (const scope of selectedScopes.get(entityCoordinate) ?? []) {
            scopes.add(scope);
          }
        }
      }
    }
    const implementation =
      GRAPHQL_EXECUTION_IMPLEMENTATION_CONTRACT.entityContributors[
        coordinate as keyof typeof GRAPHQL_EXECUTION_IMPLEMENTATION_CONTRACT.entityContributors
      ];
    if (
      leastScope(scopes, coordinate) !== entry.authorizationScope ||
      implementation.maximumBatchSize !== entry.maximumBatchSize ||
      ownerQueryPlanIdentity(implementation.ownerQueryPlan) !==
        ownerQueryPlanIdentity(entry.ownerQueryPlan) ||
      maximumOwnerQueriesPerBatch(entry.ownerQueryPlan) !== entry.maximumOwnerQueriesPerBatch ||
      implementation.resolution !== entry.resolution
    ) {
      throw new Error(`${coordinate} entity-contributor audit is invalid.`);
    }
  }
}
