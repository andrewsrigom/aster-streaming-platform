import type { HomeGenreRows, HomeRailRow, HomeRailSource } from "../domain/home-rail.js";
import type { ProjectionStoreResult } from "./projection-ports.js";

export interface HomeProjectionState {
  readonly generation: string;
  readonly status: "fresh" | "empty" | "stale";
}

export interface HomeRailRepository {
  state(now: number): Promise<HomeProjectionState>;
  fixed(
    generation: string,
    source: Exclude<HomeRailSource, "genre">,
    first: number,
    now: number,
  ): Promise<readonly HomeRailRow[]>;
  genres(generation: string, first: number, now: number): Promise<readonly HomeGenreRows[]>;
}

export interface HomeRailUnitOfWork {
  run<T>(
    work: (repository: HomeRailRepository) => Promise<T>,
    signal: AbortSignal,
  ): Promise<ProjectionStoreResult<T>>;
}
