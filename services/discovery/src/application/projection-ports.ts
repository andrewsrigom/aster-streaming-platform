import type { TitleProjection } from "../domain/title-projection.js";

export type ProjectionStoreResult<T> =
  | Readonly<{ status: "completed"; value: T }>
  | Readonly<{ status: "cancelled" | "unavailable" | "indeterminate" }>;

export interface ProjectionRepository {
  lockFence(titleId: string): Promise<TitleProjection | null>;
  targetGenerations(): Promise<readonly string[]>;
  saveFence(value: TitleProjection): Promise<void>;
  saveGeneration(generation: string, value: TitleProjection): Promise<void>;
}

export interface ProjectionUnitOfWork {
  run<T>(
    work: (repository: ProjectionRepository) => Promise<T>,
    signal: AbortSignal,
  ): Promise<ProjectionStoreResult<T>>;
}
