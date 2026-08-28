import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createAsterPostgresAdapter, type AsterPostgresQuery } from "@aster/postgres";
import { migrateLocalEngagement } from "../../src/infrastructure/local-migrations.js";
import { createPostgresProgress } from "../../src/infrastructure/postgres-progress.js";
import { createPostgresWatchlist } from "../../src/infrastructure/postgres-watchlist.js";
import { createPostgresEngagementFields } from "../../src/infrastructure/postgres-engagement-fields.js";
import { createProgressRecorder } from "../../src/application/record-progress.js";
import { createWatchlistWriter } from "../../src/application/set-watchlist.js";
import { createEngagementFieldQueries } from "../../src/application/read-engagement-fields.js";
import { createEngagementFieldLoaders } from "../../src/transport/engagement-field-loaders.js";
import { DEFAULT_PROGRESS_POLICY } from "../../src/domain/progress.js";
import type { ProgressPorts, ProgressCatalog } from "../../src/application/progress-ports.js";

assert.equal(process.env["ASTER_POSTGRES_DISPOSABLE_FIXTURE"], "true");
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
endpoint.username = "aster_engagement_local";
const database = createAsterPostgresAdapter({
  connectionString: endpoint.toString(),
  maxConnections: 2,
  connectionTimeoutMs: 500,
  operationTimeoutMs: 1000,
  statementTimeoutMs: 900,
  telemetry: {
    startDependencyOperation: () => ({ status: "rejected", reason: "telemetry_closed" }),
  },
});
const now = () => Math.floor(Date.now() / 1000);
const signal = () => AbortSignal.timeout(5000);
const emit = (event: string, value: object) =>
  process.stdout.write(JSON.stringify({ event, ...value }) + "\n");
const accountId = randomUUID(),
  profileId = randomUUID(),
  playbackSessionId = randomUUID();
const keys = Array.from({ length: 20 }, () => ({ accountId, profileId, titleId: randomUUID() }));
const request = () => ({
  credential: "synthetic-fields",
  correlationId: randomUUID(),
  signal: signal(),
});
let ownerReads = 0,
  catalogReads = 0,
  statements = 0;
let lastQuery: AsterPostgresQuery | undefined;
const identity: ProgressPorts["identity"] = {
  authorizeProfile: (_credential, requestedProfile) => {
    ownerReads++;
    return Promise.resolve({
      status: "completed",
      value: { accountId, profileId: requestedProfile, checkedAt: now(), expiresAt: now() + 300 },
    });
  },
};
const catalog: ProgressCatalog = {
  visibility: (ids) => {
    catalogReads++;
    return Promise.resolve({
      status: "completed",
      value: {
        checkedAt: now(),
        expiresAt: now() + 2,
        titles: ids.map((titleId) => ({ titleId, visible: true })),
      },
    });
  },
};
const common = {
  identity,
  catalog,
  now,
  nextId: randomUUID,
  digest: (value: string) => createHash("sha256").update(value).digest("hex"),
};
const fields = createPostgresEngagementFields({
  transaction: (work, requestSignal) =>
    database.transaction(
      (tx) =>
        work({
          query: (query) => {
            statements++;
            lastQuery = query;
            return tx.query(query);
          },
        }),
      requestSignal,
    ),
});
const queries = createEngagementFieldQueries({ identity, catalog, store: fields, now });
const counts = async () =>
  (
    await admin.query<{
      progress: number;
      memberships: number;
      progress_receipts: number;
      watchlist_receipts: number;
      events: number;
    }>(`SELECT
  (SELECT count(*)::integer FROM engagement.progress) AS progress,
  (SELECT count(*)::integer FROM engagement.watchlist_entries) AS memberships,
  (SELECT count(*)::integer FROM engagement.progress_receipts) AS progress_receipts,
  (SELECT count(*)::integer FROM engagement.watchlist_receipts) AS watchlist_receipts,
  (SELECT count(*)::integer FROM engagement.outbox) AS events`)
  ).rows;

