import { discoveryIdentifier, discoveryRecord } from "./title-projection.js";

export interface SearchPosition {
  readonly rank: number;
  readonly titleId: string;
}
export interface SearchInput {
  readonly query: string;
  readonly locale: string;
  readonly generation: string;
  readonly first: number;
  readonly after: SearchPosition | null;
}
const MAX_RANK = 1_000_000;
const MAX_CURSOR_BYTES = 1280;
const validRank = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_RANK;

// Apply identically to indexed metadata and queries, before PostgreSQL's explicit simple dictionary.
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function queryText(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    value.length > 160 ||
    Array.from(value).length > 80 ||
    /[\p{Cc}\p{Cs}\u202a-\u202e\u2066-\u2069]/u.test(value)
  ) {
    return undefined;
  }
  const normalized = normalizeSearchText(value);
  return normalized && Array.from(normalized).length <= 80 && normalized.split(" ").length <= 8
    ? normalized
    : undefined;
}

function localeTag(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= 35
    ? Intl.getCanonicalLocales(value)[0]
    : undefined;
}

export function searchCursor(
  input: Pick<SearchInput, "query" | "locale" | "generation">,
  position: SearchPosition,
): string {
  if (
    !discoveryIdentifier(input.generation) ||
    !discoveryIdentifier(position.titleId) ||
    !validRank(position.rank) ||
    queryText(input.query) !== input.query ||
    localeTag(input.locale) !== input.locale
  ) {
    throw new Error("Invalid search cursor position.");
  }
  return [
    "s1",
    input.generation,
    position.rank,
    position.titleId,
    encodeURIComponent(input.locale),
    encodeURIComponent(input.query),
  ].join(".");
}

export function normalizeSearchInput(
  value: unknown,
  generation: string,
):
  | Readonly<{ status: "completed"; value: SearchInput }>
  | Readonly<{ status: "invalid_input" | "invalid_state" | "cursor_expired" }> {
  try {
    if (!discoveryIdentifier(generation)) {
      return { status: "invalid_state" };
    }
    const data = discoveryRecord(value, ["query", "locale", "first", "after"]);
    if (!data) {
      return { status: "invalid_input" };
    }
    const query = queryText(data["query"]),
      locale = localeTag(data["locale"]);
    const first = data["first"],
      cursor = data["after"];
    if (
      !query ||
      !locale ||
      typeof first !== "number" ||
      !Number.isInteger(first) ||
      first < 1 ||
      first > 20
    ) {
      return { status: "invalid_input" };
    }
    let after: SearchPosition | null = null;
    if (cursor !== null) {
      if (typeof cursor !== "string" || cursor.length > MAX_CURSOR_BYTES) {
        return { status: "invalid_input" };
      }
      const [version, cursorGeneration, score, titleId, cursorLocale, cursorQuery, extra] =
        cursor.split(".");
      const rank = Number(score);
      if (
        version !== "s1" ||
        !discoveryIdentifier(cursorGeneration) ||
        !discoveryIdentifier(titleId) ||
        !validRank(rank) ||
        String(rank) !== score ||
        extra !== undefined ||
        cursorLocale !== encodeURIComponent(locale) ||
        cursorQuery !== encodeURIComponent(query)
      ) {
        return { status: "invalid_input" };
      }
      if (cursorGeneration !== generation) {
        return { status: "cursor_expired" };
      }
      after = Object.freeze({ rank, titleId });
    }
    return {
      status: "completed",
      value: Object.freeze({ query, locale, first, after, generation }),
    };
  } catch {
    return { status: "invalid_input" };
  }
}

export function followsSearchCursor(value: SearchPosition, after: SearchPosition): boolean {
  return value.rank < after.rank || (value.rank === after.rank && value.titleId > after.titleId);
}
