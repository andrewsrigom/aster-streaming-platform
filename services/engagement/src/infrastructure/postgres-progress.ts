import type {
  AsterPostgresAdapter,
  AsterPostgresRows,
  AsterPostgresTransaction,
  AsterPostgresTransactionResult,
} from "@aster/postgres";
import type {
  ProgressKey,
  ProgressPorts,
  ProgressReceipt,
  ProgressResult,
  ProgressTransaction,
} from "../application/progress-ports.js";
import { normalizeProgressState, progressIdentifier } from "../domain/progress.js";

class CapacityExceeded extends Error {}

function invalid(): never {
  throw new Error("Invalid Engagement persistence result.");
}
function field(row: unknown, name: string): unknown {
  return typeof row === "object" && row !== null
    ? Object.getOwnPropertyDescriptor(row, name)?.value
    : undefined;
}
function integer(value: unknown, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > maximum) {
    return invalid();
  }
  return value;
}
function one(result: AsterPostgresRows): unknown {
  if (result.rowCount !== 1 || result.rows.length !== 1) {
    return invalid();
  }
  return result.rows[0];
}
function keyValues(key: ProgressKey) {
  if (![key.accountId, key.profileId, key.titleId].every(progressIdentifier)) {
    return invalid();
  }
  return [key.accountId, key.profileId, key.titleId];
}

async function receipt(
  tx: AsterPostgresTransaction,
  key: ProgressKey,
  idempotencyKey: string,
): Promise<ProgressReceipt | null> {
  if (!progressIdentifier(idempotencyKey)) {
    return invalid();
  }
  const found = await tx.query({
    text: `SELECT r.request_digest AS digest, r.result, r.title_id::text AS title, r.expires_at::float8 AS expiry
      FROM engagement.progress_receipts r JOIN engagement.profile_guards g USING (profile_id, account_id)
      WHERE r.account_id = $1::uuid AND r.profile_id = $2::uuid
        AND r.idempotency_key = $3::uuid AND NOT g.deleted`,
    values: [...keyValues(key).slice(0, 2), idempotencyKey],
  });
  if (found.rowCount === 0 && found.rows.length === 0) {
    return null;
  }
  const row = one(found);
  const result = normalizeProgressState(field(row, "result"));
  const digest = field(row, "digest");
  if (
    !result ||
    result.accountId !== key.accountId ||
    result.profileId !== key.profileId ||
    result.titleId !== field(row, "title") ||
    typeof digest !== "string" ||
    !/^[a-f0-9]{64}$/u.test(digest)
  ) {
    return invalid();
  }
  return {
    ...key,
    titleId: result.titleId,
    idempotencyKey,
    requestDigest: digest,
    result,
    expiresAt: integer(field(row, "expiry"), 253_402_300_799),
  };
}

async function availableSlot(
  tx: AsterPostgresTransaction,
  table: "progress" | "progress_receipts" | "outbox" | "profile_guards",
  profileId: string,
): Promise<number> {
  const global = table === "profile_guards";
  const maximum = table === "progress" ? 256 : 1024;
  const result = await tx.query({
    text: `SELECT candidate.slot FROM generate_series(1, ${maximum}) AS candidate(slot)
      WHERE NOT EXISTS (SELECT 1 FROM engagement.${table} occupied
        WHERE occupied.slot = candidate.slot ${global ? "" : "AND occupied.profile_id = $1::uuid"})
      ORDER BY candidate.slot LIMIT 1`,
    values: global ? [] : [profileId],
  });
  if (result.rowCount === 0 && result.rows.length === 0) {
    throw new CapacityExceeded();
  }
  const slot = integer(field(one(result), "slot"), maximum);
  if (slot === 0) {
    return invalid();
  }
  return slot;
}

