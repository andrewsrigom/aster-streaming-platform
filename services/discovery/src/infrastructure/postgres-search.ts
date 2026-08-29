import type {
  AsterPostgresAdapter,
  AsterPostgresTransaction,
  AsterPostgresTransactionResult,
} from "@aster/postgres";
import type { ProjectionStoreResult } from "../application/projection-ports.js";
import type { SearchRepository, SearchRow, SearchUnitOfWork } from "../application/search-ports.js";
import { discoveryIdentifier, discoveryRecord } from "../domain/title-projection.js";

const invalid = (): never => {
  throw new Error("Invalid Discovery search state.");
};
const integer = (value: unknown, maximum = 253_402_300_799): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum
    ? value
    : invalid();
function one(result: Readonly<{ rowCount: number; rows: readonly unknown[] }>) {
  return result.rowCount === 1 && result.rows.length === 1 ? result.rows[0] : invalid();
}
function row(value: unknown, generation: string): SearchRow | null {
  const data = discoveryRecord(value, [
    "current_generation",
    "title_id",
    "rank",
    "source_version",
    "indexed_at",
    "visible_until",
  ]);
  if (!data || data["current_generation"] !== generation) {
    return invalid();
  }
  if (data["title_id"] === null) {
    return ["rank", "source_version", "indexed_at", "visible_until"].every(
      (key) => data[key] === null,
    )
      ? null
      : invalid();
  }
  if (!discoveryIdentifier(data["title_id"])) {
    return invalid();
  }
  return Object.freeze({
    titleId: data["title_id"],
    rank: integer(data["rank"], 1_000_000),
    sourceVersion: integer(data["source_version"], 2_147_483_647),
    indexedAt: integer(data["indexed_at"]),
    visibleUntil: integer(data["visible_until"]),
  });
}

function repository(tx: AsterPostgresTransaction): SearchRepository {
  const value: SearchRepository = {
    async activeGeneration() {
      const data = discoveryRecord(
        one(
          await tx.query({
            text: `SELECT active_generation::text AS generation
              FROM discovery.generation_control WHERE singleton`,
          }),
        ),
        ["generation"],
      );
      return data && discoveryIdentifier(data["generation"]) ? data["generation"] : invalid();
    },
    async find(input, now) {
      integer(now);
      const result = await tx.query({
        text: `SELECT current.generation::text AS current_generation,
          ranked.title_id,ranked.rank,ranked.source_version,ranked.indexed_at,ranked.visible_until
          FROM (SELECT active_generation AS generation FROM discovery.generation_control WHERE singleton) current
          LEFT JOIN (
            SELECT title_id,rank,source_version,indexed_at,visible_until FROM (
              SELECT d.title_id::text AS title_id,
                LEAST(1000000, GREATEST(0, FLOOR(ts_rank_cd(d.search_vector,
                  plainto_tsquery('simple', $2::text), 32) * 1000000)))::integer AS rank,
                t.source_version, t.indexed_at::float8 AS indexed_at,
                t.visible_until::float8 AS visible_until
              FROM discovery.search_documents d
              JOIN discovery.generation_titles t USING (generation_id, title_id)
              WHERE d.generation_id=$1::uuid AND d.locale=$3::text
                AND t.document_digest IS NOT NULL AND t.visible_until > $4::bigint
                AND d.search_vector @@ plainto_tsquery('simple', $2::text)
            ) scored WHERE ($5::integer IS NULL OR rank < $5::integer
              OR (rank=$5::integer AND title_id::uuid > $6::uuid))
            ORDER BY rank DESC, title_id::uuid ASC LIMIT $7::integer
          ) ranked ON current.generation=$1::uuid
          ORDER BY ranked.rank DESC, ranked.title_id::uuid ASC LIMIT $7::integer`,
        values: [
          input.generation,
          input.query,
          input.locale,
          now,
          input.after?.rank ?? null,
          input.after?.titleId ?? null,
          input.first + 1,
        ],
      });
      if (
        result.rowCount !== result.rows.length ||
        result.rows.length < 1 ||
        result.rows.length > input.first + 1
      ) {
        return invalid();
      }
      const rows = result.rows.map((value) => row(value, input.generation));
      return Object.freeze(rows[0] === null ? [] : rows.map((value) => value ?? invalid()));
    },
  };
  return Object.freeze(value);
}

function failure<T>(
  result: AsterPostgresTransactionResult<T>,
  signal: AbortSignal,
): ProjectionStoreResult<never> {
  return {
    status:
      result.status === "indeterminate"
        ? "indeterminate"
        : result.status === "aborted" && signal.aborted
          ? "cancelled"
          : "unavailable",
  };
}

export function createPostgresSearchUnitOfWork(
  database: Pick<AsterPostgresAdapter, "transaction">,
): SearchUnitOfWork {
  const unit: SearchUnitOfWork = {
    async run<T>(
      work: (repository: SearchRepository) => Promise<T>,
      signal: AbortSignal,
    ): Promise<ProjectionStoreResult<T>> {
      if (signal.aborted) {
        return { status: "cancelled" };
      }
      try {
        const result = await database.transaction(
          async (tx) => ({ action: "rollback", value: await work(repository(tx)) }),
          AbortSignal.any([signal, AbortSignal.timeout(1000)]),
        );
        return result.status === "rolled_back"
          ? { status: "completed", value: result.value }
          : failure(result, signal);
      } catch {
        return { status: "unavailable" };
      }
    },
  };
  return Object.freeze(unit);
}
