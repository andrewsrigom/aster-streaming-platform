import type { ValidatedIdentityAssertion } from "./identity-assertion.js";

export const MAX_ACCOUNT_SESSIONS = 8;

export interface IdentityAccount {
  readonly id: string;
  readonly issuer: string;
  readonly subject: string;
}

export interface StoredIdentitySession {
  readonly id: string;
  readonly account: IdentityAccount;
  readonly signerId: string;
  readonly credentialDigest: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

export interface AuthenticatedSession {
  readonly accountId: string;
  readonly sessionId: string;
  readonly expiresAt: number;
}

export function sessionMatchesAssertion(
  session: StoredIdentitySession,
  assertion: ValidatedIdentityAssertion,
  credentialDigest: string,
  signerId: string,
  now: number,
): boolean {
  return (
    Number.isSafeInteger(now) &&
    now >= 0 &&
    assertion.issuedAt <= now &&
    assertion.expiresAt > now &&
    session.id === assertion.sessionId &&
    session.account.issuer === assertion.issuer &&
    session.account.subject === assertion.subject &&
    session.signerId === signerId &&
    session.credentialDigest === credentialDigest &&
    session.issuedAt === assertion.issuedAt &&
    session.expiresAt === assertion.expiresAt
  );
}
