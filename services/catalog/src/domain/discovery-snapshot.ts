import { normalizeTitleMetadata, type TitleMetadata } from "./metadata.js";
import { projectPublicTitle, type PublicCatalogCandidate } from "./public-title.js";
import { normalizeRightsRecord, type RightsUsePolicy } from "./rights.js";
import { normalizePublication, normalizeTitleLifecycle } from "./title.js";
import { catalogIdentifier, catalogRecord, catalogTimestamp, catalogVersion } from "./values.js";

export interface DiscoveryCandidate {
  readonly titleId: string;
  readonly sourceVersion: number;
  readonly candidate: PublicCatalogCandidate | null;
  readonly publishedAt: number | null;
}
export interface DiscoverySnapshot {
  readonly titleId: string;
  readonly sourceVersion: number;
  readonly observedAt: number;
  readonly visibleUntil: number | null;
  readonly document:
    | (Pick<
        TitleMetadata,
        "defaultLocale" | "localizations" | "genres" | "editorialLabels" | "releaseYear"
      > & { readonly publishedAt: number })
    | null;
}

export function projectDiscoverySnapshot(
  source: unknown,
  observedAt: number,
  policy: RightsUsePolicy,
): DiscoverySnapshot {
  const input = catalogRecord(source, ["titleId", "sourceVersion", "candidate", "publishedAt"]);
  if (
    !input ||
    !catalogIdentifier(input["titleId"]) ||
    !catalogVersion(input["sourceVersion"]) ||
    !catalogTimestamp(observedAt) ||
    !catalogTimestamp(observedAt + 300)
  ) {
    throw new Error("Invalid Discovery source snapshot.");
  }
  const hidden: DiscoverySnapshot = Object.freeze({
    titleId: input["titleId"],
    sourceVersion: input["sourceVersion"],
    observedAt,
    visibleUntil: null,
    document: null,
  });
  // The owner read includes every source version, but supplies public facts only
  // for the current publication. Absence retains a retirement fence, not metadata.
  if (input["candidate"] === null) {
    return hidden;
  }
  const fields = catalogRecord(input["candidate"], [
    "title",
    "latestRightsRevision",
    "rights",
    "metadata",
    "publication",
  ]);
  if (!fields) {
    throw new Error("Invalid Discovery public candidate.");
  }
  const candidate = fields as unknown as PublicCatalogCandidate;
  const title = normalizeTitleLifecycle(candidate.title);
  const metadata = normalizeTitleMetadata(candidate.metadata);
  const rights = normalizeRightsRecord(candidate.rights);
  if (
    !title ||
    title.id !== hidden.titleId ||
    title.version !== hidden.sourceVersion ||
    !metadata ||
    !rights ||
    !catalogVersion(candidate.latestRightsRevision) ||
    !normalizePublication(candidate.publication, observedAt)
  ) {
    throw new Error("Invalid Discovery public facts.");
  }
  const visible = projectPublicTitle(candidate, observedAt, policy);
  if (!visible) {
    return hidden;
  }
  const publishedAt = input["publishedAt"];
  if (!catalogTimestamp(publishedAt) || publishedAt > observedAt) {
    throw new Error("Discovery publication time is unavailable.");
  }
  const visibleUntil = Math.min(
    observedAt + 300,
    rights.validUntil ?? Infinity,
    metadata.artwork?.rights.validUntil ?? Infinity,
  );
  return Object.freeze({
    ...hidden,
    visibleUntil,
    document: Object.freeze({
      defaultLocale: visible.defaultLocale,
      localizations: visible.localizations,
      genres: visible.genres,
      editorialLabels: visible.editorialLabels,
      releaseYear: visible.releaseYear,
      publishedAt,
    }),
  });
}
