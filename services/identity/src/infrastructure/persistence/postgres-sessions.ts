import type { AsterPostgresAdapter, AsterPostgresTransaction } from "@aster/postgres";

import type {
  IdentitySessionTransaction,
  IdentitySessionUnitOfWork,
  SessionResult,
} from "../../application/session-ports.js";
import type { IdentityAccount, StoredIdentitySession } from "../../domain/session.js";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

function invalidRow(): never {
  throw new Error("Identity persistence contract failed.");
}

function row(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalidRow();
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, maximum: number, pattern?: RegExp): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    (pattern && !pattern.test(value))
  ) {
    return invalidRow();
  }
  return value;
}

function numericDate(value: unknown): number {
  if (typeof value !== "string" || !/^\d{1,13}$/.test(value)) {
    return invalidRow();
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > 8_640_000_000_000) {
    return invalidRow();
  }
  return number;
}

function account(value: unknown): IdentityAccount {
  const item = row(value);
  return Object.freeze({
    id: text(item["account_id"], 36, uuid),
    issuer: text(item["issuer"], 256),
    subject: text(item["subject"], 256),
  });
}

function repositories(tx: AsterPostgresTransaction): IdentitySessionTransaction {
  return {
    async resolveAndLockAccount(identity, newAccountId) {
      await tx.query({
        text: "INSERT INTO identity.accounts (id, issuer, subject) VALUES ($1, $2, $3) ON CONFLICT (issuer, subject) DO NOTHING",
        values: [newAccountId, identity.issuer, identity.subject],
      });
      // A separate READ COMMITTED statement sees the winner after an insert conflict waited.
      const found = await tx.query({
        text: "SELECT id AS account_id, issuer, subject FROM identity.accounts WHERE issuer = $1 AND subject = $2 FOR UPDATE",
        values: [identity.issuer, identity.subject],
      });
      if (found.rowCount !== 1) {
        return invalidRow();
      }
      return account(found.rows[0]);
    },
    async removeUnusableSessions(accountId, signerId, now) {
      await tx.query({
        text: "DELETE FROM identity.sessions WHERE account_id = $1 AND (signer_id <> $2 OR expires_at <= $3)",
        values: [accountId, signerId, now],
      });
    },
    async countSessions(accountId) {
      const found = await tx.query({
        text: "SELECT count(*)::integer AS count FROM identity.sessions WHERE account_id = $1",
        values: [accountId],
      });
      const count = row(found.rows[0])["count"];
      if (
        found.rowCount !== 1 ||
        typeof count !== "number" ||
        !Number.isSafeInteger(count) ||
        count < 0 ||
        count > 8
      ) {
        return invalidRow();
      }
      return count;
    },
    async insertSession(session) {
      const inserted = await tx.query({
        text: `INSERT INTO identity.sessions (id, account_id, signer_id, slot, credential_digest, issued_at, expires_at)
          SELECT $1, $2, $3, candidate.slot, $4, $5, $6 FROM generate_series(1, 8) AS candidate(slot)
          WHERE NOT EXISTS (SELECT 1 FROM identity.sessions WHERE account_id = $2 AND slot = candidate.slot)
          ORDER BY candidate.slot LIMIT 1 RETURNING id`,
        values: [
          session.id,
          session.account.id,
          session.signerId,
          session.credentialDigest,
          session.issuedAt,
          session.expiresAt,
        ],
      });
      if (inserted.rowCount !== 1 || row(inserted.rows[0])["id"] !== session.id) {
        invalidRow();
      }
    },
    async findSession(sessionId) {
      const found = await tx.query({
        text: `SELECT s.id, s.account_id, a.issuer, a.subject, s.signer_id, s.credential_digest, s.issued_at, s.expires_at
          FROM identity.sessions s JOIN identity.accounts a ON a.id = s.account_id WHERE s.id = $1`,
        values: [sessionId],
      });
      if (found.rowCount === 0) {
        return undefined;
      }
      if (found.rowCount !== 1) {
        return invalidRow();
      }
      const item = row(found.rows[0]);
      const result: StoredIdentitySession = Object.freeze({
        id: text(item["id"], 36, uuid),
        account: account(item),
        signerId: text(item["signer_id"], 36, uuid),
        credentialDigest: text(item["credential_digest"], 64, /^[a-f0-9]{64}$/),
        issuedAt: numericDate(item["issued_at"]),
        expiresAt: numericDate(item["expires_at"]),
      });
      if (result.expiresAt <= result.issuedAt || result.expiresAt - result.issuedAt > 1_800) {
        return invalidRow();
      }
      return result;
    },
    async deleteSession(sessionId, digest, signerId) {
      await tx.query({
        text: "DELETE FROM identity.sessions WHERE id = $1 AND credential_digest = $2 AND signer_id = $3",
        values: [sessionId, digest, signerId],
      });
    },
  };
}

export function createPostgresSessions(
  database: Pick<AsterPostgresAdapter, "transaction">,
): IdentitySessionUnitOfWork {
  return Object.freeze({
    async run<T>(
      operation: (transaction: IdentitySessionTransaction) => Promise<SessionResult<T>>,
      signal: AbortSignal,
    ): Promise<SessionResult<T>> {
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
