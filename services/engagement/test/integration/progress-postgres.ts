import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { createAsterPostgresAdapter } from "@aster/postgres";
import { createPostgresProgress } from "../../src/infrastructure/postgres-progress.js";
import { createProgressRecorder } from "../../src/application/record-progress.js";
import type { ProgressPorts, ProgressRequest } from "../../src/application/progress-ports.js";
import { DEFAULT_PROGRESS_POLICY, type ProgressInput } from "../../src/domain/progress.js";

// This verifier mutates only an explicitly disposable database, never retained demo storage.
assert.equal(process.env["ASTER_POSTGRES_DISPOSABLE_FIXTURE"], "true");
const port = Number(process.argv[2]);
const host = process.argv[3] ?? "127.0.0.1";
assert.ok(Number.isInteger(port) && port > 1023 && port < 65536);
assert.ok(["127.0.0.1", "postgres"].includes(host));
const endpoint = new URL(`postgresql://${host}:${port}/aster`);
endpoint.username = "aster";
endpoint.password = "aster-test-only";
const poolOptions = { connectionTimeoutMillis: 1000, statement_timeout: 2000, query_timeout: 2500 };
const admin = new Pool({ ...poolOptions, connectionString: endpoint.toString(), max: 3 });
admin.on("error", () => undefined);
endpoint.username = "aster_engagement_fixture";
const runtime = new Pool({ ...poolOptions, connectionString: endpoint.toString(), max: 2 });
runtime.on("error", () => undefined);
const database = createAsterPostgresAdapter({
  connectionString: endpoint.toString(),
  maxConnections: 4,
  operationTimeoutMs: 1500,
  statementTimeoutMs: 900,
  connectionTimeoutMs: 500,
  telemetry: {
    startDependencyOperation: () => ({ status: "rejected", reason: "telemetry_closed" }),
  },
});
const store = createPostgresProgress(database);
const now = () => Math.floor(Date.now() / 1000);
const signal = () => AbortSignal.timeout(5000);
const output = (event: string, facts: Record<string, unknown> = {}) => {
  process.stdout.write(JSON.stringify({ event, ...facts }) + "\n");
};
async function migrate(direction: "up" | "down") {
  const sql = await readFile(
    new URL(`../../../migrations/0001-progress.${direction}.sql`, import.meta.url),
    "utf8",
  );
  const client = await admin.connect();
  try {
    await client.query(sql);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
function fixture() {
  const accountId = randomUUID();
  const profileId = randomUUID();
  const titleId = randomUUID();
  const playbackSessionId = randomUUID();
  const request: ProgressRequest = {
    credential: "synthetic-credential",
    correlationId: randomUUID(),
    signal: signal(),
  };
  const ports: ProgressPorts = {
    receipts: { ...store.receipts },
    transactions: { ...store.transactions },
    now,
    nextId: randomUUID,
    digest: (value) => createHash("sha256").update(value).digest("hex"),
    policy: DEFAULT_PROGRESS_POLICY,
    limits: { receiptSeconds: 3600, maximumReceipts: 1024, maximumOutbox: 1024 },
    identity: {
      authorizeProfile: () =>
        Promise.resolve({
          status: "completed",
          value: {
            accountId,
            profileId,
            checkedAt: now(),
            expiresAt: now() + 300,
          },
        }),
    },
    playback: {
      inspect: (sessionId, requestedTitle) =>
        Promise.resolve({
          status: "completed",
          value: {
            sessionId,
            titleId: requestedTitle,
            checkedAt: now(),
            createdAt: now() - 10,
            expiresAt: now() + 300,
          },
        }),
    },
  };
  const input = (patch: Partial<ProgressInput> = {}): ProgressInput => ({
    profileId,
    titleId,
    playbackSessionId,
    sequence: 1,
    positionMs: 1000,
    durationMs: 6000,
    occurredAt: now(),
    idempotencyKey: randomUUID(),
    ...patch,
  });
  const record = (value: ProgressInput) =>
    createProgressRecorder(ports).record(value, { ...request, signal: signal() });
  return { accountId, profileId, titleId, ports, input, record, request };
}
async function counts(profileId: string) {
  const result = await admin.query<{ progress: number; receipts: number; outbox: number }>(
    `SELECT (SELECT count(*)::integer FROM engagement.progress WHERE profile_id = $1) AS progress,
      (SELECT count(*)::integer FROM engagement.progress_receipts WHERE profile_id = $1) AS receipts,
      (SELECT count(*)::integer FROM engagement.outbox WHERE profile_id = $1) AS outbox`,
    [profileId],
  );
  assert.ok(result.rows[0]);
  return result.rows[0];
}

try {
  const version = (await admin.query<{ server_version: string }>("SHOW server_version")).rows[0]
    ?.server_version;
  assert.match(version ?? "", /^18\.6/u);
  await admin.query(
    "CREATE SCHEMA identity; REVOKE ALL ON SCHEMA identity FROM PUBLIC; CREATE TABLE identity.ownership_probe(id int); INSERT INTO identity.ownership_probe VALUES (1)",
  );
  await admin.query(
    "CREATE SCHEMA playback; REVOKE ALL ON SCHEMA playback FROM PUBLIC; CREATE TABLE playback.ownership_probe(id int)",
  );
  await migrate("up");
  await migrate("down");
  await migrate("up");
  await admin.query(
    "CREATE ROLE aster_engagement_fixture LOGIN PASSWORD 'aster-test-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
  );
  await admin.query("GRANT aster_engagement_runtime TO aster_engagement_fixture");
  assert.equal(
    (
      await admin.query<{ count: number }>(
        "SELECT count(*)::integer AS count FROM identity.ownership_probe",
      )
    ).rows[0]?.count,
    1,
  );
  output("engagement_migration_roundtrip", {
    postgres: version,
    upDownUp: "passed",
    unrelatedData: "preserved",
  });

  const f = fixture();
  const first = f.input();
  const accepted = await f.record(first);
  assert.equal(accepted.status, "completed");
  assert.deepEqual(await counts(f.profileId), { progress: 1, receipts: 1, outbox: 1 });
  const newer = await f.record(f.input({ sequence: 2, positionMs: 2000 }));
  assert.equal(newer.status, "completed");
  assert.equal(newer.value.version, 2);
  f.ports.playback.inspect = () => Promise.resolve({ status: "unavailable" });
  assert.deepEqual(await f.record(first), accepted);
  assert.equal((await f.record({ ...first, positionMs: 1100 })).status, "conflict");
  assert.deepEqual(await counts(f.profileId), { progress: 1, receipts: 2, outbox: 2 });
  const foreign = { accountId: randomUUID(), profileId: f.profileId, titleId: f.titleId };
  assert.deepEqual(await store.receipts.read(foreign, first.idempotencyKey, signal()), {
    status: "completed",
    value: null,
  });
  assert.equal(
    (
      await store.transactions.run(async (tx) => {
        assert.deepEqual(await tx.lock(foreign), { deleted: true, current: null });
        return { status: "not_found" };
      }, signal())
    ).status,
    "not_found",
  );
  await assert.rejects(migrate("down"), /Retained Engagement data prevents downgrade/u);
  assert.deepEqual(await counts(f.profileId), { progress: 1, receipts: 2, outbox: 2 });
  output("engagement_durable_replay", {
    exactAfterNewerAndPlaybackFailure: true,
    conflict: "rejected",
    foreignOwner: "rejected",
    nonemptyDowngrade: "refused",
  });
  assert.equal((await f.record({ ...first, titleId: randomUUID() })).status, "conflict");
  assert.deepEqual(await counts(f.profileId), { progress: 1, receipts: 2, outbox: 2 });

  for (const sql of [
    "SELECT * FROM identity.ownership_probe",
    "SELECT * FROM playback.ownership_probe",
    "SET ROLE aster",
    "CREATE TABLE engagement.forbidden(id int)",
    "UPDATE engagement.profile_guards SET deleted = true",
    "DELETE FROM engagement.profile_guards",
    "DELETE FROM engagement.progress",
    "DELETE FROM engagement.outbox",
    "INSERT INTO engagement.schema_migrations(version) VALUES (2)",
  ]) {
    await assert.rejects(runtime.query(sql), { code: "42501" });
  }
  await assert.rejects(
    runtime.query("UPDATE engagement.profile_guards SET profile_id = gen_random_uuid()"),
    /identity is immutable/u,
  );
  output("engagement_runtime_isolation", { crossOwnerDdlAndRetentionWrites: "rejected" });

  // Hold both callbacks at the transaction boundary so receipt preflight cannot serialize the test.
  const race = fixture();
  let arrivals = 0;
  let release: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  race.ports.transactions.run = async (work, requestSignal) => {
    arrivals++;
    if (arrivals === 2) {
      release();
    }
    await ready;
    return store.transactions.run(work, requestSignal);
  };
  const concurrent = race.input();
  const repeated = await Promise.all([race.record(concurrent), race.record(concurrent)]);
  assert.equal(repeated[0].status, "completed");
  assert.deepEqual(repeated[0], repeated[1]);
  assert.deepEqual(await counts(race.profileId), { progress: 1, receipts: 1, outbox: 1 });
  race.ports.transactions.run = store.transactions.run.bind(store.transactions);
  assert.equal((await race.record(race.input({ sequence: 3 }))).status, "completed");
  assert.equal((await race.record(race.input({ sequence: 2 }))).status, "stale");
  const back = await race.record(race.input({ sequence: 4, positionMs: 500 }));
  assert.equal(back.status, "completed");
  assert.equal(back.value.positionMs, 500);
  output("engagement_synchronized_replay_ordering", {
    duplicateWinners: 1,
    effects: 1,
    stale: "rejected",
    newerSeekBackward: "accepted",
  });

  const crossTitle = fixture();
  const barrier = Promise.withResolvers<undefined>();
  let attempts = 0;
  crossTitle.ports.transactions.run = async (work, requestSignal) => {
    if (++attempts === 2) {
      barrier.resolve(undefined);
    }
    await barrier.promise;
    return store.transactions.run(work, requestSignal);
  };
  const sharedKey = crossTitle.input();
  const changedTitle = { ...sharedKey, titleId: randomUUID() };
  const crossed = await Promise.all([
    crossTitle.record(sharedKey),
    crossTitle.record(changedTitle),
  ]);
  assert.deepEqual(crossed.map((result) => result.status).sort(), ["completed", "conflict"]);
  assert.deepEqual(await counts(crossTitle.profileId), { progress: 1, receipts: 1, outbox: 1 });
  output("engagement_profile_scoped_idempotency", {
    changedTitle: "conflict_before_playback",
    simultaneousTitles: "one_winner_one_conflict",
    progress: 1,
    receipts: 1,
    events: 1,
  });

  for (const omitted of ["writeReceipt", "appendOutbox"] as const) {
    const broken = fixture();
    broken.ports.transactions.run = (work, requestSignal) =>
      store.transactions.run(
        (tx) => work({ ...tx, [omitted]: () => Promise.resolve() }),
        requestSignal,
      );
    assert.notEqual((await broken.record(broken.input())).status, "completed");
    assert.deepEqual(await counts(broken.profileId), { progress: 0, receipts: 0, outbox: 0 });
  }
  const expired = fixture();
  expired.ports.transactions.run = (work, requestSignal) =>
    store.transactions.run(
      (tx) =>
        work({
          ...tx,
          save: (value) =>
            tx.save(value, { checkedAt: value.updatedAt - 10, expiresAt: value.updatedAt + 300 }),
        }),
      requestSignal,
    );
  assert.notEqual((await expired.record(expired.input())).status, "completed");
  assert.deepEqual(await counts(expired.profileId), { progress: 0, receipts: 0, outbox: 0 });
  output("engagement_atomic_guards", {
    missingReceiptAndOutbox: "rolled_back",
    staleAuthority: "rolled_back",
  });

  const blocker = await admin.connect();
  try {
    await blocker.query("BEGIN");
    await blocker.query(
      "SELECT profile_id FROM engagement.profile_guards WHERE profile_id = $1 FOR UPDATE",
      [race.profileId],
    );
    assert.equal((await race.record(race.input({ sequence: 5 }))).status, "unavailable");
    const independent = fixture();
    assert.equal((await independent.record(independent.input())).status, "completed");
    const controller = new AbortController();
    let entered: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const pending = store.transactions.run(async (tx) => {
      entered();
      await tx.lock({
        accountId: race.accountId,
        profileId: race.profileId,
        titleId: race.titleId,
      });
      return { status: "stale" };
    }, controller.signal);
    await started;
    controller.abort();
    assert.equal((await pending).status, "cancelled");
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
  assert.equal((await race.record(race.input({ sequence: 5 }))).status, "completed");
  output("engagement_lock_deadline", {
    timeoutAndCancellation: "bounded",
    independentProfile: "writable",
    recovery: "passed",
  });

  await admin.query("UPDATE engagement.profile_guards SET deleted = true WHERE profile_id = $1", [
    race.profileId,
  ]);
  assert.equal((await race.record(race.input({ sequence: 6 }))).status, "not_found");
  assert.deepEqual(
    await store.receipts.read(
      { accountId: race.accountId, profileId: race.profileId, titleId: race.titleId },
      concurrent.idempotencyKey,
      signal(),
    ),
    { status: "completed", value: null },
  );
  await assert.rejects(
    admin.query("UPDATE engagement.profile_guards SET deleted = false WHERE profile_id = $1", [
      race.profileId,
    ]),
    /identity is immutable/u,
  );
  output("engagement_deletion_fence", {
    laterWritesAndReplay: "rejected",
    resurrection: "rejected",
    deletionConsumer: "planned",
  });

  // Seed receipts only in this disposable fixture, leaving a known single free SQL slot.
  const capacity = fixture();
  assert.equal((await capacity.record(capacity.input())).status, "completed");
  const seedReceipts = `INSERT INTO engagement.progress_receipts
    (account_id, profile_id, title_id, idempotency_key, slot, request_digest, result, expires_at)
    SELECT account_id, profile_id, title_id, gen_random_uuid(), n, request_digest, result, $2
    FROM engagement.progress_receipts CROSS JOIN generate_series(2, $3::integer) AS n WHERE profile_id = $1 AND slot = 1`;
  await admin.query(seedReceipts, [capacity.profileId, now() + 3600, 1023]);
  const finalSlots = await Promise.all([
    capacity.record(capacity.input({ sequence: 2 })),
    capacity.record(capacity.input({ sequence: 3 })),
  ]);
  assert.equal(finalSlots.filter((r) => r.status === "completed").length, 1);
  assert.equal(
    finalSlots.filter((r) => r.status === "backpressure" || r.status === "stale").length,
    1,
  );
  assert.equal((await counts(capacity.profileId)).receipts, 1024);
  await assert.rejects(
    admin.query(
      seedReceipts.replace("generate_series(2, $3::integer)", "generate_series(1025, $3::integer)"),
      [capacity.profileId, now() + 3600, 1025],
    ),
    { code: "23514" },
  );
  await admin.query(
    "UPDATE engagement.progress_receipts SET expires_at = $2 WHERE profile_id = $1 AND slot <= 65",
    [capacity.profileId, now() - 1],
  );
  assert.equal((await capacity.record(capacity.input({ sequence: 4 }))).status, "completed");
  assert.equal((await counts(capacity.profileId)).receipts, 961);
  output("engagement_receipt_capacity_retention", {
    ceiling: 1024,
    lastSlotWinners: 1,
    pruned: 64,
    expiredRemaining: 1,
    livePreserved: true,
  });

  const outboxFull = fixture();
  assert.equal((await outboxFull.record(outboxFull.input())).status, "completed");
  await admin.query(
    `INSERT INTO engagement.outbox (event_id, profile_id, aggregate_id, aggregate_version, slot, event)
    SELECT generated.id, profile_id, aggregate_id, n, n,
      jsonb_set(jsonb_set(event, '{eventId}', to_jsonb(generated.id::text)), '{aggregate,version}', to_jsonb(n))
    FROM engagement.outbox CROSS JOIN generate_series(2, 1024) n
      CROSS JOIN LATERAL (SELECT gen_random_uuid() AS id WHERE n > 0) generated
    WHERE profile_id = $1 AND slot = 1`,
    [outboxFull.profileId],
  );
  assert.equal((await outboxFull.record(outboxFull.input({ sequence: 2 }))).status, "backpressure");
  assert.deepEqual(await counts(outboxFull.profileId), { progress: 1, receipts: 1, outbox: 1024 });
  output("engagement_outbox_backpressure", {
    ceiling: 1024,
    acknowledgedProgress: "preserved",
    brokerRelay: "planned",
  });

  await assert.rejects(
    runtime.query(
      `INSERT INTO engagement.progress
    (id, account_id, profile_id, title_id, slot, playback_session_id, sequence, version,
     position_ms, duration_ms, status, occurred_at, updated_at, authority_checked_at, authority_expires_at)
    SELECT gen_random_uuid(), account_id, profile_id, gen_random_uuid(), 257, playback_session_id,
      1, 1, position_ms, duration_ms, status, occurred_at, updated_at, authority_checked_at, authority_expires_at
    FROM engagement.progress WHERE profile_id = $1`,
      [f.profileId],
    ),
    { code: "23514" },
  );
  await admin.query(`INSERT INTO engagement.profile_guards (profile_id, account_id, slot)
    SELECT gen_random_uuid(), gen_random_uuid(), n FROM generate_series(1, 1024) n
    WHERE NOT EXISTS (SELECT 1 FROM engagement.profile_guards WHERE slot = n)`);
  const guardFull = fixture();
  assert.equal((await guardFull.record(guardFull.input())).status, "backpressure");
  await assert.rejects(
    runtime.query(
      "INSERT INTO engagement.profile_guards(profile_id, account_id, slot) VALUES(gen_random_uuid(), gen_random_uuid(), 1025)",
    ),
    { code: "23514" },
  );
  output("engagement_sql_guard_and_title_bounds", {
    guards: 1024,
    progressSlots: 256,
    overflow: "rejected",
    newProfileBackpressure: true,
  });
} finally {
  await database.close(signal());
  await Promise.all([admin.end(), runtime.end()]);
}
