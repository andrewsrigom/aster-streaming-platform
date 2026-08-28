import type { CatalogPublicUnitOfWork } from "./public-ports.js";
import type { CatalogReadResult } from "./public-queries.js";
import type { RightsUsePolicy } from "../domain/rights.js";
import { catalogIdentifier, catalogTimestamp } from "../domain/values.js";
import { projectPublicTitle } from "../domain/public-title.js";

interface CatalogVisibility {
  readonly checkedAt: number;
  readonly expiresAt: number;
  readonly titles: readonly Readonly<{ titleId: string; visible: boolean }>[];
}

export function createCatalogEngagementQueries(
  ports: Readonly<{
    transactions: CatalogPublicUnitOfWork;
    policy: RightsUsePolicy;
    now: () => number;
  }>,
) {
  return Object.freeze({
    async byIds(
      ids: readonly unknown[],
      signal: AbortSignal,
    ): Promise<CatalogReadResult<CatalogVisibility>> {
      const cancelled = () => signal.aborted;
      if (
        !Array.isArray(ids) ||
        ids.length < 1 ||
        ids.length > 20 ||
        Array.from({ length: ids.length }, (_, index) =>
          Object.getOwnPropertyDescriptor(ids, String(index)),
        ).some((entry) => !entry || !("value" in entry) || !catalogIdentifier(entry.value)) ||
        !ids.every(catalogIdentifier)
      ) {
        return { status: "invalid_input" };
      }
      if (cancelled()) {
        return { status: "cancelled" };
      }
      const checkedAt = ports.now();
      const expiresAt = checkedAt + 2;
      if (!catalogTimestamp(checkedAt) || !catalogTimestamp(expiresAt)) {
        return { status: "unavailable" };
      }
      const unique = [...new Set(ids)];
      try {
        const result = await ports.transactions.run(async (repository) => {
          const candidates = await repository.findMany(unique, {
            now: checkedAt,
            policy: ports.policy,
          });
          if (candidates.length > unique.length) {
            throw new Error("Catalog visibility batch exceeds its bound.");
          }
          const titles = new Map<string, boolean>();
          for (const candidate of candidates) {
            const title = projectPublicTitle(candidate, checkedAt, ports.policy);
            if (!title || !unique.includes(title.id) || titles.has(title.id)) {
              throw new Error("Invalid current Catalog visibility.");
            }
            // A conservative validity window prevents expiry between lookup and page disclosure.
            titles.set(
              title.id,
              projectPublicTitle(candidate, expiresAt, ports.policy) !== undefined,
            );
          }
          return {
            status: "completed",
            value: Object.freeze({
              checkedAt,
              expiresAt,
              titles: Object.freeze(
                ids.map((titleId) =>
                  Object.freeze({ titleId, visible: titles.get(titleId) ?? false }),
                ),
              ),
            }),
          };
        }, signal);
        if (cancelled()) {
          return { status: "cancelled" };
        }
        const finishedAt = ports.now();
        if (!catalogTimestamp(finishedAt) || finishedAt < checkedAt || finishedAt >= expiresAt) {
          return { status: "unavailable" };
        }
        return result.status === "completed"
          ? result
          : { status: result.status === "cancelled" ? "cancelled" : "unavailable" };
      } catch {
        return { status: cancelled() ? "cancelled" : "unavailable" };
      }
    },
  });
}
export type CatalogEngagementQueries = ReturnType<typeof createCatalogEngagementQueries>;
