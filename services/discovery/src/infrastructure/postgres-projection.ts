import { createHash } from "node:crypto";
import type {
  AsterPostgresAdapter,
  AsterPostgresTransaction,
  AsterPostgresTransactionResult,
} from "@aster/postgres";
import type {
  ProjectionRepository,
  ProjectionStoreResult,
  ProjectionUnitOfWork,
} from "../application/projection-ports.js";
import {
  discoveryIdentifier,
  discoveryRecord,
  normalizeTitleProjection,
  type TitleProjection,
} from "../domain/title-projection.js";
import { normalizeSearchText } from "../domain/search-input.js";

const invalid = (): never => {
  throw new Error("Invalid Discovery persistence state.");
};
const digest = (value: TitleProjection["document"]): string | null =>
  value === null ? null : createHash("sha256").update(JSON.stringify(value)).digest("hex");

function one(result: Readonly<{ rowCount: number; rows: readonly unknown[] }>) {
  return result.rowCount === 1 && result.rows.length === 1 ? result.rows[0] : invalid();
}

function repository(tx: AsterPostgresTransaction): ProjectionRepository {
  const value: ProjectionRepository = {
    async lockFence(titleId) {
      if (!discoveryIdentifier(titleId)) {
        return invalid();
      }
      const result = await tx.query({
        text: `SELECT jsonb_build_object('titleId', f.title_id, 'sourceVersion', f.source_version,
          'observedAt', f.observed_at::float8, 'visibleUntil', f.visible_until::float8,
          'document', CASE WHEN f.document_digest IS NULL THEN NULL ELSE jsonb_build_object(
            'defaultLocale', f.default_locale, 'localizations', COALESCE((SELECT jsonb_agg(
              jsonb_build_object('locale', l.locale, 'title', l.title, 'synopsis', l.synopsis) ORDER BY l.locale)
              FROM discovery.fence_localizations l WHERE l.title_id=f.title_id), '[]'::jsonb),
            'genres', f.genres, 'editorialLabels', f.editorial_labels,
            'releaseYear', f.release_year, 'publishedAt', f.published_at::float8) END,
          'projectionVersion', f.projection_version, 'indexedAt', f.indexed_at::float8,
          'triggerEventId', f.trigger_event_id) AS value
          FROM discovery.title_fences f WHERE f.title_id=$1::uuid FOR UPDATE`,
        values: [titleId],
      });
      if (result.rowCount === 0 && result.rows.length === 0) {
        return null;
      }
      const row = discoveryRecord(one(result), ["value"]);
      if (!row) {
        return invalid();
      }
      return normalizeTitleProjection(row["value"]) ?? invalid();
    },
    async targetGenerations() {
      const row = discoveryRecord(
        one(
          await tx.query({
            text: `SELECT active_generation::text AS active, building_generation::text AS building
            FROM discovery.generation_control WHERE singleton FOR SHARE`,
          }),
        ),
        ["active", "building"],
      );
      if (!row) {
        return invalid();
      }
      const values = [row["active"], row["building"]].filter(
        (value): value is string => value !== null,
      );
      if (
        values.length < 1 ||
        values.length > 2 ||
        new Set(values).size !== values.length ||
        !values.every(discoveryIdentifier)
      ) {
        return invalid();
      }
      return Object.freeze(values);
    },
    async saveFence(value) {
      const document = value.document;
      await tx.query({
        text: `INSERT INTO discovery.title_fences(title_id, source_version, projection_version,
          observed_at, visible_until, indexed_at, trigger_event_id, document_digest, default_locale,
          genres, editorial_labels, release_year, published_at)
          VALUES ($1::uuid,$2::integer,$3::smallint,$4::bigint,$5::bigint,$6::bigint,$7::uuid,$8::text,
            $9::text,$10::jsonb,$11::jsonb,$12::integer,$13::bigint)
          ON CONFLICT (title_id) DO UPDATE SET source_version=EXCLUDED.source_version,
            observed_at=EXCLUDED.observed_at, visible_until=EXCLUDED.visible_until,
            indexed_at=EXCLUDED.indexed_at, trigger_event_id=EXCLUDED.trigger_event_id,
            document_digest=EXCLUDED.document_digest, default_locale=EXCLUDED.default_locale,
            genres=EXCLUDED.genres, editorial_labels=EXCLUDED.editorial_labels,
            release_year=EXCLUDED.release_year, published_at=EXCLUDED.published_at`,
        values: [
          value.titleId,
          value.sourceVersion,
          value.projectionVersion,
          value.observedAt,
          value.visibleUntil,
          value.indexedAt,
          value.triggerEventId,
          digest(document),
          document?.defaultLocale ?? null,
          document === null ? null : JSON.stringify(document.genres),
          document === null ? null : JSON.stringify(document.editorialLabels),
          document?.releaseYear ?? null,
          document?.publishedAt ?? null,
        ],
      });
      await tx.query({
        text: "DELETE FROM discovery.fence_localizations WHERE title_id=$1::uuid",
        values: [value.titleId],
      });
      for (const localization of document?.localizations ?? []) {
        await tx.query({
          text: `INSERT INTO discovery.fence_localizations(title_id,locale,title,synopsis)
            VALUES ($1::uuid,$2::text,$3::text,$4::text)`,
          values: [value.titleId, localization.locale, localization.title, localization.synopsis],
        });
      }
    },
    async saveGeneration(generation, value) {
      if (!discoveryIdentifier(generation)) {
        return invalid();
      }
      const document = value.document;
      await tx.query({
        text: `INSERT INTO discovery.generation_titles(generation_id,title_id,source_version,
          projection_version,observed_at,visible_until,indexed_at,trigger_event_id,document_digest)
          VALUES ($1::uuid,$2::uuid,$3::integer,$4::smallint,$5::bigint,$6::bigint,$7::bigint,$8::uuid,$9::text)
          ON CONFLICT (generation_id,title_id) DO UPDATE SET source_version=EXCLUDED.source_version,
            observed_at=EXCLUDED.observed_at,visible_until=EXCLUDED.visible_until,indexed_at=EXCLUDED.indexed_at,
            trigger_event_id=EXCLUDED.trigger_event_id,document_digest=EXCLUDED.document_digest`,
        values: [
          generation,
          value.titleId,
          value.sourceVersion,
          value.projectionVersion,
          value.observedAt,
          value.visibleUntil,
          value.indexedAt,
          value.triggerEventId,
          digest(document),
        ],
      });
      await tx.query({
        text: "DELETE FROM discovery.search_documents WHERE generation_id=$1::uuid AND title_id=$2::uuid",
        values: [generation, value.titleId],
      });
      for (const localization of document?.localizations ?? []) {
        await tx.query({
          text: `INSERT INTO discovery.search_documents(generation_id,title_id,locale,
            normalized_title,normalized_synopsis,normalized_genres)
            VALUES ($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::text)`,
          values: [
            generation,
            value.titleId,
            localization.locale,
            normalizeSearchText(localization.title),
            normalizeSearchText(localization.synopsis),
            normalizeSearchText(document?.genres.join(" ") ?? ""),
          ],
        });
      }
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

export function createPostgresProjectionUnitOfWork(
  database: Pick<AsterPostgresAdapter, "transaction">,
): ProjectionUnitOfWork {
  const unit: ProjectionUnitOfWork = {
    async run<T>(
      work: (repository: ProjectionRepository) => Promise<T>,
      signal: AbortSignal,
    ): Promise<ProjectionStoreResult<T>> {
      if (signal.aborted) {
        return { status: "cancelled" };
      }
      try {
        const result = await database.transaction(
          async (tx) => ({ action: "commit", value: await work(repository(tx)) }),
          AbortSignal.any([signal, AbortSignal.timeout(1500)]),
        );
        return result.status === "committed"
          ? { status: "completed", value: result.value }
          : failure(result, signal);
      } catch {
        return { status: "indeterminate" };
      }
    },
  };
  return Object.freeze(unit);
}
