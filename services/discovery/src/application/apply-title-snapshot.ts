import { reconcileTitleProjection, type TitleProjection } from "../domain/title-projection.js";
import type { ProjectionStoreResult, ProjectionUnitOfWork } from "./projection-ports.js";

export type ProjectionApplyResult = ProjectionStoreResult<
  | Readonly<{
      status: "applied" | "refreshed" | "unchanged" | "stale";
      value: TitleProjection;
    }>
  | Readonly<{ status: "invalid_input" | "invalid_state" | "conflict" }>
>;

export function createTitleProjector(ports: Readonly<{ transactions: ProjectionUnitOfWork }>) {
  return Object.freeze({
    async apply(
      snapshot: unknown,
      context: Readonly<{
        now: number;
        event: Readonly<{ id: string; titleId: string; version: number }> | null;
      }>,
      signal: AbortSignal,
    ): Promise<ProjectionApplyResult> {
      if (signal.aborted) {
        return { status: "cancelled" };
      }
      return ports.transactions.run(async (repository) => {
        const titleDescriptor =
          snapshot && typeof snapshot === "object"
            ? Object.getOwnPropertyDescriptor(snapshot, "titleId")
            : undefined;
        const titleId: unknown =
          titleDescriptor && "value" in titleDescriptor
            ? (titleDescriptor.value as unknown)
            : undefined;
        if (typeof titleId !== "string") {
          return { status: "invalid_input" } as const;
        }
        const previous = await repository.lockFence(titleId);
        const transition = reconcileTitleProjection(previous, snapshot, context);
        if (!("value" in transition)) {
          return transition;
        }
        const targets = await repository.targetGenerations();
        if (targets.length < 1 || targets.length > 2) {
          return { status: "invalid_state" } as const;
        }
        if (transition.status === "applied" || transition.status === "refreshed") {
          await repository.saveFence(transition.value);
        }
        for (const generation of targets) {
          await repository.saveGeneration(generation, transition.value);
        }
        return transition;
      }, signal);
    },
  });
}
