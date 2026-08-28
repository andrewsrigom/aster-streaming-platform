import type { AsterPostgresAdapter } from "@aster/postgres";
import type { PlaybackSessionReadPort } from "../application/inspect-session.js";

export function createPostgresPlaybackSessionReader(
  database: Pick<AsterPostgresAdapter, "transaction">,
): PlaybackSessionReadPort {
  return {
    async read(sessionId, titleId, signal) {
      const cancelled = (): boolean => signal.aborted;
      if (cancelled()) {
        return { status: "cancelled" };
      }
      try {
        const result = await database.transaction(
          async (tx) => {
            const rows = await tx.query({
              text: `SELECT id::text AS "sessionId", title_id::text AS "titleId",
              created_at::float8 AS "createdAt", expires_at::float8 AS "expiresAt"
              FROM playback.sessions WHERE id = $1::uuid AND title_id = $2::uuid
                AND expires_at > FLOOR(EXTRACT(EPOCH FROM clock_timestamp()))`,
              values: [sessionId, titleId],
            });
            if (rows.rowCount < 0 || rows.rowCount > 1 || rows.rows.length !== rows.rowCount) {
              throw new Error("Invalid Playback read result.");
            }
            return { action: "rollback", value: rows.rowCount === 0 ? null : rows.rows[0] };
          },
          AbortSignal.any([signal, AbortSignal.timeout(1000)]),
        );
        return result.status === "rolled_back"
          ? { status: "completed", value: result.value }
          : { status: cancelled() ? "cancelled" : "unavailable" };
      } catch {
        return { status: cancelled() ? "cancelled" : "unavailable" };
      }
    },
  };
}
