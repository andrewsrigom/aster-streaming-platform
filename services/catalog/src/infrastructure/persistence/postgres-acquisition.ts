import type { AsterPostgresAdapter, AsterPostgresTransaction } from "@aster/postgres";
import type {
  AcquisitionTransaction,
  AcquisitionUnitOfWork,
} from "../../application/acquisition-ports.js";
import {
  normalizeAcquisitionAttempt,
  type AcquisitionAttempt,
} from "../../domain/media-acquisition.js";
import { mediaRepositories } from "./postgres-media.js";
import {
  catalogUnitOfWork,
  invalidRow,
  InvalidCatalogInput,
  one,
  requireId,
  row,
} from "./postgres-rights.js";

function readAttempt(value: unknown): AcquisitionAttempt {
  const data = row(value);
  const attempt = normalizeAcquisitionAttempt(data["record"]);
  return attempt &&
    attempt.id === data["id"] &&
    attempt.requestId === data["request_id"] &&
    attempt.number === data["number"] &&
    attempt.status === data["status"]
    ? attempt
    : invalidRow();
}
function repositories(tx: AsterPostgresTransaction): AcquisitionTransaction {
  const columns = "id, request_id, number, status, record";
  return {
    ...mediaRepositories(tx),
    async lockAcquisitionSlot() {
      const result = await tx.query({
        text: "SELECT pg_try_advisory_xact_lock(42781, 6) AS locked",
      });
      one(result.rowCount);
      return row(result.rows[0])["locked"] === true;
    },
    async runningAcquisition() {
      const result = await tx.query({
        text: `SELECT ${columns} FROM catalog.media_acquisitions WHERE status = 'RUNNING' LIMIT 2`,
      });
      if (result.rowCount === 0) {
        return undefined;
      }
      one(result.rowCount);
      return readAttempt(result.rows[0]);
    },
    async findAcquisition(id) {
      requireId(id);
      const result = await tx.query({
        text: `SELECT ${columns} FROM catalog.media_acquisitions WHERE id = $1`,
        values: [id],
      });
      if (result.rowCount === 0) {
        return undefined;
      }
      one(result.rowCount);
      return readAttempt(result.rows[0]);
    },
    async listAcquisitions(requestId) {
      requireId(requestId);
      const result = await tx.query({
        text: `SELECT ${columns} FROM catalog.media_acquisitions WHERE request_id = $1 ORDER BY number LIMIT 4`,
        values: [requestId],
      });
      if (result.rowCount > 3) {
        return invalidRow();
      }
      return result.rows.map(readAttempt);
    },
    async insertAcquisition(value) {
      const attempt = normalizeAcquisitionAttempt(value);
      if (!attempt || attempt.status !== "RUNNING") {
        throw new InvalidCatalogInput();
      }
      const result = await tx.query({
        text: "INSERT INTO catalog.media_acquisitions (id, request_id, number, status, record) VALUES ($1, $2, $3, 'RUNNING', $4::jsonb)",
        values: [attempt.id, attempt.requestId, attempt.number, JSON.stringify(attempt)],
      });
      one(result.rowCount);
    },
    async finishAcquisition(value) {
      const attempt = normalizeAcquisitionAttempt(value);
      if (!attempt || attempt.status === "RUNNING") {
        throw new InvalidCatalogInput();
      }
      const result = await tx.query({
        text: "UPDATE catalog.media_acquisitions SET status = $2, record = $3::jsonb WHERE id = $1 AND status = 'RUNNING' AND request_id = $4 AND number = $5",
        values: [
          attempt.id,
          attempt.status,
          JSON.stringify(attempt),
          attempt.requestId,
          attempt.number,
        ],
      });
      one(result.rowCount);
    },
  };
}
export function createPostgresCatalogAcquisitions(
  database: Pick<AsterPostgresAdapter, "transaction">,
): AcquisitionUnitOfWork {
  return catalogUnitOfWork(database, repositories);
}
