export type CatalogPublicEntityOwnerQuery = "findFences" | "findManyAtFences";

export declare const CATALOG_PUBLIC_ENTITY_OWNER_QUERY_PLAN: Readonly<{
  initial: readonly CatalogPublicEntityOwnerQuery[];
  retry: Readonly<{
    reason: string;
    maximumAttempts: number;
    sequence: readonly CatalogPublicEntityOwnerQuery[];
  }>;
}>;

export declare const CATALOG_PUBLIC_ENTITY_MAXIMUM_OWNER_QUERIES_PER_BATCH: number;
