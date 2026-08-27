import type { AsterPostgresAdapter, AsterPostgresTransaction } from "@aster/postgres";

import type {
  IdentityProfileTransaction,
  IdentityProfileUnitOfWork,
  ProfileMutationReceipt,
  ProfileResult,
} from "../../application/profile-ports.js";
import {
  createProfilePolicy,
  normalizeProfilePreferences,
  PROFILE_RETENTION,
  type ViewerProfile,
} from "../../domain/profile.js";

import {
  identityInteger,
  identityRow,
  identitySeconds,
  identityText,
  identityUuid,
  invalidIdentityRow,
  readIdentityAccount,
  readIdentitySession,
} from "./identity-rows.js";

const profileColumns =
  "id AS profile_id, account_id, display_name, locale, maturity, avatar_ref, version";

function readProfile(value: unknown): ViewerProfile {
  const row = identityRow(value);
  const displayName = identityText(row["display_name"], 120);
  const locale = identityText(row["locale"], 35);
  const preferences = normalizeProfilePreferences(
    { displayName, locale, maturity: row["maturity"], avatarRef: row["avatar_ref"] },
    createProfilePolicy({ supportedLocales: [locale] }),
  );
  if (!preferences || preferences.displayName !== displayName || preferences.locale !== locale) {
    return invalidIdentityRow();
  }
  return Object.freeze({
    ...preferences,
    id: identityUuid(row["profile_id"]),
    accountId: identityUuid(row["account_id"]),
    version: identityInteger(row["version"], 1, 2_147_483_647),
  });
}

function readReceipt(value: unknown): ProfileMutationReceipt {
  const row = identityRow(value);
  return Object.freeze({
    accountId: identityUuid(row["account_id"]),
    mutationId: identityUuid(row["mutation_id"]),
    requestDigest: identityText(row["request_digest"], 64, /^[a-f0-9]{64}$/),
    result: Object.freeze({
      profileId: identityUuid(row["profile_id"]),
      version: identityInteger(row["profile_version"], 1, 2_147_483_647),
    }),
    expiresAt: identitySeconds(row["expires_at"]),
  });
}

function requireOne(rowCount: number): void {
  if (rowCount !== 1) {
    invalidIdentityRow();
  }
}

