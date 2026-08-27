import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import type { AsterPostgresAdapter } from "@aster/postgres";
import { createCatalogCommands } from "../../src/application/commands.js";
import type {
  CatalogWorkflowTransaction,
  CatalogWorkflowUnitOfWork,
} from "../../src/application/operator-ports.js";
import { createPostgresCatalogWorkflow } from "../../src/infrastructure/persistence/postgres-workflow.js";
import { createLocalCatalogOperator } from "../../src/infrastructure/identity/local-operator.js";
import { catalogTestId as id, catalogTestTime as now } from "../rights-fixture.js";
import { hash, metadataFixture, publicationFixture, rightsFacts } from "../workflow-fixture.js";

export async function verifyWorkflow(admin: Pool, database: AsterPostgresAdapter): Promise<void> {
  let sequence = 10000;
  const nextId = () => id(sequence++);
  const output = (event: string, facts: Record<string, unknown>) =>
    process.stdout.write(JSON.stringify({ event, ...facts }) + "\n");
  const migrate = async (direction: "up" | "down") => {
    const sql = await readFile(
      new URL(`../../../migrations/0002-editorial-workflow.${direction}.sql`, import.meta.url),
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
  };
  const transactions = createPostgresCatalogWorkflow(database);
  const operator = createLocalCatalogOperator(
    { environment: "local", operatorEnabled: true, actorId: id(3) },
    now,
  );
  const request = {
    credential: operator.credential,
    correlationId: id(4),
    signal: new AbortController().signal,
  };
  const commands = (unit: CatalogWorkflowUnitOfWork = transactions) =>
    createCatalogCommands({
      authority: operator.authority,
      transactions: unit,
      policy: { commercial: true },
      now: () => now,
      nextId,
      digest: hash,
    });
  const app = commands();
  const input = (titleId: string, version: number) => ({
    titleId,
    expectedVersion: version,
    mutationId: nextId(),
  });
  const read = async (titleId: string) => {
    const result = await transactions.run(
      async (tx) => ({
        status: "completed",
        value: {
          title: await tx.lockTitle(titleId),
          rights: await tx.findRights(titleId, null),
          metadata: await tx.findMetadata(titleId),
        },
      }),
      request.signal,
    );
    assert.equal(result.status, "completed");
    return result.value;
  };
  const counts = async (titleId: string) => {
    const result = await admin.query<{ audit: number; events: number; receipts: number }>(
      "SELECT (SELECT count(*)::integer FROM catalog.command_audit WHERE title_id = $1) AS audit, (SELECT count(*)::integer FROM catalog.publication_outbox WHERE title_id = $1) AS events, (SELECT count(*)::integer FROM catalog.command_receipts WHERE title_id = $1) AS receipts",
      [titleId],
    );
    return result.rows[0];
  };
  const prepare = async (titleId: string) => {
    const create = { ...input(titleId, 0), metadata: metadataFixture(), rights: rightsFacts() };
    const result = await app.execute("create", create, request);
    assert.equal(result.status, "completed");
    assert.equal(result.value.version, 2);
    assert.deepEqual(await app.execute("create", create, request), result);
    assert.equal(
      (
        await app.execute(
          "review",
          { ...input(titleId, 2), decision: "approve", reason: "Synthetic review only" },
          request,
        )
      ).status,
      "completed",
    );
    const publication = {
      ...publicationFixture(titleId),
      id: nextId(),
      validationReportId: nextId(),
    };
    await admin.query(
      "INSERT INTO catalog.publications (id, title_id, rights_revision, source_checksum, manifest_url, validation_report_id, validated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [
        publication.id,
        titleId,
        2,
        publication.sourceChecksum,
        publication.manifestUrl,
        publication.validationReportId,
        now,
      ],
    );
    assert.equal(
      (
        await app.execute(
          "media-ready",
          { ...input(titleId, 3), publicationId: publication.id },
          request,
        )
      ).status,
      "completed",
    );
    return publication;
  };
  const wrap = (
    decorate: (tx: CatalogWorkflowTransaction) => CatalogWorkflowTransaction,
  ): CatalogWorkflowUnitOfWork => ({
    run: (work, signal) => transactions.run((tx) => work(decorate(tx)), signal),
  });
  try {
    await migrate("up");
    await assert.rejects(migrate("up"));
    await migrate("down");
    await migrate("up");
    const forbidden = [
      "INSERT INTO catalog.publications DEFAULT VALUES",
      "UPDATE catalog.publications SET manifest_url = 'forged'",
      "DELETE FROM catalog.publications",
      "UPDATE catalog.command_audit SET reason = 'rewritten'",
      "DELETE FROM catalog.command_audit",
      "UPDATE catalog.publication_outbox SET event_type = 'forged'",
      "DELETE FROM catalog.publication_outbox",
      "UPDATE catalog.command_receipts SET actor_id = NULL",
    ];
    const client = await admin.connect();
    try {
      for (const sql of forbidden) {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE aster_catalog_runtime");
        await assert.rejects(client.query(sql), { code: "42501" });
        await client.query("ROLLBACK");
      }
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    output("catalog_workflow_migration_privileges", {
      roundTrip: true,
      forbiddenStatements: forbidden.length,
    });

    for (const first of ["publish", "dispute"] as const) {
      const titleId = nextId();
      await prepare(titleId);
      const locked = Promise.withResolvers<undefined>();
      const contender = Promise.withResolvers<undefined>();
      const firstApp = commands(
        wrap((tx) => ({
          ...tx,
          async lockTitle(value) {
            const title = await tx.lockTitle(value);
            locked.resolve(undefined);
            await contender.promise;
            return title;
          },
        })),
      );
      const secondApp = commands(
        wrap((tx) => ({
          ...tx,
          lockTitle(value) {
            contender.resolve(undefined);
            return tx.lockTitle(value);
          },
        })),
      );
      const second = first === "publish" ? "dispute" : "publish";
      const invoke = (
        executor: ReturnType<typeof commands>,
        kind: "publish" | "dispute",
        version: number,
      ) =>
        executor.execute(
          kind,
          {
            ...input(titleId, version),
            ...(kind === "dispute" ? { reason: "Synthetic concurrent dispute" } : {}),
          },
          request,
        );
      const winning = invoke(firstApp, first, 4);
      await locked.promise;
      const results = await Promise.all([winning, invoke(secondApp, second, 4)]);
      assert.deepEqual(
        results.map((result) => result.status),
        ["completed", "conflict"],
      );
      if (first === "publish") {
        assert.equal((await invoke(app, "dispute", 5)).status, "completed");
      }
      const stored = await read(titleId);
      assert.equal(stored.title?.state, "RETIRED");
      assert.equal(stored.rights?.record.status, "DISPUTED");
      const events = await admin.query<{
        event: { eventType: string; payload: { rightsRevision: number } };
      }>(
        "SELECT event FROM catalog.publication_outbox WHERE title_id = $1 ORDER BY title_version",
        [titleId],
      );
      assert.equal(events.rows.at(-1)?.event.eventType, "catalog.title-retired");
      assert.equal(events.rows.at(-1)?.event.payload.rightsRevision, 3);
      assert.equal(events.rowCount, first === "publish" ? 2 : 1);
      assert.equal(
        (await app.execute("publish", input(titleId, stored.title.version), request)).status,
        "rights_not_approved",
      );
      output("catalog_publish_dispute_serialization", {
        first,
        staleContender: "conflict",
        finalState: stored.title.state,
        events: events.rowCount,
      });
    }

    const faultTitle = nextId();
    await prepare(faultTitle);
    const before = await counts(faultTitle);
    for (const fault of ["throw", "abort"] as const) {
      const controller = new AbortController();
      const failing = commands(
        wrap((tx) => ({
          ...tx,
          async appendPublicationEvent(event) {
            await tx.appendPublicationEvent(event);
            if (fault === "throw") {
              throw new Error("Injected failure after event insert");
            }
            controller.abort();
          },
        })),
      );
      assert.equal(
        (
          await failing.execute("publish", input(faultTitle, 4), {
            ...request,
            signal: controller.signal,
          })
        ).status,
        fault === "throw" ? "unavailable" : "cancelled",
      );
      assert.equal((await read(faultTitle)).title?.state, "MEDIA_READY");
      assert.deepEqual(await counts(faultTitle), before);
    }
    output("catalog_workflow_atomic_faults", {
      faults: ["throw-after-outbox", "abort-after-outbox"],
      unchanged: true,
    });

    const replay = input(faultTitle, 4);
    const published = await app.execute("publish", replay, request);
    assert.equal(published.status, "completed");
    assert.deepEqual(await app.execute("publish", replay, request), published);
    assert.equal(
      (await app.execute("publish", { ...replay, expectedVersion: 3 }, request)).status,
      "conflict",
    );
    assert.deepEqual(await counts(faultTitle), { audit: 4, events: 1, receipts: 4 });
    const receipt = await admin.query(
      "SELECT slot FROM catalog.command_receipts WHERE title_id = $1 AND mutation_id = $2",
      [faultTitle, replay.mutationId],
    );
    assert.equal(receipt.rowCount, 1);
    await admin.query("UPDATE catalog.command_receipts SET expires_at = $2 WHERE title_id = $1", [
      faultTitle,
      now,
    ]);
    assert.equal(
      (
        await app.execute(
          "retire",
          { ...input(faultTitle, 5), reason: "Synthetic retirement" },
          request,
        )
      ).status,
      "completed",
    );
    assert.deepEqual(await counts(faultTitle), { audit: 5, events: 2, receipts: 1 });
    output("catalog_workflow_replay_expiry", {
      exactlyOnceAudit: true,
      changedReplayRejected: true,
      expiredReceiptsReclaimed: 4,
    });

    for (const resource of ["receipts", "outbox"] as const) {
      const titleId = nextId();
      await prepare(titleId);
      const limit = resource === "receipts" ? 63 : 127;
      // Fill with explicitly synthetic persisted facts, not application success claims.
      await admin.query("DELETE FROM catalog.command_receipts WHERE title_id = $1", [titleId]);
      for (let n = 1; n <= limit; n++) {
        const auditId = nextId();
        const mutationId = nextId();
        const version = 100 + n;
        await admin.query(
          "INSERT INTO catalog.command_audit (id,title_id,title_version,kind,actor_id,occurred_at,correlation_id,mutation_id) VALUES ($1,$2,$3,'publish',$4,$5,$6,$7)",
          [auditId, titleId, version, id(3), now, id(4), mutationId],
        );
        if (resource === "receipts") {
          await admin.query(
            "INSERT INTO catalog.command_receipts (title_id,mutation_id,actor_id,digest,expires_at,slot,title_version,result) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)",
            [
              titleId,
              mutationId,
              id(3),
              "a".repeat(64),
              now + 86400,
              n,
              version,
              JSON.stringify({
                titleId,
                version,
                state: "MEDIA_READY",
                rightsRevision: 2,
                publicationId: (await read(titleId)).title?.publicationId,
              }),
            ],
          );
        } else {
          const eventId = nextId();
          const event = {
            eventId,
            eventType: "catalog.title-published",
            schemaVersion: 1,
            producer: "catalog",
            occurredAt: new Date(now * 1000).toISOString(),
            correlationId: id(4),
            causationId: mutationId,
            aggregate: { type: "Title", id: titleId, version },
            trace: {},
            payload: { titleId, publicationId: null, rightsRevision: 2 },
          };
          await admin.query(
            "INSERT INTO catalog.publication_outbox (event_id,title_id,title_version,slot,event_type,event) VALUES ($1,$2,$3,$4,'catalog.title-published',$5::jsonb)",
            [eventId, titleId, version, n, JSON.stringify(event)],
          );
        }
      }
      assert.equal(
        (await app.execute("publish", input(titleId, 4), request)).status,
        "backpressure",
      );
      assert.equal(
        (
          await app.execute(
            "retire",
            { ...input(titleId, 4), reason: "Reserved takedown" },
            request,
          )
        ).status,
        "completed",
      );
      const full = await counts(titleId);
      assert.equal(resource === "receipts" ? full?.receipts : full?.events, limit + 1);
      const table =
        resource === "receipts" ? "catalog.command_receipts" : "catalog.publication_outbox";
      await assert.rejects(
        admin.query(`UPDATE ${table} SET slot = $2 WHERE title_id = $1 AND slot = 1`, [
          titleId,
          limit + 2,
        ]),
        { code: "23514" },
      );
      output("catalog_reserved_takedown_capacity", {
        resource,
        normalLimit: limit,
        retiredAtFullCapacity: limit + 1,
        databaseBound: true,
      });
    }

    const metadataTitle = nextId();
    const metadata = {
      ...metadataFixture(),
      localizations: [{ locale: "en", title: "🎬".repeat(80), synopsis: "界".repeat(1024) }],
      artwork: {
        url: "https://example.invalid/poster.png",
        altText: "Synthetic poster",
        rights: rightsFacts({ assetSourceUrl: "https://example.invalid/poster.png" }),
      },
    };
    assert.equal(
      (
        await app.execute(
          "create",
          { ...input(metadataTitle, 0), metadata, rights: rightsFacts() },
          request,
        )
      ).status,
      "completed",
    );
    assert.equal(
      (
        await app.execute(
          "review",
          { ...input(metadataTitle, 2), decision: "approve", reason: "Independent asset review" },
          request,
        )
      ).status,
      "completed",
    );
    const snapshots = await admin.query<{
      metadata: { artwork: { rights: { status: string; reviewedBy: string | null } } };
    }>("SELECT metadata FROM catalog.command_audit WHERE title_id = $1 ORDER BY title_version", [
      metadataTitle,
    ]);
    assert.deepEqual(
      snapshots.rows.map((entry) => entry.metadata.artwork.rights.status),
      ["DRAFT", "APPROVED"],
    );
    assert.equal(snapshots.rows[1]?.metadata.artwork.rights.reviewedBy, id(3));
    assert.equal(
      (await read(metadataTitle)).metadata?.localizations[0]?.synopsis,
      "界".repeat(1024),
    );
    output("catalog_metadata_audit", { unicodeRoundTrip: true, immutableArtworkReviews: 2 });
    operator.revoke();
    assert.equal(
      (await app.execute("retire", { ...input(metadataTitle, 3), reason: "Revoked" }, request))
        .status,
      "unauthorized",
    );
  } finally {
    await database.close();
  }
}
