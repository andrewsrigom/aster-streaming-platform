import {
  normalizeHomeGenreRows,
  normalizeHomeRailInput,
  normalizeHomeRailRows,
  type HomeRailKind,
  type HomeRailRow,
  type HomeRailSource,
} from "../domain/home-rail.js";
import type { ProjectionStoreResult } from "./projection-ports.js";
import type { HomeProjectionState, HomeRailRepository, HomeRailUnitOfWork } from "./rail-ports.js";

type HomeRailCode =
  "completed" | "empty" | "fallback" | "unavailable" | "cancelled" | "indeterminate";

export interface HomeRailMetricObservation {
  readonly kind: HomeRailKind;
  readonly outcome: HomeRailCode | "stale";
  readonly durationMs: number;
  readonly freshnessSeconds?: number;
}

interface HomeRailEdge {
  readonly titleId: string;
  readonly sourceVersion: number;
  readonly indexedAt: number;
  readonly visibleUntil: number;
}

export interface HomeRail {
  readonly key: string;
  readonly kind: HomeRailKind;
  readonly genre: string | null;
  readonly source: HomeRailSource;
  readonly oldestIndexedAt: number | null;
  readonly freshUntil: number | null;
  readonly edges: readonly HomeRailEdge[];
}

export interface HomeRailResult {
  readonly code: HomeRailCode;
  readonly rail: HomeRail | null;
}

export interface HomeGenreRailResult {
  readonly code: Exclude<HomeRailCode, "fallback">;
  readonly rails: readonly HomeRail[];
}

export interface HomeRailsPage {
  readonly status: "completed" | "partial";
  readonly generation: string;
  readonly generatedAt: number;
  readonly featured: HomeRailResult;
  readonly recentlyAdded: HomeRailResult;
  readonly trending: HomeRailResult;
  readonly genres: HomeGenreRailResult;
}

export type HomeRailsResult = ProjectionStoreResult<
  | Readonly<{ status: "completed"; value: HomeRailsPage }>
  | Readonly<{ status: "invalid_input" | "stale" }>
>;

function rail(
  kind: HomeRailKind,
  source: HomeRailSource,
  rows: readonly HomeRailRow[],
  genre: string | null = null,
): HomeRail {
  const edges = Object.freeze(
    rows.map((row) =>
      Object.freeze({
        titleId: row.titleId,
        sourceVersion: row.sourceVersion,
        indexedAt: row.indexedAt,
        visibleUntil: row.visibleUntil,
      }),
    ),
  );
  return Object.freeze({
    key: genre === null ? kind.replaceAll("_", "-") : `genre:${genre}`,
    kind,
    genre,
    source,
    oldestIndexedAt: rows.length === 0 ? null : Math.min(...rows.map((row) => row.indexedAt)),
    freshUntil: rows.length === 0 ? null : Math.min(...rows.map((row) => row.visibleUntil)),
    edges,
  });
}

function code(result: ProjectionStoreResult<unknown>): Exclude<HomeRailCode, "fallback"> {
  return result.status === "completed" ? "unavailable" : result.status;
}

function fixedResult(
  result: ProjectionStoreResult<readonly HomeRailRow[]>,
  source: Exclude<HomeRailSource, "genre">,
  now: number,
  first: number,
): HomeRailResult {
  if (result.status !== "completed") {
    return Object.freeze({ code: code(result), rail: null });
  }
  const rows = normalizeHomeRailRows(result.value, now, first);
  if (!rows) {
    return Object.freeze({ code: "unavailable", rail: null });
  }
  return Object.freeze({
    code: rows.length === 0 ? "empty" : "completed",
    rail: rail(source, source, rows),
  });
}

function genreResult(
  result: ProjectionStoreResult<unknown>,
  now: number,
  first: number,
): HomeGenreRailResult {
  if (result.status !== "completed") {
    return Object.freeze({ code: code(result), rails: Object.freeze([]) });
  }
  const groups = normalizeHomeGenreRows(result.value, now, first);
  if (!groups) {
    return Object.freeze({ code: "unavailable", rails: Object.freeze([]) });
  }
  return Object.freeze({
    code: groups.length === 0 ? "empty" : "completed",
    rails: Object.freeze(groups.map((group) => rail("genre", "genre", group.rows, group.genre))),
  });
}

function fallback(primary: HomeRailResult, recent: HomeRailResult, kind: "featured" | "trending") {
  if (
    primary.code === "completed" ||
    primary.code === "fallback" ||
    recent.code !== "completed" ||
    !recent.rail ||
    recent.rail.edges.length === 0
  ) {
    return primary;
  }
  return Object.freeze({
    code: "fallback" as const,
    rail: Object.freeze({ ...recent.rail, key: kind, kind, source: "recently_added" as const }),
  });
}

function emptyPage(state: HomeProjectionState, now: number): HomeRailsPage {
  const empty = (kind: "featured" | "recently_added" | "trending") =>
    Object.freeze({ code: "empty" as const, rail: rail(kind, kind, Object.freeze([])) });
  return Object.freeze({
    status: "completed",
    generation: state.generation,
    generatedAt: now,
    featured: empty("featured"),
    recentlyAdded: empty("recently_added"),
    trending: empty("trending"),
    genres: Object.freeze({ code: "empty" as const, rails: Object.freeze([]) }),
  });
}

