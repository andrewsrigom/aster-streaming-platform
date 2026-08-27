import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Pool } from "pg";

import { createAsterPostgresAdapter } from "@aster/postgres";
import { createAsterTelemetry } from "@aster/telemetry";

import type { IdentitySessionUnitOfWork } from "../../src/application/session-ports.js";
import { createIdentitySessions } from "../../src/application/sessions.js";
import { createLocalIdentityAdapter } from "../../src/infrastructure/identity/local-identity.js";
import { createPostgresSessions } from "../../src/infrastructure/persistence/postgres-sessions.js";
import { eventually } from "./docker-fixture.js";
import { change } from "./worker-control.js";

const postgresPort = Number(process.argv[3]);
assert.ok(Number.isSafeInteger(postgresPort) && postgresPort >= 1024 && postgresPort <= 65535);
const endpoint = new URL(`postgresql://127.0.0.1:${postgresPort}/aster`);
endpoint.username = "aster";
endpoint.password = "aster-test-only";
const admin = new Pool({
  connectionString: endpoint.toString(),
  max: 2,
  connectionTimeoutMillis: 1_000,
  statement_timeout: 2_000,
  query_timeout: 2_500,
  idleTimeoutMillis: 5_000,
});
admin.on("error", () => undefined);
endpoint.username = "aster_identity_fixture";
const connectionString = endpoint.toString();
const telemetry = createAsterTelemetry({
  serviceName: "identity-session-integration",
  serviceVersion: "0.0.0",
  environment: "test",
  export: { mode: "none" },
});
const database = createAsterPostgresAdapter({
  connectionString,
  telemetry,
  maxConnections: 8,
  connectionTimeoutMs: 1_000,
  operationTimeoutMs: 2_000,
  statementTimeoutMs: 1_000,
});
const transactions = createPostgresSessions(database);
let now = 1_787_814_000;
const identityConfiguration = {
  environment: "local",
  localDemoEnabled: true,
  publicOrigin: "http://127.0.0.1:3000",
} as const;
const identity = await createLocalIdentityAdapter(identityConfiguration, () => now);
let signerId = randomUUID();
const signal = (): AbortSignal => new AbortController().signal;
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
const useCases = (unitOfWork = transactions, issuer = identity) =>
  createIdentitySessions({
    identity: issuer,
    transactions: unitOfWork,
    signerId,
    nextId: randomUUID,
    now: () => now,
    digest,
  });

