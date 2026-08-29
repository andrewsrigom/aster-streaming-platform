const MAX_TIME = 253_402_300_799;
const MAX_VERSION = 2_147_483_647;
const MAX_LEASE_SECONDS = 300;

interface SearchMetadata {
  readonly defaultLocale: string;
  readonly localizations: readonly Readonly<{ locale: string; title: string; synopsis: string }>[];
  readonly genres: readonly string[];
  readonly editorialLabels: readonly string[];
  readonly releaseYear: number | null;
  readonly publishedAt: number;
}
interface CatalogSnapshot {
  readonly titleId: string;
  readonly sourceVersion: number;
  readonly observedAt: number;
  readonly visibleUntil: number | null;
  readonly document: SearchMetadata | null;
}
export interface TitleProjection extends CatalogSnapshot {
  readonly projectionVersion: 1;
  readonly indexedAt: number;
  readonly triggerEventId: string | null;
}
type Transition =
  | Readonly<{ status: "applied" | "refreshed" | "unchanged" | "stale"; value: TitleProjection }>
  | Readonly<{ status: "invalid_input" | "invalid_state" | "conflict" }>;

const identifier = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
export { identifier as discoveryIdentifier, record as discoveryRecord };
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;

function record(value: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value) as object | null)) {
    return undefined;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const names = Reflect.ownKeys(descriptors);
  if (
    names.length !== keys.length ||
    names.some((key) => typeof key !== "string" || !keys.includes(key))
  ) {
    return undefined;
  }
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor)) {
      return undefined;
    }
    copy[key] = descriptor.value as unknown;
  }
  return copy;
}

function list(value: unknown, maximum: number): readonly unknown[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const length: unknown = Object.getOwnPropertyDescriptor(value, "length")?.value;
  if (!integer(length, 0, maximum) || Reflect.ownKeys(value).length !== length + 1) {
    return undefined;
  }
  const copy: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor)) {
      return undefined;
    }
    copy.push(descriptor.value as unknown);
  }
  return copy;
}

function text(value: unknown, maximum: number): string | undefined {
  if (typeof value !== "string" || value.length > maximum * 2) {
    return undefined;
  }
  const normalized = value.normalize("NFC").trim();
  return normalized.length > 0 &&
    Array.from(normalized).length <= maximum &&
    !/[\p{Cc}\p{Cs}\u202a-\u202e\u2066-\u2069]/u.test(normalized)
    ? normalized
    : undefined;
}

function locale(value: unknown): string | undefined {
  const normalized = text(value, 35);
  return normalized ? Intl.getCanonicalLocales(normalized)[0] : undefined;
}

function slugs(value: unknown): readonly string[] | undefined {
  const values = list(value, 8);
  if (
    !values?.every(
      (item): item is string =>
        typeof item === "string" && item.length <= 48 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(item),
    ) ||
    new Set(values).size !== values.length
  ) {
    return undefined;
  }
  return Object.freeze([...values].sort());
}

function metadata(value: unknown, observedAt: number): SearchMetadata | undefined {
  const input = record(value, [
    "defaultLocale",
    "localizations",
    "genres",
    "editorialLabels",
    "releaseYear",
    "publishedAt",
  ]);
  if (!input) {
    return undefined;
  }
  const defaultLocale = locale(input["defaultLocale"]);
  const entries = list(input["localizations"], 4);
  const genres = slugs(input["genres"]);
  const editorialLabels = slugs(input["editorialLabels"]);
  const releaseYear = input["releaseYear"],
    publishedAt = input["publishedAt"];
  if (
    !defaultLocale ||
    !entries?.length ||
    !genres ||
    !editorialLabels ||
    !(releaseYear === null || integer(releaseYear, 1888, 9999)) ||
    !integer(publishedAt, 0, observedAt)
  ) {
    return undefined;
  }
  const localizations: { locale: string; title: string; synopsis: string }[] = [];
  for (const entry of entries) {
    const fields = record(entry, ["locale", "title", "synopsis"]);
    if (!fields) {
      return undefined;
    }
    const tag = locale(fields["locale"]),
      title = text(fields["title"], 160),
      synopsis = text(fields["synopsis"], 1024);
    if (!tag || !title || !synopsis) {
      return undefined;
    }
    localizations.push(Object.freeze({ locale: tag, title, synopsis }));
  }
  localizations.sort((a, b) => (a.locale < b.locale ? -1 : a.locale > b.locale ? 1 : 0));
  if (
    new Set(localizations.map((item) => item.locale)).size !== localizations.length ||
    !localizations.some((item) => item.locale === defaultLocale)
  ) {
    return undefined;
  }
  return Object.freeze({
    defaultLocale,
    localizations: Object.freeze(localizations),
    genres,
    editorialLabels,
    releaseYear,
    publishedAt,
  });
}