function transaction(tx: AsterPostgresTransaction): ProgressTransaction {
  let locked: ProgressKey | undefined;
  const requireKey = (key: ProgressKey) => {
    const expected = locked;
    if (!expected || keyValues(key).some((value, i) => value !== keyValues(expected)[i])) {
      return invalid();
    }
  };
  return {
    async lock(key) {
      if (locked) {
        return invalid();
      }
      keyValues(key);
      const selectGuard = () =>
        tx.query({
          text: "SELECT account_id::text AS account, deleted FROM engagement.profile_guards WHERE profile_id = $1::uuid FOR UPDATE",
          values: [key.profileId],
        });
      let guard = await selectGuard();
      if (guard.rowCount === 0) {
        // Admission is only shared by new profiles; hot existing profiles never take this lock.
        one(
          await tx.query({
            text: "SELECT singleton FROM engagement.profile_admission WHERE singleton FOR UPDATE",
          }),
        );
        guard = await selectGuard();
        if (guard.rowCount === 0) {
          const slot = await availableSlot(tx, "profile_guards", key.profileId);
          guard = await tx.query({
            text: `INSERT INTO engagement.profile_guards (profile_id, account_id, slot)
              VALUES ($1::uuid, $2::uuid, $3::smallint) RETURNING account_id::text AS account, deleted`,
            values: [key.profileId, key.accountId, slot],
          });
        }
      }
      const row = one(guard);
      const deleted = field(row, "deleted");
      if (typeof deleted !== "boolean") {
        return invalid();
      }
      if (deleted || field(row, "account") !== key.accountId) {
        return { deleted: true, current: null };
      }
      locked = Object.freeze({ ...key });
      const result = await tx.query({
        text: `SELECT jsonb_build_object('id', id, 'accountId', account_id, 'profileId', profile_id,
          'titleId', title_id, 'playbackSessionId', playback_session_id, 'sequence', sequence,
          'version', version, 'positionMs', position_ms, 'durationMs', duration_ms, 'status', status,
          'occurredAt', occurred_at, 'updatedAt', updated_at) AS state
          FROM engagement.progress WHERE account_id = $1::uuid AND profile_id = $2::uuid AND title_id = $3::uuid`,
        values: keyValues(key),
      });
      if (result.rowCount === 0 && result.rows.length === 0) {
        return { deleted: false, current: null };
      }
      const current = normalizeProgressState(field(one(result), "state"));
      if (!current || keyValues(current).some((value, i) => value !== keyValues(key)[i])) {
        return invalid();
      }
      return { deleted: false, current };
    },
    async pruneReceipts(key, now, maximum) {
      requireKey(key);
      integer(now, 253_402_300_799);
      integer(maximum, 64);
      await tx.query({
        text: `DELETE FROM engagement.progress_receipts WHERE profile_id = $1::uuid AND slot IN (
          SELECT slot FROM engagement.progress_receipts WHERE profile_id = $1::uuid
            AND expires_at <= LEAST($2::bigint, FLOOR(EXTRACT(EPOCH FROM clock_timestamp())))
          ORDER BY expires_at, slot LIMIT $3::integer)`,
        values: [key.profileId, now, maximum],
      });
    },
    findReceipt(key, idempotencyKey) {
      requireKey(key);
      return receipt(tx, key, idempotencyKey);
    },
    async retainedCounts(key) {
      requireKey(key);
      const row = one(
        await tx.query({
          text: `SELECT (SELECT count(*)::integer FROM engagement.progress_receipts WHERE profile_id = $1::uuid) AS receipts,
          (SELECT count(*)::integer FROM engagement.outbox WHERE profile_id = $1::uuid) AS outbox`,
          values: [key.profileId],
        }),
      );
      return {
        receipts: integer(field(row, "receipts"), 1024),
        outbox: integer(field(row, "outbox"), 1024),
      };
    },
    async save(value, authority) {
      requireKey(value);
      const state = normalizeProgressState(value);
      if (!state) {
        return invalid();
      }
      integer(authority.checkedAt, 253_402_300_799);
      integer(authority.expiresAt, 253_402_300_799);
      const values = [
        state.id,
        ...keyValues(state),
        state.playbackSessionId,
        state.sequence,
        state.version,
        state.positionMs,
        state.durationMs,
        state.status,
        state.occurredAt,
        state.updatedAt,
        authority.checkedAt,
        authority.expiresAt,
      ];
      const result =
        state.version === 1
          ? await tx.query({
              text: `INSERT INTO engagement.progress
            (id, account_id, profile_id, title_id, playback_session_id, sequence, version,
             position_ms, duration_ms, status, occurred_at, updated_at, authority_checked_at, authority_expires_at, slot)
            VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::integer, $7::integer,
              $8::integer, $9::integer, $10::text, $11::bigint, $12::bigint, $13::bigint, $14::bigint, $15::smallint) RETURNING id`,
              values: [...values, await availableSlot(tx, "progress", state.profileId)],
            })
          : await tx.query({
              text: `UPDATE engagement.progress SET playback_session_id = $5::uuid, sequence = $6::integer,
            version = $7::integer, position_ms = $8::integer, duration_ms = $9::integer, status = $10::text,
            occurred_at = $11::bigint, updated_at = $12::bigint, authority_checked_at = $13::bigint, authority_expires_at = $14::bigint
            WHERE id = $1::uuid AND account_id = $2::uuid AND profile_id = $3::uuid AND title_id = $4::uuid RETURNING id`,
              values,
            });
      if (field(one(result), "id") !== state.id) {
        return invalid();
      }
    },
    async writeReceipt(value) {
      requireKey(value);
      const slot = await availableSlot(tx, "progress_receipts", value.profileId);
      one(
        await tx.query({
          text: `INSERT INTO engagement.progress_receipts
          (account_id, profile_id, title_id, idempotency_key, slot, request_digest, result, expires_at)
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::smallint, $6::text, $7::jsonb, $8::bigint) RETURNING slot`,
          values: [
            ...keyValues(value),
            value.idempotencyKey,
            slot,
            value.requestDigest,
            JSON.stringify(value.result),
            value.expiresAt,
          ],
        }),
      );
    },
    async appendOutbox(event) {
      if (
        !locked ||
        event.payload.profileId !== locked.profileId ||
        event.payload.titleId !== locked.titleId
      ) {
        return invalid();
      }
      const slot = await availableSlot(tx, "outbox", locked.profileId);
      one(
        await tx.query({
          text: `INSERT INTO engagement.outbox (event_id, profile_id, aggregate_id, aggregate_version, slot, event)
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4::integer, $5::smallint, $6::jsonb) RETURNING slot`,
          values: [
            event.eventId,
            locked.profileId,
            event.aggregate.id,
            event.aggregate.version,
            slot,
            JSON.stringify(event),
          ],
        }),
      );
    },
  };
}

