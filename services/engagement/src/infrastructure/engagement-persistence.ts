import type { AsterPostgresRows, AsterPostgresTransaction } from "@aster/postgres";
import { progressIdentifier } from "../domain/progress.js";

export class CapacityExceeded extends Error {}
export function invalid(): never {
  throw new Error("Invalid Engagement persistence result.");
}
export function field(row: unknown, name: string): unknown {
  return typeof row === "object" && row !== null
    ? Object.getOwnPropertyDescriptor(row, name)?.value
    : undefined;
}
export function integer(value: unknown, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > maximum) {
    return invalid();
  }
  return value;
}
export function one(result: AsterPostgresRows): unknown {
  if (result.rowCount !== 1 || result.rows.length !== 1) {
    return invalid();
  }
  return result.rows[0];
}
export async function availableSlot(
  tx: AsterPostgresTransaction,
  table:
    | "progress"
    | "progress_receipts"
    | "outbox"
    | "profile_guards"
    | "watchlist_entries"
    | "watchlist_receipts",
  profileId: string,
): Promise<number> {
  const global = table === "profile_guards";
  const maximum = table === "progress" || table === "watchlist_entries" ? 256 : 1024;
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
  return slot === 0 ? invalid() : slot;
}

export async function lockEngagementProfile(
  tx: AsterPostgresTransaction,
  owner: Readonly<{ accountId: string; profileId: string }>,
): Promise<boolean> {
  if (!progressIdentifier(owner.accountId) || !progressIdentifier(owner.profileId)) {
    return invalid();
  }
  const selectGuard = () =>
    tx.query({
      text: "SELECT account_id::text AS account, deleted FROM engagement.profile_guards WHERE profile_id = $1::uuid FOR UPDATE",
      values: [owner.profileId],
    });
  let guard = await selectGuard();
  if (guard.rowCount === 0) {
    // Only unseen profiles take global admission; both writers share the same deletion fence.
    one(
      await tx.query({
        text: "SELECT singleton FROM engagement.profile_admission WHERE singleton FOR UPDATE",
      }),
    );
    guard = await selectGuard();
    if (guard.rowCount === 0) {
      const slot = await availableSlot(tx, "profile_guards", owner.profileId);
      guard = await tx.query({
        text: `INSERT INTO engagement.profile_guards (profile_id, account_id, slot)
          VALUES ($1::uuid, $2::uuid, $3::smallint) RETURNING account_id::text AS account, deleted`,
        values: [owner.profileId, owner.accountId, slot],
      });
    }
  }
  const row = one(guard);
  const deleted = field(row, "deleted");
  if (typeof deleted !== "boolean") {
    return invalid();
  }
  return !deleted && field(row, "account") === owner.accountId;
}
