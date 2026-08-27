import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

import { Pool } from "pg";
import { createAsterPostgresAdapter } from "@aster/postgres";
import { createAsterTelemetry } from "@aster/telemetry";

import { createPostgresCatalogRights } from "../../src/infrastructure/persistence/postgres-rights.js";
import { verifyWorkflow } from "./workflow-postgres.js";
import { verifyOperatorCli } from "./operator-cli.js";
import { verifyPublicCatalog } from "./public-postgres.js";
import { catalogTestId as id, provenanceFixture, rightsFixture } from "../rights-fixture.js";
import type {
  CatalogRightsTransaction,
  CatalogStoreResult,
} from "../../src/application/rights-ports.js";

const port = Number(process.argv[2]);
assert.ok(Number.isSafeInteger(port) && port > 1023 && port < 65536);
const endpoint = new URL(`postgresql://127.0.0.1:${port}/aster`);
endpoint.username = "aster";
endpoint.password = "aster-test-only";
const admin = new Pool({
  connectionString: endpoint.toString(),
  max: 2,
  connectionTimeoutMillis: 1000,
  statement_timeout: 2000,
  query_timeout: 2500,
  idleTimeoutMillis: 1000,
});
admin.on("error", () => undefined);
endpoint.username = "aster_catalog_fixture";
const connectionString = endpoint.toString();
const telemetry = createAsterTelemetry({
  serviceName: "catalog-rights-integration",
  serviceVersion: "0.0.0",
  environment: "test",
  export: { mode: "none" },
});
const makeDatabase = (username = "aster_catalog_fixture") => {
  const endpoint = new URL(connectionString);
  endpoint.username = username;
  return createAsterPostgresAdapter({
    connectionString: endpoint.toString(),
    telemetry,
    maxConnections: 8,
    connectionTimeoutMs: 1000,
    operationTimeoutMs: 2000,
    statementTimeoutMs: 1000,
  });
};
let database = makeDatabase();
let store = createPostgresCatalogRights(database);
const signal = () => new AbortController().signal;
const output = (event: string, data: Record<string, unknown> = {}) =>
  process.stdout.write(JSON.stringify({ event, ...data }) + "\n");
async function migrate(direction: "up" | "down") {
  const sql = await readFile(
    new URL(`../../../migrations/0001-rights-history.${direction}.sql`, import.meta.url),
    "utf8",
  );
  const client = await admin.connect();
  try {
    await client.query(sql);
  } catch (error) {
    client.release(true);
    throw error;
  }
  client.release();
}
async function completed<T>(
  operation: (tx: CatalogRightsTransaction) => Promise<CatalogStoreResult<T>>,
) {
  const result = await store.run(operation, signal());
  assert.equal(result.status, "completed");
  return result.value;
}
const append = (revision: number, expectedVersion: number, recordId = id(revision + 10)) =>
  completed(async (tx) => ({
    status: "completed",
    value: await tx.appendRights(
      rightsFixture({
        id: recordId,
        revision,
        status: revision === 1 ? "DRAFT" : "NEEDS_CLARIFICATION",
        evidenceLocations: ["evidence/phase-03/synthetic-review.txt"],
      }),
      expectedVersion,
      provenanceFixture(),
    ),
  }));
const history = () =>
  completed(async (tx) => ({
    status: "completed",
    value: await tx.listRights(id(1), null, 50),
  }));
