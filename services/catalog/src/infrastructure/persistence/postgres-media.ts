import type { AsterPostgresAdapter, AsterPostgresTransaction } from "@aster/postgres";
import type {
  CatalogMediaTransaction,
  CatalogMediaUnitOfWork,
} from "../../application/media-ports.js";
import {
  MAX_MEDIA_REQUESTS_PER_TITLE,
  normalizeMediaRequest,
  type CatalogMediaRequest,
} from "../../domain/media-request.js";
import { catalogChecksum } from "../../domain/values.js";
import {
  catalogUnitOfWork,
  InvalidCatalogInput,
  invalidRow,
  one,
  requireId,
  rightsRepositories,
  row,
} from "./postgres-rights.js";

const columns =
  "request_id, title_id, rights_revision, request, actor_id, correlation_id, requested_at, source_fingerprint";
function readRequest(value: unknown): CatalogMediaRequest {
  const data = row(value);
  const timestamp =
    typeof data["requested_at"] === "string" && /^\d{1,12}$/u.test(data["requested_at"])
      ? Number(data["requested_at"])
      : data["requested_at"];
  const result = normalizeMediaRequest({
    input: data["request"],
    actorId: data["actor_id"],
    correlationId: data["correlation_id"],
    requestedAt: timestamp,
    sourceFingerprint: data["source_fingerprint"],
  });
  if (
    !result ||
    result.input.requestId !== data["request_id"] ||
    result.input.titleId !== data["title_id"] ||
    result.input.rightsRevision !== data["rights_revision"]
  ) {
    return invalidRow();
  }
  return result;
}
function repositories(tx: AsterPostgresTransaction): CatalogMediaTransaction {
  return {
    ...rightsRepositories(tx),
    async findMediaRequest(requestId) {
      requireId(requestId);
      const result = await tx.query({
        text: `SELECT ${columns} FROM catalog.media_requests WHERE request_id = $1`,
        values: [requestId],
      });
      if (result.rowCount === 0) {
        return undefined;
      }
      one(result.rowCount);
      const record = readRequest(result.rows[0]);
      return record.input.requestId === requestId ? record : invalidRow();
    },
    async findMediaFingerprint(titleId, fingerprint) {
      requireId(titleId);
      if (!catalogChecksum(fingerprint)) {
        throw new InvalidCatalogInput();
      }
      const result = await tx.query({
        text: `SELECT ${columns} FROM catalog.media_requests WHERE title_id = $1 AND source_fingerprint = $2`,
        values: [titleId, fingerprint],
      });
      if (result.rowCount === 0) {
        return undefined;
      }
      one(result.rowCount);
      const record = readRequest(result.rows[0]);
      return record.input.titleId === titleId && record.sourceFingerprint === fingerprint
        ? record
        : invalidRow();
    },
    async countMediaRequests(titleId) {
      requireId(titleId);
      const result = await tx.query({
        text: "SELECT count(*)::integer AS count FROM catalog.media_requests WHERE title_id = $1",
        values: [titleId],
      });
      one(result.rowCount);
      const count = row(result.rows[0])["count"];
      if (
        typeof count !== "number" ||
        !Number.isSafeInteger(count) ||
        count < 0 ||
        count > MAX_MEDIA_REQUESTS_PER_TITLE
      ) {
        return invalidRow();
      }
      return count;
    },
    async insertMediaRequest(value) {
      const record = normalizeMediaRequest(value);
      if (!record) {
        throw new InvalidCatalogInput();
      }
      const request = JSON.stringify(record.input);
      if (request.length > 4096 || new TextEncoder().encode(request).length > 4096) {
        throw new InvalidCatalogInput();
      }
      const result = await tx.query({
        text: "INSERT INTO catalog.media_requests (request_id, title_id, rights_revision, request, actor_id, correlation_id, requested_at, source_fingerprint, slot) SELECT $1, $2, $3, $4::jsonb, $5, $6, $7, $8, n FROM generate_series(1, 16) AS n WHERE NOT EXISTS (SELECT 1 FROM catalog.media_requests r WHERE r.title_id = $2 AND r.slot = n) ORDER BY n LIMIT 1 ON CONFLICT DO NOTHING",
        values: [
          record.input.requestId,
          record.input.titleId,
          record.input.rightsRevision,
          request,
          record.actorId,
          record.correlationId,
          record.requestedAt,
          record.sourceFingerprint,
        ],
      });
      if (result.rowCount === 0) {
        return false;
      }
      one(result.rowCount);
      return true;
    },
  };
}
export function createPostgresCatalogMedia(
  database: Pick<AsterPostgresAdapter, "transaction">,
): CatalogMediaUnitOfWork {
  return catalogUnitOfWork(database, repositories);
}
