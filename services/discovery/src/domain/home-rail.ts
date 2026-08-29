import { discoveryIdentifier, discoveryRecord } from "./title-projection.js";

const MAX_HOME_RAIL_TITLES = 12;
const MAX_HOME_GENRE_RAILS = 3;

export type HomeRailKind = "featured" | "recently_added" | "trending" | "genre";
export type HomeRailSource = HomeRailKind;

export interface HomeRailInput {
  readonly first: number;
}

export interface HomeRailRow {
  readonly titleId: string;
  readonly sourceVersion: number;
  readonly indexedAt: number;
  readonly visibleUntil: number;
  readonly publishedAt: number;
}

export interface HomeGenreRows {
  readonly genre: string;
  readonly available: number;
  readonly rows: readonly HomeRailRow[];
}

const integer = (value: unknown, minimum: number, maximum: number): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;

export function normalizeHomeRailInput(value: unknown): HomeRailInput | undefined {
  const input = discoveryRecord(value, ["first"]);
  return input && integer(input["first"], 1, MAX_HOME_RAIL_TITLES)
    ? Object.freeze({ first: input["first"] })
    : undefined;
}

function normalizeRow(value: unknown, now: number): HomeRailRow | undefined {
  const row = discoveryRecord(value, [
    "titleId",
    "sourceVersion",
    "indexedAt",
    "visibleUntil",
    "publishedAt",
  ]);
  if (
    !row ||
    !discoveryIdentifier(row["titleId"]) ||
    !integer(row["sourceVersion"], 1, 2_147_483_647) ||
    !integer(row["indexedAt"], 0, now) ||
    !integer(row["visibleUntil"], now + 1, 253_402_300_799) ||
    !integer(row["publishedAt"], 0, row["indexedAt"])
  ) {
    return undefined;
  }
  return Object.freeze({
    titleId: row["titleId"],
    sourceVersion: row["sourceVersion"],
    indexedAt: row["indexedAt"],
    visibleUntil: row["visibleUntil"],
    publishedAt: row["publishedAt"],
  });
}

function ordered(after: HomeRailRow, before: HomeRailRow): boolean {
  return (
    after.publishedAt < before.publishedAt ||
    (after.publishedAt === before.publishedAt && after.titleId > before.titleId)
  );
}

export function normalizeHomeRailRows(
  value: unknown,
  now: number,
  maximum: number,
): readonly HomeRailRow[] | undefined {
  if (
    !integer(now, 0, 253_402_300_799) ||
    !integer(maximum, 1, MAX_HOME_RAIL_TITLES) ||
    !Array.isArray(value) ||
    value.length > maximum
  ) {
    return undefined;
  }
  const rows: HomeRailRow[] = [];
  const titles = new Set<string>();
  for (const raw of value) {
    const row = normalizeRow(raw, now);
    const previous = rows.at(-1);
    if (!row || titles.has(row.titleId) || (previous !== undefined && !ordered(row, previous))) {
      return undefined;
    }
    titles.add(row.titleId);
    rows.push(row);
  }
  return Object.freeze(rows);
}

export function normalizeHomeGenreRows(
  value: unknown,
  now: number,
  maximum: number,
): readonly HomeGenreRows[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_HOME_GENRE_RAILS) {
    return undefined;
  }
  const groups: HomeGenreRows[] = [];
  const genres = new Set<string>();
  for (const raw of value) {
    const group = discoveryRecord(raw, ["genre", "available", "rows"]);
    const rows = group ? normalizeHomeRailRows(group["rows"], now, maximum) : undefined;
    if (
      !group ||
      typeof group["genre"] !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(group["genre"]) ||
      genres.has(group["genre"]) ||
      !integer(group["available"], rows?.length ?? 1, 1_000_000) ||
      !rows ||
      rows.length === 0
    ) {
      return undefined;
    }
    const previous = groups.at(-1);
    if (
      previous &&
      (group["available"] > previous.available ||
        (group["available"] === previous.available && group["genre"] < previous.genre))
    ) {
      return undefined;
    }
    genres.add(group["genre"]);
    groups.push(
      Object.freeze({
        genre: group["genre"],
        available: group["available"],
        rows,
      }),
    );
  }
  return Object.freeze(groups);
}