const snapshotKeys = ["titleId", "sourceVersion", "observedAt", "visibleUntil", "document"];
function snapshot(value: unknown): CatalogSnapshot | undefined {
  const input = record(value, snapshotKeys);
  if (
    !input ||
    !identifier(input["titleId"]) ||
    !integer(input["sourceVersion"], 1, MAX_VERSION) ||
    !integer(input["observedAt"], 0, MAX_TIME)
  ) {
    return undefined;
  }
  const observedAt = input["observedAt"];
  const visibleUntil = input["visibleUntil"];
  const document = input["document"] === null ? null : metadata(input["document"], observedAt);
  if (
    document === undefined ||
    (document === null
      ? visibleUntil !== null
      : !integer(visibleUntil, observedAt + 1, Math.min(MAX_TIME, observedAt + MAX_LEASE_SECONDS)))
  ) {
    return undefined;
  }
  return Object.freeze({
    titleId: input["titleId"],
    sourceVersion: input["sourceVersion"],
    observedAt,
    visibleUntil: visibleUntil as number | null,
    document,
  });
}

export function normalizeTitleProjection(value: unknown): TitleProjection | undefined {
  try {
    const input = record(value, [
      ...snapshotKeys,
      "projectionVersion",
      "indexedAt",
      "triggerEventId",
    ]);
    if (
      !input ||
      input["projectionVersion"] !== 1 ||
      !integer(input["indexedAt"], 0, MAX_TIME) ||
      !(input["triggerEventId"] === null || identifier(input["triggerEventId"]))
    ) {
      return undefined;
    }
    const source = snapshot(Object.fromEntries(snapshotKeys.map((key) => [key, input[key]])));
    if (
      !source ||
      input["indexedAt"] < source.observedAt ||
      input["indexedAt"] - source.observedAt > 2
    ) {
      return undefined;
    }
    return Object.freeze({
      ...source,
      projectionVersion: 1,
      indexedAt: input["indexedAt"],
      triggerEventId: input["triggerEventId"],
    });
  } catch {
    return undefined;
  }
}

export function reconcileTitleProjection(
  previous: unknown,
  incoming: unknown,
  context: Readonly<{
    now: number;
    event: Readonly<{ id: string; titleId: string; version: number }> | null;
  }>,
): Transition {
  try {
    if (!integer(context.now, 0, MAX_TIME)) {
      return { status: "invalid_input" };
    }
    const source = snapshot(incoming);
    if (
      !source ||
      source.observedAt > context.now ||
      context.now - source.observedAt > 2 ||
      (source.visibleUntil !== null && source.visibleUntil <= context.now)
    ) {
      return { status: "invalid_input" };
    }
    const event =
      context.event === null ? null : record(context.event, ["id", "titleId", "version"]);
    if (
      context.event !== null &&
      (!event ||
        !identifier(event["id"]) ||
        event["titleId"] !== source.titleId ||
        !integer(event["version"], 1, MAX_VERSION))
    ) {
      return { status: "invalid_input" };
    }
    if (event && (event["version"] as number) > source.sourceVersion) {
      return { status: "conflict" };
    }
    const current = previous === null ? null : normalizeTitleProjection(previous);
    if (
      previous !== null &&
      (!current || current.titleId !== source.titleId || current.indexedAt > context.now)
    ) {
      return { status: "invalid_state" };
    }
    if (current && source.sourceVersion < current.sourceVersion) {
      return { status: "stale", value: current };
    }
    if (current && source.sourceVersion === current.sourceVersion) {
      // Expiry may hide a same-version title; resurrection requires a new authoritative version.
      if (
        source.document !== null &&
        (current.document === null ||
          JSON.stringify(source.document) !== JSON.stringify(current.document))
      ) {
        return { status: "conflict" };
      }
      if (source.observedAt < current.observedAt) {
        return { status: "stale", value: current };
      }
      if (
        source.observedAt === current.observedAt &&
        source.document !== null &&
        source.visibleUntil !== current.visibleUntil
      ) {
        return { status: "conflict" };
      }
      if (
        source.observedAt === current.observedAt &&
        JSON.stringify(source.document) === JSON.stringify(current.document) &&
        source.visibleUntil === current.visibleUntil
      ) {
        return { status: "unchanged", value: current };
      }
    }
    const next: TitleProjection = Object.freeze({
      ...source,
      projectionVersion: 1,
      indexedAt: context.now,
      triggerEventId: event ? (event["id"] as string) : null,
    });
    return {
      status: current?.sourceVersion === source.sourceVersion ? "refreshed" : "applied",
      value: next,
    };
  } catch {
    return { status: "invalid_input" };
  }
}

export function isTitleProjectionVisible(value: unknown, now: number): boolean {
  const projection = normalizeTitleProjection(value);
  return (
    integer(now, 0, MAX_TIME) &&
    !!projection &&
    projection.indexedAt <= now &&
    projection.document !== null &&
    projection.visibleUntil !== null &&
    now < projection.visibleUntil
  );
}
