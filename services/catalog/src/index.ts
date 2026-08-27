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
