import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import {
  createAsterPostgresAdapter,
  type AsterPostgresAdapter,
  type AsterPostgresQuery,
} from "@aster/postgres";
import { createPostgresWatchlist } from "../../src/infrastructure/postgres-watchlist.js";
import { migrateLocalEngagement } from "../../src/infrastructure/local-migrations.js";
import { probeEngagementStore } from "../../src/infrastructure/store-readiness.js";
import { createWatchlistWriter } from "../../src/application/set-watchlist.js";
import { createWatchlistQueries } from "../../src/application/read-watchlist.js";
import { createPostgresProgress } from "../../src/infrastructure/postgres-progress.js";
import { createProgressRecorder } from "../../src/application/record-progress.js";
import { DEFAULT_PROGRESS_POLICY } from "../../src/domain/progress.js";
import type { ProgressRequest } from "../../src/application/progress-ports.js";
import type { WatchlistPorts, WatchlistStore } from "../../src/application/watchlist-ports.js";
import type { WatchlistInput } from "../../src/domain/watchlist.js";

assert.equal(process.env["ASTER_POSTGRES_DISPOSABLE_FIXTURE"], "true");
const port = Number(process.argv[2]);
const host = process.argv[3] ?? "127.0.0.1";
assert.ok(Number.isInteger(port) && port > 1023 && port < 65536);
assert.ok(["127.0.0.1", "postgres"].includes(host));
const endpoint = new URL(`postgresql://${host}:${port}/aster`);
endpoint.username = "aster";
endpoint.password = "aster-test-only";
const options = { connectionTimeoutMillis: 1000, statement_timeout: 2000, query_timeout: 2500 };
const admin = new Pool({ ...options, connectionString: endpoint.toString(), max: 3 });
admin.on("error", () => undefined);
endpoint.username = "aster_engagement_local";
const runtime = new Pool({ ...options, connectionString: endpoint.toString(), max: 2 });
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
let lastSqlFailure: { status: string; statements: number; statement: string } | undefined;
const store = createPostgresWatchlist({
  transaction: async (work, signal) => {
    let statements = 0;
    let statement = "";
    const result = await database.transaction(
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
    if (result.status !== "committed" && result.status !== "rolled_back") {
      lastSqlFailure = { status: result.status, statements, statement };
    }
    return result;
  },
});
const now = () => Math.floor(Date.now() / 1000);
const signal = () => AbortSignal.timeout(5000);
const output = (event: string, facts: object = {}) =>
  process.stdout.write(JSON.stringify({ event, ...facts }) + "\n");
const environment = {
  ASTER_ENVIRONMENT: "local",
  ASTER_ENGAGEMENT_MIGRATION_ENABLED: "true",
  ASTER_ENGAGEMENT_ADMIN_DATABASE_URL: `postgresql://aster@${host}:${port}/aster`,
  ASTER_ENGAGEMENT_ADMIN_DATABASE_PASSWORD: "aster-test-only",
};
function fixture(selected: WatchlistStore = store) {
  const accountId = randomUUID();
  const profileId = randomUUID();
  const titleId = randomUUID();
  const request: ProgressRequest = {
    credential: "synthetic-watchlist",
    correlationId: randomUUID(),
    signal: signal(),
  };
  const ports: WatchlistPorts = {
    store: { ...selected },
    now,
    nextId: randomUUID,
    digest: (value) => createHash("sha256").update(value).digest("hex"),
    identity: {
      authorizeProfile: () =>
        Promise.resolve({
          status: "completed",
          value: { accountId, profileId, checkedAt: now(), expiresAt: now() + 300 },
        }),
    },
    catalog: {
      visibility: (ids) =>
        Promise.resolve({
          status: "completed",
          value: {
            checkedAt: now(),
            expiresAt: now() + 2,
            titles: ids.map((titleId) => ({ titleId, visible: true })),
          },
        }),
    },
  };
  const input = (patch: Partial<WatchlistInput> = {}): WatchlistInput => ({
    profileId,
    titleId,
    idempotencyKey: randomUUID(),
    present: true,
    ...patch,
  });
  return {
    accountId,
    profileId,
    titleId,
    ports,
    request,
    input,
    set: (value: WatchlistInput) =>
      createWatchlistWriter(ports).set(value, { ...request, signal: signal() }),
  };
}
async function counts(profileId: string) {
  const result = await admin.query<{
    heads: number;
    entries: number;
    receipts: number;
    outbox: number;
  }>(
    `SELECT (SELECT count(*)::integer FROM engagement.watchlists WHERE profile_id=$1) AS heads,
      (SELECT count(*)::integer FROM engagement.watchlist_entries WHERE profile_id=$1) AS entries,
      (SELECT count(*)::integer FROM engagement.watchlist_receipts WHERE profile_id=$1) AS receipts,
      (SELECT count(*)::integer FROM engagement.outbox WHERE profile_id=$1) AS outbox`,
    [profileId],
  );
  assert.ok(result.rows[0]);
  return result.rows[0];
}
async function down(names = ["0004-identity-events", "0003-event-relay", "0002-watchlist"]) {
  const client = await admin.connect();
  try {
    for (const name of names) {
      await client.query(
        await readFile(new URL(`../../../migrations/${name}.down.sql`, import.meta.url), "utf8"),
      );
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
try {
  const version = (await admin.query<{ server_version: string }>("SHOW server_version")).rows[0]
    ?.server_version;
  assert.match(version ?? "", /^18\.6/u);
  await admin.query(
    "CREATE SCHEMA catalog; REVOKE ALL ON SCHEMA catalog FROM PUBLIC; CREATE TABLE catalog.ownership_probe(id int); INSERT INTO catalog.ownership_probe VALUES (1)",
  );
  assert.deepEqual((await migrateLocalEngagement(environment, signal())).applied, [1, 2, 3, 4]);
  await down();
  assert.deepEqual((await migrateLocalEngagement(environment, signal())).applied, [2, 3, 4]);
  assert.deepEqual((await migrateLocalEngagement(environment, signal())).applied, []);
  assert.equal(await probeEngagementStore(database, signal()), "ready");
  assert.equal(
    (await admin.query<{ n: number }>("SELECT count(*)::integer AS n FROM catalog.ownership_probe"))
      .rows[0]?.n,
    1,
  );
  output("watchlist_migration", {
    postgres: version,
    upDownUp: "passed",
    replay: "no-op",
    unrelatedData: "preserved",
    readiness: "ready",
  });

  const f = fixture();
  const first = f.input();
  const added = await f.set(first);
  assert.equal(added.status, "completed");
  assert.deepEqual(await counts(f.profileId), { heads: 1, entries: 1, receipts: 1, outbox: 1 });
  const originalEntry = (
    await admin.query(
      "SELECT id, slot, added_at FROM engagement.watchlist_entries WHERE profile_id=$1",
      [f.profileId],
    )
  ).rows;
  assert.equal((await f.set(f.input())).status, "completed");
  assert.deepEqual(
    (
      await admin.query(
        "SELECT id, slot, added_at FROM engagement.watchlist_entries WHERE profile_id=$1",
        [f.profileId],
      )
    ).rows,
    originalEntry,
  );
  assert.equal((await f.set(f.input({ present: false }))).status, "completed");
  f.ports.catalog.visibility = () => Promise.resolve({ status: "unavailable" });
  assert.deepEqual(await f.set(first), added);
  for (const patch of [{ titleId: randomUUID() }, { present: false }]) {
    assert.equal((await f.set({ ...first, ...patch })).status, "conflict");
  }
  assert.deepEqual(await counts(f.profileId), { heads: 1, entries: 0, receipts: 3, outbox: 3 });
  await assert.rejects(() => down(["0002-watchlist"]), /Retained watchlist/u);
  output("watchlist_durable_replay", {
    oppositeCommandReplay: "original-result",
    currentMembership: false,
    crossTitleAndActionConflict: true,
    noDuplicateEffect: true,
    retainedDowngrade: "refused",
  });

  for (const conflict of [false, true]) {
    const racing = fixture();
    const command = racing.input();
    let arrived = 0;
    let release: () => void = () => undefined;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    racing.ports.store.run = async (work, signal) => {
      if (++arrived === 2) {
        release();
      }
      await barrier;
      return store.run(work, signal);
    };
    const results = await Promise.all([
      racing.set(command),
      racing.set(conflict ? { ...command, titleId: randomUUID() } : command),
    ]);
    assert.deepEqual(
      results.map((result) => result.status).sort(),
      conflict ? ["completed", "conflict"] : ["completed", "completed"],
    );
    if (!conflict) {
      assert.deepEqual(results[0], results[1]);
    }
    assert.deepEqual(await counts(racing.profileId), {
      heads: 1,
      entries: 1,
      receipts: 1,
      outbox: 1,
    });
  }
  output("watchlist_concurrency", {
    synchronizedSameKey: "one-effect",
    synchronizedCrossTitle: "one-conflict",
    profileGuard: "shared",
  });

  for (const missing of ["writeReceipt", "appendOutbox"] as const) {
    const broken = fixture();
    broken.ports.store.run = (work, signal) =>
      store.run((tx) => work({ ...tx, [missing]: () => Promise.resolve() }), signal);
    // The shared adapter conservatively treats COMMIT-stage failures as uncertain.
    assert.equal((await broken.set(broken.input())).status, "indeterminate");
    assert.deepEqual(await counts(broken.profileId), {
      heads: 0,
      entries: 0,
      receipts: 0,
      outbox: 0,
    });
  }
  output("watchlist_atomic_commit", { missingReceipt: "rollback", missingEvent: "rollback" });

  const capacity = fixture();
  const titleIds: string[] = [];
  for (let n = 0; n < 256; n++) {
    const titleId = randomUUID();
    titleIds.push(titleId);
    lastSqlFailure = undefined;
    const attempt = await capacity.set(capacity.input({ titleId }));
    if (attempt.status !== "completed") {
      output("watchlist_capacity_rejection", {
        slot: n + 1,
        status: attempt.status,
        sql: lastSqlFailure,
      });
    }
    assert.equal(attempt.status, "completed", "active slot " + String(n + 1));
  }
  assert.equal((await capacity.set(capacity.input())).status, "backpressure");
  const removedTitle = titleIds[0];
  assert.ok(removedTitle);
  assert.equal(
    (await capacity.set(capacity.input({ titleId: removedTitle, present: false }))).status,
    "completed",
  );
  assert.equal((await capacity.set(capacity.input())).status, "completed");
  assert.deepEqual(await counts(capacity.profileId), {
    heads: 1,
    entries: 256,
    receipts: 258,
    outbox: 258,
  });
  const slots = await admin.query<{ count: number; maximum: number }>(
    "SELECT count(DISTINCT slot)::integer AS count, max(slot)::integer AS maximum FROM engagement.watchlist_entries WHERE profile_id=$1",
    [capacity.profileId],
  );
  assert.deepEqual(slots.rows[0], { count: 256, maximum: 256 });
  const fullPage = await store.candidates(
    capacity,
    { profileId: capacity.profileId, first: 20, after: null },
    signal(),
  );
  assert.equal(fullPage.status, "completed");
  assert.equal(fullPage.value.length, 256);
  await assert.rejects(
    runtime.query("DELETE FROM engagement.watchlist_entries WHERE profile_id=$1 AND title_id=$2", [
      capacity.profileId,
      capacity.titleId,
    ]),
    /requires its watchlist command/u,
  );
  output("watchlist_capacity", {
    active: 256,
    overflow: "backpressure",
    removalReclaimsSlot: true,
    versions: 258,
    directMembershipWriteWithoutCommand: "rejected",
  });

  const queries: AsterPostgresQuery[] = [];
  const readDatabase: Pick<AsterPostgresAdapter, "transaction"> = {
    transaction: (work, signal) =>
      database.transaction(
        (tx) =>
          work({
            query: (query) => {
              queries.push(query);
              return tx.query(query);
            },
          }),
        signal,
      ),
  };
  const paged = fixture(createPostgresWatchlist(readDatabase));
  for (let n = 0; n < 25; n++) {
    assert.equal((await paged.set(paged.input({ titleId: randomUUID() }))).status, "completed");
  }
  const all = await store.candidates(
    paged,
    { profileId: paged.profileId, first: 20, after: null },
    signal(),
  );
  assert.equal(all.status, "completed");
  const hidden = new Set(all.value.slice(0, 21).map((entry) => entry.titleId));
  paged.ports.catalog.visibility = (ids) =>
    Promise.resolve({
      status: "completed",
      value: {
        checkedAt: now(),
        expiresAt: now() + 2,
        titles: ids.map((titleId) => ({ titleId, visible: !hidden.has(titleId) })),
      },
    });
  queries.length = 0;
  const beforeReads = await counts(paged.profileId);
  const page = await createWatchlistQueries(paged.ports).page(
    { profileId: paged.profileId, first: 2, after: null },
    { ...paged.request, signal: signal() },
  );
  assert.equal(page.status, "completed");
  assert.deepEqual(
    page.value.edges.map((edge) => edge.node.id),
    all.value.slice(21, 23).map((entry) => entry.id),
  );
  assert.equal(page.value.pageInfo.hasNextPage, true);
  assert.equal(queries.length, 1);
  const pageTwo = await createWatchlistQueries(paged.ports).page(
    { profileId: paged.profileId, first: 2, after: page.value.pageInfo.endCursor },
    { ...paged.request, signal: signal() },
  );
  assert.equal(pageTwo.status, "completed");
  assert.deepEqual(
    pageTwo.value.edges.map((edge) => edge.node.id),
    all.value.slice(23).map((entry) => entry.id),
  );
  assert.equal(pageTwo.value.pageInfo.hasNextPage, false);
  assert.deepEqual(await counts(paged.profileId), beforeReads);
  const query = queries[0];
  assert.ok(query);
  const plan = await admin.query("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + query.text, [
    ...(query.values ?? []),
  ]);
  output("watchlist_filtered_keyset", {
    stored: 25,
    hidden: 21,
    visiblePages: [2, 2],
    selectsPerPage: 1,
    writesByReads: 0,
    plan: plan.rows,
    limitation: "small fixture, not production performance",
  });
  assert.deepEqual(
    await store.candidates(
      { ...paged, accountId: randomUUID() },
      { profileId: paged.profileId, first: 20, after: null },
      signal(),
    ),
    { status: "completed", value: [] },
  );

  const progressStore = createPostgresProgress(database);
  const progress = await createProgressRecorder({
    ...progressStore,
    identity: paged.ports.identity,
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
    now,
    nextId: randomUUID,
    digest: paged.ports.digest,
    policy: DEFAULT_PROGRESS_POLICY,
    limits: { receiptSeconds: 3600, maximumReceipts: 1024, maximumOutbox: 1024 },
  }).record(
    {
      profileId: paged.profileId,
      titleId: paged.titleId,
      playbackSessionId: randomUUID(),
      idempotencyKey: randomUUID(),
      sequence: 1,
      positionMs: 1000,
      durationMs: 6000,
      occurredAt: now(),
    },
    { ...paged.request, signal: signal() },
  );
  assert.equal(progress.status, "completed");
  assert.equal((await counts(paged.profileId)).outbox, 26);
  output("watchlist_progress_coexistence", {
    sameProfileGuard: true,
    sharedOutboxBudget: true,
    progressCommit: "passed",
  });

  const uncertainDatabase: Pick<AsterPostgresAdapter, "transaction"> = {
    transaction: async (work, signal) => {
      const result = await database.transaction(work, signal);
      return result.status === "committed" ? { status: "indeterminate" } : result;
    },
  };
  const uncertain = fixture(createPostgresWatchlist(uncertainDatabase));
  const uncertainInput = uncertain.input();
  assert.equal((await uncertain.set(uncertainInput)).status, "indeterminate");
  assert.equal((await uncertain.set(uncertainInput)).status, "completed");
  assert.deepEqual(await counts(uncertain.profileId), {
    heads: 1,
    entries: 1,
    receipts: 1,
    outbox: 1,
  });
  output("watchlist_indeterminate", { sameKeyRecovery: "completed", committedEffects: 1 });

  for (const sql of [
    "SELECT * FROM catalog.ownership_probe",
    "UPDATE engagement.profile_guards SET deleted=true",
    "UPDATE engagement.watchlists SET id=gen_random_uuid()",
    "UPDATE engagement.watchlists SET write_transaction=pg_current_xact_id()",
    "DELETE FROM engagement.watchlists",
    "UPDATE engagement.watchlist_entries SET added_at=0",
    "TRUNCATE engagement.watchlist_entries",
  ]) {
    await assert.rejects(runtime.query(sql), { code: "42501" });
  }
  await admin.query("UPDATE engagement.profile_guards SET deleted=true WHERE profile_id=$1", [
    paged.profileId,
  ]);
  assert.deepEqual(
    await store.candidates(paged, { profileId: paged.profileId, first: 20, after: null }, signal()),
    { status: "completed", value: [] },
  );
  assert.equal((await paged.set(paged.input())).status, "not_found");
  assert.equal(await probeEngagementStore(database, signal()), "ready");
  output("watchlist_owner_and_deletion", {
    foreignReads: "hidden",
    deletedWrites: "denied",
    deletedReads: "hidden",
    privilegeEscalation: "denied",
    readiness: "ready",
  });
} finally {
  await database.close(signal());
  await Promise.all([admin.end(), runtime.end()]);
}
