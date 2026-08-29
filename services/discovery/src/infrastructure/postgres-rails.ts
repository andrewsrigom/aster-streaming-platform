import type {
  AsterPostgresAdapter,
  AsterPostgresTransaction,
  AsterPostgresTransactionResult,
} from "@aster/postgres";
import type { ProjectionStoreResult } from "../application/projection-ports.js";
import type {
  HomeProjectionState,
  HomeRailRepository,
  HomeRailUnitOfWork,
} from "../application/rail-ports.js";
import type { HomeGenreRows, HomeRailRow } from "../domain/home-rail.js";
import { discoveryIdentifier, discoveryRecord } from "../domain/title-projection.js";

const invalid = (): never => {
  throw new Error("Invalid Discovery rail state.");
};
const integer = (value: unknown, maximum = 253_402_300_799): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum
    ? value
    : invalid();
function one(result: Readonly<{ rowCount: number; rows: readonly unknown[] }>) {
  return result.rowCount === 1 && result.rows.length === 1 ? result.rows[0] : invalid();
}

function railRow(value: unknown, generation: string): HomeRailRow {
  const row = discoveryRecord(value, [
    "generation",
    "title_id",
    "source_version",
    "indexed_at",
    "visible_until",
    "published_at",
  ]);
  if (!row || row["generation"] !== generation || !discoveryIdentifier(row["title_id"])) {
    return invalid();
  }
  return Object.freeze({
    titleId: row["title_id"],
    sourceVersion: integer(row["source_version"], 2_147_483_647),
    indexedAt: integer(row["indexed_at"]),
    visibleUntil: integer(row["visible_until"]),
    publishedAt: integer(row["published_at"]),
  });
}

