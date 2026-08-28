import type {
  AsterPostgresAdapter,
  AsterPostgresTransaction,
  AsterPostgresTransactionResult,
} from "@aster/postgres";
import type {
  WatchlistOwner,
  WatchlistReceipt,
  WatchlistResult,
  WatchlistStore,
  WatchlistTransaction,
} from "../application/watchlist-ports.js";
import { normalizeWatchlistChange, normalizeWatchlistEntry } from "../domain/watchlist.js";
import { progressIdentifier } from "../domain/progress.js";
import {
  availableSlot,
  CapacityExceeded,
  field,
  integer,
  invalid,
  lockEngagementProfile,
  one,
} from "./engagement-persistence.js";

function ownerValues(owner: WatchlistOwner) {
  if (!progressIdentifier(owner.accountId) || !progressIdentifier(owner.profileId)) {
    return invalid();
  }
  return [owner.accountId, owner.profileId];
}
async function receipt(
  tx: AsterPostgresTransaction,
  owner: WatchlistOwner,
  key: string,
): Promise<WatchlistReceipt | null> {
  if (!progressIdentifier(key)) {
    return invalid();
  }
  const result = await tx.query({
    text: `SELECT r.request_digest AS digest, r.result, r.expires_at::float8 AS expiry
      FROM engagement.watchlist_receipts r JOIN engagement.profile_guards g USING (profile_id, account_id)
      WHERE r.account_id = $1::uuid AND r.profile_id = $2::uuid AND r.idempotency_key = $3::uuid AND NOT g.deleted`,
    values: [...ownerValues(owner), key],
  });
  if (result.rowCount === 0 && result.rows.length === 0) {
    return null;
  }
  const row = one(result);
  const change = normalizeWatchlistChange(field(row, "result"));
  const digest = field(row, "digest");
  if (
    !change ||
    change.accountId !== owner.accountId ||
    change.profileId !== owner.profileId ||
    typeof digest !== "string" ||
    !/^[a-f0-9]{64}$/u.test(digest)
  ) {
    return invalid();
  }
  return {
    ...owner,
    idempotencyKey: key,
    requestDigest: digest,
    result: change,
    expiresAt: integer(field(row, "expiry"), 253_402_300_799),
  };
}

