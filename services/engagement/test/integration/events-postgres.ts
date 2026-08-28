import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { setTimeout as delay } from "node:timers/promises";
import { createAsterPostgresAdapter, type AsterPostgresAdapter } from "@aster/postgres";
import { createPostgresOutbox, createOutboxRelay, type EventOwner } from "@aster/event-delivery";
import { migrateLocalEngagement } from "../../src/infrastructure/local-migrations.js";
import { createPostgresIdentityEvents } from "../../src/infrastructure/postgres-identity-events.js";
import { createIdentityEventInspector } from "../../src/infrastructure/identity-event-wire.js";
import { createIdentityEventConsumer } from "../../src/application/consume-identity-event.js";
import { createPostgresProgress } from "../../src/infrastructure/postgres-progress.js";
import { createPostgresWatchlist } from "../../src/infrastructure/postgres-watchlist.js";
import { createPostgresProgressRead } from "../../src/infrastructure/postgres-progress-read.js";
import { createProgressRecorder } from "../../src/application/record-progress.js";
import { createProgressQueries } from "../../src/application/read-progress.js";
import { createWatchlistWriter } from "../../src/application/set-watchlist.js";
import { DEFAULT_PROGRESS_POLICY, type ProgressInput } from "../../src/domain/progress.js";
import type { ProgressPorts } from "../../src/application/progress-ports.js";
import {
  eventCredential,
  identityEnvelope,
  signedIdentityRecord,
} from "../identity-event-fixture.js";

assert.equal(process.env["ASTER_POSTGRES_DISPOSABLE_FIXTURE"], "true");
const port = Number(process.argv[2]),
  host = process.argv[3] ?? "127.0.0.1";
assert.ok(Number.isInteger(port) && port > 1023 && port < 65536);
assert.ok(["127.0.0.1", "postgres"].includes(host));
const url = (login: string) => {
  const endpoint = new URL(`postgresql://${host}:${port}/aster`);
  endpoint.username = login;
  endpoint.password = "aster-test-only";
  return endpoint.href;
};
const signal = () => AbortSignal.timeout(5000);
const now = () => Math.floor(Date.now() / 1000);
const admin = new Pool({
  connectionString: url("aster"),
  max: 3,
  connectionTimeoutMillis: 1000,
  statement_timeout: 2000,
  query_timeout: 2500,
});
admin.on("error", () => undefined);
const adapters: AsterPostgresAdapter[] = [],
  pools: Pool[] = [];
const telemetry = {
  startDependencyOperation: () => ({
    status: "rejected" as const,
    reason: "telemetry_closed" as const,
  }),
};
function database(login: string) {
  const result = createAsterPostgresAdapter({
    connectionString: url(login),
    maxConnections: 2,
    connectionTimeoutMs: 500,
    statementTimeoutMs: 900,
    operationTimeoutMs: 1000,
    telemetry,
  });
  adapters.push(result);
  return {
    ...result,
    transaction: async (work, signal) => {
      let statements = 0;
      let statement = "";
      const outcome = await result.transaction(
        (tx) =>
          work({
            query: (query) => {
              statements++;
              statement = query.text.trim().split(/\s+/u).slice(0, 4).join(" ");
              return tx.query(query);
            },
          }),
        signal,
      );
      if (outcome.status !== "committed" && outcome.status !== "rolled_back") {
        emit("event_sql_failure", { login, status: outcome.status, statements, statement });
      }
      return outcome;
    },
  } satisfies AsterPostgresAdapter;
}
function pool(login: string) {
  const result = new Pool({
    connectionString: url(login),
    max: 1,
    connectionTimeoutMillis: 1000,
    statement_timeout: 1000,
  });
  result.on("error", () => undefined);
  pools.push(result);
  return result;
}
const emit = (event: string, facts: object = {}) =>
  process.stdout.write(JSON.stringify({ event, ...facts }) + "\n");
