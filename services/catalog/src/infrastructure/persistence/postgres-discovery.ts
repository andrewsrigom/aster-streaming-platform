import type { AsterPostgresAdapter, AsterPostgresTransaction } from "@aster/postgres";
import type {
  CatalogDiscoveryRepository,
  CatalogDiscoveryUnitOfWork,
} from "../../application/discovery-ports.js";
import type { DiscoveryCandidate } from "../../domain/discovery-snapshot.js";
import { catalogTimestamp, catalogVersion } from "../../domain/values.js";
import {
  catalogUnitOfWork,
  InvalidCatalogInput,
  invalidRow,
  requireId,
  row,
} from "./postgres-rights.js";

function sourceRow(value: unknown): DiscoveryCandidate {
  const data = row(value);
  requireId(data["title_id"]);
  const version = data["source_version"];
  const publishedAt =
    typeof data["published_at"] === "string" && /^\d{1,12}$/u.test(data["published_at"])
      ? Number(data["published_at"])
      : data["published_at"];
  if (
    !catalogVersion(version) ||
    (publishedAt !== null && !catalogTimestamp(publishedAt)) ||
    (data["candidate"] !== null &&
      (typeof data["candidate"] !== "object" || Array.isArray(data["candidate"])))
  ) {
    return invalidRow();
  }
  return Object.freeze({
    titleId: data["title_id"],
    sourceVersion: version,
    candidate: data["candidate"] as DiscoveryCandidate["candidate"],
    publishedAt,
  });
}
function repositories(tx: AsterPostgresTransaction): CatalogDiscoveryRepository {
  async function query(text: string, values: readonly (string | number)[], limit: number) {
    const result = await tx.query({ text, values });
    if (result.rowCount !== result.rows.length || result.rows.length > limit) {
      return invalidRow();
    }
    return Object.freeze(result.rows.map(sourceRow));
  }
  const columns = "title_id, source_version, candidate, published_at";
  return {
    findMany(ids) {
      if (ids.length < 1 || ids.length > 2 || new Set(ids).size !== ids.length) {
        throw new InvalidCatalogInput();
      }
      ids.forEach(requireId);
      const placeholders = ids.map((_, index) => "$" + String(index + 1) + "::uuid").join(", ");
      return query(
        `SELECT ${columns} FROM catalog.discovery_sources WHERE title_id IN (${placeholders}) ORDER BY title_id`,
        ids,
        ids.length,
      );
    },
    scan(afterId, limit) {
      if (afterId !== null) {
        requireId(afterId);
      }
      if (limit !== 3) {
        throw new InvalidCatalogInput();
      }
      return query(
        `SELECT ${columns} FROM catalog.discovery_sources ${afterId === null ? "" : "WHERE title_id > $2::uuid"} ORDER BY title_id LIMIT $1`,
        [limit, ...(afterId === null ? [] : [afterId])],
        limit,
      );
    },
  };
}
export function createPostgresCatalogDiscovery(
  database: Pick<AsterPostgresAdapter, "transaction">,
): CatalogDiscoveryUnitOfWork {
  return catalogUnitOfWork(database, repositories);
}
