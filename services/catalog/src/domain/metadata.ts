import {
  normalizeRightsRecord,
  currentApprovedRights,
  type RightsRecord,
  type RightsUsePolicy,
} from "./rights.js";
import { catalogMediaUrl, catalogRecord, catalogText } from "./values.js";

export interface TitleLocalization {
  readonly locale: string;
  readonly title: string;
  readonly synopsis: string;
}
export interface TitleMetadata {
  readonly defaultLocale: string;
  readonly localizations: readonly TitleLocalization[];
  readonly releaseYear: number | null;
  readonly runtimeSeconds: number | null;
  readonly languages: readonly string[];
  readonly accessibility: readonly ("CAPTIONS" | "AUDIO_DESCRIPTION" | "TRANSCRIPT")[];
  readonly editorialLabels: readonly string[];
  readonly genres: readonly string[];
  readonly credits: readonly Readonly<{ name: string; role: string }>[];
  readonly artwork: Readonly<{ url: string; altText: string; rights: RightsRecord }> | null;
}
function list(value: unknown, maximum: number): readonly unknown[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const size: unknown = Object.getOwnPropertyDescriptor(value, "length")?.value;
  if (
    typeof size !== "number" ||
    size > maximum ||
    Reflect.ownKeys(descriptors).length !== size + 1
  ) {
    return undefined;
  }
  const result: unknown[] = [];
  for (let index = 0; index < size; index++) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor)) {
      return undefined;
    }
    result.push(descriptor.value as unknown);
  }
  return result;
}
export function normalizeCatalogLocale(value: unknown): string | undefined {
  if (!catalogText(value, 35)) {
    return undefined;
  }
  try {
    return Intl.getCanonicalLocales(value)[0];
  } catch {
    return undefined;
  }
}
const legacyFields = ["defaultLocale", "localizations", "genres", "credits", "artwork"];
export function metadataInput(value: unknown): Record<string, unknown> | undefined {
  const current = catalogRecord(value, [
    ...legacyFields,
    "releaseYear",
    "runtimeSeconds",
    "languages",
    "accessibility",
    "editorialLabels",
  ]);
  if (current) {
    return current;
  }
  const legacy = catalogRecord(value, legacyFields);
  // Immutable pre-extension audit snapshots stay readable; unknown facts remain explicit.
  return legacy
    ? {
        ...legacy,
        releaseYear: null,
        runtimeSeconds: null,
        languages: [],
        accessibility: [],
        editorialLabels: [],
      }
    : undefined;
}
function slugs(value: unknown): readonly string[] | undefined {
  const items = list(value, 8);
  return items?.every(
    (item): item is string => catalogText(item, 48) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(item),
  ) && new Set(items).size === items.length
    ? Object.freeze([...items].sort())
    : undefined;
}
export function normalizeTitleMetadata(value: unknown): TitleMetadata | undefined {
  try {
    const input = metadataInput(value);
    if (!input) {
      return undefined;
    }
    const defaultLocale = normalizeCatalogLocale(input["defaultLocale"]);
    const entries = list(input["localizations"], 4);
    const genres = slugs(input["genres"]);
    const editorialLabels = slugs(input["editorialLabels"]);
    const releaseYear = input["releaseYear"];
    const runtimeSeconds = input["runtimeSeconds"];
    const languages = list(input["languages"], 8)?.map(normalizeCatalogLocale);
    const accessibility = list(input["accessibility"], 3);
    const credits = list(input["credits"], 16);
    if (
      !defaultLocale ||
      !entries?.length ||
      !genres ||
      !credits ||
      !editorialLabels ||
      (releaseYear !== null &&
        (typeof releaseYear !== "number" ||
          !Number.isInteger(releaseYear) ||
          releaseYear < 1888 ||
          releaseYear > 9999)) ||
      (runtimeSeconds !== null &&
        (typeof runtimeSeconds !== "number" ||
          !Number.isInteger(runtimeSeconds) ||
          runtimeSeconds < 1 ||
          runtimeSeconds > 86400)) ||
      !languages?.every((item): item is string => item !== undefined) ||
      new Set(languages).size !== languages.length ||
      !accessibility?.every(
        (item): item is TitleMetadata["accessibility"][number] =>
          item === "CAPTIONS" || item === "AUDIO_DESCRIPTION" || item === "TRANSCRIPT",
      ) ||
      new Set(accessibility).size !== accessibility.length
    ) {
      return undefined;
    }
    const localizations: TitleLocalization[] = [];
    for (const entry of entries) {
      const item = catalogRecord(entry, ["locale", "title", "synopsis"]);
      const tag = item ? normalizeCatalogLocale(item["locale"]) : undefined;
      if (
        !item ||
        !tag ||
        !catalogText(item["title"], 160) ||
        !catalogText(item["synopsis"], 1024)
      ) {
        return undefined;
      }
      localizations.push(
        Object.freeze({ locale: tag, title: item["title"], synopsis: item["synopsis"] }),
      );
    }
    localizations.sort((a, b) => (a.locale < b.locale ? -1 : a.locale > b.locale ? 1 : 0));
    if (
      new Set(localizations.map((entry) => entry.locale)).size !== localizations.length ||
      !localizations.some((entry) => entry.locale === defaultLocale)
    ) {
      return undefined;
    }
    const normalizedCredits: { name: string; role: string }[] = [];
    for (const entry of credits) {
      const item = catalogRecord(entry, ["name", "role"]);
      if (!item || !catalogText(item["name"], 128) || !catalogText(item["role"], 64)) {
        return undefined;
      }
      normalizedCredits.push(Object.freeze({ name: item["name"], role: item["role"] }));
    }
    let artwork: TitleMetadata["artwork"] = null;
    if (input["artwork"] !== null) {
      const item = catalogRecord(input["artwork"], ["url", "altText", "rights"]);
      const rights = item ? normalizeRightsRecord(item["rights"]) : undefined;
      if (
        !item ||
        !rights ||
        !catalogMediaUrl(item["url"], "artwork") ||
        !catalogText(item["altText"], 256)
      ) {
        return undefined;
      }
      artwork = Object.freeze({ url: item["url"], altText: item["altText"], rights });
    }
    return Object.freeze({
      defaultLocale,
      localizations: Object.freeze(localizations),
      releaseYear,
      runtimeSeconds,
      languages: Object.freeze([...languages].sort()),
      accessibility: Object.freeze([...accessibility].sort()),
      editorialLabels,
      genres: Object.freeze([...genres].sort()),
      credits: Object.freeze(normalizedCredits),
      artwork,
    });
  } catch {
    return undefined;
  }
}
export function localizeTitle(
  metadata: Pick<TitleMetadata, "defaultLocale" | "localizations">,
  requested: string,
): TitleLocalization {
  const canonical = normalizeCatalogLocale(requested);
  const language = canonical?.split("-")[0];
  const fallback = metadata.localizations.find((entry) => entry.locale === metadata.defaultLocale);
  const localized =
    metadata.localizations.find((entry) => entry.locale === canonical) ??
    (language
      ? metadata.localizations.find((entry) => entry.locale.split("-")[0] === language)
      : undefined) ??
    fallback;
  if (!localized) {
    throw new Error("Invalid Catalog locale fallback.");
  }
  return localized;
}
export function artworkPublishable(
  metadata: TitleMetadata,
  titleId: string,
  now: number,
  policy: RightsUsePolicy,
): boolean {
  if (metadata.artwork === null) {
    return true;
  }
  const rights = currentApprovedRights(metadata.artwork.rights, now, policy);
  return (
    rights !== undefined &&
    rights.titleId === titleId &&
    rights.assetSourceUrl === metadata.artwork.url
  );
}
