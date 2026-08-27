import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Pool } from "pg";

import { createAsterPostgresAdapter } from "@aster/postgres";
import { createAsterTelemetry } from "@aster/telemetry";

import type {
  IdentityProfileUnitOfWork,
  ProfileRequest,
} from "../../src/application/profile-ports.js";
import { createIdentityProfiles } from "../../src/application/profiles.js";
import { createIdentitySessions } from "../../src/application/sessions.js";
import { createProfileEvent } from "../../src/domain/profile-event.js";
import { createProfilePolicy } from "../../src/domain/profile.js";
import { createLocalIdentityAdapter } from "../../src/infrastructure/identity/local-identity.js";
import { createPostgresProfiles } from "../../src/infrastructure/persistence/postgres-profiles.js";
import { createPostgresSessions } from "../../src/infrastructure/persistence/postgres-sessions.js";
import { eventually } from "./docker-fixture.js";

const postgresPort = Number(process.argv[3]);
assert.ok(Number.isSafeInteger(postgresPort) && postgresPort >= 1024 && postgresPort <= 65535);
const endpoint = new URL(`postgresql://127.0.0.1:${postgresPort}/aster`);
endpoint.username = "aster";
endpoint.password = "aster-test-only";
const admin = new Pool({
  connectionString: endpoint.toString(),
  max: 2,
  connectionTimeoutMillis: 1_000,
  query_timeout: 2_500,
  statement_timeout: 2_000,
  idleTimeoutMillis: 5_000,
});
admin.on("error", () => undefined);
endpoint.username = "aster_identity_fixture";
const connectionString = endpoint.toString();
const telemetry = createAsterTelemetry({
  serviceName: "identity-profile-integration",
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
const transactions = createPostgresProfiles(database);
let now = 1_787_814_000;
const identity = await createLocalIdentityAdapter(
  { environment: "local", localDemoEnabled: true, publicOrigin: "http://127.0.0.1:3000" },
  () => now,
);
const common = {
  identity,
  signerId: randomUUID(),
  nextId: randomUUID,
  now: () => now,
  digest: (value: string): string => createHash("sha256").update(value).digest("hex"),
};
const sessionApp = createIdentitySessions({
  ...common,
  transactions: createPostgresSessions(database),
});
const application = (unit = transactions) =>
  createIdentityProfiles({
    ...common,
    transactions: unit,
    policy: createProfilePolicy({ maximumProfiles: 2 }),
  });
const app = application();
let credential = "";
const signal = (): AbortSignal => new AbortController().signal;
const request = (selectedCredential = credential, inputSignal = signal()): ProfileRequest => ({
  credential: selectedCredential,
  signal: inputSignal,
  context: { correlationId: randomUUID(), causationId: null },
});
const preferences = {
  displayName: "  Cine\u0301ma   viewer ",
  locale: "pt-br",
  maturity: "GENERAL",
} as const;
const createInput = () => ({ mutationId: randomUUID(), profile: preferences });

function output(event: string, details: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({ event, ...details })}\n`);
}

async function migrate(
  name: "0001-accounts-sessions" | "0002-profiles-outbox",
  direction: "up" | "down",
): Promise<void> {
  const sql = await readFile(
    new URL(`../../../migrations/${name}.${direction}.sql`, import.meta.url),
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

async function counts(accountId: string) {
  const result = await admin.query<{
    profiles: number;
    receipts: number;
    audit: number;
    outbox: number;
  }>(
    `SELECT
    (SELECT count(*)::integer FROM identity.profiles WHERE account_id = $1) AS profiles,
    (SELECT count(*)::integer FROM identity.profile_receipts WHERE account_id = $1) AS receipts,
    (SELECT count(*)::integer FROM identity.profile_audit WHERE account_id = $1) AS audit,
    (SELECT count(*)::integer FROM identity.profile_outbox WHERE account_id = $1) AS outbox`,
    [accountId],
  );
  const row = result.rows[0];
  assert.ok(row);
  return row;
}

function barrier(): IdentityProfileUnitOfWork {
  let arrived = 0;
  let release: (() => void) | undefined;
  let timer: NodeJS.Timeout;
  const gate = new Promise<void>((resolve, reject) => {
    release = resolve;
    timer = setTimeout(() => {
      reject(new Error("Profile barrier timed out."));
    }, 2_000);
  });
  return {
    async run(operation, inputSignal) {
      if (++arrived === 8) {
        clearTimeout(timer);
        release?.();
      }
      await gate;
      return transactions.run(operation, inputSignal);
    },
  };
}

async function waitingOnLock(): Promise<boolean> {
  const result = await admin.query<{ waiting: number }>(
    "SELECT count(*)::integer AS waiting FROM pg_stat_activity WHERE usename = 'aster_identity_fixture' AND wait_event_type = 'Lock'",
  );
  return (result.rows[0]?.waiting ?? 0) > 0;
}

async function verify(): Promise<void> {
  const schema = await admin.query<{ name: string | null }>(
    "SELECT to_regnamespace('identity')::text AS name",
  );
  if (schema.rows[0]?.name === null) {
    await migrate("0001-accounts-sessions", "up");
    await admin.query(
      "CREATE ROLE aster_identity_fixture LOGIN PASSWORD 'aster-test-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
    );
    await admin.query("GRANT aster_identity_runtime TO aster_identity_fixture");
  } else {
    assert.deepEqual(
      (
        await admin.query<{ version: number }>(
          "SELECT version FROM identity.schema_migrations ORDER BY version",
        )
      ).rows,
      [{ version: 1 }],
    );
  }
  await migrate("0002-profiles-outbox", "up");
  await assert.rejects(migrate("0002-profiles-outbox", "up"));
  const firstSession = await sessionApp.signIn(signal());
  assert.equal(firstSession.status, "completed");
  const secondSession = await sessionApp.signIn(signal());
  assert.equal(secondSession.status, "completed");
  credential = firstSession.value.credential;
  const accountId = firstSession.value.accountId;
  const original = createInput();
  const concurrent = application(barrier());
  const repeats = await Promise.all(
    Array.from({ length: 8 }, () => concurrent.create(request(), original)),
  );
  assert.equal(repeats.filter((result) => result.status === "completed").length, 8);
  const first = repeats[0];
  assert.ok(first);
  assert.equal(first.status, "completed");
  for (const result of repeats) {
    assert.deepEqual(result, first);
  }
  const firstId = first.value.profileId;
  assert.deepEqual(await counts(accountId), { profiles: 1, receipts: 1, audit: 1, outbox: 1 });
  const crossing = application(barrier());
  const crossed = await Promise.all(
    Array.from({ length: 8 }, () => crossing.create(request(), createInput())),
  );
  assert.equal(crossed.filter((result) => result.status === "completed").length, 1);
  assert.equal(crossed.filter((result) => result.status === "limit_exceeded").length, 7);
  const second = crossed.find((result) => result.status === "completed");
  assert.ok(second);
  assert.equal(second.status, "completed");
  const secondId = second.value.profileId;
  assert.deepEqual(await counts(accountId), { profiles: 2, receipts: 2, audit: 2, outbox: 2 });
  const list = await app.list(request());
  assert.equal(list.status, "completed");
  assert.ok(
    list.value.profiles.every(
      (profile) => profile.displayName === "Cinéma viewer" && profile.locale === "pt-BR",
    ),
  );
  output("profiles_concurrent_admission", {
    duplicateCallers: 8,
    duplicateFacts: 1,
    limitCallers: 8,
    admitted: 1,
    limitRejected: 7,
    stored: 2,
  });

  const foreignAccount = randomUUID();
  const foreignProfile = randomUUID();
  await admin.query(
    "INSERT INTO identity.accounts(id, issuer, subject) VALUES ($1, 'urn:fixture:foreign', 'foreign-viewer')",
    [foreignAccount],
  );
  await admin.query(
    "INSERT INTO identity.profiles(id, account_id, slot, display_name, locale, maturity, version) VALUES ($1, $2, 1, 'Foreign', 'en-US', 'GENERAL', 1)",
    [foreignProfile, foreignAccount],
  );
  assert.equal((await app.get(request(), foreignProfile)).status, "not_found");
  assert.equal((await app.select(request(), foreignProfile)).status, "not_found");
  assert.equal((await app.active(request(), foreignProfile)).status, "not_found");
  assert.equal(
    (
      await app.update(request(), {
        mutationId: randomUUID(),
        profileId: foreignProfile,
        expectedVersion: 1,
        profile: preferences,
      })
    ).status,
    "not_found",
  );
  assert.equal(
    (
      await app.delete(request(), {
        mutationId: randomUUID(),
        profileId: foreignProfile,
        expectedVersion: 1,
      })
    ).status,
    "not_found",
  );
  await assert.rejects(
    admin.query("UPDATE identity.sessions SET active_profile_id = $1 WHERE id = $2", [
      foreignProfile,
      firstSession.value.sessionId,
    ]),
    { code: "23503" },
  );
  await assert.rejects(
    admin.query(
      "INSERT INTO identity.profiles(id, account_id, slot, display_name, locale, maturity, version) VALUES ($1, $2, 17, 'Invalid', 'en-US', 'GENERAL', 1)",
      [randomUUID(), accountId],
    ),
    { code: "23514" },
  );
  const runtimeProbe = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 1_000,
    query_timeout: 2_000,
    statement_timeout: 1_000,
  });
  runtimeProbe.on("error", () => undefined);
  try {
    for (const sql of [
      "UPDATE identity.profiles SET account_id = account_id",
      "DELETE FROM identity.profile_outbox",
      "CREATE TABLE identity.forbidden (id integer)",
    ]) {
      await assert.rejects(runtimeProbe.query(sql), { code: "42501" });
    }
  } finally {
    await runtimeProbe.end();
  }
  output("profiles_owner_isolation", {
    operations: ["get", "update", "delete", "select", "active"],
    foreignKey: "enforced",
    restrictedRuntime: true,
  });

  assert.equal((await app.select(request(), firstId)).status, "completed");
  assert.equal(
    (await app.select(request(secondSession.value.credential), firstId)).status,
    "completed",
  );
  const beforeFaults = await counts(accountId);
  for (const fault of ["audit", "outbox", "receipt"] as const) {
    const faulty: IdentityProfileUnitOfWork = {
      run(operation, inputSignal) {
        return transactions.run(
          (tx) =>
            operation({
              ...tx,
              async appendAudit(event) {
                await tx.appendAudit(event);
                if (fault === "audit") {
                  throw new Error("Injected audit failure.");
                }
              },
              async appendOutbox(event) {
                await tx.appendOutbox(event);
                if (fault === "outbox") {
                  throw new Error("Injected outbox failure.");
                }
              },
              async writeReceipt(receipt) {
                await tx.writeReceipt(receipt);
                if (fault === "receipt") {
                  throw new Error("Injected receipt failure.");
                }
              },
            }),
          inputSignal,
        );
      },
    };
    assert.equal(
      (
        await application(faulty).update(request(), {
          mutationId: randomUUID(),
          profileId: firstId,
          expectedVersion: 1,
          profile: { ...preferences, displayName: "Must roll back" },
        })
      ).status,
      "unavailable",
    );
    assert.deepEqual(await counts(accountId), beforeFaults);
    const current = await app.get(request(), firstId);
    assert.equal(current.status, "completed");
    assert.equal(current.value.version, 1);
  }
  output("profiles_atomic_failure", {
    afterWrites: ["audit", "outbox", "receipt"],
    allRolledBack: true,
  });

  const update = {
    mutationId: randomUUID(),
    profileId: firstId,
    expectedVersion: 1,
    profile: { ...preferences, displayName: "Updated viewer", maturity: "TEEN" },
  };
  const updated = await app.update(request(), update);
  assert.equal(updated.status, "completed");
  assert.equal(updated.value.version, 2);
  assert.deepEqual(await app.update(request(), update), updated);
  assert.equal(
    (await app.update(request(), { ...update, mutationId: randomUUID() })).status,
    "conflict",
  );
  const removal = { mutationId: randomUUID(), profileId: firstId, expectedVersion: 2 };
  const removed = await app.delete(request(), removal);
  assert.equal(removed.status, "completed");
  assert.equal(removed.value.version, 3);
  assert.deepEqual(await app.delete(request(), removal), removed);
  assert.deepEqual(await app.create(request(), original), first);
  assert.equal((await app.get(request(), firstId)).status, "not_found");
  const selected = await admin.query<{ active_profile_id: string | null }>(
    "SELECT active_profile_id FROM identity.sessions WHERE account_id = $1",
    [accountId],
  );
  assert.ok(selected.rows.every((row) => row.active_profile_id === null));
  const eventData = await admin.query<{ envelope: unknown }>(
    "SELECT envelope FROM identity.profile_outbox WHERE account_id = $1",
    [accountId],
  );
  assert.equal(JSON.stringify(eventData.rows).includes("Updated viewer"), false);
  assert.equal((await counts(accountId)).profiles, 1);
  output("profiles_deletion_retry", {
    selectionsCleared: selected.rows.length,
    preferencesRemoved: true,
    replayDoesNotRecreate: true,
  });

  let ready = false;
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const hold: IdentityProfileUnitOfWork = {
    run(operation, inputSignal) {
      return transactions.run(
        (tx) =>
          operation({
            ...tx,
            async appendOutbox(event) {
              await tx.appendOutbox(event);
              ready = true;
              await held;
            },
          }),
        inputSignal,
      );
    },
  };
  const racingUpdate = application(hold).update(request(), {
    mutationId: randomUUID(),
    profileId: secondId,
    expectedVersion: 1,
    profile: { ...preferences, displayName: "Race updated" },
  });
  try {
    await eventually("profile mutation holding the authenticated session", () => ready);
    let logoutFinished = false;
    const logout = sessionApp.signOut(credential, signal()).then((result) => {
      logoutFinished = true;
      return result;
    });
    await eventually("revocation waiting behind the authorized mutation", waitingOnLock);
    assert.equal(logoutFinished, false);
    release?.();
    assert.equal((await racingUpdate).status, "completed");
    assert.equal((await logout).status, "completed");
    assert.equal((await app.get(request(), secondId)).status, "unauthenticated");
  } finally {
    release?.();
  }
  credential = secondSession.value.credential;
  output("profiles_revocation_order", {
    mutationBeforeRevocation: true,
    revokedSessionRejected: true,
  });

  let current = await app.get(request(), secondId);
  assert.equal(current.status, "completed");
  let retained = await counts(accountId);
  for (let slot = retained.receipts + 1; slot <= 64; slot += 1) {
    await admin.query(
      "INSERT INTO identity.profile_receipts(account_id, mutation_id, slot, request_digest, profile_id, profile_version, expires_at) VALUES ($1,$2,$3,$4,$5,1,$6)",
      [accountId, randomUUID(), slot, "0".repeat(64), secondId, now + 86_400],
    );
  }
  const changeProfile = (name: string, version: number) => ({
    mutationId: randomUUID(),
    profileId: secondId,
    expectedVersion: version,
    profile: { ...preferences, displayName: name },
  });
  assert.equal(
    (await app.update(request(), changeProfile("Receipt blocked", current.value.version))).status,
    "backpressure",
  );
  await admin.query("UPDATE identity.profile_receipts SET expires_at = $1 WHERE account_id = $2", [
    now,
    accountId,
  ]);
  assert.equal(
    (await app.update(request(), changeProfile("Receipts recovered", current.value.version)))
      .status,
    "completed",
  );
  assert.equal((await counts(accountId)).receipts, 1);

  retained = await counts(accountId);
  for (let slot = retained.audit + 1; slot <= 128; slot += 1) {
    await admin.query(
      "INSERT INTO identity.profile_audit(event_id, account_id, slot, profile_id, profile_version, event_type, occurred_at) VALUES ($1,$2,$3,$4,1,'identity.profile-created',$5)",
      [randomUUID(), accountId, slot, randomUUID(), now],
    );
  }
  current = await app.get(request(), secondId);
  assert.equal(current.status, "completed");
  assert.equal(
    (await app.update(request(), changeProfile("Audit blocked", current.value.version))).status,
    "backpressure",
  );
  await admin.query("UPDATE identity.profile_audit SET occurred_at = $1 WHERE account_id = $2", [
    now - 30 * 86_400,
    accountId,
  ]);
  assert.equal(
    (await app.update(request(), changeProfile("Audit recovered", current.value.version))).status,
    "completed",
  );
  assert.equal((await counts(accountId)).audit, 1);

  retained = await counts(accountId);
  for (let slot = retained.outbox + 1; slot <= 128; slot += 1) {
    const event = createProfileEvent({
      eventId: randomUUID(),
      eventType: "identity.profile-created",
      accountId,
      profileId: randomUUID(),
      version: 1,
      now,
      context: request().context,
    });
    await admin.query(
      "INSERT INTO identity.profile_outbox(event_id, account_id, slot, profile_id, profile_version, envelope) VALUES ($1,$2,$3,$4,1,$5::jsonb)",
      [event.eventId, accountId, slot, event.aggregate.id, JSON.stringify(event)],
    );
  }
  current = await app.get(request(), secondId);
  assert.equal(current.status, "completed");
  assert.equal(
    (await app.update(request(), changeProfile("Outbox blocked", current.value.version))).status,
    "backpressure",
  );
  assert.equal(
    (await app.update(request(), changeProfile(current.value.displayName, current.value.version)))
      .status,
    "completed",
  );
  assert.equal((await app.list(request())).status, "completed");
  assert.equal((await app.select(request(), secondId)).status, "completed");
  assert.equal((await counts(accountId)).outbox, 128);
  await assert.rejects(
    admin.query(
      "UPDATE identity.profile_outbox SET envelope = jsonb_set(envelope, '{aggregate}', 'null'::jsonb) WHERE event_id = (SELECT event_id FROM identity.profile_outbox WHERE account_id = $1 LIMIT 1)",
      [accountId],
    ),
    { code: "23514" },
  );
  output("profiles_retention_backpressure", {
    receipts: 64,
    audit: 128,
    pendingOutbox: 128,
    expiryCleanup: "passed",
    pendingFactsPreserved: true,
    malformedEnvelopeRejected: true,
  });

  for (const mode of ["abort", "timeout"] as const) {
    const blocker = await admin.connect();
    const controller = new AbortController();
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM identity.accounts WHERE id = $1 FOR UPDATE", [accountId]);
      const started = performance.now();
      const pending = app.list(request(credential, controller.signal));
      await eventually("profile read waiting on account lock", waitingOnLock);
      if (mode === "abort") {
        controller.abort();
      }
      assert.equal((await pending).status, mode === "abort" ? "cancelled" : "unavailable");
      assert.equal(database.snapshot().reservedSlots, 0);
      output("profiles_lock_failure", {
        mode,
        durationMs: Math.round(performance.now() - started),
      });
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
    }
  }
  now += 1_800;
  assert.equal((await app.get(request(), secondId)).status, "unauthenticated");
  const renewed = await sessionApp.signIn(signal());
  assert.equal(renewed.status, "completed");
  credential = renewed.value.credential;
  assert.equal((await app.get(request(), secondId)).status, "completed");
  output("profiles_absolute_expiry", { expiredRejected: true, newSessionWorks: true });

  const preserved = (
    await admin.query<{ accounts: number; sessions: number }>(
      "SELECT (SELECT count(*)::integer FROM identity.accounts) AS accounts, (SELECT count(*)::integer FROM identity.sessions) AS sessions",
    )
  ).rows[0];
  const beforeRollback = await counts(accountId);
  await admin.query(
    "CREATE TABLE identity.future_profile_guard (profile_id uuid REFERENCES identity.profiles(id))",
  );
  await assert.rejects(migrate("0002-profiles-outbox", "down"));
  assert.deepEqual(await counts(accountId), beforeRollback);
  await admin.query("DROP TABLE identity.future_profile_guard");
  await database.close();
  await migrate("0002-profiles-outbox", "down");
  assert.deepEqual(
    (
      await admin.query(
        "SELECT (SELECT count(*)::integer FROM identity.accounts) AS accounts, (SELECT count(*)::integer FROM identity.sessions) AS sessions",
      )
    ).rows[0],
    preserved,
  );
  await migrate("0002-profiles-outbox", "up");
  assert.deepEqual(await counts(accountId), { profiles: 0, receipts: 0, audit: 0, outbox: 0 });
  output("profiles_migration_round_trip", {
    accountsAndSessionsPreserved: true,
    dependencyGuard: true,
  });
}

try {
  await verify();
} catch (error) {
  output("profile_scenario_failed", {
    name: error instanceof Error ? error.name : "unknown",
    locations:
      error instanceof Error
        ? error.stack
            ?.split("\n")
            .filter((line) => line.includes("profiles-worker.js"))
            .slice(0, 3)
        : [],
  });
  process.exitCode = 1;
} finally {
  await database.close();
  await admin.end();
  assert.equal((await telemetry.shutdown()).status, "completed");
  output("profile_resources_closed", { reservedSlots: database.snapshot().reservedSlots });
  process.disconnect();
  process.once("beforeExit", () => {
    output("natural_exit", { mode: "profiles" });
  });
}
