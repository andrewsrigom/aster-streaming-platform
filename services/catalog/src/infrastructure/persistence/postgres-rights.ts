import type { AsterPostgresAdapter, AsterPostgresTransaction } from "@aster/postgres";

import type {
  CatalogRightsRevision,
  CatalogRightsTransaction,
  CatalogRightsUnitOfWork,
  CatalogStoreResult,
  StoredCatalogTitle,
} from "../../application/rights-ports.js";
import { normalizeRightsRecord } from "../../domain/rights.js";
import { normalizeTitleLifecycle } from "../../domain/title.js";
import {
  catalogIdentifier,
  catalogRecord,
  catalogTimestamp,
  catalogVersion,
} from "../../domain/values.js";

class InvalidCatalogInput extends Error {
  constructor() {
    super("Invalid Catalog persistence input.");
  }
}
function invalidRow(): never {
  throw new Error("Catalog persistence returned an invalid row.");
}
function requireId(value: unknown): asserts value is string {
  if (!catalogIdentifier(value)) {
    throw new InvalidCatalogInput();
  }
}
function one(count: number): void {
  if (count !== 1) {
    invalidRow();
  }
}
function row(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalidRow();
  }
  return value as Record<string, unknown>;
}
function readTitle(value: unknown): StoredCatalogTitle {
  const data = row(value);
  const title = normalizeTitleLifecycle({
    id: data["id"],
    version: data["version"],
    state: data["state"],
    rightsRevision: data["rights_revision"],
    publicationId: data["publication_id"],
  });
  const latest = data["latest_rights_revision"];
  if (
    !title ||
    (latest !== null && !catalogVersion(latest)) ||
    (title.rightsRevision !== null && (latest === null || title.rightsRevision > latest))
  ) {
    return invalidRow();
  }
  return Object.freeze({
    ...title,
    latestRightsRevision: latest === null ? 0 : latest,
  });
}
function readRevision(value: unknown): CatalogRightsRevision {
  const data = row(value);
  const record = normalizeRightsRecord(data["record"]);
  const timestamp =
    typeof data["recorded_at"] === "string" && /^\d{1,12}$/u.test(data["recorded_at"])
      ? Number(data["recorded_at"])
      : data["recorded_at"];
  if (
    !record ||
    data["id"] !== record.id ||
    data["title_id"] !== record.titleId ||
    data["revision"] !== record.revision ||
    data["status"] !== record.status ||
    !catalogIdentifier(data["actor_id"]) ||
    !catalogIdentifier(data["correlation_id"]) ||
    !catalogTimestamp(timestamp) ||
    !catalogVersion(data["title_version"]) ||
    data["title_version"] < 2
  ) {
    return invalidRow();
  }
  return Object.freeze({
    record,
    actorId: data["actor_id"],
    recordedAt: timestamp,
    correlationId: data["correlation_id"],
    titleVersion: data["title_version"],
  });
}
const columns =
  "r.id, r.title_id, r.revision, r.status, r.record, a.actor_id, a.recorded_at, a.correlation_id, a.title_version";
const join = "catalog.rights_revisions r JOIN catalog.rights_audit a USING (title_id, revision)";

