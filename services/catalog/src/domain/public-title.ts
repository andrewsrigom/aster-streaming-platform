import { artworkPublishable, normalizeTitleMetadata, type TitleMetadata } from "./metadata.js";
import { deriveAttribution, type RightsUsePolicy } from "./rights.js";
import { isPublicTitle, normalizeTitleLifecycle } from "./title.js";

export interface PublicCatalogCandidate {
  readonly title: unknown;
  readonly latestRightsRevision: number;
  readonly rights: unknown;
  readonly metadata: unknown;
  readonly publication: unknown;
}
type PublicAttribution = NonNullable<ReturnType<typeof deriveAttribution>>;
export interface PublicCatalogTitle extends Omit<TitleMetadata, "artwork"> {
  readonly id: string;
  readonly attribution: PublicAttribution;
  readonly artwork: Readonly<{
    url: string;
    altText: string;
    attribution: PublicAttribution;
  }> | null;
}

export function projectPublicTitle(
  candidate: PublicCatalogCandidate,
  now: number,
  policy: RightsUsePolicy,
): PublicCatalogTitle | undefined {
  const title = normalizeTitleLifecycle(candidate.title);
  const metadata = normalizeTitleMetadata(candidate.metadata);
  const attribution = deriveAttribution(candidate.rights, now, policy);
  if (
    !title ||
    !metadata ||
    !attribution ||
    title.rightsRevision !== candidate.latestRightsRevision ||
    !isPublicTitle(title, candidate.rights, candidate.publication, now, policy) ||
    !artworkPublishable(metadata, title.id, now, policy)
  ) {
    return undefined;
  }
  let artwork: PublicCatalogTitle["artwork"] = null;
  if (metadata.artwork !== null) {
    const credit = deriveAttribution(metadata.artwork.rights, now, policy);
    if (!credit) {
      return undefined;
    }
    artwork = Object.freeze({
      url: metadata.artwork.url,
      altText: metadata.artwork.altText,
      attribution: credit,
    });
  }
  return Object.freeze({
    id: title.id,
    defaultLocale: metadata.defaultLocale,
    localizations: metadata.localizations,
    releaseYear: metadata.releaseYear,
    runtimeSeconds: metadata.runtimeSeconds,
    genres: metadata.genres,
    languages: metadata.languages,
    credits: metadata.credits,
    accessibility: metadata.accessibility,
    editorialLabels: metadata.editorialLabels,
    artwork,
    attribution,
  });
}