function repository(tx: AsterPostgresTransaction): HomeRailRepository {
  const value: HomeRailRepository = {
    async state(now): Promise<HomeProjectionState> {
      integer(now);
      const row = discoveryRecord(
        one(
          await tx.query({
            text: `SELECT control.active_generation::text AS generation,
              EXISTS (SELECT 1 FROM discovery.generation_titles title
                WHERE title.generation_id=control.active_generation
                  AND title.document_digest IS NOT NULL) AS has_projected,
              EXISTS (SELECT 1 FROM discovery.rail_documents document
                WHERE document.generation_id=control.active_generation) AS has_matching,
              EXISTS (SELECT 1 FROM discovery.rail_documents document
                WHERE document.generation_id=control.active_generation
                  AND document.visible_until > $1::bigint) AS has_fresh
              FROM discovery.generation_control control WHERE control.singleton`,
            values: [now],
          }),
        ),
        ["generation", "has_projected", "has_matching", "has_fresh"],
      );
      if (
        !row ||
        !discoveryIdentifier(row["generation"]) ||
        typeof row["has_projected"] !== "boolean" ||
        typeof row["has_matching"] !== "boolean" ||
        typeof row["has_fresh"] !== "boolean" ||
        (row["has_matching"] && !row["has_projected"]) ||
        (row["has_fresh"] && !row["has_matching"]) ||
        (row["has_projected"] && !row["has_matching"])
      ) {
        return invalid();
      }
      return Object.freeze({
        generation: row["generation"],
        status: !row["has_projected"] ? "empty" : row["has_fresh"] ? "fresh" : "stale",
      });
    },
    async fixed(generation, source, first, now) {
      if (!discoveryIdentifier(generation)) {
        return invalid();
      }
      if (integer(first, 12) < 1) {
        return invalid();
      }
      integer(now);
      const label = source === "recently_added" ? null : source;
      const result = await tx.query({
        text: `SELECT document.generation_id::text AS generation,
          document.title_id::text AS title_id,document.source_version,
          document.indexed_at::float8 AS indexed_at,
          document.visible_until::float8 AS visible_until,
          document.published_at::float8 AS published_at
          FROM discovery.rail_documents document
          JOIN discovery.generations generation ON generation.id=document.generation_id
          WHERE document.generation_id=$1::uuid
            AND generation.state IN ('ACTIVE','PREVIOUS')
            AND document.visible_until > $2::bigint
            AND ($3::text IS NULL OR document.editorial_labels ? $3::text)
          ORDER BY document.published_at DESC, document.title_id ASC
          LIMIT $4::integer`,
        values: [generation, now, label, first],
      });
      if (result.rowCount !== result.rows.length || result.rows.length > first) {
        return invalid();
      }
      return Object.freeze(result.rows.map((row) => railRow(row, generation)));
    },
    async genres(generation, first, now): Promise<readonly HomeGenreRows[]> {
      if (!discoveryIdentifier(generation)) {
        return invalid();
      }
      if (integer(first, 12) < 1) {
        return invalid();
      }
      integer(now);
      const result = await tx.query({
        text: `SELECT result.* FROM (WITH eligible AS (
            SELECT document.*, item.genre
            FROM discovery.rail_documents document
            JOIN discovery.generations generation ON generation.id=document.generation_id
            CROSS JOIN LATERAL jsonb_array_elements_text(document.genres) item(genre)
            WHERE document.generation_id=$1::uuid
              AND generation.state IN ('ACTIVE','PREVIOUS')
              AND document.visible_until > $2::bigint
          ), selected AS (
            SELECT genre,count(*)::integer AS available FROM eligible
            GROUP BY genre ORDER BY available DESC,genre ASC LIMIT 3
          ), ranked AS (
            SELECT eligible.*,
              row_number() OVER (PARTITION BY eligible.genre
                ORDER BY eligible.published_at DESC,eligible.title_id ASC) AS position
            FROM eligible JOIN selected USING (genre)
          )
          SELECT ranked.generation_id::text AS generation,
            ranked.title_id::text AS title_id,ranked.source_version,
            ranked.indexed_at::float8 AS indexed_at,
            ranked.visible_until::float8 AS visible_until,
            ranked.published_at::float8 AS published_at,
            ranked.genre,selected.available
          FROM ranked JOIN selected USING (genre)
          WHERE ranked.position <= $3::integer
        ) result ORDER BY result.available DESC,result.genre ASC,
          result.published_at DESC,result.title_id ASC`,
        values: [generation, now, first],
      });
      if (result.rowCount !== result.rows.length || result.rows.length > first * 3) {
        return invalid();
      }
      const groups: { genre: string; available: number; rows: HomeRailRow[] }[] = [];
      for (const raw of result.rows) {
        const value = discoveryRecord(raw, [
          "generation",
          "title_id",
          "source_version",
          "indexed_at",
          "visible_until",
          "published_at",
          "genre",
          "available",
        ]);
        if (
          !value ||
          typeof value["genre"] !== "string" ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value["genre"])
        ) {
          return invalid();
        }
        const available = integer(value["available"], 1_000_000);
        let group = groups.at(-1);
        if (group?.genre !== value["genre"]) {
          if (groups.some((entry) => entry.genre === value["genre"]) || groups.length >= 3) {
            return invalid();
          }
          group = { genre: value["genre"], available, rows: [] };
          groups.push(group);
        }
        if (group.available !== available || group.rows.length >= first) {
          return invalid();
        }
        group.rows.push(
          railRow(
            {
              generation: value["generation"],
              title_id: value["title_id"],
              source_version: value["source_version"],
              indexed_at: value["indexed_at"],
              visible_until: value["visible_until"],
              published_at: value["published_at"],
            },
            generation,
          ),
        );
      }
      return Object.freeze(
        groups.map((group) =>
          Object.freeze({
            genre: group.genre,
            available: group.available,
            rows: Object.freeze(group.rows),
          }),
        ),
      );
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

export function createPostgresHomeRailUnitOfWork(
  database: Pick<AsterPostgresAdapter, "transaction">,
): HomeRailUnitOfWork {
  return Object.freeze({
    async run<T>(
      work: (repository: HomeRailRepository) => Promise<T>,
      signal: AbortSignal,
    ): Promise<ProjectionStoreResult<T>> {
      if (signal.aborted) {
        return { status: "cancelled" };
      }
      try {
        const result = await database.transaction(
          async (tx) => ({ action: "rollback", value: await work(repository(tx)) }),
          AbortSignal.any([signal, AbortSignal.timeout(700)]),
        );
        return result.status === "rolled_back"
          ? { status: "completed", value: result.value }
          : failure(result, signal);
      } catch {
        return { status: "unavailable" };
      }
    },
  });
}
