import type { AsterPostgresAdapter } from "@aster/postgres";
import type { PlaybackSessionPorts, SessionWrite } from "../application/session-ports.js";

function invalidRow(): never {
  throw new Error("Invalid Playback session-store result.");
}

export function createPostgresPlaybackSessions(
  database: Pick<AsterPostgresAdapter, "transaction">,
): PlaybackSessionPorts["sessions"] {
  return Object.freeze({
    async create(session, signal): Promise<SessionWrite> {
      const cancelled = (): boolean => signal.aborted;
      if (cancelled()) {
        return { status: "cancelled" };
      }
      try {
        const result = await database.transaction<SessionWrite>(
          async (tx) => {
            const lock = await tx.query({
              text: "SELECT singleton FROM playback.session_admission WHERE singleton = true FOR UPDATE",
            });
            if (lock.rowCount !== 1) {
              return invalidRow();
            }
            await tx.query({
              text: `DELETE FROM playback.sessions WHERE id IN (
              SELECT id FROM playback.sessions
              WHERE expires_at <= FLOOR(EXTRACT(EPOCH FROM clock_timestamp())) - 86400
              ORDER BY expires_at, id LIMIT 64)`,
            });
            const available = await tx.query({
              text: `SELECT candidate.slot FROM generate_series(1, 4096) AS candidate(slot)
              WHERE NOT EXISTS (SELECT 1 FROM playback.sessions WHERE slot = candidate.slot)
              ORDER BY candidate.slot LIMIT 1`,
            });
            if (available.rowCount === 0) {
              return { action: "rollback", value: { status: "limit_exceeded" } };
            }
            const row = available.rows[0];
            const slot: unknown =
              typeof row === "object" && row !== null
                ? Object.getOwnPropertyDescriptor(row, "slot")?.value
                : undefined;
            if (
              available.rowCount !== 1 ||
              typeof slot !== "number" ||
              !Number.isInteger(slot) ||
              slot < 1 ||
              slot > 4096
            ) {
              return invalidRow();
            }
            const inserted = await tx.query({
              text: `INSERT INTO playback.sessions
              (id, slot, title_id, publication_id, catalog_version, catalog_checked_at, manifest_url, created_at, expires_at, correlation_id)
              SELECT $1::uuid, $2::smallint, $3::uuid, $4::uuid, $5::integer, $6::bigint, $7::text, $8::bigint, $9::bigint, $10::uuid
              WHERE $9::bigint > FLOOR(EXTRACT(EPOCH FROM clock_timestamp()))
                AND $6::bigint BETWEEN FLOOR(EXTRACT(EPOCH FROM clock_timestamp())) - 2 AND FLOOR(EXTRACT(EPOCH FROM clock_timestamp()))
              RETURNING id`,
              values: [
                session.id,
                slot,
                session.titleId,
                session.publicationId,
                session.catalogVersion,
                session.catalogCheckedAt,
                session.manifestUrl,
                session.createdAt,
                session.expiresAt,
                session.correlationId,
              ],
            });
            if (inserted.rowCount === 0) {
              return { action: "rollback", value: { status: "unavailable" } };
            }
            const value = inserted.rows[0];
            if (
              inserted.rowCount !== 1 ||
              typeof value !== "object" ||
              value === null ||
              Object.getOwnPropertyDescriptor(value, "id")?.value !== session.id
            ) {
              return invalidRow();
            }
            return { action: "commit", value: { status: "completed" } };
          },
          AbortSignal.any([signal, AbortSignal.timeout(1000)]),
        );
        if (result.status === "committed" || result.status === "rolled_back") {
          return result.value;
        }
        return {
          status:
            result.status === "indeterminate"
              ? "indeterminate"
              : result.status === "aborted"
                ? cancelled()
                  ? "cancelled"
                  : "unavailable"
                : result.status === "rejected" && result.reason === "capacity_exceeded"
                  ? "limit_exceeded"
                  : "unavailable",
        };
      } catch {
        // A nonconforming adapter can throw after dispatch; never infer rollback or retry it.
        return { status: "indeterminate" };
      }
    },
  });
}
