import {
  localizeTitle,
  normalizeCatalogLocale,
  type TitleLocalization,
} from "../domain/metadata.js";
import {
  projectPublicTitle,
  type PublicCatalogTitle,
  type PublicCatalogCandidate,
} from "../domain/public-title.js";
import { catalogIdentifier, catalogRecord, catalogTimestamp } from "../domain/values.js";
import type { RightsUsePolicy } from "../domain/rights.js";
import type { CatalogPublicUnitOfWork } from "./public-ports.js";
import type { CatalogPublicRepository } from "./public-ports.js";
import type { CatalogPublicEntityReader } from "./public-ports.js";
import type { CatalogStoreResult } from "./rights-ports.js";

export type CatalogReadResult<T> =
  | Readonly<{ status: "completed"; value: T }>
  | Readonly<{ status: "invalid_input" | "cancelled" | "unavailable" }>;
export interface CatalogTitleConnection {
  readonly edges: readonly Readonly<{ cursor: string; node: PublicCatalogTitle }>[];
  readonly pageInfo: Readonly<{ endCursor: string | null; hasNextPage: boolean }>;
}
// Opaque to clients, versioned for future ordering changes; not an authorization credential.
const cursorFor = (id: string): string => "c1." + id;
export function createCatalogPublicQueries(
  ports: Readonly<{
    transactions: CatalogPublicUnitOfWork;
    entities?: CatalogPublicEntityReader;
    policy: RightsUsePolicy;
    now: () => number;
  }>,
) {
  async function read<T>(
    signal: AbortSignal,
    work: (repository: CatalogPublicRepository) => Promise<CatalogStoreResult<T>>,
  ): Promise<CatalogReadResult<T>> {
    const cancelled = (): boolean => signal.aborted;
    if (cancelled()) {
      return { status: "cancelled" };
    }
    try {
      const result = await ports.transactions.run(work, signal);
      if (cancelled()) {
        return { status: "cancelled" };
      }
      return result.status === "completed"
        ? { status: "completed", value: result.value }
        : { status: result.status === "cancelled" ? "cancelled" : "unavailable" };
    } catch {
      return { status: cancelled() ? "cancelled" : "unavailable" };
    }
  }
  async function readEntities(
    ids: readonly string[],
    now: number,
    signal: AbortSignal,
  ): Promise<CatalogReadResult<readonly PublicCatalogTitle[]>> {
    if (!ports.entities) {
      return { status: "unavailable" };
    }
    try {
      const result = await ports.entities.findMany(ids, { now, policy: ports.policy }, signal);
      if (signal.aborted) {
        return { status: "cancelled" };
      }
      return result.status === "completed"
        ? { status: "completed", value: result.value }
        : { status: result.status === "cancelled" ? "cancelled" : "unavailable" };
    } catch {
      return { status: signal.aborted ? "cancelled" : "unavailable" };
    }
  }
  function project(candidate: PublicCatalogCandidate, now: number): PublicCatalogTitle {
    const title = projectPublicTitle(candidate, now, ports.policy);
    if (!title) {
      // A candidate that passed SQL eligibility but fails domain validation is corrupt, not a page gap.
      throw new Error("Invalid public Catalog candidate.");
    }
    return title;
  }
  return Object.freeze({
    async browse(
      value: unknown,
      signal: AbortSignal,
    ): Promise<CatalogReadResult<CatalogTitleConnection>> {
      const input = catalogRecord(value, ["first", "after"]);
      const first = input?.["first"];
      const after = input?.["after"];
      const afterId = typeof after === "string" && after.startsWith("c1.") ? after.slice(3) : null;
      if (
        !input ||
        typeof first !== "number" ||
        !Number.isInteger(first) ||
        first < 1 ||
        first > 20 ||
        (after !== null && (!afterId || !catalogIdentifier(afterId)))
      ) {
        return { status: "invalid_input" };
      }
      const now = ports.now();
      if (!catalogTimestamp(now)) {
        return { status: "unavailable" };
      }
      return read<CatalogTitleConnection>(signal, async (repository) => {
        const candidates = await repository.browse(afterId, first + 1, {
          now,
          policy: ports.policy,
        });
        if (candidates.length > first + 1) {
          throw new Error("Catalog page exceeds its bound.");
        }
        let previous = afterId ?? "";
        const titles = candidates.map((candidate) => {
          const title = project(candidate, now);
          if (title.id <= previous) {
            throw new Error("Invalid Catalog page order.");
          }
          previous = title.id;
          return title;
        });
        const edges = Object.freeze(
          titles.slice(0, first).map((node) => Object.freeze({ cursor: cursorFor(node.id), node })),
        );
        return {
          status: "completed",
          value: Object.freeze({
            edges,
            pageInfo: Object.freeze({
              endCursor: edges.at(-1)?.cursor ?? null,
              hasNextPage: titles.length > first,
            }),
          }),
        };
      });
    },
    async byIds(
      ids: readonly unknown[],
      signal: AbortSignal,
    ): Promise<CatalogReadResult<readonly (PublicCatalogTitle | null)[]>> {
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
      const now = ports.now();
      if (!catalogTimestamp(now)) {
        return { status: "unavailable" };
      }
      if (signal.aborted) {
        return { status: "cancelled" };
      }
      if (ids.length === 0) {
        return { status: "completed", value: [] };
      }
      const unique = [...new Set(ids)];
      if (ports.entities) {
        const result = await readEntities(unique, now, signal);
        if (result.status !== "completed") {
          return result;
        }
        if (result.value.length > unique.length) {
          return { status: "unavailable" };
        }
        const titles = new Map<string, PublicCatalogTitle>();
        for (const title of result.value) {
          if (!unique.includes(title.id) || titles.has(title.id)) {
            return { status: "unavailable" };
          }
          titles.set(title.id, title);
        }
        return {
          status: "completed",
          value: Object.freeze(ids.map((id) => titles.get(id) ?? null)),
        };
      }
      return read<readonly (PublicCatalogTitle | null)[]>(signal, async (repository) => {
        const candidates = await repository.findMany(unique, { now, policy: ports.policy });
        if (candidates.length > unique.length) {
          throw new Error("Catalog batch exceeds its bound.");
        }
        const titles = new Map<string, PublicCatalogTitle>();
        for (const candidate of candidates) {
          const title = project(candidate, now);
          if (!unique.includes(title.id) || titles.has(title.id)) {
            throw new Error("Invalid Catalog batch identity.");
          }
          titles.set(title.id, title);
        }
        return {
          status: "completed",
          value: Object.freeze(ids.map((id) => titles.get(id) ?? null)),
        };
      });
    },
    localized(title: PublicCatalogTitle, locale: unknown): CatalogReadResult<TitleLocalization> {
      const canonical = normalizeCatalogLocale(locale);
      return canonical
        ? { status: "completed", value: localizeTitle(title, canonical) }
        : { status: "invalid_input" };
    },
  });
}
export type CatalogPublicQueries = ReturnType<typeof createCatalogPublicQueries>;