function transaction(tx: AsterPostgresTransaction): WatchlistTransaction {
  let locked: WatchlistOwner | undefined;
  const requireOwner = (owner: WatchlistOwner) => {
    const expected = locked;
    if (!expected || ownerValues(owner).some((value, i) => value !== ownerValues(expected)[i])) {
      return invalid();
    }
  };
  return {
    async lock(owner) {
      if (locked) {
        return invalid();
      }
      if (!(await lockEngagementProfile(tx, owner))) {
        return { deleted: true, current: null };
      }
      locked = Object.freeze({ accountId: owner.accountId, profileId: owner.profileId });
      const result = await tx.query({
        text: `SELECT jsonb_build_object('id', id, 'accountId', account_id, 'profileId', profile_id,
          'titleId', title_id, 'present', present, 'version', version, 'updatedAt', updated_at) AS state
          FROM engagement.watchlists WHERE account_id = $1::uuid AND profile_id = $2::uuid`,
        values: ownerValues(owner),
      });
      if (result.rowCount === 0 && result.rows.length === 0) {
        return { deleted: false, current: null };
      }
      const current = normalizeWatchlistChange(field(one(result), "state"));
      if (
        !current ||
        current.accountId !== owner.accountId ||
        current.profileId !== owner.profileId
      ) {
        return invalid();
      }
      return { deleted: false, current };
    },
    async pruneReceipts(owner, now) {
      requireOwner(owner);
      integer(now, 253_402_300_799);
      await tx.query({
        text: `DELETE FROM engagement.watchlist_receipts WHERE profile_id = $1::uuid AND slot IN (
          SELECT slot FROM engagement.watchlist_receipts WHERE profile_id = $1::uuid
          AND expires_at <= LEAST($2::bigint, FLOOR(EXTRACT(EPOCH FROM clock_timestamp())))
          ORDER BY expires_at, slot LIMIT 64)`,
        values: [owner.profileId, now],
      });
    },
    receipt(owner, key) {
      requireOwner(owner);
      return receipt(tx, owner, key);
    },
    async counts(owner) {
      requireOwner(owner);
      const row = one(
        await tx.query({
          text: `SELECT (SELECT count(*)::integer FROM engagement.watchlist_receipts WHERE profile_id = $1::uuid) AS receipts,
          (SELECT count(*)::integer FROM engagement.outbox WHERE profile_id = $1::uuid) AS outbox`,
          values: [owner.profileId],
        }),
      );
      return {
        receipts: integer(field(row, "receipts"), 1024),
        outbox: integer(field(row, "outbox"), 1024),
      };
    },
    async save(value, authority, entryId) {
      requireOwner(value);
      const change = normalizeWatchlistChange(value);
      if (!change || !progressIdentifier(entryId)) {
        return invalid();
      }
      integer(authority.checkedAt, 253_402_300_799);
      integer(authority.expiresAt, 253_402_300_799);
      const values = [
        change.id,
        ...ownerValues(change),
        change.titleId,
        change.present,
        change.version,
        change.updatedAt,
        authority.checkedAt,
        authority.expiresAt,
      ];
      const result =
        change.version === 1
          ? await tx.query({
              text: `INSERT INTO engagement.watchlists
            (id, account_id, profile_id, title_id, present, version, updated_at, authority_checked_at, authority_expires_at)
            VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::boolean,$6::integer,$7::bigint,$8::bigint,$9::bigint) RETURNING id`,
              values,
            })
          : await tx.query({
              text: `UPDATE engagement.watchlists SET title_id=$4::uuid, present=$5::boolean, version=$6::integer,
            updated_at=$7::bigint, authority_checked_at=$8::bigint, authority_expires_at=$9::bigint
            WHERE id=$1::uuid AND account_id=$2::uuid AND profile_id=$3::uuid RETURNING id`,
              values,
            });
      if (field(one(result), "id") !== change.id) {
        return invalid();
      }
      if (change.present) {
        const existing = await tx.query({
          text: "SELECT id FROM engagement.watchlist_entries WHERE account_id=$1::uuid AND profile_id=$2::uuid AND title_id=$3::uuid",
          values: [...ownerValues(change), change.titleId],
        });
        if (existing.rowCount === 0 && existing.rows.length === 0) {
          const slot = await availableSlot(tx, "watchlist_entries", change.profileId);
          one(
            await tx.query({
              text: `INSERT INTO engagement.watchlist_entries (id, account_id, profile_id, title_id, slot, added_at)
              VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::smallint,$6::bigint) RETURNING id`,
              values: [entryId, ...ownerValues(change), change.titleId, slot, change.updatedAt],
            }),
          );
        } else if (!progressIdentifier(field(one(existing), "id"))) {
          return invalid();
        }
      } else {
        const removed = await tx.query({
          text: "DELETE FROM engagement.watchlist_entries WHERE account_id=$1::uuid AND profile_id=$2::uuid AND title_id=$3::uuid",
          values: [...ownerValues(change), change.titleId],
        });
        if (removed.rowCount > 1) {
          return invalid();
        }
      }
    },
    async writeReceipt(value) {
      requireOwner(value);
      if (
        !progressIdentifier(value.idempotencyKey) ||
        !normalizeWatchlistChange(value.result) ||
        !/^[a-f0-9]{64}$/u.test(value.requestDigest)
      ) {
        return invalid();
      }
      integer(value.expiresAt, 253_402_300_799);
      const slot = await availableSlot(tx, "watchlist_receipts", value.profileId);
      one(
        await tx.query({
          text: `INSERT INTO engagement.watchlist_receipts (account_id, profile_id, idempotency_key, slot, request_digest, result, expires_at)
          VALUES ($1::uuid,$2::uuid,$3::uuid,$4::smallint,$5::text,$6::jsonb,$7::bigint) RETURNING slot`,
          values: [
            ...ownerValues(value),
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
      if (!locked || event.payload.profileId !== locked.profileId) {
        return invalid();
      }
      const slot = await availableSlot(tx, "outbox", locked.profileId);
      one(
        await tx.query({
          text: `INSERT INTO engagement.outbox (event_id, profile_id, aggregate_id, aggregate_version, slot, event)
          VALUES ($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::smallint,$6::jsonb) RETURNING slot`,
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
): WatchlistResult<never> {
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

export function createPostgresWatchlist(
  database: Pick<AsterPostgresAdapter, "transaction">,
): WatchlistStore {
  async function read<T>(
    work: (tx: AsterPostgresTransaction) => Promise<T>,
    signal: AbortSignal,
  ): Promise<WatchlistResult<T>> {
    if (signal.aborted) {
      return { status: "cancelled" };
    }
    try {
      const result = await database.transaction(
        async (tx) => ({ action: "rollback", value: await work(tx) }),
        AbortSignal.any([signal, AbortSignal.timeout(1000)]),
      );
      return result.status === "rolled_back"
        ? { status: "completed", value: result.value }
        : failed(result, signal);
    } catch {
      return { status: "unavailable" };
    }
  }
  return {
    receipt: (owner, key, signal) => read((tx) => receipt(tx, owner, key), signal),
    candidates: (owner, input, signal) =>
      read(async (tx) => {
        if (input.profileId !== owner.profileId) {
          return invalid();
        }
        const result = await tx.query({
          text: `SELECT COALESCE(jsonb_agg(candidate.entry ORDER BY candidate.added_at DESC, candidate.id DESC), '[]'::jsonb) AS entries
          FROM (SELECT e.added_at, e.id, jsonb_build_object('id', e.id, 'accountId', e.account_id, 'profileId', e.profile_id,
          'titleId', e.title_id, 'addedAt', e.added_at) AS entry
          FROM engagement.watchlist_entries e JOIN engagement.profile_guards g USING (profile_id, account_id)
          WHERE e.account_id=$1::uuid AND e.profile_id=$2::uuid AND NOT g.deleted
            AND ($3::bigint IS NULL OR (e.added_at, e.id) < ($3::bigint, $4::uuid))
          ORDER BY e.added_at DESC, e.id DESC LIMIT 256) AS candidate`,
          values: [...ownerValues(owner), input.after?.addedAt ?? null, input.after?.id ?? null],
        });
        const entries = field(one(result), "entries");
        if (!Array.isArray(entries) || entries.length > 256) {
          return invalid();
        }
        return Object.freeze(
          Array.from(entries, (row: unknown) => {
            const entry = normalizeWatchlistEntry(row);
            if (
              !entry ||
              entry.accountId !== owner.accountId ||
              entry.profileId !== owner.profileId
            ) {
              return invalid();
            }
            return entry;
          }),
        );
      }, signal),
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
        if (
          result.status === "committed" ||
          (result.status === "rolled_back" && result.value.status !== "completed")
        ) {
          return result.value;
        }
        return failed(result, signal);
      } catch {
        return { status: "indeterminate" };
      }
    },
  };
}
