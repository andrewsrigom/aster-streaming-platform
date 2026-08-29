import { projectDiscoverySnapshot, type DiscoverySnapshot } from "../domain/discovery-snapshot.js";
import type { RightsUsePolicy } from "../domain/rights.js";
import { catalogIdentifier, catalogTimestamp } from "../domain/values.js";
import type { CatalogDiscoveryRepository, CatalogDiscoveryUnitOfWork } from "./discovery-ports.js";
import type { CatalogReadResult } from "./public-queries.js";
import type { CatalogStoreResult } from "./rights-ports.js";

interface DiscoveryPage {
  readonly snapshots: readonly DiscoverySnapshot[];
  readonly endCursor: string | null;
  readonly hasNextPage: boolean;
}
function titleIds(value: unknown): readonly string[] | undefined {
  try {
    if (
      !Array.isArray(value) ||
      value.length < 1 ||
      value.length > 2 ||
      Reflect.ownKeys(value).length !== value.length + 1
    ) {
      return undefined;
    }
    const ids: string[] = [];
    for (let index = 0; index < value.length; index++) {
      const entry = Object.getOwnPropertyDescriptor(value, String(index));
      if (!entry || !("value" in entry) || !catalogIdentifier(entry.value)) {
        return undefined;
      }
      ids.push(entry.value);
    }
    return Object.freeze(ids);
  } catch {
    return undefined;
  }
}
export function createCatalogDiscoveryQueries(ports: {
  transactions: CatalogDiscoveryUnitOfWork;
  policy: RightsUsePolicy;
  now: () => number;
}) {
  let active = false;
  async function read<T>(
    signal: AbortSignal,
    work: (
      repository: CatalogDiscoveryRepository,
      checkedAt: number,
    ) => Promise<CatalogStoreResult<T>>,
  ): Promise<CatalogReadResult<T>> {
    const cancelled = () => signal.aborted;
    if (cancelled()) {
      return { status: "cancelled" };
    }
    if (active) {
      return { status: "unavailable" };
    }
    active = true;
    try {
      const checkedAt = ports.now();
      if (!catalogTimestamp(checkedAt) || !catalogTimestamp(checkedAt + 300)) {
        return { status: "unavailable" };
      }
      const result = await ports.transactions.run(
        (repository) => work(repository, checkedAt),
        signal,
      );
      if (cancelled()) {
        return { status: "cancelled" };
      }
      const finishedAt = ports.now();
      if (!catalogTimestamp(finishedAt) || finishedAt < checkedAt || finishedAt - checkedAt >= 2) {
        return { status: "unavailable" };
      }
      return result.status === "completed"
        ? result
        : { status: result.status === "cancelled" ? "cancelled" : "unavailable" };
    } catch {
      return { status: cancelled() ? "cancelled" : "unavailable" };
    } finally {
      active = false;
    }
  }
  return Object.freeze({
    byIds(
      input: unknown,
      signal: AbortSignal,
    ): Promise<CatalogReadResult<readonly (DiscoverySnapshot | null)[]>> {
      const ids = titleIds(input);
      if (!ids) {
        return Promise.resolve({ status: "invalid_input" });
      }
      return read(signal, async (repository, checkedAt) => {
        const unique = [...new Set(ids)];
        const rows = await repository.findMany(unique);
        if (!Array.isArray(rows) || rows.length > unique.length) {
          throw new Error("Discovery snapshot batch exceeds its bound.");
        }
        const found = new Map<string, DiscoverySnapshot>();
        for (const row of rows) {
          const snapshot = projectDiscoverySnapshot(row, checkedAt, ports.policy);
          if (!unique.includes(snapshot.titleId) || found.has(snapshot.titleId)) {
            throw new Error("Discovery source returned an unrelated or duplicate title.");
          }
          found.set(snapshot.titleId, snapshot);
        }
        return {
          status: "completed",
          value: Object.freeze(ids.map((id) => found.get(id) ?? null)),
        };
      });
    },
    exportPage(afterId: unknown, signal: AbortSignal): Promise<CatalogReadResult<DiscoveryPage>> {
      if (afterId !== null && !catalogIdentifier(afterId)) {
        return Promise.resolve({ status: "invalid_input" });
      }
      return read(signal, async (repository, checkedAt) => {
        const rows = await repository.scan(afterId, 3);
        if (!Array.isArray(rows) || rows.length > 3) {
          throw new Error("Discovery export exceeds its bound.");
        }
        const snapshots: DiscoverySnapshot[] = [];
        let previous = afterId;
        for (const row of rows) {
          const snapshot = projectDiscoverySnapshot(row, checkedAt, ports.policy);
          if (previous !== null && snapshot.titleId <= previous) {
            throw new Error("Discovery export is not strictly ordered.");
          }
          previous = snapshot.titleId;
          if (snapshots.length < 2) {
            snapshots.push(snapshot);
          }
        }
        return {
          status: "completed",
          value: Object.freeze({
            snapshots: Object.freeze(snapshots),
            endCursor: snapshots.at(-1)?.titleId ?? null,
            hasNextPage: rows.length > 2,
          }),
        };
      });
    },
  });
}
export type CatalogDiscoveryQueries = ReturnType<typeof createCatalogDiscoveryQueries>;
