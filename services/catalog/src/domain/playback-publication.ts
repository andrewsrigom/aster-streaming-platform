import { normalizeTitleMetadata } from "./metadata.js";
import { projectPublicTitle, type PublicCatalogCandidate } from "./public-title.js";
import { currentApprovedRights, type RightsUsePolicy } from "./rights.js";
import { normalizePublication, normalizeTitleLifecycle } from "./title.js";

/** A current owner snapshot, never a transferable approval or a cross-request cache entry. */
export interface CurrentPlaybackPublication {
  readonly titleId: string;
  readonly publicationId: string;
  readonly titleVersion: number;
  readonly manifestUrl: string;
  readonly checkedAt: number;
  readonly validUntil: number | null;
}

export function projectPlaybackPublication(
  candidate: PublicCatalogCandidate,
  now: number,
  policy: RightsUsePolicy,
): CurrentPlaybackPublication | undefined {
  if (!projectPublicTitle(candidate, now, policy)) {
    return undefined;
  }
  const title = normalizeTitleLifecycle(candidate.title);
  const publication = normalizePublication(candidate.publication, now);
  const rights = currentApprovedRights(candidate.rights, now, policy);
  const metadata = normalizeTitleMetadata(candidate.metadata);
  if (
    !title ||
    !publication ||
    !rights ||
    !metadata ||
    metadata.editorialLabels.includes("ui-seed-v1")
  ) {
    return undefined;
  }
  const expiries = [rights.validUntil, metadata.artwork?.rights.validUntil ?? null].filter(
    (expiry): expiry is number => expiry !== null,
  );
  return Object.freeze({
    titleId: title.id,
    publicationId: publication.id,
    titleVersion: title.version,
    manifestUrl: publication.manifestUrl,
    checkedAt: now,
    validUntil: expiries.length ? Math.min(...expiries) : null,
  });
}