interface HomeRailPorts {
  readonly transactions: HomeRailUnitOfWork;
  readonly monotonicNow?: () => number;
  readonly observe?: (observation: HomeRailMetricObservation) => void;
}

function safeTime(clock: () => number): number {
  try {
    const value = clock();
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function elapsed(startedAt: number, clock: () => number): number {
  return Math.max(0, safeTime(clock) - startedAt);
}

function freshness(result: HomeRailResult | HomeGenreRailResult, now: number): number | undefined {
  const timestamps =
    "rail" in result
      ? result.rail?.oldestIndexedAt === null || result.rail?.oldestIndexedAt === undefined
        ? []
        : [result.rail.oldestIndexedAt]
      : result.rails.flatMap((value) =>
          value.oldestIndexedAt === null ? [] : [value.oldestIndexedAt],
        );
  if (timestamps.length === 0) {
    return undefined;
  }
  const age = now - Math.min(...timestamps);
  return Number.isFinite(age) && age >= 0 && age <= 300 ? age : undefined;
}

export function createHomeRails(ports: Readonly<HomeRailPorts>) {
  const clock = ports.monotonicNow ?? (() => 0);
  const observe = (
    kind: HomeRailKind,
    outcome: HomeRailMetricObservation["outcome"],
    durationMs: number,
    freshnessSeconds?: number,
  ): void => {
    try {
      ports.observe?.(
        Object.freeze({
          kind,
          outcome,
          durationMs,
          ...(freshnessSeconds === undefined ? {} : { freshnessSeconds }),
        }),
      );
    } catch {
      // Telemetry is non-authoritative and cannot change a home response.
    }
  };
  const observeAll = (outcome: HomeRailMetricObservation["outcome"], durationMs: number): void => {
    for (const kind of ["featured", "recently_added", "trending", "genre"] as const) {
      observe(kind, outcome, durationMs);
    }
  };
  const select = async <T>(
    work: (repository: HomeRailRepository) => Promise<T>,
    signal: AbortSignal,
  ): Promise<Readonly<{ result: ProjectionStoreResult<T>; durationMs: number }>> => {
    const startedAt = safeTime(clock);
    const result = await ports.transactions.run(work, signal);
    return Object.freeze({ result, durationMs: elapsed(startedAt, clock) });
  };

  return Object.freeze({
    async execute(input: unknown, now: number, signal: AbortSignal): Promise<HomeRailsResult> {
      const request = normalizeHomeRailInput(input);
      if (!request || !Number.isSafeInteger(now) || now < 0 || now > 253_402_300_799) {
        return { status: "completed", value: { status: "invalid_input" } };
      }
      if (signal.aborted) {
        return { status: "cancelled" };
      }
      const stateStartedAt = safeTime(clock);
      const state = await ports.transactions.run((repository) => repository.state(now), signal);
      const stateDurationMs = elapsed(stateStartedAt, clock);
      if (state.status !== "completed") {
        observeAll(state.status, stateDurationMs);
        return state;
      }
      if (state.value.status === "stale") {
        observeAll("stale", stateDurationMs);
        return { status: "completed", value: { status: "stale" } };
      }
      if (state.value.status === "empty") {
        observeAll("empty", stateDurationMs);
        return {
          status: "completed",
          value: { status: "completed", value: emptyPage(state.value, now) },
        };
      }
      const generation = state.value.generation;
      const selections = await Promise.all([
        select<readonly HomeRailRow[]>(
          (repository) => repository.fixed(generation, "featured", request.first, now),
          signal,
        ),
        select<readonly HomeRailRow[]>(
          (repository) => repository.fixed(generation, "recently_added", request.first, now),
          signal,
        ),
        select<readonly HomeRailRow[]>(
          (repository) => repository.fixed(generation, "trending", request.first, now),
          signal,
        ),
        select<unknown>((repository) => repository.genres(generation, request.first, now), signal),
      ] as const);
      const recent = fixedResult(selections[1].result, "recently_added", now, request.first);
      const featured = fallback(
        fixedResult(selections[0].result, "featured", now, request.first),
        recent,
        "featured",
      );
      const trending = fallback(
        fixedResult(selections[2].result, "trending", now, request.first),
        recent,
        "trending",
      );
      const genres = genreResult(selections[3].result, now, request.first);
      const results = [featured, recent, trending, genres] as const;
      observe("featured", featured.code, selections[0].durationMs, freshness(featured, now));
      observe("recently_added", recent.code, selections[1].durationMs, freshness(recent, now));
      observe("trending", trending.code, selections[2].durationMs, freshness(trending, now));
      observe("genre", genres.code, selections[3].durationMs, freshness(genres, now));
      const usable = results.filter((result) =>
        ["completed", "empty", "fallback"].includes(result.code),
      ).length;
      if (usable === 0) {
        const statuses = results.map((result) => result.code);
        return {
          status: statuses.every((value) => value === "cancelled")
            ? "cancelled"
            : statuses.some((value) => value === "indeterminate")
              ? "indeterminate"
              : "unavailable",
        };
      }
      const page: HomeRailsPage = Object.freeze({
        status:
          usable === results.length && results.every((result) => result.code !== "fallback")
            ? "completed"
            : "partial",
        generation,
        generatedAt: now,
        featured,
        recentlyAdded: recent,
        trending,
        genres,
      });
      return { status: "completed", value: { status: "completed", value: page } };
    },
  });
}
