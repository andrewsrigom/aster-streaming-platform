import type { AsterPostgresAdapter } from "@aster/postgres";
import type { ProgressReadStore } from "../application/read-progress.js";
import { normalizeProgressState, progressIdentifier } from "../domain/progress.js";
import { normalizeProgressPageInput, progressCursor } from "../domain/progress-page.js";

export function createPostgresProgressRead(
  database: Pick<AsterPostgresAdapter, "transaction">,
): ProgressReadStore {
  return {
    async page(key, signal) {
      const cancelled = () => signal.aborted;
      if (cancelled()) {
        return { status: "cancelled" };
      }
      try {
        const { input, kind, accountId } = key;
        const validated = normalizeProgressPageInput(
          {
            profileId: input.profileId,
            first: input.first,
            after: input.after ? progressCursor(input.profileId, kind, input.after) : null,
          },
          kind,
        );
        if (!validated || !progressIdentifier(accountId)) {
          return { status: "invalid_input" };
        }
        const maximum = kind === "continue" ? 256 : input.first + 1;
        const result = await database.transaction(
          async (tx) => {
            const rows = await tx.query({
              // One bounded aggregate respects the adapter's 64-row result ceiling.
              text: `SELECT COALESCE(jsonb_agg(candidate.state ORDER BY candidate.updated_at DESC, candidate.id DESC), '[]'::jsonb) AS states
              FROM (SELECT p.updated_at, p.id, jsonb_build_object('id', p.id, 'accountId', p.account_id, 'profileId', p.profile_id,
              'titleId', p.title_id, 'playbackSessionId', p.playback_session_id, 'sequence', p.sequence,
              'version', p.version, 'positionMs', p.position_ms, 'durationMs', p.duration_ms,
              'status', p.status, 'occurredAt', p.occurred_at, 'updatedAt', p.updated_at) AS state
              FROM engagement.progress p JOIN engagement.profile_guards g USING (profile_id, account_id)
              WHERE p.account_id = $1::uuid AND p.profile_id = $2::uuid AND NOT g.deleted
              ${kind === "continue" ? "AND p.status = 'IN_PROGRESS'" : ""}
              ${input.after ? "AND (p.updated_at, p.id) < ($4::bigint, $5::uuid)" : ""}
              ORDER BY p.updated_at DESC, p.id DESC LIMIT $3::integer) AS candidate`,
              values: [
                accountId,
                input.profileId,
                maximum,
                ...(input.after ? [input.after.updatedAt, input.after.id] : []),
              ],
            });
            if (rows.rowCount !== 1 || rows.rows.length !== 1) {
              throw new Error("Invalid progress read bound.");
            }
            const raw = rows.rows[0];
            const states: unknown =
              typeof raw === "object" && raw !== null
                ? Object.getOwnPropertyDescriptor(raw, "states")?.value
                : undefined;
            if (!Array.isArray(states) || states.length > maximum) {
              throw new Error("Invalid progress collection bound.");
            }
            const page = Array.from(states, (state: unknown) => {
              const value = normalizeProgressState(state);
              if (!value || value.accountId !== accountId || value.profileId !== input.profileId) {
                throw new Error("Invalid progress read identity.");
              }
              return value;
            });
            return { action: "rollback", value: Object.freeze(page) };
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