// Keep the shared adapter's 4096-character parameter cap, including surrogate-pair boundaries.
function chunks(text: string): readonly string[] {
  const result: string[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + 4000, text.length);
    const last = text.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff) {
      end--;
    }
    result.push(text.slice(start, end));
    start = end;
  }
  return Array.from({ length: 9 }, (_, index) => result[index] ?? "");
}
function repositories(tx: AsterPostgresTransaction): CatalogRightsTransaction {
  return {
    async createDraft(titleId) {
      requireId(titleId);
      const result = await tx.query({
        text: "INSERT INTO catalog.titles (id, version, state) VALUES ($1, 1, 'DRAFT') ON CONFLICT (id) DO NOTHING",
        values: [titleId],
      });
      return result.rowCount === 1;
    },
    async lockTitle(titleId) {
      requireId(titleId);
      const result = await tx.query({
        text: "SELECT id, version, state, rights_revision, publication_id, latest_rights_revision FROM catalog.titles WHERE id = $1 FOR UPDATE",
        values: [titleId],
      });
      if (result.rowCount === 0) {
        return undefined;
      }
      one(result.rowCount);
      const title = readTitle(result.rows[0]);
      if (title.id !== titleId) {
        return invalidRow();
      }
      return title;
    },
    async appendRights(value, expectedTitleVersion, provenance) {
      const record = normalizeRightsRecord(value);
      const audit = catalogRecord(provenance, ["actorId", "recordedAt", "correlationId"]);
      if (
        !record ||
        !catalogVersion(expectedTitleVersion) ||
        expectedTitleVersion === 2_147_483_647 ||
        !audit ||
        !catalogIdentifier(audit["actorId"]) ||
        !catalogTimestamp(audit["recordedAt"]) ||
        !catalogIdentifier(audit["correlationId"])
      ) {
        throw new InvalidCatalogInput();
      }
      const json = JSON.stringify(record);
      // Reserve JSONB's whitespace expansion; both source and stored forms are bounded.
      if (new TextEncoder().encode(json).length > 30_000) {
        throw new InvalidCatalogInput();
      }
      const updated = await tx.query({
        text: "UPDATE catalog.titles SET version = version + 1, latest_rights_revision = $2 WHERE id = $1 AND version = $3 AND COALESCE(latest_rights_revision, 0) = $2 - 1",
        values: [record.titleId, record.revision, expectedTitleVersion],
      });
      if (updated.rowCount === 0) {
        return false;
      }
      one(updated.rowCount);
      const inserted = await tx.query({
        text: "INSERT INTO catalog.rights_revisions (id, title_id, revision, status, record) VALUES ($1, $2, $3, $4, ($5 || $6 || $7 || $8 || $9 || $10 || $11 || $12 || $13)::jsonb)",
        values: [record.id, record.titleId, record.revision, record.status, ...chunks(json)],
      });
      one(inserted.rowCount);
      const audited = await tx.query({
        text: "INSERT INTO catalog.rights_audit (title_id, revision, title_version, actor_id, recorded_at, correlation_id) VALUES ($1, $2, $3, $4, $5, $6)",
        values: [
          record.titleId,
          record.revision,
          expectedTitleVersion + 1,
          audit["actorId"],
          audit["recordedAt"],
          audit["correlationId"],
        ],
      });
      one(audited.rowCount);
      return true;
    },
    async findRights(titleId, revision) {
      requireId(titleId);
      if (revision !== null && !catalogVersion(revision)) {
        throw new InvalidCatalogInput();
      }
      const result = await tx.query({
        text: `SELECT ${columns} FROM ${join} WHERE r.title_id = $1 AND ($2::integer IS NULL OR r.revision = $2) ORDER BY r.revision DESC LIMIT 1`,
        values: [titleId, revision],
      });
      if (result.rowCount === 0) {
        return undefined;
      }
      one(result.rowCount);
      const found = readRevision(result.rows[0]);
      if (
        found.record.titleId !== titleId ||
        (revision !== null && found.record.revision !== revision)
      ) {
        return invalidRow();
      }
      return found;
    },
    async listRights(titleId, beforeRevision, first) {
      requireId(titleId);
      if (
        (beforeRevision !== null && !catalogVersion(beforeRevision)) ||
        !Number.isSafeInteger(first) ||
        first < 1 ||
        first > 50
      ) {
        throw new InvalidCatalogInput();
      }
      const result = await tx.query({
        text: `SELECT ${columns} FROM ${join} WHERE r.title_id = $1 AND ($2::integer IS NULL OR r.revision < $2) ORDER BY r.revision DESC LIMIT $3`,
        values: [titleId, beforeRevision, first],
      });
      if (result.rowCount !== result.rows.length || result.rows.length > first) {
        return invalidRow();
      }
      let previous = beforeRevision ?? 2_147_483_648;
      const values = result.rows.map((value) => {
        const found = readRevision(value);
        if (found.record.titleId !== titleId || found.record.revision >= previous) {
          return invalidRow();
        }
        previous = found.record.revision;
        return found;
      });
      return Object.freeze(values);
    },
  };
}
export function createPostgresCatalogRights(
  database: Pick<AsterPostgresAdapter, "transaction">,
): CatalogRightsUnitOfWork {
  return Object.freeze({
    async run<T>(
      operation: (transaction: CatalogRightsTransaction) => Promise<CatalogStoreResult<T>>,
      signal: AbortSignal,
    ): Promise<CatalogStoreResult<T>> {
      const cancelled = (): boolean => signal.aborted;
      if (cancelled()) {
        return { status: "cancelled" };
      }
      try {
        const result = await database.transaction(async (tx) => {
          let value: CatalogStoreResult<T>;
          try {
            value = await operation(repositories(tx));
          } catch (error) {
            if (!(error instanceof InvalidCatalogInput)) {
              throw error;
            }
            value = { status: "invalid_input" };
          }
          return { action: value.status === "completed" ? "commit" : "rollback", value };
        }, signal);
        if (result.status === "committed" || result.status === "rolled_back") {
          return result.value;
        }
        return {
          status:
            result.status === "aborted"
              ? "cancelled"
              : result.status === "indeterminate"
                ? "indeterminate"
                : "unavailable",
        };
      } catch {
        return { status: cancelled() ? "cancelled" : "unavailable" };
      }
    },
  });
}