async function eventually(predicate: () => Promise<boolean>) {
  const until = performance.now() + 2000;
  while (!(await predicate())) {
    assert.ok(performance.now() < until, "Expected PostgreSQL state did not appear.");
    await delay(10);
  }
}
async function verify() {
  await migrate("up");
  await admin.query(
    "CREATE ROLE aster_catalog_fixture LOGIN PASSWORD 'aster-test-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
  );
  await admin.query("GRANT aster_catalog_runtime TO aster_catalog_fixture");
  await assert.rejects(migrate("up"));
  await admin.query("CREATE SCHEMA identity");
  await admin.query("REVOKE ALL ON SCHEMA identity FROM PUBLIC");
  await admin.query("CREATE TABLE identity.synthetic_private (id integer)");
  const restricted = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 1000,
    query_timeout: 2000,
    statement_timeout: 1500,
  });
  restricted.on("error", () => undefined);
  try {
    for (const sql of [
      "SELECT * FROM identity.synthetic_private",
      "CREATE TABLE catalog.forbidden (id integer)",
      "INSERT INTO catalog.schema_migrations(version) VALUES (2)",
      "UPDATE catalog.rights_revisions SET status = 'APPROVED'",
      "DELETE FROM catalog.rights_revisions",
      "UPDATE catalog.rights_audit SET actor_id = NULL",
      "DELETE FROM catalog.rights_audit",
      "UPDATE catalog.titles SET state = 'PUBLISHED'",
      "UPDATE catalog.titles SET id = NULL",
      "CREATE ROLE forbidden_catalog NOLOGIN",
    ]) {
      await assert.rejects(restricted.query(sql), { code: "42501" });
    }
  } finally {
    await restricted.end();
  }
  output("catalog_migration_isolation", { duplicateRefused: true, forbiddenStatements: 10 });

  assert.equal(
    await completed(async (tx) => ({ status: "completed", value: await tx.lockTitle(id(1)) })),
    undefined,
  );
  assert.equal(
    await completed(async (tx) => ({ status: "completed", value: await tx.createDraft(id(1)) })),
    true,
  );
  assert.equal(
    await completed(async (tx) => ({ status: "completed", value: await tx.createDraft(id(1)) })),
    false,
  );
  assert.equal(await append(1, 1), true);
  assert.equal(await append(2, 2), true);
  assert.equal(await append(3, 1), false);
  const stored = await history();
  assert.deepEqual(
    stored.map((entry) => entry.record.revision),
    [2, 1],
  );
  assert.equal(stored[0]?.actorId, provenanceFixture().actorId);
  assert.equal(stored[0].record.evidenceLocations[0], "evidence/phase-03/synthetic-review.txt");
  assert.equal(stored[1]?.record.status, "DRAFT");
  assert.equal(
    (await completed(async (tx) => ({ status: "completed", value: await tx.findRights(id(1), 1) })))
      ?.titleVersion,
    2,
  );
  assert.equal(
    await completed(async (tx) => ({
      status: "completed",
      value: await tx.findRights(id(99), null),
    })),
    undefined,
  );
  output("catalog_rights_round_trip", {
    revisions: 2,
    provenance: true,
    staleVersionRefused: true,
  });

  const barrier = Promise.withResolvers<undefined>();
  let arrived = 0;
  const raced = await Promise.all(
    Array.from({ length: 8 }, (_, n) =>
      completed(async (tx) => {
        if (++arrived === 8) {
          barrier.resolve(undefined);
        }
        await barrier.promise;
        return {
          status: "completed",
          value: await tx.appendRights(
            rightsFixture({ id: id(100 + n), revision: 3 }),
            3,
            provenanceFixture(),
          ),
        };
      }),
    ),
  );
  assert.equal(arrived, 8);
  assert.equal(raced.filter(Boolean).length, 1);
  assert.equal(raced.filter((value) => !value).length, 7);
  const page = await completed(async (tx) => ({
    status: "completed",
    value: await tx.listRights(id(1), null, 2),
  }));
  assert.deepEqual(
    page.map((entry) => entry.record.revision),
    [3, 2],
  );
  assert.equal(await append(4, 4), true);
  const nextPage = await completed(async (tx) => ({
    status: "completed",
    value: await tx.listRights(id(1), 2, 2),
  }));
  assert.deepEqual(
    nextPage.map((entry) => entry.record.revision),
    [1],
  );
  assert.equal((await history()).length, 4);
  output("catalog_concurrency_keyset", {
    callers: 8,
    committed: 1,
    stale: 7,
    stablePages: true,
    synchronizedTransactions: arrived,
  });

  for (const fault of ["throw", "rollback", "abort"] as const) {
    const controller = new AbortController();
    const outcome = await store.run(async (tx) => {
      assert.equal(
        await tx.appendRights(rightsFixture({ id: id(20), revision: 5 }), 5, provenanceFixture()),
        true,
      );
      if (fault === "throw") {
        throw new Error("Injected post-write failure.");
      }
      if (fault === "rollback") {
        return { status: "conflict" };
      }
      controller.abort();
      return { status: "completed", value: true };
    }, controller.signal);
    assert.equal(
      outcome.status,
      fault === "throw" ? "unavailable" : fault === "abort" ? "cancelled" : "conflict",
    );
    await eventually(async () => (await history()).length === 4);
  }
  assert.equal(
    (await completed(async (tx) => ({ status: "completed", value: await tx.lockTitle(id(1)) })))
      ?.version,
    5,
  );
  output("catalog_atomic_rollback", {
    faults: ["throw", "rollback", "abort"],
    retainedRevisions: 4,
    titleVersion: 5,
  });

  for (const mode of ["abort", "timeout"] as const) {
    const blocker = await admin.connect();
    const controller = new AbortController();
    const started = performance.now();
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM catalog.titles WHERE id = $1 FOR UPDATE", [id(1)]);
      const pending = store.run(
        async (tx) => ({
          status: "completed",
          value: await tx.appendRights(
            rightsFixture({ id: id(20), revision: 5 }),
            5,
            provenanceFixture(),
          ),
        }),
        controller.signal,
      );
      await eventually(async () => {
        const result = await admin.query<{ waiting: number }>(
          "SELECT count(*)::integer AS waiting FROM pg_stat_activity WHERE usename = 'aster_catalog_fixture' AND wait_event_type = 'Lock'",
        );
        return (result.rows[0]?.waiting ?? 0) > 0;
      });
      if (mode === "abort") {
        controller.abort();
      }
      assert.equal((await pending).status, mode === "abort" ? "cancelled" : "unavailable");
      assert.ok(performance.now() - started < 4000);
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
    }
    assert.equal((await history()).length, 4);
    output("catalog_lock_failure", {
      mode,
      durationMs: Math.round(performance.now() - started),
      retainedRevisions: 4,
    });
  }

  const auditGuard = await admin.connect();
  try {
    await auditGuard.query("BEGIN");
    await auditGuard.query(
      "DELETE FROM catalog.rights_audit WHERE title_id = $1 AND revision = 1",
      [id(1)],
    );
    await assert.rejects(auditGuard.query("COMMIT"), { code: "23503" });
    await auditGuard.query("ROLLBACK");
  } finally {
    auditGuard.release();
  }
  await assert.rejects(
    admin.query(
      "UPDATE catalog.rights_revisions SET record = jsonb_set(record, '{titleId}', to_jsonb($1::text)) WHERE title_id = $2 AND revision = 1",
      [id(99), id(1)],
    ),
    { code: "23514" },
  );
  await assert.rejects(
    admin.query("UPDATE catalog.titles SET latest_rights_revision = 999 WHERE id = $1", [id(1)]),
    { code: "23503" },
  );
  const plan = await admin.query(
    "EXPLAIN (FORMAT JSON) SELECT revision FROM catalog.rights_revisions WHERE title_id = $1 AND revision < 4 ORDER BY revision DESC LIMIT 2",
    [id(1)],
  );
  output("catalog_constraints_query_plan", {
    provenanceRequired: true,
    ownerProjectionRequired: true,
    latestMustExist: true,
    plan: plan.rows,
  });

  assert.equal((await database.close()).status, "completed");
  assert.equal(
    (
      await store.run(
        async (tx) => ({ status: "completed", value: await tx.findRights(id(1), null) }),
        signal(),
      )
    ).status,
    "unavailable",
  );
  database = makeDatabase();
  store = createPostgresCatalogRights(database);
  assert.equal((await history()).length, 4);
  output("catalog_adapter_reconnect", { retainedRevisions: 4, closedAdapterFails: true });

  const unicode = rightsFixture({
    id: id(61),
    titleId: id(60),
    workTitle: "🎬".repeat(512),
    creator: "🎬".repeat(512),
    copyrightHolder: "🎬".repeat(512),
    attributionText: "🎬".repeat(512),
    modificationNotice: "🎬".repeat(512),
  });
  await completed(async (tx) => {
    assert.equal(await tx.createDraft(id(60)), true);
    assert.equal(await tx.appendRights(unicode, 1, provenanceFixture()), true);
    assert.equal(
      await tx.appendRights(rightsFixture({ id: id(99), titleId: id(99) }), 1, provenanceFixture()),
      false,
    );
    return { status: "completed", value: true };
  });
  const unicodeRoundTrip = await completed(async (tx) => ({
    status: "completed",
    value: await tx.findRights(id(60), 1),
  }));
  assert.deepEqual(unicodeRoundTrip?.record, unicode);
  output("catalog_unicode_orphan_guard", {
    jsonBytes: Buffer.byteLength(JSON.stringify(unicode)),
    exactRoundTrip: true,
    missingTitleRejected: true,
  });

  await admin.query(
    "CREATE TABLE catalog.future_guard (rights_id uuid REFERENCES catalog.rights_revisions(id))",
  );
  await assert.rejects(migrate("down"));
  assert.equal((await history()).length, 4);
  await admin.query("DROP TABLE catalog.future_guard");
  await database.close();
  await migrate("down");
  const absent = await admin.query<{ schema: string | null }>(
    "SELECT to_regnamespace('catalog')::text AS schema",
  );
  assert.equal(absent.rows[0]?.schema, null);
  await migrate("up");
  const empty = await admin.query<{ count: number }>(
    "SELECT count(*)::integer AS count FROM catalog.titles",
  );
  assert.equal(empty.rows[0]?.count, 0);
  output("catalog_migration_round_trip", { dependencyGuard: true, cleanReinstall: true });
  await admin.query("GRANT aster_catalog_runtime TO aster_catalog_fixture");
  await verifyWorkflow(admin, makeDatabase());
  await verifyOperatorCli(admin, port);
  await admin.query("GRANT aster_catalog_runtime TO aster_catalog_fixture");
  await verifyPublicCatalog(admin, makeDatabase(), makeDatabase("aster_catalog_reader_fixture"));
}
try {
  await verify();
} catch (error) {
  output("catalog_integration_failed", {
    name: error instanceof Error ? error.name : "unknown",
    message: error instanceof Error ? error.message : "Unknown failure",
    locations:
      error instanceof Error
        ? error.stack
            ?.split("\n")
            .filter((line) =>
              /(?:rights-postgres|workflow-postgres|operator-cli|public-postgres)\.js/u.test(line),
            )
            .slice(0, 3)
        : [],
  });
  process.exitCode = 1;
} finally {
  await database.close();
  await admin.end();
  assert.equal((await telemetry.shutdown()).status, "completed");
  output("catalog_resources_closed", { reservedSlots: database.snapshot().reservedSlots });
}