try {
  const version = (await admin.query<{ server_version: string }>("SHOW server_version")).rows[0]
    ?.server_version;
  assert.match(version ?? "", /^18\.6/u);
  assert.deepEqual(
    (
      await migrateLocalEngagement(
        {
          ASTER_ENVIRONMENT: "local",
          ASTER_ENGAGEMENT_MIGRATION_ENABLED: "true",
          ASTER_ENGAGEMENT_ADMIN_DATABASE_URL: `postgresql://aster@${host}:${port}/aster`,
          ASTER_ENGAGEMENT_ADMIN_DATABASE_PASSWORD: "aster-test-only",
        },
        signal(),
      )
    ).applied,
    [1, 2],
  );
  const writer = createWatchlistWriter({ ...common, store: createPostgresWatchlist(database) });
  const recorder = createProgressRecorder({
    ...common,
    ...createPostgresProgress(database),
    playback: {
      inspect: (sessionId, titleId) =>
        Promise.resolve({
          status: "completed",
          value: {
            sessionId,
            titleId,
            checkedAt: now(),
            createdAt: now() - 10,
            expiresAt: now() + 300,
          },
        }),
    },
    policy: DEFAULT_PROGRESS_POLICY,
    limits: { receiptSeconds: 3600, maximumReceipts: 1024, maximumOutbox: 1024 },
  });
  for (const [index, key] of keys.entries()) {
    assert.equal(
      (
        await writer.set(
          { profileId, titleId: key.titleId, idempotencyKey: randomUUID(), present: true },
          request(),
        )
      ).status,
      "completed",
    );
    if (index < 18) {
      assert.equal(
        (
          await recorder.record(
            {
              profileId,
              titleId: key.titleId,
              playbackSessionId,
              idempotencyKey: randomUUID(),
              sequence: 1,
              positionMs: 1000,
              durationMs: 6000,
              occurredAt: now(),
            },
            request(),
          )
        ).status,
        "completed",
      );
    }
  }
  const before = await counts();
  statements = 0;
  const baselineStarted = performance.now();
  for (const key of keys) {
    assert.equal((await fields.read([key], signal())).status, "completed");
  }
  const baseline = {
    queries: statements,
    durationMs: Number((performance.now() - baselineStarted).toFixed(3)),
  };
  assert.equal(baseline.queries, 20);
  statements = 0;
  ownerReads = 0;
  catalogReads = 0;
  const loader = createEngagementFieldLoaders(queries, request());
  const started = performance.now();
  const data = await Promise.all(
    keys.map(async ({ profileId, titleId }) => {
      const key = { profileId, titleId };
      const [progress, membership] = await Promise.all([
        loader.progress(key),
        loader.inWatchlist(key),
      ]);
      return { progress, membership };
    }),
  );
  const batched = {
    queries: statements,
    durationMs: Number((performance.now() - started).toFixed(3)),
    ownerReads,
    catalogReads,
  };
  assert.equal(batched.queries, 1);
  assert.equal(ownerReads, 1);
  assert.equal(catalogReads, 1);
  assert.ok(data.every((row) => row.membership));
  assert.equal(data.filter((row) => row.progress === null).length, 2);
  for (const [index, row] of data.slice(0, 18).entries()) {
    assert.equal(row.progress?.titleId, keys[index]?.titleId);
  }
  assert.ok(lastQuery);
  const plan = await admin.query("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + lastQuery.text, [
    ...(lastQuery.values ?? []),
  ]);
  emit("engagement_fields_query_count", {
    postgres: version,
    workload: "20 title pairs, 18 progress rows, 20 memberships, 40 fields",
    baselineKind: "synthetic sequential per-pair SQL, not a previous production implementation",
    baseline,
    batched,
    limitations:
      "single small local fixture; timings are observations, not throughput or SLO claims",
  });
  emit("engagement_fields_query_plan", { plan: plan.rows });
  const absent = { accountId, profileId, titleId: randomUUID() };
  const firstKey = keys[0];
  assert.ok(firstKey);
  const mixed = await fields.read([firstKey, absent], signal());
  assert.equal(mixed.status, "completed");
  const emptyRow = mixed.value[1];
  assert.ok(emptyRow);
  assert.equal(emptyRow.progress, null);
  assert.equal(emptyRow.inWatchlist, false);
  const foreign = await fields.read([{ ...firstKey, accountId: randomUUID() }], signal());
  assert.equal(foreign.status, "completed");
  const foreignRow = foreign.value[0];
  assert.ok(foreignRow);
  assert.equal(foreignRow.deleted, true);
  assert.equal(foreignRow.progress, null);
  assert.equal(foreignRow.inWatchlist, false);
  assert.deepEqual(await counts(), before);
  await admin.query("UPDATE engagement.profile_guards SET deleted=true WHERE profile_id=$1", [
    profileId,
  ]);
  const deleted = await queries.scope(request()).read([{ profileId, titleId: firstKey.titleId }]);
  assert.equal(deleted[0]?.status, "not_found");
  assert.deepEqual(await counts(), before);
  emit("engagement_fields_sql_boundaries", {
    ownerRole: "aster_engagement_local",
    missingPairs: "preserved",
    foreignOwner: "no_disclosure",
    deletionFence: "not_found",
    readWrites: 0,
    schemaVersions: [1, 2],
  });
} finally {
  await database.close(AbortSignal.timeout(2000));
  await admin.end();
}
