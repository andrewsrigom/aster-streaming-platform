import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type {
  IdentitySessionPorts,
  IdentitySessionTransaction,
  IdentitySessionUnitOfWork,
  SessionResult,
} from "../src/application/session-ports.js";
import { createIdentitySessions } from "../src/application/sessions.js";
import type { IdentityAccount, StoredIdentitySession } from "../src/domain/session.js";
import { createLocalIdentityAdapter } from "../src/infrastructure/identity/local-identity.js";

const NOW = 1_787_814_000;
const SIGNER = "00000000-0000-4000-8000-000000000099";
const id = (index: number): string => "00000000-0000-4000-8000-" + String(index).padStart(12, "0");
const signal = (): AbortSignal => new AbortController().signal;

// This fake proves application intent, not PostgreSQL isolation, locking or rollback semantics.
class RecordingTransactions implements IdentitySessionUnitOfWork {
  accounts: IdentityAccount[] = [];
  sessions: StoredIdentitySession[] = [];
  readonly calls: string[] = [];
  runs = 0;
  failure: "none" | "insert" | "commit_unknown" = "none";
  lastSignal: AbortSignal | undefined;

  async run<T>(
    operation: (transaction: IdentitySessionTransaction) => Promise<SessionResult<T>>,
    inputSignal: AbortSignal,
  ): Promise<SessionResult<T>> {
    this.runs += 1;
    this.lastSignal = inputSignal;
    if (inputSignal.aborted) {
      return { status: "cancelled" };
    }
    const beforeAccounts = [...this.accounts];
    const beforeSessions = [...this.sessions];
    const transaction: IdentitySessionTransaction = {
      resolveAndLockAccount: (identity, newAccountId) => {
        this.calls.push("resolve_and_lock");
        let account = this.accounts.find(
          (item) => item.issuer === identity.issuer && item.subject === identity.subject,
        );
        if (!account) {
          account = { id: newAccountId, ...identity };
          this.accounts.push(account);
        }
        return Promise.resolve(account);
      },
      removeUnusableSessions: (accountId, signerId, now) => {
        this.calls.push("cleanup");
        this.sessions = this.sessions.filter(
          (item) =>
            item.account.id !== accountId || (item.signerId === signerId && item.expiresAt > now),
        );
        return Promise.resolve();
      },
      countSessions: (accountId) => {
        this.calls.push("count");
        return Promise.resolve(
          this.sessions.filter((item) => item.account.id === accountId).length,
        );
      },
      insertSession: (session) => {
        this.calls.push("insert");
        if (this.failure === "insert") {
          throw new Error("private-database-details");
        }
        this.sessions.push(session);
        return Promise.resolve();
      },
      findSession: (sessionId) =>
        Promise.resolve(this.sessions.find((item) => item.id === sessionId)),
      deleteSession: (sessionId, digest, signerId) => {
        this.sessions = this.sessions.filter(
          (item) =>
            item.id !== sessionId || item.credentialDigest !== digest || item.signerId !== signerId,
        );
        return Promise.resolve();
      },
    };
    try {
      const result = await operation(transaction);
      if (result.status !== "completed") {
        this.accounts = beforeAccounts;
        this.sessions = beforeSessions;
      }
      if (result.status === "completed" && this.failure === "commit_unknown") {
        return { status: "indeterminate" };
      }
      return result;
    } catch (error) {
      this.accounts = beforeAccounts;
      this.sessions = beforeSessions;
      throw error;
    }
  }
}

async function fixture() {
  const time = { now: NOW };
  const identity = await createLocalIdentityAdapter(
    { environment: "local", localDemoEnabled: true, publicOrigin: "http://127.0.0.1:3100" },
    () => time.now,
  );
  const transactions = new RecordingTransactions();
  let sequence = 0;
  const ports: IdentitySessionPorts = {
    identity,
    transactions,
    signerId: SIGNER,
    nextId: () => id(++sequence),
    now: () => time.now,
    digest: (credential) => createHash("sha256").update(credential).digest("hex"),
  };
  return { time, transactions, ports, application: createIdentitySessions(ports) };
}

