import type { AsterPostgresAdapter } from "@aster/postgres";
import type {
  EngagementFieldStore,
  EngagementFieldRow,
} from "../application/read-engagement-fields.js";
import { engagementPairKey, normalizeEngagementPair } from "../domain/engagement-fields.js";
import { normalizeProgressState, progressIdentifier } from "../domain/progress.js";
import { field, invalid } from "./engagement-persistence.js";

export function createPostgresEngagementFields(
  database: Pick<AsterPostgresAdapter, "transaction">,
): EngagementFieldStore {
  return {
    async read(keys, signal) {
      const cancelled = () => signal.aborted;
      if (cancelled()) {
        return { status: "cancelled" };
      }
      if (
        keys.length < 1 ||
        keys.length > 20 ||
        new Set(keys.map(engagementPairKey)).size !== keys.length ||
        new Set(keys.map((key) => key.accountId)).size !== 1 ||
        keys.some(
          (key) =>
            !progressIdentifier(key.accountId) ||
            !normalizeEngagementPair({ profileId: key.profileId, titleId: key.titleId }),
        )
      ) {
        return { status: "invalid_input" };
      }
      try {
        const result = await database.transaction(
          async (tx) => {
            const answer = await tx.query({
              // One <=20-row read, preserving missing pairs and the shared 64-row adapter bound.
              text: `SELECT requested.ordinality::integer AS ordinal,
              requested.key->>'accountId' AS account, requested.key->>'profileId' AS profile,
              requested.key->>'titleId' AS title,
              COALESCE(g.deleted OR g.account_id <> (requested.key->>'accountId')::uuid, false) AS deleted,
              w.id IS NOT NULL AS present,
              CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
                'id', p.id, 'accountId', p.account_id, 'profileId', p.profile_id,
                'titleId', p.title_id, 'playbackSessionId', p.playback_session_id,
                'sequence', p.sequence, 'version', p.version, 'positionMs', p.position_ms,
                'durationMs', p.duration_ms, 'status', p.status,
                'occurredAt', p.occurred_at, 'updatedAt', p.updated_at) END AS progress
              FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS requested(key, ordinality)
              LEFT JOIN engagement.profile_guards g ON g.profile_id = (requested.key->>'profileId')::uuid
              LEFT JOIN engagement.progress p ON p.profile_id = g.profile_id AND p.account_id = g.account_id
                AND p.account_id = (requested.key->>'accountId')::uuid AND NOT g.deleted
                AND p.title_id = (requested.key->>'titleId')::uuid
              LEFT JOIN engagement.watchlist_entries w ON w.profile_id = g.profile_id AND w.account_id = g.account_id
                AND w.account_id = (requested.key->>'accountId')::uuid AND NOT g.deleted
                AND w.title_id = (requested.key->>'titleId')::uuid
              ORDER BY requested.ordinality LIMIT 20`,
              values: [JSON.stringify(keys)],
            });
            if (answer.rowCount !== keys.length || answer.rows.length !== keys.length) {
              invalid();
            }
            const rows: EngagementFieldRow[] = answer.rows.map((row, index) => {
              const key = keys[index];
              const deleted = field(row, "deleted");
              const present = field(row, "present");
              const raw = field(row, "progress");
              const progress = raw === null ? null : normalizeProgressState(raw);
              if (
                !key ||
                field(row, "ordinal") !== index + 1 ||
                field(row, "account") !== key.accountId ||
                field(row, "profile") !== key.profileId ||
                field(row, "title") !== key.titleId ||
                typeof deleted !== "boolean" ||
                typeof present !== "boolean" ||
                progress === undefined ||
                (deleted && (present || progress !== null)) ||
                (progress &&
                  (progress.accountId !== key.accountId ||
                    progress.profileId !== key.profileId ||
                    progress.titleId !== key.titleId))
              ) {
                return invalid();
              }
              return Object.freeze({ ...key, deleted, progress, inWatchlist: present });
            });
            return { action: "rollback", value: Object.freeze(rows) };
          },
          AbortSignal.any([signal, AbortSignal.timeout(1000)]),
        );
        if (cancelled()) {
          return { status: "cancelled" };
        }
        return result.status === "rolled_back"
          ? { status: "completed", value: result.value }
          : { status: "unavailable" };
      } catch {
        return { status: cancelled() ? "cancelled" : "unavailable" };
      }
    },
  };
}
