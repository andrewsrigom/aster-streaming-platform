import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { createAsterPostgresAdapter } from "@aster/postgres";
import { createTitleProjector } from "../../src/application/apply-title-snapshot.js";
import { createProjectionRebuilder } from "../../src/application/rebuild-projection.js";
import { createTitleSearch, type SearchPage } from "../../src/application/search-titles.js";
import { createPostgresProjectionUnitOfWork } from "../../src/infrastructure/postgres-projection.js";
import { createPostgresRebuildStore } from "../../src/infrastructure/postgres-rebuild.js";
import { createPostgresSearchUnitOfWork } from "../../src/infrastructure/postgres-search.js";

assert.equal(process.env["ASTER_POSTGRES_DISPOSABLE_FIXTURE"], "true");
const port = Number(process.argv[2]);
assert.ok(Number.isSafeInteger(port) && port > 1023 && port < 65536);
const endpoint = new URL(`postgresql://127.0.0.1:${port}/aster`);
endpoint.username = "aster";
endpoint.password = "aster-test-only";
const options = {
  connectionTimeoutMillis: 1000,
  statement_timeout: 2000,
  query_timeout: 2500,
};
const admin = new Pool({ ...options, connectionString: endpoint.toString(), max: 2 });
admin.on("error", () => undefined);
const database = (username: string) => {
  const target = new URL(endpoint);
  target.username = username;
  return createAsterPostgresAdapter({
    connectionString: target.toString(),
    maxConnections: 2,
    connectionTimeoutMs: 500,
    statementTimeoutMs: 1000,
    operationTimeoutMs: 1500,
    telemetry: {
      startDependencyOperation: () => ({ status: "rejected", reason: "telemetry_closed" }),
    },
  });
};
const projectorDatabase = database("aster_discovery_projector_fixture");
const runtimeDatabase = database("aster_discovery_runtime_fixture");
const projector = createTitleProjector({
  transactions: createPostgresProjectionUnitOfWork(projectorDatabase),
});
const search = createTitleSearch({
  transactions: createPostgresSearchUnitOfWork(runtimeDatabase),
});
const rebuildStore = createPostgresRebuildStore(projectorDatabase);
const rebuilder = createProjectionRebuilder({ store: rebuildStore });
const signal = () => AbortSignal.timeout(5000);
const now = Math.floor(Date.now() / 1000);
const ids = Array.from({ length: 8 }, () => randomUUID());
const [titleSignal, titleSynopsis, titleOcean, titleInserted, eventId, generation2, generation3] =
  ids;
assert.ok(
  titleSignal &&
    titleSynopsis &&
    titleOcean &&
    titleInserted &&
    eventId &&
    generation2 &&
    generation3,
);
const output = (event: string, facts: Record<string, unknown>) =>
  process.stdout.write(JSON.stringify({ event, ...facts }) + "\n");
