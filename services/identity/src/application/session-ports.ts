import type { ValidatedIdentityAssertion } from "../domain/identity-assertion.js";
import type { IdentityAccount, StoredIdentitySession } from "../domain/session.js";

export type SessionResult<T> =
  | Readonly<{ status: "completed"; value: T }>
  | Readonly<{
      status: "unauthenticated" | "unavailable" | "cancelled" | "indeterminate" | "limit_exceeded";
    }>;

interface SessionIdentityPort {
  issue(sessionId: string, signal: AbortSignal): Promise<IdentityCredentialResult<string>>;
  verify(
    credential: unknown,
    signal: AbortSignal,
  ): Promise<IdentityCredentialResult<ValidatedIdentityAssertion>>;
}

type IdentityCredentialResult<T> =
  | Readonly<{ status: "completed"; value: T }>
  | Readonly<{ status: "unauthenticated" | "invalid_input" | "cancelled" | "unavailable" }>;

export interface IdentitySessionTransaction {
  resolveAndLockAccount(
    identity: Pick<ValidatedIdentityAssertion, "issuer" | "subject">,
    newAccountId: string,
  ): Promise<IdentityAccount>;
  removeUnusableSessions(accountId: string, signerId: string, now: number): Promise<void>;
  countSessions(accountId: string): Promise<number>;
  insertSession(session: StoredIdentitySession): Promise<void>;
  findSession(sessionId: string): Promise<StoredIdentitySession | undefined>;
  deleteSession(sessionId: string, credentialDigest: string, signerId: string): Promise<void>;
}

export interface IdentitySessionUnitOfWork {
  // Non-completed outcomes roll back. Completion is returned only after acknowledged commit.
  run<T>(
    operation: (transaction: IdentitySessionTransaction) => Promise<SessionResult<T>>,
    signal: AbortSignal,
  ): Promise<SessionResult<T>>;
}

export interface IdentitySessionPorts {
  readonly identity: SessionIdentityPort;
  readonly transactions: IdentitySessionUnitOfWork;
  readonly signerId: string;
  readonly nextId: () => string;
  readonly now: () => number;
  readonly digest: (credential: string) => string;
}
