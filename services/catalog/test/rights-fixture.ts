import type { RightsRecord } from "../src/domain/rights.js";

export const catalogTestId = (n: number): string =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
export const catalogTestTime = 1_787_800_000;
export function rightsFixture(patch: Partial<RightsRecord> = {}): RightsRecord {
  return {
    id: catalogTestId(2),
    titleId: catalogTestId(1),
    revision: 1,
    status: "DRAFT",
    workTitle: "Synthetic fixture",
    creator: null,
    copyrightHolder: null,
    canonicalSourceUrl: null,
    assetSourceUrl: null,
    licenseName: null,
    licenseVersion: null,
    licenseUrl: null,
    attributionText: null,
    modificationNotice: null,
    thirdPartyMaterialNotes: null,
    trademarkNotes: null,
    redistributionAllowed: null,
    commercialUseAllowed: null,
    modificationAllowed: null,
    shareAlikeRequired: null,
    technicalRestrictions: null,
    sourceChecksum: null,
    reviewedAt: null,
    reviewedBy: null,
    validUntil: null,
    evidenceLocations: [],
    ...patch,
  };
}
export const provenanceFixture = () => ({
  actorId: catalogTestId(3),
  recordedAt: catalogTestTime,
  correlationId: catalogTestId(4),
});