test("sign-in resolves a verified account, stores only a digest, restores and revokes", async () => {
  const { application, transactions, ports } = await fixture();
  const inputSignal = signal();
  const signedIn = await application.signIn(inputSignal);
  assert.equal(signedIn.status, "completed");
  assert.deepEqual(transactions.calls, ["resolve_and_lock", "cleanup", "count", "insert"]);
  assert.equal(transactions.lastSignal, inputSignal);
  assert.equal(transactions.accounts.length, 1);
  assert.equal(transactions.sessions[0]?.credentialDigest, ports.digest(signedIn.value.credential));
  assert.equal(JSON.stringify(transactions.sessions).includes(signedIn.value.credential), false);
  const restored = await application.restore(signedIn.value.credential, signal());
  assert.deepEqual(restored, {
    status: "completed",
    value: { accountId: id(2), sessionId: id(1), expiresAt: NOW + 1_800 },
  });
  assert.equal(JSON.stringify(restored).includes("credential"), false);
  assert.equal(
    (await application.signOut(signedIn.value.credential, signal())).status,
    "completed",
  );
  assert.equal(
    (await application.signOut(signedIn.value.credential, signal())).status,
    "completed",
  );
  assert.deepEqual(await application.restore(signedIn.value.credential, signal()), {
    status: "unauthenticated",
  });
});

test("a valid signature with no durable session never authenticates", async () => {
  const { application, ports, transactions } = await fixture();
  const issued = await ports.identity.issue(id(1), signal());
  assert.equal(issued.status, "completed");
  assert.deepEqual(await application.restore(issued.value, signal()), {
    status: "unauthenticated",
  });
  assert.equal(transactions.accounts.length, 0);
});

test("account, digest, signer and stored lifetime substitution fail closed", async () => {
  const { application, transactions } = await fixture();
  const signedIn = await application.signIn(signal());
  assert.equal(signedIn.status, "completed");
  const original = transactions.sessions[0];
  assert.ok(original);
  const invalid = [
    { ...original, account: { ...original.account, subject: "another-viewer" } },
    { ...original, account: { ...original.account, issuer: "urn:another:issuer" } },
    { ...original, credentialDigest: "0".repeat(64) },
    { ...original, signerId: id(100) },
    { ...original, issuedAt: NOW - 1 },
    { ...original, expiresAt: NOW + 3_600 },
  ];
  for (const session of invalid) {
    transactions.sessions = [session];
    assert.deepEqual(await application.restore(signedIn.value.credential, signal()), {
      status: "unauthenticated",
    });
  }
});

test("application admission caps sessions and reclaims expired or old-signer slots", async () => {
  const { application, transactions, ports, time } = await fixture();
  for (let index = 0; index < 8; index += 1) {
    assert.equal((await application.signIn(signal())).status, "completed");
  }
  assert.equal(transactions.accounts.length, 1);
  assert.deepEqual(await application.signIn(signal()), { status: "limit_exceeded" });
  const nextSigner = createIdentitySessions({ ...ports, signerId: id(101) });
  assert.equal((await nextSigner.signIn(signal())).status, "completed");
  assert.equal(transactions.sessions.length, 1);
  time.now += 1_800;
  assert.equal((await nextSigner.signIn(signal())).status, "completed");
  assert.equal(transactions.sessions.length, 1);
});

test("invalid credentials and pre-cancellation do not reach persistence", async () => {
  const { application, transactions } = await fixture();
  for (const credential of [undefined, {}, "malformed"]) {
    assert.deepEqual(await application.restore(credential, signal()), {
      status: "unauthenticated",
    });
    assert.equal((await application.signOut(credential, signal())).status, "completed");
  }
  const cancelled = new AbortController();
  cancelled.abort();
  assert.deepEqual(await application.signIn(cancelled.signal), { status: "cancelled" });
  assert.deepEqual(await application.restore("malformed", cancelled.signal), {
    status: "cancelled",
  });
  assert.deepEqual(await application.signOut("malformed", cancelled.signal), {
    status: "cancelled",
  });
  assert.equal(transactions.runs, 0);
});

test("failed persistence returns no credential and an unknown commit is never retried", async () => {
  const { application, transactions } = await fixture();
  transactions.failure = "insert";
  assert.deepEqual(await application.signIn(signal()), { status: "unavailable" });
  assert.equal(transactions.sessions.length, 0);
  assert.equal(transactions.accounts.length, 0);
  transactions.failure = "commit_unknown";
  assert.deepEqual(await application.signIn(signal()), { status: "indeterminate" });
  assert.equal(transactions.runs, 2);
  assert.equal(transactions.sessions.length, 1);
});