async function sqlMigration(owner: EventOwner, name: string, direction: "up" | "down" = "up") {
  const sql = await readFile(
    new URL(`../../../../${owner}/migrations/${name}.${direction}.sql`, import.meta.url),
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
const environment = {
  ASTER_ENVIRONMENT: "local",
  ASTER_ENGAGEMENT_MIGRATION_ENABLED: "true",
  ASTER_ENGAGEMENT_ADMIN_DATABASE_URL: `postgresql://aster@${host}:${port}/aster`,
  ASTER_ENGAGEMENT_ADMIN_DATABASE_PASSWORD: "aster-test-only",
};
function fixture(
  db: AsterPostgresAdapter,
  selectedProfile = randomUUID(),
  selectedAccount = randomUUID(),
) {
  const accountId = selectedAccount,
    profileId = selectedProfile,
    titleId = randomUUID();
  const playbackSessionId = randomUUID();
  const request = () => ({
    credential: "synthetic-events",
    correlationId: randomUUID(),
    signal: signal(),
  });
  const identity: ProgressPorts["identity"] = {
    authorizeProfile: () =>
      Promise.resolve({
        status: "completed",
        value: { accountId, profileId, checkedAt: now(), expiresAt: now() + 300 },
      }),
  };
  const common = {
    identity,
    now,
    nextId: randomUUID,
    digest: (value: string) => createHash("sha256").update(value).digest("hex"),
  };
  const progress = createPostgresProgress(db);
  const recorder = createProgressRecorder({
    ...common,
    ...progress,
    policy: DEFAULT_PROGRESS_POLICY,
    limits: { receiptSeconds: 3600, maximumReceipts: 1024, maximumOutbox: 1024 },
    playback: {
      inspect: (sessionId, titleId) =>
        Promise.resolve({
          status: "completed",
          value: {
            sessionId,
            titleId,
            checkedAt: now(),
            createdAt: now() - 1,
            expiresAt: now() + 300,
          },
        }),
    },
  });
  const catalog = {
    visibility: (ids: readonly string[]) =>
      Promise.resolve({
        status: "completed" as const,
        value: {
          checkedAt: now(),
          expiresAt: now() + 2,
          titles: ids.map((titleId) => ({ titleId, visible: true })),
        },
      }),
  };
  const watchlist = createWatchlistWriter({
    ...common,
    catalog,
    store: createPostgresWatchlist(db),
  });
  const input = (sequence = 1): ProgressInput => ({
    profileId,
    titleId,
    playbackSessionId,
    idempotencyKey: randomUUID(),
    sequence,
    positionMs: sequence * 1000,
    durationMs: 6000,
    occurredAt: now(),
  });
  const deletion = () => ({
    ...identityEnvelope(),
    eventId: randomUUID(),
    occurredAt: new Date(now() * 1000).toISOString(),
    aggregate: { type: "Profile", id: profileId, version: 4 },
    payload: { profileId, accountId },
  });
  return {
    accountId,
    profileId,
    titleId,
    common,
    catalog,
    request,
    input,
    deletion,
    record: (value: ProgressInput) => recorder.record(value, request()),
    watch: () =>
      watchlist.set({ profileId, titleId, present: true, idempotencyKey: randomUUID() }, request()),
    page: () =>
      createProgressQueries({ ...common, catalog, store: createPostgresProgressRead(db) }).page(
        "continue",
        { profileId, first: 20, after: null },
        request(),
      ),
  };
}
async function counts(profileId: string) {
  return (
    await admin.query<{
      progress: number;
      receipts: number;
      watchlists: number;
      entries: number;
      watch_receipts: number;
      outbox: number;
    }>(
      `SELECT (SELECT count(*)::integer FROM engagement.progress WHERE profile_id=$1) AS progress,
      (SELECT count(*)::integer FROM engagement.progress_receipts WHERE profile_id=$1) AS receipts,
      (SELECT count(*)::integer FROM engagement.watchlists WHERE profile_id=$1) AS watchlists,
      (SELECT count(*)::integer FROM engagement.watchlist_entries WHERE profile_id=$1) AS entries,
      (SELECT count(*)::integer FROM engagement.watchlist_receipts WHERE profile_id=$1) AS watch_receipts,
      (SELECT count(*)::integer FROM engagement.outbox WHERE profile_id=$1) AS outbox`,
      [profileId],
    )
  ).rows;
}
async function blocked(login: string) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const waiting = await admin.query<{ waiting: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND wait_event_type='Lock') AS waiting",
      [login],
    );
    if (waiting.rows[0]?.waiting) {
      return;
    }
    await delay(5);
  }
  assert.fail("Expected the fixture operation to wait on the owned profile guard.");
}