function failed<T>(
  result: AsterPostgresTransactionResult<T>,
  signal: AbortSignal,
): ProgressResult<never> {
  return {
    status:
      result.status === "indeterminate"
        ? "indeterminate"
        : result.status === "aborted" && signal.aborted
          ? "cancelled"
          : result.status === "rejected" && result.reason === "capacity_exceeded"
            ? "backpressure"
            : "unavailable",
  };
}

export function createPostgresProgress(
  database: Pick<AsterPostgresAdapter, "transaction">,
): Pick<ProgressPorts, "receipts" | "transactions"> {
  return {
    receipts: {
      async read(key, idempotencyKey, signal) {
        if (signal.aborted) {
          return { status: "cancelled" };
        }
        try {
          const result = await database.transaction(
            async (tx) => ({
              action: "rollback",
              value: await receipt(tx, key, idempotencyKey),
            }),
            AbortSignal.any([signal, AbortSignal.timeout(1000)]),
          );
          return result.status === "rolled_back" || result.status === "committed"
            ? { status: "completed", value: result.value }
            : failed(result, signal);
        } catch {
          return { status: "unavailable" };
        }
      },
    },
    transactions: {
      async run(work, signal) {
        if (signal.aborted) {
          return { status: "cancelled" };
        }
        try {
          const result = await database.transaction(
            async (tx) => {
              try {
                const value = await work(transaction(tx));
                return { action: value.status === "completed" ? "commit" : "rollback", value };
              } catch (error) {
                if (error instanceof CapacityExceeded) {
                  return { action: "rollback", value: { status: "backpressure" } as const };
                }
                throw error;
              }
            },
            AbortSignal.any([signal, AbortSignal.timeout(1000)]),
          );
          if (result.status === "committed") {
            return result.value;
          }
          if (result.status === "rolled_back" && result.value.status !== "completed") {
            return result.value;
          }
          return failed(result, signal);
        } catch {
          // A broken adapter may throw after COMMIT dispatch; only a same-key retry is safe.
          return { status: "indeterminate" };
        }
      },
    },
  };
}
