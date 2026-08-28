import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { createAsterPostgresAdapter } from "@aster/postgres";
import { createPostgresPlaybackSessions } from "../../src/infrastructure/postgres-sessions.js";
import { createAnonymousPlaybackSession } from "../../src/domain/session.js";
import { migrateLocalPlayback } from "../../src/infrastructure/local-migrations.js";
import { probePlaybackStore } from "../../src/infrastructure/store-readiness.js";

const port = Number(process.argv[2]);
const host = process.argv[3] ?? "127.0.0.1";
assert.ok(Number.isInteger(port) && port > 1023 && port < 65536);
assert.ok(["127.0.0.1", "postgres"].includes(host));
const endpoint = new URL(`postgresql://${host}:${port}/aster`);
endpoint.username = "aster";
endpoint.password = "aster-test-only";
const admin = new Pool({
  connectionString: endpoint.toString(),
  max: 2,
  connectionTimeoutMillis: 1000,
  statement_timeout: 2000,
  query_timeout: 2500,
});
admin.on("error", () => undefined);
endpoint.username = "aster_playback_fixture";
const runtime = new Pool({
  connectionString: endpoint.toString(),
  max: 1,
  connectionTimeoutMillis: 1000,
  statement_timeout: 1000,
  query_timeout: 1500,
});
runtime.on("error", () => undefined);
const makeDatabase = () =>
  createAsterPostgresAdapter({
    connectionString: endpoint.toString(),
    maxConnections: 4,
    operationTimeoutMs: 1200,
    statementTimeoutMs: 900,
    connectionTimeoutMs: 500,
    telemetry: {
      startDependencyOperation: () => ({ status: "rejected", reason: "telemetry_closed" }),
    },
  });
const migrationEnvironment = {
  ASTER_ENVIRONMENT: "local",
  ASTER_PLAYBACK_MIGRATION_ENABLED: "true",
  ASTER_PLAYBACK_ADMIN_DATABASE_URL: `postgresql://aster@${host}:${port}/aster`,
  ASTER_PLAYBACK_ADMIN_DATABASE_PASSWORD: "aster-test-only",
};
let database = makeDatabase();
let store = createPostgresPlaybackSessions(database);
const count = async () =>
  (await admin.query<{ count: number }>("SELECT count(*)::int AS count FROM playback.sessions"))
    .rows[0]?.count;
const signal = () => AbortSignal.timeout(5000);
const session = () => {
  const now = Math.floor(Date.now() / 1000);
  const titleId = randomUUID();
  const value = createAnonymousPlaybackSession({
    id: randomUUID(),
    titleId,
    correlationId: randomUUID(),
    now,
    allowLocalMedia: false,
    publication: {
      titleId,
      publicationId: randomUUID(),
      titleVersion: 1,
      manifestUrl: "https://example.invalid/master.m3u8",
      checkedAt: now,
      validUntil: null,
    },
  });
  assert.ok(value);
  return value;
};
const output = (event: string, facts: Record<string, unknown> = {}) => {
  process.stdout.write(JSON.stringify({ event, ...facts }) + "\n");
};
async function migrate(direction: "up" | "down") {
  const sql = await readFile(
    new URL(`../../../migrations/0001-playback-sessions.${direction}.sql`, import.meta.url),
    "utf8",
  );
  const client = await admin.connect();
  try {
    await client.query(sql);
    client.release();
  } catch (error) {
    client.release(true);
    throw error;
  }
}
const seed = `INSERT INTO playback.sessions (id, slot, title_id, publication_id, catalog_version, catalog_checked_at, manifest_url, created_at, expires_at, correlation_id)
  SELECT gen_random_uuid(), n, gen_random_uuid(), gen_random_uuid(), 1, $2, 'https://example.invalid/master.m3u8', $2, $3, gen_random_uuid()
  FROM generate_series(1, $1::int) AS n`;

