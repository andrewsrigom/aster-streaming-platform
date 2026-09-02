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

export type HomeRailCode =
  "completed" | "empty" | "fallback" | "unavailable" | "cancelled" | "indeterminate";

export interface HomeRailMetricObservation {
  readonly kind: HomeRailKind;
  readonly outcome: HomeRailCode | "stale";
  readonly durationMs: number;
  readonly freshnessSeconds?: number;
}

export interface HomeRailEdge {
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
  readonly status: "completed" | "partial" | "stale";
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

function assembleHomeRail(
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

function railSelectionFailureCode(
  result: ProjectionStoreResult<unknown>,
): Exclude<HomeRailCode, "fallback"> {
  return result.status === "completed" ? "unavailable" : result.status;
}

function assembleFixedRailResult(
  result: ProjectionStoreResult<readonly HomeRailRow[]>,
  source: Exclude<HomeRailSource, "genre">,
  now: number,
  first: number,
): HomeRailResult {
  if (result.status !== "completed") {
    return Object.freeze({ code: railSelectionFailureCode(result), rail: null });
  }
  const rows = normalizeHomeRailRows(result.value, now, first);
  if (!rows) {
    return Object.freeze({ code: "unavailable", rail: null });
  }
  return Object.freeze({
    code: rows.length === 0 ? "empty" : "completed",
    rail: assembleHomeRail(source, source, rows),
  });
}

function assembleGenreRailResult(
  result: ProjectionStoreResult<unknown>,
  now: number,
  first: number,
): HomeGenreRailResult {
  if (result.status !== "completed") {
    return Object.freeze({
      code: railSelectionFailureCode(result),
      rails: Object.freeze([]),
    });
  }
  const groups = normalizeHomeGenreRows(result.value, now, first);
  if (!groups) {
    return Object.freeze({ code: "unavailable", rails: Object.freeze([]) });
  }
  return Object.freeze({
    code: groups.length === 0 ? "empty" : "completed",
    rails: Object.freeze(
      groups.map((group) => assembleHomeRail("genre", "genre", group.rows, group.genre)),
    ),
  });
}

function applyRecentRailFallback(
  primaryResult: HomeRailResult,
  recentlyAddedResult: HomeRailResult,
  fallbackKind: "featured" | "trending",
) {
  if (
    (primaryResult.code !== "empty" && primaryResult.code !== "unavailable") ||
    recentlyAddedResult.code !== "completed" ||
    !recentlyAddedResult.rail ||
    recentlyAddedResult.rail.edges.length === 0
  ) {
    return primaryResult;
  }
  return Object.freeze({
    code: "fallback" as const,
    rail: Object.freeze({
      ...recentlyAddedResult.rail,
      key: fallbackKind,
      kind: fallbackKind,
      source: "recently_added" as const,
    }),
  });
}

function emptyHomeRailsPage(state: HomeProjectionState, now: number): HomeRailsPage {
  const emptyFixedRail = (kind: "featured" | "recently_added" | "trending") =>
    Object.freeze({
      code: "empty" as const,
      rail: assembleHomeRail(kind, kind, Object.freeze([])),
    });
  return Object.freeze({
    status: "completed",
    generation: state.generation,
    generatedAt: now,
    featured: emptyFixedRail("featured"),
    recentlyAdded: emptyFixedRail("recently_added"),
    trending: emptyFixedRail("trending"),
    genres: Object.freeze({ code: "empty" as const, rails: Object.freeze([]) }),
  });
}

interface HomeRailPorts {
  readonly transactions: HomeRailUnitOfWork;
  readonly monotonicNow?: () => number;
  readonly observe?: (observation: HomeRailMetricObservation) => void;
}

function readMonotonicTime(clock: () => number): number {
  try {
    const value = clock();
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function elapsedMilliseconds(startedAt: number, clock: () => number): number {
  return Math.max(0, readMonotonicTime(clock) - startedAt);
}

function railFreshnessSeconds(
  result: HomeRailResult | HomeGenreRailResult,
  now: number,
): number | undefined {
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
  const observeRail = (
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
  const observeAllRails = (
    outcome: HomeRailMetricObservation["outcome"],
    durationMs: number,
  ): void => {
    for (const kind of ["featured", "recently_added", "trending", "genre"] as const) {
      observeRail(kind, outcome, durationMs);
    }
  };
  const selectRail = async <T>(
    work: (repository: HomeRailRepository) => Promise<T>,
    signal: AbortSignal,
  ): Promise<Readonly<{ result: ProjectionStoreResult<T>; durationMs: number }>> => {
    const startedAt = readMonotonicTime(clock);
    const result = await ports.transactions.run(work, signal);
    return Object.freeze({ result, durationMs: elapsedMilliseconds(startedAt, clock) });
  };

  return Object.freeze({
    async execute(input: unknown, now: number, signal: AbortSignal): Promise<HomeRailsResult> {
      const railRequest = normalizeHomeRailInput(input);
      if (!railRequest || !Number.isSafeInteger(now) || now < 0 || now > 253_402_300_799) {
        return { status: "completed", value: { status: "invalid_input" } };
      }
      if (signal.aborted) {
        return { status: "cancelled" };
      }

      const projectionStateStartedAt = readMonotonicTime(clock);
      const projectionState = await ports.transactions.run(
        (repository) => repository.state(now),
        signal,
      );
      const projectionStateDurationMs = elapsedMilliseconds(projectionStateStartedAt, clock);
      if (projectionState.status !== "completed") {
        observeAllRails(projectionState.status, projectionStateDurationMs);
        return projectionState;
      }
      if (projectionState.value.status === "stale") {
        observeAllRails("stale", projectionStateDurationMs);
        return { status: "completed", value: { status: "stale" } };
      }
      if (projectionState.value.status === "empty") {
        observeAllRails("empty", projectionStateDurationMs);
        return {
          status: "completed",
          value: {
            status: "completed",
            value: emptyHomeRailsPage(projectionState.value, now),
          },
        };
      }

      const generation = projectionState.value.generation;
      const featuredSelection = await selectRail<readonly HomeRailRow[]>(
        (repository) => repository.fixed(generation, "featured", railRequest.first, now),
        signal,
      );
      const recentlyAddedSelection = await selectRail<readonly HomeRailRow[]>(
        (repository) => repository.fixed(generation, "recently_added", railRequest.first, now),
        signal,
      );
      const trendingSelection = await selectRail<readonly HomeRailRow[]>(
        (repository) => repository.fixed(generation, "trending", railRequest.first, now),
        signal,
      );
      const genreSelection = await selectRail<unknown>(
        (repository) => repository.genres(generation, railRequest.first, now),
        signal,
      );

      const recentlyAddedResult = assembleFixedRailResult(
        recentlyAddedSelection.result,
        "recently_added",
        now,
        railRequest.first,
      );
      const featuredResult = applyRecentRailFallback(
        assembleFixedRailResult(featuredSelection.result, "featured", now, railRequest.first),
        recentlyAddedResult,
        "featured",
      );
      const trendingResult = applyRecentRailFallback(
        assembleFixedRailResult(trendingSelection.result, "trending", now, railRequest.first),
        recentlyAddedResult,
        "trending",
      );
      const genreResult = assembleGenreRailResult(genreSelection.result, now, railRequest.first);

      observeRail(
        "featured",
        featuredResult.code,
        featuredSelection.durationMs,
        railFreshnessSeconds(featuredResult, now),
      );
      observeRail(
        "recently_added",
        recentlyAddedResult.code,
        recentlyAddedSelection.durationMs,
        railFreshnessSeconds(recentlyAddedResult, now),
      );
      observeRail(
        "trending",
        trendingResult.code,
        trendingSelection.durationMs,
        railFreshnessSeconds(trendingResult, now),
      );
      observeRail(
        "genre",
        genreResult.code,
        genreSelection.durationMs,
        railFreshnessSeconds(genreResult, now),
      );

      const railResults = [
        featuredResult,
        recentlyAddedResult,
        trendingResult,
        genreResult,
      ] as const;
      const usableRailCount = railResults.filter((result) =>
        ["completed", "empty", "fallback"].includes(result.code),
      ).length;
      if (usableRailCount === 0) {
        const railOutcomes = railResults.map((result) => result.code);
        if (railOutcomes.every((outcome) => outcome === "cancelled")) {
          return { status: "cancelled" };
        }
        if (railOutcomes.some((outcome) => outcome === "indeterminate")) {
          return { status: "indeterminate" };
        }
        return { status: "unavailable" };
      }

      const pageStatus =
        usableRailCount === railResults.length &&
        railResults.every((result) => result.code !== "fallback")
          ? "completed"
          : "partial";
      const page: HomeRailsPage = Object.freeze({
        status: pageStatus,
        generation,
        generatedAt: now,
        featured: featuredResult,
        recentlyAdded: recentlyAddedResult,
        trending: trendingResult,
        genres: genreResult,
      });
      return { status: "completed", value: { status: "completed", value: page } };
    },
  });
}
