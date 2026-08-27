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
export type {
  CatalogTitleLifecycle,
  TitleState,
  ValidatedPublicationReference,
} from "./domain/title.js";