function repositories(tx: AsterPostgresTransaction): IdentityProfileTransaction {
  return {
    async lockAccount(identity) {
      const result = await tx.query({
        text: "SELECT id AS account_id, issuer, subject FROM identity.accounts WHERE issuer = $1 AND subject = $2 FOR UPDATE",
        values: [identity.issuer, identity.subject],
      });
      if (result.rowCount === 0) {
        return undefined;
      }
      requireOne(result.rowCount);
      return readIdentityAccount(result.rows[0]);
    },
    async lockSession(sessionId) {
      const result = await tx.query({
        text: `SELECT s.id, s.account_id, a.issuer, a.subject, s.signer_id, s.credential_digest, s.issued_at, s.expires_at, s.active_profile_id
          FROM identity.sessions s JOIN identity.accounts a ON a.id = s.account_id WHERE s.id = $1 FOR UPDATE OF s`,
        values: [sessionId],
      });
      if (result.rowCount === 0) {
        return undefined;
      }
      requireOne(result.rowCount);
      const row = identityRow(result.rows[0]);
      return Object.freeze({
        ...readIdentitySession(row),
        activeProfileId:
          row["active_profile_id"] === null ? null : identityUuid(row["active_profile_id"]),
      });
    },
    async listProfiles(accountId) {
      const result = await tx.query({
        text: `SELECT ${profileColumns} FROM identity.profiles WHERE account_id = $1 ORDER BY slot LIMIT 17`,
        values: [accountId],
      });
      return Object.freeze(result.rows.map(readProfile));
    },
    async findProfile(accountId, profileId) {
      const result = await tx.query({
        text: `SELECT ${profileColumns} FROM identity.profiles WHERE account_id = $1 AND id = $2`,
        values: [accountId, profileId],
      });
      if (result.rowCount === 0) {
        return undefined;
      }
      requireOne(result.rowCount);
      return readProfile(result.rows[0]);
    },
    async insertProfile(profile) {
      const result = await tx.query({
        text: `INSERT INTO identity.profiles (id, account_id, slot, display_name, locale, maturity, avatar_ref, version)
          SELECT $1, $2, candidate.slot, $3, $4, $5, NULL, $6 FROM generate_series(1, 16) AS candidate(slot)
          WHERE NOT EXISTS (SELECT 1 FROM identity.profiles WHERE account_id = $2 AND slot = candidate.slot)
          ORDER BY candidate.slot LIMIT 1`,
        values: [
          profile.id,
          profile.accountId,
          profile.displayName,
          profile.locale,
          profile.maturity,
          profile.version,
        ],
      });
      requireOne(result.rowCount);
    },
    async updateProfile(profile, expectedVersion) {
      const result = await tx.query({
        text: "UPDATE identity.profiles SET display_name = $1, locale = $2, maturity = $3, avatar_ref = NULL, version = $4 WHERE account_id = $5 AND id = $6 AND version = $7",
        values: [
          profile.displayName,
          profile.locale,
          profile.maturity,
          profile.version,
          profile.accountId,
          profile.id,
          expectedVersion,
        ],
      });
      return result.rowCount === 1;
    },
    async deleteProfile(accountId, profileId, expectedVersion) {
      const result = await tx.query({
        text: "DELETE FROM identity.profiles WHERE account_id = $1 AND id = $2 AND version = $3",
        values: [accountId, profileId, expectedVersion],
      });
      return result.rowCount === 1;
    },
    async selectProfile(accountId, sessionId, profileId) {
      const result = await tx.query({
        text: "UPDATE identity.sessions SET active_profile_id = $1 WHERE account_id = $2 AND id = $3",
        values: [profileId, accountId, sessionId],
      });
      requireOne(result.rowCount);
    },
    async clearSelectedProfile(accountId, profileId) {
      await tx.query({
        text: "UPDATE identity.sessions SET active_profile_id = NULL WHERE account_id = $1 AND active_profile_id = $2",
        values: [accountId, profileId],
      });
    },
    async pruneReceiptsAndAudit(accountId, now) {
      await tx.query({
        text: "DELETE FROM identity.profile_receipts WHERE account_id = $1 AND expires_at <= $2",
        values: [accountId, now],
      });
      // At most 128 owned audit rows; each statement stays within the adapter's 64-row contract.
      for (let batch = 0; batch < 2; batch += 1) {
        const result = await tx.query({
          text: "DELETE FROM identity.profile_audit WHERE event_id IN (SELECT event_id FROM identity.profile_audit WHERE account_id = $1 AND occurred_at <= $2 ORDER BY occurred_at, event_id LIMIT 64)",
          values: [accountId, now - PROFILE_RETENTION.auditSeconds],
        });
        if (result.rowCount < 64) {
          break;
        }
      }
    },
    async findReceipt(accountId, mutationId, now) {
      const result = await tx.query({
        text: "SELECT account_id, mutation_id, request_digest, profile_id, profile_version, expires_at FROM identity.profile_receipts WHERE account_id = $1 AND mutation_id = $2 AND expires_at > $3",
        values: [accountId, mutationId, now],
      });
      if (result.rowCount === 0) {
        return undefined;
      }
      requireOne(result.rowCount);
      return readReceipt(result.rows[0]);
    },
    async retainedCounts(accountId) {
      const result = await tx.query({
        text: `SELECT
        (SELECT count(*)::integer FROM identity.profile_receipts WHERE account_id = $1) AS receipts,
        (SELECT count(*)::integer FROM identity.profile_audit WHERE account_id = $1) AS audit,
        (SELECT count(*)::integer FROM identity.profile_outbox WHERE account_id = $1) AS outbox`,
        values: [accountId],
      });
      requireOne(result.rowCount);
      const row = identityRow(result.rows[0]);
      return {
        receipts: identityInteger(row["receipts"], 0, 64),
        audit: identityInteger(row["audit"], 0, 128),
        outbox: identityInteger(row["outbox"], 0, 128),
      };
    },
    async writeReceipt(receipt) {
      const result = await tx.query({
        text: `INSERT INTO identity.profile_receipts (account_id, mutation_id, slot, request_digest, profile_id, profile_version, expires_at)
          SELECT $1, $2, candidate.slot, $3, $4, $5, $6 FROM generate_series(1, 64) AS candidate(slot)
          WHERE NOT EXISTS (SELECT 1 FROM identity.profile_receipts WHERE account_id = $1 AND slot = candidate.slot)
          ORDER BY candidate.slot LIMIT 1`,
        values: [
          receipt.accountId,
          receipt.mutationId,
          receipt.requestDigest,
          receipt.result.profileId,
          receipt.result.version,
          receipt.expiresAt,
        ],
      });
      requireOne(result.rowCount);
    },
    async appendAudit(event) {
      const result = await tx.query({
        text: `INSERT INTO identity.profile_audit (event_id, account_id, slot, profile_id, profile_version, event_type, occurred_at)
          SELECT $1, $2, candidate.slot, $3, $4, $5, $6 FROM generate_series(1, 128) AS candidate(slot)
          WHERE NOT EXISTS (SELECT 1 FROM identity.profile_audit WHERE account_id = $2 AND slot = candidate.slot)
          ORDER BY candidate.slot LIMIT 1`,
        values: [
          event.eventId,
          event.payload.accountId,
          event.aggregate.id,
          event.aggregate.version,
          event.eventType,
          Date.parse(event.occurredAt) / 1_000,
        ],
      });
      requireOne(result.rowCount);
    },
    async appendOutbox(event) {
      const result = await tx.query({
        text: `INSERT INTO identity.profile_outbox (event_id, account_id, slot, profile_id, profile_version, envelope)
          SELECT $1, $2, candidate.slot, $3, $4, $5::jsonb FROM generate_series(1, 128) AS candidate(slot)
          WHERE NOT EXISTS (SELECT 1 FROM identity.profile_outbox WHERE account_id = $2 AND slot = candidate.slot)
          ORDER BY candidate.slot LIMIT 1`,
        values: [
          event.eventId,
          event.payload.accountId,
          event.aggregate.id,
          event.aggregate.version,
          JSON.stringify(event),
        ],
      });
      requireOne(result.rowCount);
    },
  };
}

export function createPostgresProfiles(
  database: Pick<AsterPostgresAdapter, "transaction">,
): IdentityProfileUnitOfWork {
  return Object.freeze({
    async run<T>(
      operation: (tx: IdentityProfileTransaction) => Promise<ProfileResult<T>>,
      signal: AbortSignal,
    ): Promise<ProfileResult<T>> {
      const result = await database.transaction(async (tx) => {
        const outcome = await operation(repositories(tx));
        return { action: outcome.status === "completed" ? "commit" : "rollback", value: outcome };
      }, signal);
      if (result.status === "committed" || result.status === "rolled_back") {
        return result.value;
      }
      return {
        status:
          result.status === "aborted"
            ? "cancelled"
            : result.status === "indeterminate"
              ? "indeterminate"
              : "unavailable",
      };
    },
  });
}
