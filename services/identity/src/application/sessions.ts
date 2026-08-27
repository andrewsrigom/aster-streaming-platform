import {
  MAX_ACCOUNT_SESSIONS,
  sessionMatchesAssertion,
  type AuthenticatedSession,
} from "../domain/session.js";

import type { IdentitySessionPorts, SessionResult } from "./session-ports.js";

export interface IssuedSession extends AuthenticatedSession {
  readonly credential: string;
}

export function createIdentitySessions(ports: IdentitySessionPorts) {
  const run = async <T>(
    signal: AbortSignal,
    operation: () => Promise<SessionResult<T>>,
  ): Promise<SessionResult<T>> => {
    const cancelled = (): boolean => signal.aborted;
    if (cancelled()) {
      return { status: "cancelled" };
    }
    try {
      return await operation();
    } catch {
      return { status: cancelled() ? "cancelled" : "unavailable" };
    }
  };

  const currentTime = (): number => {
    const now = ports.now();
    if (!Number.isSafeInteger(now) || now < 0) {
      throw new Error("Identity session clock is unavailable.");
    }
    return now;
  };

  return Object.freeze({
    signIn(signal: AbortSignal): Promise<SessionResult<IssuedSession>> {
      return run(signal, async () => {
        const sessionId = ports.nextId();
        const issued = await ports.identity.issue(sessionId, signal);
        if (issued.status === "invalid_input") {
          return { status: "unavailable" };
        }
        if (issued.status !== "completed") {
          return { status: issued.status };
        }
        const verified = await ports.identity.verify(issued.value, signal);
        if (verified.status === "invalid_input") {
          return { status: "unavailable" };
        }
        if (verified.status !== "completed") {
          return { status: verified.status };
        }
        const assertion = verified.value;
        if (assertion.sessionId !== sessionId || assertion.expiresAt <= currentTime()) {
          return { status: "unavailable" };
        }
        const digest = ports.digest(issued.value);
        const newAccountId = ports.nextId();
        return ports.transactions.run(async (transaction) => {
          const account = await transaction.resolveAndLockAccount(assertion, newAccountId);
          const now = currentTime();
          if (
            account.issuer !== assertion.issuer ||
            account.subject !== assertion.subject ||
            assertion.issuedAt > now ||
            assertion.expiresAt <= now
          ) {
            return { status: "unavailable" };
          }
          await transaction.removeUnusableSessions(account.id, ports.signerId, now);
          const count = await transaction.countSessions(account.id);
          if (!Number.isSafeInteger(count) || count < 0 || count > MAX_ACCOUNT_SESSIONS) {
            return { status: "unavailable" };
          }
          if (count === MAX_ACCOUNT_SESSIONS) {
            return { status: "limit_exceeded" };
          }
          await transaction.insertSession({
            id: sessionId,
            account,
            signerId: ports.signerId,
            credentialDigest: digest,
            issuedAt: assertion.issuedAt,
            expiresAt: assertion.expiresAt,
          });
          return {
            status: "completed",
            value: Object.freeze({
              accountId: account.id,
              sessionId,
              expiresAt: assertion.expiresAt,
              credential: issued.value,
            }),
          };
        }, signal);
      });
    },
    restore(
      credential: unknown,
      signal: AbortSignal,
    ): Promise<SessionResult<AuthenticatedSession>> {
      return run(signal, async () => {
        if (typeof credential !== "string") {
          return { status: "unauthenticated" };
        }
        const verified = await ports.identity.verify(credential, signal);
        if (verified.status === "invalid_input") {
          return { status: "unauthenticated" };
        }
        if (verified.status !== "completed") {
          return { status: verified.status };
        }
        const digest = ports.digest(credential);
        return ports.transactions.run(async (transaction) => {
          const session = await transaction.findSession(verified.value.sessionId);
          if (
            !session ||
            !sessionMatchesAssertion(session, verified.value, digest, ports.signerId, currentTime())
          ) {
            return { status: "unauthenticated" };
          }
          return {
            status: "completed",
            value: Object.freeze({
              accountId: session.account.id,
              sessionId: session.id,
              expiresAt: session.expiresAt,
            }),
          };
        }, signal);
      });
    },
    signOut(credential: unknown, signal: AbortSignal): Promise<SessionResult<undefined>> {
      return run(signal, async () => {
        if (typeof credential !== "string") {
          return { status: "completed", value: undefined };
        }
        const verified = await ports.identity.verify(credential, signal);
        if (verified.status === "unauthenticated" || verified.status === "invalid_input") {
          return { status: "completed", value: undefined };
        }
        if (verified.status !== "completed") {
          return { status: verified.status };
        }
        const digest = ports.digest(credential);
        return ports.transactions.run(async (transaction) => {
          await transaction.deleteSession(verified.value.sessionId, digest, ports.signerId);
          return { status: "completed", value: undefined };
        }, signal);
      });
    },
  });
}