function output(event: string, details: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({ event, ...details })}\n`);
}

async function migrate(direction: "up" | "down"): Promise<void> {
  const sql = await readFile(
    new URL(`../../../migrations/0001-accounts-sessions.${direction}.sql`, import.meta.url),
    "utf8",
  );
  const client = await admin.connect();
  let failed = false;
  try {
    await client.query(sql);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    client.release(failed);
  }
}

async function counts(): Promise<{ accounts: number; sessions: number }> {
  const result = await admin.query<{ accounts: number; sessions: number }>(
    "SELECT (SELECT count(*)::integer FROM identity.accounts) AS accounts, (SELECT count(*)::integer FROM identity.sessions) AS sessions",
  );
  const value = result.rows[0];
  assert.ok(value);
  return value;
}

function barrier(target: number): IdentitySessionUnitOfWork {
  let arrived = 0;
  let release: (() => void) | undefined;
  let timeout: NodeJS.Timeout;
  const gate = new Promise<void>((resolve, reject) => {
    release = resolve;
    timeout = setTimeout(() => {
      reject(new Error("Session admission barrier timed out."));
    }, 2_000);
  });
  return {
    async run(operation, inputSignal) {
      if (++arrived === target) {
        clearTimeout(timeout);
        release?.();
      }
      await gate;
      return transactions.run(operation, inputSignal);
    },
  };
}

async function verify(): Promise<void> {
  const migrationStarted = performance.now();
  await migrate("up");
  await admin.query(
    "CREATE ROLE aster_identity_fixture LOGIN PASSWORD 'aster-test-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
  );
  await admin.query("GRANT aster_identity_runtime TO aster_identity_fixture");
  await assert.rejects(migrate("up"));
  assert.deepEqual(await counts(), { accounts: 0, sessions: 0 });
  output("identity_migration_up", {
    durationMs: Math.round(performance.now() - migrationStarted),
    duplicateRefused: true,
  });

  // Runtime credentials are not schema owners and cannot change identity keys or issue grants.
  const runtimeProbe = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 1_000,
    query_timeout: 2_000,
    statement_timeout: 1_500,
  });
  runtimeProbe.on("error", () => undefined);
  try {
    for (const sql of [
      "CREATE TABLE identity.forbidden (id integer)",
      "UPDATE identity.accounts SET subject = 'forbidden'",
      "DELETE FROM identity.accounts",
      "INSERT INTO identity.schema_migrations(version) VALUES (2)",
      "CREATE ROLE forbidden_role NOLOGIN",
    ]) {
      await assert.rejects(runtimeProbe.query(sql), { code: "42501" });
    }
  } finally {
    await runtimeProbe.end();
  }
  output("identity_runtime_privileges", { outcome: "passed" });

  // Faults occur after real INSERTs on the real leased transaction, not an in-memory rollback fake.
  for (const fault of ["throw", "abort"] as const) {
    const controller = new AbortController();
    const faulty: IdentitySessionUnitOfWork = {
      run(operation, inputSignal) {
        return transactions.run(
          (tx) =>
            operation({
              ...tx,
              async insertSession(session) {
                await tx.insertSession(session);
                if (fault === "throw") {
                  throw new Error("Injected post-insert failure.");
                }
                controller.abort();
              },
            }),
          inputSignal,
        );
      },
    };
    const result = await useCases(faulty).signIn(controller.signal);
    assert.equal(result.status, fault === "abort" ? "cancelled" : "unavailable");
    await eventually("rolled back account and session", async () => {
      const count = await counts();
      return count.accounts === 0 && count.sessions === 0;
    });
    assert.equal(database.snapshot().reservedSlots, 0);
  }
  output("identity_atomic_rollback", {
    faults: ["after-insert-throw", "after-insert-abort"],
    accounts: 0,
    sessions: 0,
  });

  const firstLogins = useCases(barrier(8));
  const first = await Promise.all(Array.from({ length: 8 }, () => firstLogins.signIn(signal())));
  assert.equal(first.filter((result) => result.status === "completed").length, 8);
  const issued = first.map((result) => {
    assert.equal(result.status, "completed");
    return result.value;
  });
  assert.equal(new Set(issued.map((item) => item.accountId)).size, 1);
  assert.equal(new Set(issued.map((item) => item.sessionId)).size, 8);
  assert.deepEqual(await counts(), { accounts: 1, sessions: 8 });
  const sessions = useCases();
  for (const item of issued) {
    assert.equal((await sessions.restore(item.credential, signal())).status, "completed");
  }
  const persisted = await admin.query<{ credential_digest: string }>(
    "SELECT credential_digest FROM identity.sessions",
  );
  assert.equal(persisted.rows.length, 8);
  assert.ok(persisted.rows.every((item) => /^[a-f0-9]{64}$/.test(item.credential_digest)));
  const unknown = await identity.issue(randomUUID(), signal());
  assert.equal(unknown.status, "completed");
  assert.equal((await sessions.restore(unknown.value, signal())).status, "unauthenticated");
  const firstIssued = issued[0];
  assert.ok(firstIssued);
  await admin.query("UPDATE identity.sessions SET credential_digest = $1 WHERE id = $2", [
    "0".repeat(64),
    firstIssued.sessionId,
  ]);
  assert.equal(
    (await sessions.restore(firstIssued.credential, signal())).status,
    "unauthenticated",
  );
  await admin.query("UPDATE identity.sessions SET credential_digest = $1 WHERE id = $2", [
    digest(firstIssued.credential),
    firstIssued.sessionId,
  ]);
  output("identity_concurrent_first_login", {
    callers: 8,
    accounts: 1,
    sessions: 8,
    signatureAloneRejected: true,
    digestMismatchRejected: true,
  });

  for (const item of issued.slice(0, 4)) {
    assert.equal((await sessions.signOut(item.credential, signal())).status, "completed");
  }
  const crossing = useCases(barrier(8));
  const crossed = await Promise.all(Array.from({ length: 8 }, () => crossing.signIn(signal())));
  assert.equal(crossed.filter((result) => result.status === "completed").length, 4);
  assert.equal(crossed.filter((result) => result.status === "limit_exceeded").length, 4);
  assert.deepEqual(await counts(), { accounts: 1, sessions: 8 });
  await assert.rejects(
    admin.query(
      "INSERT INTO identity.sessions (id, account_id, signer_id, slot, credential_digest, issued_at, expires_at) VALUES ($1,$2,$3,9,$4,$5,$6)",
      [randomUUID(), firstIssued.accountId, signerId, "0".repeat(64), now, now + 1_800],
    ),
    { code: "23514" },
  );
  await assert.rejects(
    admin.query(
      "INSERT INTO identity.sessions (id, account_id, signer_id, slot, credential_digest, issued_at, expires_at) VALUES ($1,$2,$3,1,$4,$5,$6)",
      [randomUUID(), firstIssued.accountId, signerId, "0".repeat(64), now, now + 1_800],
    ),
    { code: "23505" },
  );
  output("identity_concurrent_session_limit", {
    callers: 8,
    admitted: 4,
    rejected: 4,
    stored: 8,
    databaseCap: "enforced",
  });

  signerId = randomUUID();
  const restartedIdentity = await createLocalIdentityAdapter(identityConfiguration, () => now);
  const restarted = useCases(transactions, restartedIdentity);
  const current = await restarted.signIn(signal());
  assert.equal(current.status, "completed");
  assert.equal(current.value.accountId, firstIssued.accountId);
  assert.deepEqual(await counts(), { accounts: 1, sessions: 1 });
  assert.equal(
    (await restarted.restore(firstIssued.credential, signal())).status,
    "unauthenticated",
  );
  now += 1_801;
  assert.equal(
    (await restarted.restore(current.value.credential, signal())).status,
    "unauthenticated",
  );
  const renewed = await restarted.signIn(signal());
  assert.equal(renewed.status, "completed");
  assert.deepEqual(await counts(), { accounts: 1, sessions: 1 });
  output("identity_signer_restart_expiry", {
    accountPreserved: true,
    oldCredentialsRejected: true,
    sessions: 1,
  });

  for (const mode of ["abort", "timeout"] as const) {
    const blocker = await admin.connect();
    const controller = new AbortController();
    let durationMs: number;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM identity.accounts WHERE id = $1 FOR UPDATE", [
        firstIssued.accountId,
      ]);
      const started = performance.now();
      const pending = restarted.signIn(controller.signal);
      await eventually("session request waiting on account lock", async () => {
        const result = await admin.query<{ waiting: number }>(
          "SELECT count(*)::integer AS waiting FROM pg_stat_activity WHERE usename = 'aster_identity_fixture' AND wait_event_type = 'Lock'",
        );
        return (result.rows[0]?.waiting ?? 0) > 0;
      });
      if (mode === "abort") {
        controller.abort();
      }
      assert.equal((await pending).status, mode === "abort" ? "cancelled" : "unavailable");
      durationMs = Math.round(performance.now() - started);
      assert.ok(durationMs < 5_000);
      assert.equal(database.snapshot().reservedSlots, 0);
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
    }
    assert.deepEqual(await counts(), { accounts: 1, sessions: 1 });
    output("identity_lock_failure", { mode, durationMs, connectionsRetired: true });
  }

  await change("postgres", "stop");
  assert.equal((await restarted.restore(renewed.value.credential, signal())).status, "unavailable");
  await change("postgres", "start");
  assert.equal((await restarted.restore(renewed.value.credential, signal())).status, "completed");
  assert.equal((await restarted.signOut(renewed.value.credential, signal())).status, "completed");
  assert.equal((await restarted.signOut(renewed.value.credential, signal())).status, "completed");
  assert.equal(
    (await restarted.restore(renewed.value.credential, signal())).status,
    "unauthenticated",
  );
  assert.deepEqual(await counts(), { accounts: 1, sessions: 0 });
  output("identity_database_recovery_revocation", {
    failClosed: true,
    restoredAfterRestart: true,
    idempotentRevocation: true,
  });

  await admin.query(
    "CREATE TABLE identity.future_guard (account_id uuid REFERENCES identity.accounts(id))",
  );
  await assert.rejects(migrate("down"));
  assert.deepEqual(await counts(), { accounts: 1, sessions: 0 });
  await admin.query("DROP TABLE identity.future_guard");
  assert.equal((await database.close()).status, "completed");
  const rollbackStarted = performance.now();
  await migrate("down");
  const absent = await admin.query<{ schema: string | null }>(
    "SELECT to_regnamespace('identity')::text AS schema",
  );
  assert.equal(absent.rows[0]?.schema, null);
  await migrate("up");
  await admin.query("GRANT aster_identity_runtime TO aster_identity_fixture");
  assert.deepEqual(await counts(), { accounts: 0, sessions: 0 });
  output("identity_migration_round_trip", {
    durationMs: Math.round(performance.now() - rollbackStarted),
    dependencyGuard: true,
    accounts: 0,
    sessions: 0,
  });
}

try {
  await verify();
} catch (error) {
  output("session_scenario_failed", {
    name: error instanceof Error ? error.name : "unknown",
    locations:
      error instanceof Error
        ? error.stack
            ?.split("\n")
            .filter((line) => line.includes("sessions-worker.js"))
            .slice(0, 3)
        : [],
  });
  process.exitCode = 1;
} finally {
  await database.close();
  await admin.end();
  assert.equal((await telemetry.shutdown()).status, "completed");
  output("identity_session_resources_closed", { reservedSlots: database.snapshot().reservedSlots });
  process.disconnect();
  process.once("beforeExit", () => {
    output("natural_exit", { mode: "sessions" });
  });
}
