import type { AsterPostgresAdapter, AsterPostgresTransaction } from "@aster/postgres";
import type {
  ProcessingTransaction,
  ProcessingUnitOfWork,
} from "../../application/processing-ports.js";
import {
  normalizeProcessingAttempt,
  type ProcessingAttempt,
} from "../../domain/media-processing.js";
import { catalogChecksum } from "../../domain/values.js";
import { acquisitionRepositories } from "./postgres-acquisition.js";
import {
  catalogUnitOfWork,
  invalidRow,
  InvalidCatalogInput,
  one,
  requireId,
  row,
} from "./postgres-rights.js";

const columns = "id, acquisition_id, request_id, processing_key, number, status, record";
function readAttempt(value: unknown): ProcessingAttempt {
  const data = row(value);
  const attempt = normalizeProcessingAttempt(data["record"]);
  return attempt &&
    attempt.id === data["id"] &&
    attempt.acquisitionId === data["acquisition_id"] &&
    attempt.requestId === data["request_id"] &&
    attempt.processingKey === data["processing_key"] &&
    attempt.number === data["number"] &&
    attempt.status === data["status"]
    ? attempt
    : invalidRow();
}
function repositories(tx: AsterPostgresTransaction): ProcessingTransaction {
  return {
    ...acquisitionRepositories(tx),
    async lockProcessingSlot() {
      const result = await tx.query({
        text: "SELECT pg_try_advisory_xact_lock(42781, 7) AS locked",
      });
      one(result.rowCount);
      return row(result.rows[0])["locked"] === true;
    },
    async runningProcessing() {
      const result = await tx.query({
        text:
          "SELECT " + columns + " FROM catalog.media_processing WHERE status = 'RUNNING' LIMIT 2",
      });
      if (result.rowCount === 0) {
        return undefined;
      }
      one(result.rowCount);
      return readAttempt(result.rows[0]);
    },
    async findProcessing(id) {
      requireId(id);
      const result = await tx.query({
        text: "SELECT " + columns + " FROM catalog.media_processing WHERE id = $1",
        values: [id],
      });
      if (result.rowCount === 0) {
        return undefined;
      }
      one(result.rowCount);
      return readAttempt(result.rows[0]);
    },
    async listProcessing(key) {
      if (!catalogChecksum(key)) {
        throw new InvalidCatalogInput();
      }
      const result = await tx.query({
        text:
          "SELECT " +
          columns +
          " FROM catalog.media_processing WHERE processing_key = $1 ORDER BY number LIMIT 4",
        values: [key],
      });
      if (result.rowCount > 3) {
        return invalidRow();
      }
      return result.rows.map(readAttempt);
    },
    async insertProcessing(value) {
      const attempt = normalizeProcessingAttempt(value);
      if (!attempt || attempt.status !== "RUNNING") {
        throw new InvalidCatalogInput();
      }
      const result = await tx.query({
        text: "INSERT INTO catalog.media_processing (id, acquisition_id, request_id, processing_key, number, status, record) VALUES ($1, $2, $3, $4, $5, 'RUNNING', $6::jsonb)",
        values: [
          attempt.id,
          attempt.acquisitionId,
          attempt.requestId,
          attempt.processingKey,
          attempt.number,
          JSON.stringify(attempt),
        ],
      });
      one(result.rowCount);
    },
    async finishProcessing(value) {
      const attempt = normalizeProcessingAttempt(value);
      if (!attempt || attempt.status === "RUNNING") {
        throw new InvalidCatalogInput();
      }
      const result = await tx.query({
        text: "UPDATE catalog.media_processing SET status = $2, record = $3::jsonb WHERE id = $1 AND status = 'RUNNING' AND processing_key = $4 AND number = $5 AND acquisition_id = $6 AND request_id = $7",
        values: [
          attempt.id,
          attempt.status,
          JSON.stringify(attempt),
          attempt.processingKey,
          attempt.number,
          attempt.acquisitionId,
          attempt.requestId,
        ],
      });
      one(result.rowCount);
    },
  };
}
export function createPostgresCatalogProcessing(
  database: Pick<AsterPostgresAdapter, "transaction">,
): ProcessingUnitOfWork {
  return catalogUnitOfWork(database, repositories);
}
