import type { CatalogPublicUnitOfWork } from "./public-ports.js";
import type { CatalogReadResult } from "./public-queries.js";
import {
  projectPlaybackPublication,
  type CurrentPlaybackPublication,
} from "../domain/playback-publication.js";
import type { RightsUsePolicy } from "../domain/rights.js";
import { catalogIdentifier, catalogTimestamp } from "../domain/values.js";
import { projectPublicTitle } from "../domain/public-title.js";

export type CatalogPlaybackQueries = ReturnType<typeof createCatalogPlaybackQueries>;

export function createCatalogPlaybackQueries(
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
    ): Promise<CatalogReadResult<readonly (CurrentPlaybackPublication | null)[]>> {
      const cancelled = (): boolean => signal.aborted;
      if (
        !Array.isArray(ids) ||
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
      const now = ports.now();
      if (!catalogTimestamp(now)) {
        return { status: "unavailable" };
      }
      if (!ids.length) {
        return { status: "completed", value: [] };
      }
      const unique = [...new Set(ids)];
      try {
        const result = await ports.transactions.run(async (repository) => {
          const candidates = await repository.findMany(unique, { now, policy: ports.policy });
          if (candidates.length > unique.length) {
            throw new Error("Playback publication batch exceeds its bound.");
          }
          const publications = new Map<string, CurrentPlaybackPublication>();
          const seen = new Set<string>();
          for (const candidate of candidates) {
            const title = projectPublicTitle(candidate, now, ports.policy);
            if (!title || !unique.includes(title.id) || seen.has(title.id)) {
              throw new Error("Invalid current playback publication.");
            }
            seen.add(title.id);
            if (title.editorialLabels.includes("ui-seed-v1")) {
              continue;
            }
            const publication = projectPlaybackPublication(candidate, now, ports.policy);
            if (
              !publication ||
              !unique.includes(publication.titleId) ||
              publications.has(publication.titleId)
            ) {
              throw new Error("Invalid current playback publication.");
            }
            publications.set(publication.titleId, publication);
          }
          return {
            status: "completed",
            value: Object.freeze(ids.map((id) => publications.get(id) ?? null)),
          };
        }, signal);
        if (cancelled()) {
          return { status: "cancelled" };
        }
        return result.status === "completed"
          ? { status: "completed", value: result.value }
          : { status: result.status === "cancelled" ? "cancelled" : "unavailable" };
      } catch {
        return { status: cancelled() ? "cancelled" : "unavailable" };
      }
    },
  });
}
