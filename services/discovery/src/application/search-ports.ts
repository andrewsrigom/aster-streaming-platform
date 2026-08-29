import type { SearchInput, SearchPosition } from "../domain/search-input.js";
import type { ProjectionStoreResult } from "./projection-ports.js";

export interface SearchRow extends SearchPosition {
  readonly sourceVersion: number;
  readonly indexedAt: number;
  readonly visibleUntil: number;
}

export interface SearchRepository {
  activeGeneration(): Promise<string>;
  find(input: SearchInput, now: number): Promise<readonly SearchRow[]>;
}

export interface SearchUnitOfWork {
  run<T>(
    work: (repository: SearchRepository) => Promise<T>,
    signal: AbortSignal,
  ): Promise<ProjectionStoreResult<T>>;
}
