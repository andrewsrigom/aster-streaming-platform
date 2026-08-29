import { normalizeSearchInput, searchCursor } from "../domain/search-input.js";
import type { ProjectionStoreResult } from "./projection-ports.js";
import type { SearchUnitOfWork } from "./search-ports.js";

interface SearchEdge {
  readonly cursor: string;
  readonly titleId: string;
  readonly sourceVersion: number;
  readonly indexedAt: number;
  readonly visibleUntil: number;
}

export interface SearchPage {
  readonly generation: string;
  readonly edges: readonly SearchEdge[];
  readonly endCursor: string | null;
  readonly hasNextPage: boolean;
}

type SearchResult = ProjectionStoreResult<
  | Readonly<{ status: "completed"; value: SearchPage }>
  | Readonly<{ status: "invalid_input" | "invalid_state" | "cursor_expired" | "stale" }>
>;

export interface SearchQualitySample {
  readonly resultCount: number;
  readonly topRank: number | null;
}

interface TitleSearchPorts {
  readonly transactions: SearchUnitOfWork;
  readonly observeSample?: (sample: SearchQualitySample) => void;
}

export function createTitleSearch(ports: Readonly<TitleSearchPorts>) {
  return Object.freeze({
    async execute(
      input: unknown,
      now: number,
      signal: AbortSignal,
      sampled = false,
    ): Promise<SearchResult> {
      if (signal.aborted) {
        return { status: "cancelled" };
      }
      if (!Number.isSafeInteger(now) || now < 0 || now > 253_402_300_799) {
        return { status: "completed", value: { status: "invalid_input" } };
      }
      return ports.transactions.run(async (repository) => {
        const generation = await repository.activeGeneration();
        const normalized = normalizeSearchInput(input, generation);
        if (normalized.status !== "completed") {
          return normalized;
        }
        if (await repository.projectionStale(generation, now)) {
          return { status: "stale" } as const;
        }
        const rows = await repository.find(normalized.value, now);
        if (rows.length > normalized.value.first + 1) {
          return { status: "invalid_state" } as const;
        }
        const selected = rows.slice(0, normalized.value.first);
        if (sampled) {
          try {
            ports.observeSample?.(
              Object.freeze({
                resultCount: selected.length,
                topRank: selected[0]?.rank ?? null,
              }),
            );
          } catch {
            // Telemetry is non-authoritative and cannot change search results.
          }
        }
        const edges = selected.map((row) =>
          Object.freeze({
            cursor: searchCursor(normalized.value, row),
            titleId: row.titleId,
            sourceVersion: row.sourceVersion,
            indexedAt: row.indexedAt,
            visibleUntil: row.visibleUntil,
          }),
        );
        return {
          status: "completed",
          value: Object.freeze({
            generation,
            edges: Object.freeze(edges),
            endCursor: edges.at(-1)?.cursor ?? null,
            hasNextPage: rows.length > normalized.value.first,
          }),
        } as const;
      }, signal);
    },
  });
}
