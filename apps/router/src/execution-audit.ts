import {
  Kind,
  getNamedType,
  isListType,
  isNonNullType,
  isObjectType,
  parse,
  type ConstDirectiveNode,
  type GraphQLOutputType,
  type GraphQLSchema,
} from "graphql";

type Owner = "catalog" | "discovery" | "engagement" | "identity" | "playback";
type AuthorizationScope = "public" | "account" | "profile";
type Resolution = "materialized" | "owner_page" | "reference_only" | "request_loader";

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
  maximumOwnerQueriesPerBatch: number,
  resolution: EntityContributorAudit["resolution"],
): EntityContributorAudit =>
  Object.freeze({
    authorizationScope,
    maximumBatchSize,
    maximumOwnerQueriesPerBatch,
    resolution,
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
    "catalog.Title": contributor("public", 20, 1, "request_loader"),
    "discovery.Title": contributor("public", 20, 0, "reference_only"),
    "engagement.Profile": contributor("profile", 20, 1, "request_loader"),
    "engagement.Title": contributor("profile", 20, 1, "request_loader"),
    "identity.Profile": contributor("account", 16, 1, "request_loader"),
  }),
});

type ExecutionPathAudit = typeof GRAPHQL_EXECUTION_PATH_AUDIT;

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

function sourceFacts(sources: Readonly<Record<string, string>>) {
  const listSizes = new Map<string, number>();
  const contributors: string[] = [];
  const entityTypes = new Set<string>();
  for (const [owner, source] of Object.entries(sources)) {
    const document = parse(source, { maxTokens: 20_000 });
    for (const definition of document.definitions) {
      if (definition.kind !== Kind.OBJECT_TYPE_DEFINITION) {
        continue;
      }
      if (definition.directives?.some((directive) => directive.name.value === "key")) {
        entityTypes.add(definition.name.value);
        contributors.push(`${owner}.${definition.name.value}`);
      }
      for (const field of definition.fields ?? []) {
        const directive = field.directives?.find((entry) => entry.name.value === "listSize");
        if (directive) {
          const coordinate = `${definition.name.value}.${field.name.value}`;
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
  return { contributors, entityTypes, listSizes };
}

export function validateGraphqlExecutionPathAudit(
  api: GraphQLSchema,
  sources: Readonly<Record<string, string>>,
  audit: ExecutionPathAudit = GRAPHQL_EXECUTION_PATH_AUDIT,
): void {
  const facts = sourceFacts(sources);
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
  for (const [coordinate, entry] of Object.entries(audit.lists)) {
    if (
      facts.listSizes.get(coordinate) !== entry.maximumItems ||
      !["public", "account", "profile"].includes(entry.authorizationScope) ||
      !["materialized", "owner_page"].includes(entry.resolution)
    ) {
      throw new Error(`${coordinate} list execution audit is invalid.`);
    }
  }
  for (const [coordinate, entry] of Object.entries(audit.entityReturns)) {
    if (
      !Number.isSafeInteger(entry.maximumParentItems) ||
      entry.maximumParentItems < 1 ||
      entry.maximumParentItems > 20 ||
      !["public", "account", "profile"].includes(entry.authorizationScope) ||
      !["materialized", "request_loader"].includes(entry.resolution)
    ) {
      throw new Error(`${coordinate} entity-return audit is invalid.`);
    }
  }
  for (const [coordinate, entry] of Object.entries(audit.entityContributors)) {
    if (
      !Number.isSafeInteger(entry.maximumBatchSize) ||
      entry.maximumBatchSize < 1 ||
      entry.maximumBatchSize > 20 ||
      !Number.isSafeInteger(entry.maximumOwnerQueriesPerBatch) ||
      entry.maximumOwnerQueriesPerBatch < 0 ||
      entry.maximumOwnerQueriesPerBatch > 3 ||
      (entry.resolution === "reference_only") !== (entry.maximumOwnerQueriesPerBatch === 0)
    ) {
      throw new Error(`${coordinate} entity-contributor audit is invalid.`);
    }
  }
}
