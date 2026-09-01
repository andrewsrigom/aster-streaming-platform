import type { AsterPostgresAdapter, AsterPostgresTransaction } from "@aster/postgres";
import type {
  CatalogPublicEntitySource,
  CatalogPublicFence,
  CatalogPublicRepository,
  CatalogPublicUnitOfWork,
  CatalogReadScope,
} from "../../application/public-ports.js";
import type { PublicCatalogCandidate } from "../../domain/public-title.js";
import { catalogIdentifier, catalogTimestamp, catalogVersion } from "../../domain/values.js";
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
    AND ($3::boolean OR ${record}->>'assetSourceUrl' LIKE 'https://%')
    AND ${record}->>'shareAlikeRequired' = 'false'
    AND ${record}->>'technicalRestrictions' = 'NONE'
    AND (${record}->>'reviewedAt')::bigint <= $1
    AND (${record}->>'validUntil' IS NULL OR (${record}->>'validUntil')::bigint > $1))`;
}
const eligible = `${compatible("rights")}
  AND ($3::boolean OR publication->>'manifestUrl' LIKE 'https://%')
  AND (publication->>'validatedAt')::bigint <= $1
  AND (publication->>'validatedAt')::bigint >= (rights->>'reviewedAt')::bigint
  AND (rights->>'sourceChecksum' IS NULL OR rights->>'sourceChecksum' = publication->>'sourceChecksum')
  AND (metadata->'artwork' = 'null'::jsonb OR ${compatible("(metadata->'artwork'->'rights')")})`;
function scopeValues(scope: CatalogReadScope): readonly [number, boolean, boolean] {
  if (
    !catalogTimestamp(scope.now) ||
    typeof scope.policy.commercial !== "boolean" ||
    (scope.policy.allowLocalMedia !== undefined &&
      typeof scope.policy.allowLocalMedia !== "boolean")
  ) {
    throw new InvalidCatalogInput();
  }
  return [scope.now, scope.policy.commercial, scope.policy.allowLocalMedia === true];
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

function fence(value: unknown): CatalogPublicFence {
  const data = row(value);
  if (
    !catalogIdentifier(data["id"]) ||
    !catalogVersion(data["title_version"]) ||
    !catalogVersion(data["rights_revision"]) ||
    !catalogIdentifier(data["publication_id"])
  ) {
    return invalidRow();
  }
  return Object.freeze({
    id: data["id"],
    titleVersion: data["title_version"],
    rightsRevision: data["rights_revision"],
    publicationId: data["publication_id"],
  });
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
        `SELECT ${columns} FROM catalog.public_candidates WHERE ${eligible} ${afterId === null ? "" : "AND id > $5::uuid"} ORDER BY id LIMIT $4`,
        [...scopeValues(scope), limit, ...(afterId === null ? [] : [afterId])],
        limit,
      );
    },
    findMany(ids, scope) {
      if (ids.length === 0 || ids.length > 20 || new Set(ids).size !== ids.length) {
        throw new InvalidCatalogInput();
      }
      ids.forEach(requireId);
      const placeholders = ids.map((_, index) => "$" + String(index + 4) + "::uuid").join(", ");
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

interface CatalogPublicEntityRepository {
  findFences(
    ids: readonly string[],
    scope: CatalogReadScope,
  ): Promise<readonly CatalogPublicFence[]>;
  findManyAtFences(
    fences: readonly CatalogPublicFence[],
    scope: CatalogReadScope,
  ): Promise<readonly PublicCatalogCandidate[]>;
}

function validateIds(ids: readonly string[]): void {
  if (ids.length === 0 || ids.length > 20 || new Set(ids).size !== ids.length) {
    throw new InvalidCatalogInput();
  }
  ids.forEach(requireId);
}

function entityRepositories(tx: AsterPostgresTransaction): CatalogPublicEntityRepository {
  return {
    async findFences(ids, scope) {
      validateIds(ids);
      const placeholders = ids.map((_, index) => "$" + String(index + 4) + "::uuid").join(", ");
      const result = await tx.query({
        text: `SELECT id, version AS title_version, rights_revision, publication_id FROM catalog.public_candidates WHERE ${eligible} AND id IN (${placeholders}) ORDER BY id`,
        values: [...scopeValues(scope), ...ids],
      });
      if (result.rowCount !== result.rows.length || result.rows.length > ids.length) {
        return invalidRow();
      }
      return Object.freeze(result.rows.map(fence));
    },
    async findManyAtFences(fences, scope) {
      validateIds(fences.map((value) => value.id));
      for (const value of fences) {
        if (
          !catalogVersion(value.titleVersion) ||
          !catalogVersion(value.rightsRevision) ||
          !catalogIdentifier(value.publicationId)
        ) {
          throw new InvalidCatalogInput();
        }
      }
      // One bounded tuple parameter keeps the twenty-title DataLoader contract below the
      // shared PostgreSQL adapter's 32-parameter guard without weakening exact fence matching.
      const encodedFences = JSON.stringify(
        fences.map((value) => [
          value.id,
          value.titleVersion,
          value.rightsRevision,
          value.publicationId,
        ]),
      );
      const result = await tx.query({
        text: `SELECT ${columns} FROM catalog.public_candidates WHERE ${eligible} AND EXISTS (
          SELECT 1 FROM jsonb_array_elements($4::jsonb) AS expected(value)
          WHERE id = (expected.value->>0)::uuid
            AND version = (expected.value->>1)::integer
            AND rights_revision = (expected.value->>2)::integer
            AND publication_id = (expected.value->>3)::uuid
        ) ORDER BY id`,
        values: [...scopeValues(scope), encodedFences],
      });
      if (result.rowCount !== result.rows.length || result.rows.length > fences.length) {
        return invalidRow();
      }
      return Object.freeze(result.rows.map(candidate));
    },
  };
}

export function createPostgresCatalogPublicEntitySource(
  database: Pick<AsterPostgresAdapter, "transaction">,
): CatalogPublicEntitySource {
  const transactions = catalogUnitOfWork(database, entityRepositories);
  const source: CatalogPublicEntitySource = {
    findFences(ids, scope, signal) {
      return transactions.run(
        async (repository) => ({
          status: "completed",
          value: await repository.findFences(ids, scope),
        }),
        signal,
      );
    },
    findManyAtFences(fences, scope, signal) {
      return transactions.run(
        async (repository) => ({
          status: "completed",
          value: await repository.findManyAtFences(fences, scope),
        }),
        signal,
      );
    },
  };
  return Object.freeze(source);
}
