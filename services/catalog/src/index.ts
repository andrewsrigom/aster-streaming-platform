export {
  approveRights,
  currentApprovedRights,
  deriveAttribution,
  normalizeRightsRecord,
} from "./domain/rights.js";
export type { RightsRecord, RightsUsePolicy } from "./domain/rights.js";
export {
  TITLE_STATES,
  isPublicTitle,
  normalizeTitleLifecycle,
  transitionTitle,
} from "./domain/title.js";
export { createPostgresCatalogRights } from "./infrastructure/persistence/postgres-rights.js";
export type {
  CatalogRightsRevision,
  CatalogRightsTransaction,
  CatalogRightsUnitOfWork,
  CatalogStoreResult,
  RightsProvenance,
  StoredCatalogTitle,
} from "./application/rights-ports.js";
export type {
  CatalogTitleLifecycle,
  TitleState,
  ValidatedPublicationReference,
} from "./domain/title.js";
export {
  CATALOG_PUBLIC_ENTITY_MAXIMUM_OWNER_QUERIES_PER_BATCH,
  CATALOG_PUBLIC_ENTITY_OWNER_QUERY_PLAN,
} from "./application/public-cache.js";
export type { CatalogPublicEntityOwnerQuery } from "./application/public-cache.js";