try {
  const version = await admin.query<{ server_version: string }>("SHOW server_version");
  assert.match(version.rows[0]?.server_version ?? "", /^18\.6/u);
  assert.deepEqual(await migrateLocalPlayback(migrationEnvironment, signal()), { applied: [1] });
  assert.deepEqual(await migrateLocalPlayback(migrationEnvironment, signal()), { applied: [] });
  await admin.query(
    "CREATE ROLE aster_playback_fixture LOGIN PASSWORD 'aster-test-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
  );
  await admin.query("GRANT aster_playback_runtime TO aster_playback_fixture");
  await admin.query(
    "CREATE SCHEMA catalog; REVOKE ALL ON SCHEMA catalog FROM PUBLIC; CREATE TABLE catalog.ownership_probe(id int); INSERT INTO catalog.ownership_probe VALUES (1)",
  );
  await admin.query(
    "CREATE SCHEMA identity; REVOKE ALL ON SCHEMA identity FROM PUBLIC; CREATE TABLE identity.ownership_probe(id int)",
  );
  output("playback_migration_up", { version: 1, postgres: version.rows[0]?.server_version });

  const first = session();
  assert.deepEqual(await store.create(first, signal()), { status: "completed" });
  const saved = await runtime.query<{
    id: string;
    profile_id: null;
    expires_at: string;
    correlation_id: string;
  }>("SELECT id, profile_id, expires_at, correlation_id FROM playback.sessions WHERE id = $1", [
    first.id,
  ]);
  assert.deepEqual(saved.rows[0], {
    id: first.id,
    profile_id: null,
    expires_at: String(first.expiresAt),
    correlation_id: first.correlationId,
  });
  assert.deepEqual(
    await Promise.all(Array.from({ length: 4 }, () => store.create(session(), signal()))),
    Array.from({ length: 4 }, () => ({ status: "completed" })),
  );
  assert.equal(await count(), 5);
  for (const sql of [
    "UPDATE playback.sessions SET manifest_url = 'https://evil.invalid/master.m3u8'",
    "DELETE FROM playback.session_admission",
    "INSERT INTO playback.schema_migrations(version) VALUES (2)",
    "CREATE TABLE playback.forbidden(id int)",
    "SELECT * FROM catalog.ownership_probe",
    "SELECT * FROM identity.ownership_probe",
    "SET ROLE aster",
  ]) {
    await assert.rejects(runtime.query(sql), { code: "42501" });
  }
  await assert.rejects(runtime.query("UPDATE playback.session_admission SET singleton = false"), {
    code: "23514",
  });
  output("playback_durable_owner_boundary", {
    sessions: 5,
    concurrentCreates: 4,
    crossOwnerAndDdl: "rejected",
  });

  const old = session();
  assert.deepEqual(
    await store.create(
      {
        ...old,
        createdAt: old.createdAt - 901,
        catalogCheckedAt: old.createdAt - 901,
        expiresAt: old.createdAt - 1,
      },
      signal(),
    ),
    { status: "unavailable" },
  );
  assert.deepEqual(await store.create({ ...old, catalogCheckedAt: old.createdAt - 10 }, signal()), {
    status: "unavailable",
  });
  assert.deepEqual(
    await store.create(
      { ...old, createdAt: old.createdAt + 5, catalogCheckedAt: old.createdAt + 5 },
      signal(),
    ),
    { status: "unavailable" },
  );
  assert.deepEqual(await store.create(session(), AbortSignal.abort()), { status: "cancelled" });
  assert.equal(await count(), 5);
  const blocker = await admin.connect();
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT singleton FROM playback.session_admission FOR UPDATE");
    assert.deepEqual(await store.create(session(), signal()), { status: "unavailable" });
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
  assert.equal(await count(), 5);
  assert.deepEqual(await store.create(session(), signal()), { status: "completed" });
  output("playback_expiry_freshness_cancellation", {
    staleFutureExpired: "rejected",
    blockedWrite: "bounded",
    laterRecovery: "passed",
  });

  // This database is the isolated tmpfs fixture; never point this verifier at retained volumes.
  await admin.query("TRUNCATE playback.sessions");
  const now = Math.floor(Date.now() / 1000);
  await admin.query(seed, [65, now - 90000, now - 89500]);
  await admin.query(seed.replace("generate_series(1, $1::int)", "generate_series(66, $1::int)"), [
    66,
    now - 600,
    now - 5,
  ]);
  await admin.query(seed.replace("generate_series(1, $1::int)", "generate_series(67, $1::int)"), [
    67,
    now,
    now + 900,
  ]);
  assert.deepEqual(await store.create(session(), signal()), { status: "completed" });
  assert.equal(await count(), 4);
  assert.equal(
    (
      await admin.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM playback.sessions WHERE slot IN (66, 67)",
      )
    ).rows[0]?.count,
    2,
  );
  output("playback_retention", { eligible: 65, purged: 64, recentAndLivePreserved: 2 });

  await admin.query("TRUNCATE playback.sessions");
  const capacityTime = Math.floor(Date.now() / 1000);
  await admin.query(seed, [4095, capacityTime, capacityTime + 900]);
  const results = await Promise.all(
    Array.from({ length: 4 }, () => store.create(session(), signal())),
  );
  assert.equal(results.filter((value) => value.status === "completed").length, 1);
  assert.equal(results.filter((value) => value.status === "limit_exceeded").length, 3);
  assert.equal(await count(), 4096);
  await assert.rejects(
    runtime.query(seed.replace("generate_series(1, $1::int)", "generate_series(4097, $1::int)"), [
      4097,
      capacityTime,
      capacityTime + 900,
    ]),
    { code: "23514" },
  );
  output("playback_sql_capacity", { maximum: 4096, concurrentLastSlotWinners: 1, rejected: 3 });

  await database.close(signal());
  await migrate("down");
  assert.equal(
    (
      await admin.query<{ table_name: string | null }>(
        "SELECT to_regclass('playback.sessions') AS table_name",
      )
    ).rows[0]?.table_name,
    null,
  );
  assert.equal(
    (
      await admin.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM catalog.ownership_probe",
      )
    ).rows[0]?.count,
    1,
  );
  await migrate("up");
  await admin.query("GRANT aster_playback_runtime TO aster_playback_fixture");
  database = makeDatabase();
  store = createPostgresPlaybackSessions(database);
  assert.equal(await count(), 0);
  assert.deepEqual(await store.create(session(), signal()), { status: "completed" });
  output("playback_migration_roundtrip", { upDownUp: "passed", unrelatedData: "preserved" });
  assert.deepEqual(await migrateLocalPlayback(migrationEnvironment, signal()), { applied: [] });
  const runtimeEndpoint = new URL(endpoint);
  runtimeEndpoint.username = "aster_playback_local";
  const local = createAsterPostgresAdapter({
    connectionString: runtimeEndpoint.toString(),
    maxConnections: 1,
    connectionTimeoutMs: 500,
    operationTimeoutMs: 1200,
    statementTimeoutMs: 900,
    telemetry: {
      startDependencyOperation: () => ({ status: "rejected", reason: "telemetry_closed" }),
    },
  });
  try {
    assert.equal(await probePlaybackStore(local, signal()), "ready");
    for (const [grant, revoke] of [
      [
        "GRANT USAGE ON SCHEMA catalog TO aster_playback_local",
        "REVOKE USAGE ON SCHEMA catalog FROM aster_playback_local",
      ],
      [
        "GRANT UPDATE(manifest_url) ON playback.sessions TO aster_playback_local",
        "REVOKE UPDATE(manifest_url) ON playback.sessions FROM aster_playback_local",
      ],
      [
        "INSERT INTO playback.schema_migrations(version) VALUES (2)",
        "DELETE FROM playback.schema_migrations WHERE version = 2",
      ],
    ]) {
      assert.ok(grant && revoke);
      await admin.query(grant);
      assert.equal(await probePlaybackStore(local, signal()), "unavailable");
      await admin.query(revoke);
      assert.equal(await probePlaybackStore(local, signal()), "ready");
    }
    output("playback_local_runtime_readiness", {
      initializerIdempotent: true,
      crossOwnerAndColumnGrantRejected: true,
      incompatibleSchemaRejected: true,
      recovery: "passed",
    });
  } finally {
    await local.close(signal());
  }
} finally {
  await database.close(signal());
  await Promise.all([admin.end(), runtime.end()]);
}