try {
  assert.match(
    (await admin.query<{ server_version: string }>("SHOW server_version")).rows[0]
      ?.server_version ?? "",
    /^18\.6/u,
  );
  for (const name of ["0001-accounts-sessions", "0002-profiles-outbox", "0003-event-relay"]) {
    await sqlMigration("identity", name);
  }
  for (const name of [
    "0001-rights-history",
    "0002-editorial-workflow",
    "0003-public-reads",
    "0004-media-requests",
    "0005-media-acquisitions",
    "0006-media-processing",
    "0007-media-attestations",
    "0008-publication-activations",
    "0009-event-relay",
  ]) {
    await sqlMigration("catalog", name);
  }
  assert.deepEqual((await migrateLocalEngagement(environment, signal())).applied, [1, 2, 3, 4]);
  for (const [owner, name] of [
    ["identity", "0003-event-relay"],
    ["catalog", "0009-event-relay"],
    ["engagement", "0004-identity-events"],
    ["engagement", "0003-event-relay"],
  ] as const) {
    await sqlMigration(owner, name, "down");
  }
  await sqlMigration("identity", "0003-event-relay");
  await sqlMigration("catalog", "0009-event-relay");
  assert.deepEqual((await migrateLocalEngagement(environment, signal())).applied, [3, 4]);
  for (const owner of ["identity", "catalog"] as const) {
    await admin.query(
      `CREATE ROLE aster_${owner}_relay_local LOGIN PASSWORD 'aster-test-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; GRANT aster_${owner}_relay TO aster_${owner}_relay_local`,
    );
  }
  emit("event_migrations", {
    emptyRoundtrip: "passed",
    versions: { identity: 3, catalog: 9, engagement: 4 },
  });

  const requestDb = database("aster_engagement_local");
  const consumerDb = database("aster_engagement_consumer_local");
  const events = createPostgresIdentityEvents(consumerDb, randomUUID);
  const consumer = createIdentityEventConsumer({
    store: events,
    inspect: createIdentityEventInspector(eventCredential),
  });
  const f = fixture(requestDb);
  assert.equal((await f.record(f.input())).status, "completed");
  assert.equal((await f.record(f.input(2))).status, "completed");
  const before = await f.page();
  assert.equal(before.status, "completed");
  assert.equal(before.value.edges.length, 1);
  const rebuilt = await fixture(
    database("aster_engagement_local"),
    f.profileId,
    f.accountId,
  ).page();
  assert.deepEqual(rebuilt, before);
  const initialCounts = await counts(f.profileId);

  const account = randomUUID(),
    aggregate = randomUUID(),
    title = randomUUID();
  await admin.query(
    "INSERT INTO identity.accounts(id,issuer,subject) VALUES($1,'urn:aster:fixture','events')",
    [account],
  );
  await admin.query("INSERT INTO catalog.titles(id,version,state) VALUES($1,1,'DRAFT')", [title]);
  for (const version of [3, 2]) {
    const id = randomUUID();
    const identityEvent = {
      ...identityEnvelope(),
      eventId: id,
      aggregate: { type: "Profile", id: aggregate, version },
      payload: { accountId: account, profileId: aggregate },
    };
    await admin.query(
      "INSERT INTO identity.profile_outbox(event_id,account_id,slot,profile_id,profile_version,envelope) VALUES($1,$2,$3,$4,$5,$6::jsonb)",
      [id, account, version, aggregate, version, JSON.stringify(identityEvent)],
    );
    const catalogEvent = {
      ...identityEvent,
      eventId: randomUUID(),
      producer: "catalog",
      eventType: "catalog.title-retired",
      aggregate: { type: "Title", id: title, version },
      payload: { titleId: title, publicationId: null, rightsRevision: null },
      causationId: randomUUID(),
    };
    await admin.query(
      "INSERT INTO catalog.command_audit(id,title_id,title_version,kind,actor_id,occurred_at,correlation_id,mutation_id) VALUES($1,$2,$3,'retire',$4,$5,$6,$7)",
      [randomUUID(), title, version, randomUUID(), now(), randomUUID(), catalogEvent.causationId],
    );
    await admin.query(
      "INSERT INTO catalog.publication_outbox(event_id,title_id,title_version,slot,event_type,event) VALUES($1,$2,$3::integer,$3::smallint,'catalog.title-retired',$4::jsonb)",
      [catalogEvent.eventId, title, version, JSON.stringify(catalogEvent)],
    );
  }

  for (const owner of ["identity", "catalog", "engagement"] as const) {
    const relayDb = database(`aster_${owner}_relay_local`);
    const outbox = createPostgresOutbox(owner, relayDb);
    const firstVersion = owner === "engagement" ? 1 : 2;
    const claims = await Promise.all([
      outbox.claim(randomUUID(), signal()),
      outbox.claim(randomUUID(), signal()),
    ]);
    const claimed = claims.filter((value) => value.status === "claimed");
    assert.equal(claimed.length, 1);
    const claim = claimed[0];
    assert.ok(claim);
    assert.equal(claim.status, "claimed");
    assert.equal(claim.value.aggregateVersion, firstVersion);
    assert.equal((await outbox.claim(randomUUID(), signal())).status, "busy");
    assert.equal(
      await outbox.acknowledge({ ...claim.value, token: randomUUID() }, signal()),
      "not_owned",
    );
    const downName = owner === "catalog" ? "0009-event-relay" : "0003-event-relay";
    await assert.rejects(sqlMigration(owner, downName, "down"), /Retain|Reverse/u);
    // Deterministically expire only this disposable lease; no wall-clock waiting or production mutation.
    await admin.query(
      `UPDATE ${owner}.outbox_relay_state SET expires_at=clock_timestamp()-interval '1 second'`,
    );
    assert.equal(await outbox.acknowledge(claim.value, signal()), "not_owned");
    const replay = await outbox.claim(randomUUID(), signal());
    assert.equal(replay.status, "claimed");
    assert.equal(replay.value.eventId, claim.value.eventId);
    assert.notEqual(replay.value.token, claim.value.token);
    assert.equal(await outbox.acknowledge(claim.value, signal()), "not_owned");
    const unknown: Pick<AsterPostgresAdapter, "transaction"> = {
      transaction: async (work, signal) => {
        const result = await relayDb.transaction(work, signal);
        return result.status === "committed" ? { status: "indeterminate" } : result;
      },
    };
    assert.equal(
      await createPostgresOutbox(owner, unknown).acknowledge(replay.value, signal()),
      "unavailable",
    );
    const next = await outbox.claim(randomUUID(), signal());
    assert.equal(next.status, "claimed");
    assert.equal(next.value.aggregateVersion, firstVersion + 1);
    await admin.query(
      `UPDATE ${owner}.outbox_relay_state SET expires_at=clock_timestamp()-interval '1 second'`,
    );
    assert.equal(
      await createOutboxRelay(owner, {
        outbox,
        nextToken: randomUUID,
        publish: () => Promise.resolve("uncertain"),
      }).step(signal()),
      "uncertain",
    );
    await admin.query(
      `UPDATE ${owner}.outbox_relay_state SET expires_at=clock_timestamp()-interval '1 second'`,
    );
    const retained = await outbox.claim(randomUUID(), signal());
    assert.equal(retained.status, "claimed");
    assert.equal(retained.value.eventId, next.value.eventId);
    assert.equal(await outbox.acknowledge(retained.value, signal()), "acknowledged");
    assert.equal((await outbox.claim(randomUUID(), signal())).status, "empty");
    const restricted = pool(`aster_${owner}_relay_local`);
    const table =
      owner === "identity"
        ? "profile_outbox"
        : owner === "catalog"
          ? "publication_outbox"
          : "outbox";
    await assert.rejects(restricted.query(`DELETE FROM ${owner}.${table}`), { code: "42501" });
    await assert.rejects(restricted.query("SELECT * FROM identity.accounts"), { code: "42501" });
    emit("owner_relay_fencing", {
      owner,
      concurrentClaims: 1,
      firstVersion,
      lateAck: "refused",
      uncertainPublish: "retained",
      unknownAck: "safe",
      pending: 0,
    });
  }
  assert.equal((await f.page()).status, "completed");
  assert.deepEqual(await f.page(), before);
  assert.equal(initialCounts.length, 1);
  emit("continue_watching_reconstruction", {
    restartAndRelay: "same-durable-result",
    duplicateProjection: "none",
    sourceRows: 1,
  });

  assert.equal((await f.watch()).status, "completed");
  const deletion = f.deletion(),
    record = signedIdentityRecord(deletion, f.profileId);
  const beforeDelete = await counts(f.profileId);
  assert.deepEqual(beforeDelete, [
    { progress: 1, receipts: 2, watchlists: 1, entries: 1, watch_receipts: 1, outbox: 1 },
  ]);
  const unknownConsumer: Pick<AsterPostgresAdapter, "transaction"> = {
    transaction: async (work, signal) => {
      const result = await consumerDb.transaction(work, signal);
      return result.status === "committed" ? { status: "indeterminate" } : result;
    },
  };
  assert.equal(
    await createIdentityEventConsumer({
      inspect: createIdentityEventInspector(eventCredential),
      store: createPostgresIdentityEvents(unknownConsumer, randomUUID),
    }).handle(record, signal()),
    "retry",
  );
  assert.equal(await consumer.handle(record, signal()), "duplicate");
  const inspected = createIdentityEventInspector(eventCredential)(record);
  assert.equal(inspected.status, "valid");
  assert.equal(
    await events.deleteProfile({ ...inspected.fact, accountId: randomUUID() }, signal()),
    "conflict",
  );
  const substitutedProfile = randomUUID();
  assert.equal(
    await events.deleteProfile({ ...inspected.fact, profileId: substitutedProfile }, signal()),
    "conflict",
  );
  assert.equal(
    (
      await admin.query("SELECT 1 FROM engagement.profile_guards WHERE profile_id=$1", [
        substitutedProfile,
      ])
    ).rowCount,
    0,
  );
  assert.deepEqual(await counts(f.profileId), [
    { progress: 0, receipts: 0, watchlists: 0, entries: 0, watch_receipts: 0, outbox: 0 },
  ]);
  assert.deepEqual(
    (
      await admin.query(
        "SELECT removed_progress,removed_progress_receipts,removed_watchlists,removed_watchlist_entries,removed_watchlist_receipts,removed_outbox FROM engagement.profile_deletions WHERE profile_id=$1",
        [f.profileId],
      )
    ).rows,
    [
      {
        removed_progress: 1,
        removed_progress_receipts: 2,
        removed_watchlists: 1,
        removed_watchlist_entries: 1,
        removed_watchlist_receipts: 1,
        removed_outbox: 1,
      },
    ],
  );
  assert.equal((await f.record(f.input(3))).status, "not_found");
  assert.equal((await f.watch()).status, "not_found");
  for (const eventType of ["identity.profile-created", "identity.profile-updated"]) {
    assert.equal(
      await consumer.handle(
        signedIdentityRecord(
          { ...deletion, eventType, aggregate: { ...deletion.aggregate, version: 1 } },
          f.profileId,
        ),
        signal(),
      ),
      "ignored",
    );
  }
  assert.equal((await f.page()).status, "completed");
  const empty = await f.page();
  assert.equal(empty.status, "completed");
  assert.equal(empty.value.edges.length, 0);
  await assert.rejects(
    admin.query("UPDATE engagement.profile_guards SET deleted=false WHERE profile_id=$1", [
      f.profileId,
    ]),
    /immutable/u,
  );
  await assert.rejects(sqlMigration("engagement", "0004-identity-events", "down"), /Retain/u);
  emit("deletion_atomicity", {
    unknownCommit: "retry-then-duplicate",
    countsAudited: true,
    oldFacts: "ignored",
    fence: "permanent",
    retainedDowngrade: "refused",
  });

  for (const deletionFirst of [false, true]) {
    const racing = fixture(requestDb);
    assert.equal((await racing.record(racing.input())).status, "completed");
    const blocker = await admin.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        "SELECT profile_id FROM engagement.profile_guards WHERE profile_id=$1 FOR UPDATE",
        [racing.profileId],
      );
      const raceRecord = signedIdentityRecord(racing.deletion(), racing.profileId);
      const first = deletionFirst
        ? consumer.handle(raceRecord, signal())
        : racing.record(racing.input(2));
      await blocked(deletionFirst ? "aster_engagement_consumer_local" : "aster_engagement_local");
      const second = deletionFirst
        ? racing.record(racing.input(2))
        : consumer.handle(raceRecord, signal());
      await blocked(deletionFirst ? "aster_engagement_local" : "aster_engagement_consumer_local");
      await blocker.query("COMMIT");
      const results = await Promise.all([first, second]);
      assert.ok(results.some((result) => result === "applied"));
      const writer = results.find((result) => typeof result === "object");
      assert.ok(writer && ["completed", "not_found"].includes(writer.status));
      assert.deepEqual(await counts(racing.profileId), [
        { progress: 0, receipts: 0, watchlists: 0, entries: 0, watch_receipts: 0, outbox: 0 },
      ]);
      assert.equal((await racing.record(racing.input(3))).status, "not_found");
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
    }
  }
  emit("deletion_writer_race", { orders: 2, finalRows: 0, staleWriter: "denied" });

  const replayTarget = fixture(requestDb);
  assert.equal((await replayTarget.record(replayTarget.input())).status, "completed");
  const replayRecord = {
    ...signedIdentityRecord(replayTarget.deletion(), replayTarget.profileId),
    offset: "1000",
  };
  assert.equal(await events.quarantine(replayRecord, "identity_conflict", signal()), "stored");
  const replayId = (
    await admin.query<{ id: string }>(
      "SELECT id FROM engagement.event_quarantine WHERE broker_offset='1000'",
    )
  ).rows[0]?.id;
  assert.ok(replayId);
  assert.equal(await consumer.replay(replayId, signal()), "applied");
  assert.equal(await events.readQuarantine(replayId, signal()), undefined);
  const poison = {
    ...record,
    value: new Uint8Array(8192).fill(255),
    headers: Object.fromEntries(
      ["a", "b", "c", "d"].map((name) => [name, new Uint8Array(1023).fill(128)]),
    ),
    offset: "1001",
  };
  assert.equal(await consumer.handle(poison, signal()), "quarantined");
  assert.equal(await consumer.handle(poison, signal()), "quarantined");
  const poisonId = (
    await admin.query<{ id: string }>(
      "SELECT id FROM engagement.event_quarantine WHERE broker_offset='1001'",
    )
  ).rows[0]?.id;
  assert.ok(poisonId);
  assert.equal(await consumer.replay(poisonId, signal()), "retry");
  const exactPoison = await events.readQuarantine(poisonId, signal());
  assert.ok(exactPoison);
  assert.deepEqual(exactPoison.value, poison.value);
  assert.deepEqual(exactPoison.headers, poison.headers);
  for (let index = 1; index < 128; index++) {
    assert.equal(
      await consumer.handle({ ...record, headers: {}, offset: String(1001 + index) }, signal()),
      "quarantined",
    );
  }
  assert.equal(await consumer.handle({ ...poison, offset: "9999" }, signal()), "retry");
  assert.equal(
    (
      await admin.query<{ n: number }>(
        "SELECT count(*)::integer AS n FROM engagement.event_quarantine",
      )
    ).rows[0]?.n,
    128,
  );
  emit("quarantine_replay", {
    capacity: 128,
    maximumValueBytes: 8192,
    maximumHeaderBytes: 4096,
    duplicatePosition: "one-record",
    invalidReplay: "retained",
    exactValidReplay: "applied-then-removed",
    overflow: "uncommitted",
  });

  const restricted = pool("aster_engagement_consumer_local"),
    request = pool("aster_engagement_local");
  for (const text of [
    "SELECT * FROM engagement.progress",
    "UPDATE engagement.profile_guards SET deleted=true",
    "DELETE FROM engagement.event_quarantine",
    "SELECT * FROM identity.accounts",
  ]) {
    await assert.rejects(restricted.query(text), { code: "42501" });
  }
  await assert.rejects(
    request.query("SELECT engagement.consume_profile_deletion($1,$2,$3,2,0)", [
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ]),
    { code: "42501" },
  );
  await admin.query(`INSERT INTO engagement.profile_guards(profile_id,account_id,slot)
    SELECT gen_random_uuid(),gen_random_uuid(),n FROM generate_series(1,1024) slots(n)
    WHERE NOT EXISTS (SELECT 1 FROM engagement.profile_guards WHERE slot=n)`);
  const full = fixture(requestDb);
  assert.equal(
    await consumer.handle(signedIdentityRecord(full.deletion(), full.profileId), signal()),
    "retry",
  );
  assert.equal(
    (
      await admin.query<{ n: number }>(
        "SELECT count(*)::integer AS n FROM engagement.profile_guards",
      )
    ).rows[0]?.n,
    1024,
  );
  emit("consumer_authority_capacity", {
    arbitraryWrites: "denied",
    requestEscalation: "denied",
    permanentGuards: 1024,
    overflow: "uncommitted",
  });
} finally {
  await Promise.allSettled(adapters.map((adapter) => adapter.close(signal())));
  await Promise.all([admin.end(), ...pools.map((item) => item.end())]);
}
