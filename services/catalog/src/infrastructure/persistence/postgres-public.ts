import type { AsterPostgresAdapter, AsterPostgresTransaction } from "@aster/postgres";
import type {
  CatalogPublicRepository,
  CatalogPublicUnitOfWork,
  CatalogReadScope,
} from "../../application/public-ports.js";
import type { PublicCatalogCandidate } from "../../domain/public-title.js";
import { catalogTimestamp } from "../../domain/values.js";
import {
  catalogUnitOfWork,
  InvalidCatalogInput,
  invalidRow,
  requireId,
  row,
} from "./postgres-rights.js";

const columns =
  "id, version, state, rights_revision, publication_id, latest_rights_revision, metadata, rights, publication";
function compatible(record: string): string {
  // These indexed-read predicates exclude ordinary permission/expiry changes before LIMIT.
  // Complete field/URL validation remains in the owning domain projection.
  return `(${record}->>'status' = 'APPROVED'
    AND ${record}->>'redistributionAllowed' = 'true'
    AND ${record}->>'modificationAllowed' = 'true'
    AND ${record}->>'commercialUseAllowed' IN ('true', 'false')
    AND (NOT $2::boolean OR ${record}->>'commercialUseAllowed' = 'true')
    AND ${record}->>'shareAlikeRequired' = 'false'
    AND ${record}->>'technicalRestrictions' = 'NONE'
    AND (${record}->>'reviewedAt')::bigint <= $1
    AND (${record}->>'validUntil' IS NULL OR (${record}->>'validUntil')::bigint > $1))`;
}
const eligible = `${compatible("rights")}
  AND (publication->>'validatedAt')::bigint <= $1
  AND (publication->>'validatedAt')::bigint >= (rights->>'reviewedAt')::bigint
  AND (rights->>'sourceChecksum' IS NULL OR rights->>'sourceChecksum' = publication->>'sourceChecksum')
  AND (metadata->'artwork' = 'null'::jsonb OR ${compatible("(metadata->'artwork'->'rights')")})`;
function scopeValues(scope: CatalogReadScope): readonly [number, boolean] {
  if (!catalogTimestamp(scope.now) || typeof scope.policy.commercial !== "boolean") {
    throw new InvalidCatalogInput();
  }
  return [scope.now, scope.policy.commercial];
}
function candidate(value: unknown): PublicCatalogCandidate {
  const data = row(value);
  return {
    title: {
      id: data["id"],
      version: data["version"],
      state: data["state"],
      rightsRevision: data["rights_revision"],
      publicationId: data["publication_id"],
    },
    latestRightsRevision: data["latest_rights_revision"] as number,
    metadata: data["metadata"],
    rights: data["rights"],
    publication: data["publication"],
  };
}
function publicRepositories(tx: AsterPostgresTransaction): CatalogPublicRepository {
  async function query(
    text: string,
    values: readonly (string | number | boolean | null)[],
    maximum: number,
  ) {
    const result = await tx.query({ text, values });
    if (result.rowCount !== result.rows.length || result.rows.length > maximum) {
      return invalidRow();
    }
    return Object.freeze(result.rows.map(candidate));
  }
  return {
    browse(afterId, limit, scope) {
      if (afterId !== null) {
        requireId(afterId);
      }
      if (!Number.isInteger(limit) || limit < 2 || limit > 21) {
        throw new InvalidCatalogInput();
      }
      return query(
        `SELECT ${columns} FROM catalog.public_candidates WHERE ${eligible} ${afterId === null ? "" : "AND id > $4::uuid"} ORDER BY id LIMIT $3`,
        [...scopeValues(scope), limit, ...(afterId === null ? [] : [afterId])],
        limit,
      );
    },
    findMany(ids, scope) {
      if (ids.length === 0 || ids.length > 20 || new Set(ids).size !== ids.length) {
        throw new InvalidCatalogInput();
      }
      ids.forEach(requireId);
      const placeholders = ids.map((_, index) => "$" + String(index + 3) + "::uuid").join(", ");
      return query(
        `SELECT ${columns} FROM catalog.public_candidates WHERE ${eligible} AND id IN (${placeholders}) ORDER BY id`,
        [...scopeValues(scope), ...ids],
        ids.length,
      );
    },
  };
}
export function createPostgresCatalogPublic(
  database: Pick<AsterPostgresAdapter, "transaction">,
): CatalogPublicUnitOfWork {
  return catalogUnitOfWork(database, publicRepositories);
}