const document = (title: string, synopsis: string, genres = ["drama"]) => ({
  defaultLocale: "en",
  localizations: [
    { locale: "en", title, synopsis },
    { locale: "pt-BR", title: title === "Café Signal" ? "Sinal Café" : title, synopsis },
  ],
  genres,
  editorialLabels: ["featured"],
  releaseYear: 2026,
  publishedAt: now - 10,
});
const snapshot = (
  titleId: string,
  sourceVersion: number,
  value: ReturnType<typeof document> | null,
) => ({
  titleId,
  sourceVersion,
  observedAt: now,
  visibleUntil: value === null ? null : now + 300,
  document: value,
});
async function apply(
  value: ReturnType<typeof snapshot>,
  event: { id: string; titleId: string; version: number } | null,
) {
  const result = await projector.apply(value, { now, event }, signal());
  assert.equal(result.status, "completed");
  return result.value;
}
async function find(value: Record<string, unknown>): Promise<SearchPage> {
  const result = await search.execute(value, now, signal());
  assert.equal(result.status, "completed");
  assert.equal(result.value.status, "completed");
  return result.value.value;
}
async function migrate(direction: "up" | "down") {
  const sql = await readFile(
    new URL(`../../../migrations/0001-title-projections.${direction}.sql`, import.meta.url),
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

try {
  const version = await admin.query<{ server_version: string }>("SHOW server_version");
  assert.match(version.rows[0]?.server_version ?? "", /^18\.6/u);
  await migrate("up");
  await migrate("down");
  const emptyRollback = await admin.query<{ schema: string | null; roles: number }>(`SELECT
    to_regnamespace('discovery')::text AS schema,
    (SELECT count(*)::int FROM pg_roles WHERE rolname IN ('aster_discovery_runtime','aster_discovery_projector')) AS roles`);
  assert.deepEqual(emptyRollback.rows, [{ schema: null, roles: 0 }]);
  await migrate("up");
  await admin.query(`CREATE ROLE aster_discovery_projector_fixture LOGIN PASSWORD 'aster-test-only'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  await admin.query(`CREATE ROLE aster_discovery_runtime_fixture LOGIN PASSWORD 'aster-test-only'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  await admin.query("GRANT aster_discovery_projector TO aster_discovery_projector_fixture");
  await admin.query("GRANT aster_discovery_runtime TO aster_discovery_runtime_fixture");
  await admin.query(`CREATE SCHEMA catalog; REVOKE ALL ON SCHEMA catalog FROM PUBLIC;
    CREATE TABLE catalog.ownership_probe(id integer); INSERT INTO catalog.ownership_probe VALUES (1)`);
  output("discovery_migration", {
    postgres: version.rows[0]?.server_version,
    version: 1,
    emptyRollback: true,
  });

  assert.equal(
    (
      await apply(snapshot(titleSignal, 1, document("Café Signal", "A quiet transmission.")), {
        id: eventId,
        titleId: titleSignal,
        version: 1,
      })
    ).status,
    "applied",
  );
  assert.equal(
    (
      await apply(
        snapshot(titleSynopsis, 1, document("Archive", "A signal crosses the city.")),
        null,
      )
    ).status,
    "applied",
  );
  assert.equal(
    (await apply(snapshot(titleOcean, 1, document("Ocean", "A blue journey.", ["nature"])), null))
      .status,
    "applied",
  );
  const relevance = await find({ query: "signal", locale: "en", first: 20, after: null });
  assert.deepEqual(
    relevance.edges.map((edge) => edge.titleId),
    [titleSignal, titleSynopsis],
  );
  const localized = await find({ query: "café", locale: "pt-br", first: 20, after: null });
  assert.deepEqual(
    localized.edges.map((edge) => edge.titleId),
    [titleSignal],
  );
  output("discovery_relevance", {
    titleBeforeSynopsis: true,
    diacriticNormalization: true,
    resultCount: relevance.edges.length,
  });

  const first = await find({ query: "signal", locale: "en", first: 1, after: null });
  assert.ok(first.endCursor);
  assert.equal(
    (await apply(snapshot(titleInserted, 1, document("Signal Prime", "New insertion.")), null))
      .status,
    "applied",
  );
  const second = await find({
    query: "signal",
    locale: "en",
    first: 2,
    after: first.endCursor,
  });
  assert.equal(
    second.edges.some((edge) => edge.titleId === first.edges[0]?.titleId),
    false,
  );
  output("discovery_keyset", { duplicateAcrossInsert: false, cursorBoundToGeneration: true });

  assert.equal((await apply(snapshot(titleSignal, 1, null), null)).status, "refreshed");
  assert.equal(
    (await find({ query: "cafe", locale: "en", first: 20, after: null })).edges.length,
    0,
  );
  assert.equal(
    (await apply(snapshot(titleSignal, 1, document("Café Signal", "Resurrection.")), null)).status,
    "conflict",
  );
  assert.equal(
    (await apply(snapshot(titleSignal, 2, document("Café Signal", "Republished safely.")), null))
      .status,
    "applied",
  );
  output("discovery_retirement_fence", {
    sameVersionResurrection: "rejected",
    newerVersionRepublish: "applied",
  });

  const started = await rebuilder.start(
    { generation: generation2, startedAt: now, barrier: { 0: "10" } },
    signal(),
  );
  assert.deepEqual(started, { status: "completed", value: "started" });
  assert.equal((await apply(snapshot(titleOcean, 2, null), null)).status, "applied");
  const premature = await rebuilder.checkpoint(
    {
      generation: generation2,
      after: titleOcean,
      scanComplete: true,
      handled: { 0: "9" },
      rowsApplied: 4,
    },
    signal(),
  );
  assert.deepEqual(premature, { status: "completed", value: "checkpointed" });
  assert.deepEqual(
    await rebuilder.promote({ generation: generation2, completedAt: now + 1 }, signal()),
    {
      status: "completed",
      value: "conflict",
    },
  );
  assert.deepEqual(
    await rebuilder.checkpoint(
      {
        generation: generation2,
        after: titleOcean,
        scanComplete: true,
        handled: { 0: "10" },
        rowsApplied: 4,
      },
      signal(),
    ),
    { status: "completed", value: "checkpointed" },
  );
  assert.deepEqual(
    await rebuilder.promote({ generation: generation2, completedAt: now + 1 }, signal()),
    {
      status: "completed",
      value: "promoted",
    },
  );
  const expired = await search.execute(
    { query: "signal", locale: "en", first: 1, after: first.endCursor },
    now,
    signal(),
  );
  assert.equal(expired.status, "completed");
  assert.equal(expired.value.status, "cursor_expired");
  assert.deepEqual(
    await rebuilder.start(
      { generation: generation3, startedAt: now + 2, barrier: { 0: "11" } },
      signal(),
    ),
    { status: "completed", value: "started" },
  );
  const generations = await admin.query<{ state: string; count: number }>(
    "SELECT state,count(*)::int AS count FROM discovery.generations GROUP BY state ORDER BY state",
  );
  assert.deepEqual(generations.rows, [
    { state: "ACTIVE", count: 1 },
    { state: "BUILDING", count: 1 },
  ]);
  output("discovery_rebuild", {
    barrierRequired: true,
    cursorExpiredAfterPromotion: true,
    activeSurvivesPartialNextBuild: true,
    retainedGenerations: 2,
  });

  const client = await admin.connect();
  let denied = 0;
  try {
    for (const role of ["aster_discovery_runtime", "aster_discovery_projector"]) {
      await client.query("BEGIN");
      await client.query(`SET LOCAL ROLE ${role}`);
      await assert.rejects(client.query("SELECT * FROM catalog.ownership_probe"), {
        code: "42501",
      });
      await client.query("ROLLBACK");
      denied++;
    }
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE aster_discovery_runtime");
    await assert.rejects(
      client.query("UPDATE discovery.generation_titles SET source_version=source_version+1"),
      { code: "42501" },
    );
    await client.query("ROLLBACK");
    denied++;
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
  output("discovery_privileges", { deniedStatements: denied, catalogIsolation: true });

  const planClient = await admin.connect();
  let planText: string;
  try {
    await planClient.query("SET enable_seqscan=off");
    const plan = await planClient.query<{ "QUERY PLAN": unknown }>(`EXPLAIN (FORMAT JSON)
      SELECT title_id FROM discovery.search_documents
      WHERE search_vector @@ plainto_tsquery('simple','signal')`);
    planText = JSON.stringify(plan.rows[0]?.["QUERY PLAN"]);
  } finally {
    planClient.release();
  }
  assert.match(planText, /discovery_search_vector/u);
  await assert.rejects(migrate("down"), /Retain Discovery projection state/u);
  output("discovery_query_plan", { ginIndex: "discovery_search_vector", guardedRollback: true });
} finally {
  await projectorDatabase.close(AbortSignal.timeout(3000));
  await runtimeDatabase.close(AbortSignal.timeout(3000));
  await admin.end();
}
