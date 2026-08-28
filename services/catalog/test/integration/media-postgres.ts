import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import type { AsterPostgresAdapter } from "@aster/postgres";
import { createCatalogCommands } from "../../src/application/commands.js";
import { createCatalogMediaRequests } from "../../src/application/request-media.js";
import type { CatalogMediaUnitOfWork } from "../../src/application/media-ports.js";
import type { CatalogWorkflowUnitOfWork } from "../../src/application/operator-ports.js";
import { createPostgresCatalogMedia } from "../../src/infrastructure/persistence/postgres-media.js";
import { createPostgresCatalogWorkflow } from "../../src/infrastructure/persistence/postgres-workflow.js";
import { createLocalCatalogOperator } from "../../src/infrastructure/identity/local-operator.js";
import { catalogTestId as id, catalogTestTime as now } from "../rights-fixture.js";
import { hash, metadataFixture, rightsFacts } from "../workflow-fixture.js";

export async function verifyMediaRequests(
  admin: Pool,
  database: AsterPostgresAdapter,
): Promise<void> {
  const operator = createLocalCatalogOperator(
    { environment: "local", operatorEnabled: true, actorId: id(3) },
    now,
  );
  const request = {
    credential: operator.credential,
    correlationId: id(4),
    signal: new AbortController().signal,
  };
  const mediaStore = createPostgresCatalogMedia(database);
  const workflow = createPostgresCatalogWorkflow(database);
  let sequence = 880100;
  const nextId = () => id(sequence++);
  const commands = (transactions: CatalogWorkflowUnitOfWork = workflow) =>
    createCatalogCommands({
      authority: operator.authority,
      transactions,
      policy: { commercial: true },
      now: () => now,
      nextId,
      digest: hash,
    });
  const media = (transactions: CatalogMediaUnitOfWork = mediaStore) =>
    createCatalogMediaRequests({
      authority: operator.authority,
      transactions,
      policy: { commercial: true },
      now: () => now,
      digest: hash,
    });
  const prepare = async (titleId: string) => {
    assert.equal(
      (
        await commands().execute(
          "create",
          {
            titleId,
            expectedVersion: 0,
            mutationId: nextId(),
            metadata: metadataFixture(),
            rights: rightsFacts(),
          },
          request,
        )
      ).status,
      "completed",
    );
    assert.equal(
      (
        await commands().execute(
          "review",
          {
            titleId,
            expectedVersion: 2,
            mutationId: nextId(),
            decision: "approve",
            reason: "Synthetic media request review",
          },
          request,
        )
      ).status,
      "completed",
    );
  };
  const input = (titleId = id(880001)) => ({
    requestId: id(880010),
    titleId,
    expectedVersion: 3,
    rightsRevision: 2,
    recipeVersion: "hls-avc-aac-v1",
    source: {
      url: "https://example.invalid/source.mp4",
      bytes: 1000,
      etag: '"fixture-v1"',
      sha256: "a".repeat(64),
      container: "mp4",
    },
  });
  const count = async (titleId: string) =>
    (
      await admin.query<{ count: number }>(
        "SELECT count(*)::integer AS count FROM catalog.media_requests WHERE title_id = $1",
        [titleId],
      )
    ).rows[0]?.count;
  const output = (event: string, facts: Record<string, unknown>) =>
    process.stdout.write(JSON.stringify({ event, ...facts }) + "\n");
  try {
    await prepare(id(880001));
    const raced = await Promise.all(
      Array.from({ length: 8 }, () => media().request(input(), request)),
    );
    assert.equal(raced.filter((result) => result.status === "completed").length, 8);
    for (const result of raced) {
      assert.deepEqual(result, raced[0]);
    }
    assert.equal(await count(id(880001)), 1);
    const read = await createPostgresCatalogMedia(database).run(
      async (tx) => ({ status: "completed", value: await tx.findMediaRequest(input().requestId) }),
      request.signal,
    );
    assert.deepEqual(read, raced[0]);
    assert.equal(
      (await media().request({ ...input(), requestId: nextId() }, request)).status,
      "conflict",
    );
    assert.equal(
      (await media().request({ ...input(), source: { ...input().source, bytes: 1001 } }, request))
        .status,
      "conflict",
    );
    const title = (
      await admin.query<{ version: number; state: string; publication_id: string | null }>(
        "SELECT version, state, publication_id FROM catalog.titles WHERE id = $1",
        [id(880001)],
      )
    ).rows[0];
    assert.deepEqual(title, { version: 3, state: "RIGHTS_REVIEWED", publication_id: null });
    output("catalog_media_request_concurrency", {
      callers: 8,
      accepted: 8,
      durableRequests: 1,
      independentRead: true,
      changedReplayRefused: true,
      duplicateWorkRefused: true,
      editorialStateUnchanged: true,
    });

    const failed: CatalogMediaUnitOfWork = {
      run: (operation, signal) =>
        mediaStore.run(
          (tx) =>
            operation({
              ...tx,
              async insertMediaRequest(record) {
                assert.equal(await tx.insertMediaRequest(record), true);
                throw new Error("Injected failure after durable insert before commit");
              },
            }),
          signal,
        ),
    };
    const next = {
      ...input(),
      requestId: nextId(),
      source: { ...input().source, etag: '"second"' },
    };
    assert.equal((await media(failed).request(next, request)).status, "unavailable");
    assert.equal(await count(id(880001)), 1);
    assert.equal((await media().request(next, request)).status, "completed");
    assert.equal(await count(id(880001)), 2);

    const privileges = (
      await admin.query<{
        operator_read: boolean;
        operator_insert: boolean;
        immutable: boolean;
        reader_private: boolean;
      }>(
        "SELECT has_table_privilege('aster_catalog_local', 'catalog.media_requests', 'SELECT') AS operator_read, has_table_privilege('aster_catalog_local', 'catalog.media_requests', 'INSERT') AS operator_insert, NOT has_table_privilege('aster_catalog_local', 'catalog.media_requests', 'UPDATE,DELETE,TRUNCATE') AS immutable, NOT has_table_privilege('aster_catalog_reader_local', 'catalog.media_requests', 'SELECT,INSERT,UPDATE,DELETE') AS reader_private",
      )
    ).rows[0];
    assert.deepEqual(privileges, {
      operator_read: true,
      operator_insert: true,
      immutable: true,
      reader_private: true,
    });
    const guard = await admin.connect();
    try {
      await assert.rejects(
        guard.query(
          await readFile(
            new URL("../../../migrations/0004-media-requests.down.sql", import.meta.url),
            "utf8",
          ),
        ),
        { code: "P0001" },
      );
    } finally {
      await guard.query("ROLLBACK");
      guard.release();
    }
    assert.equal(await count(id(880001)), 2);
    output("catalog_media_request_rollback_privileges", {
      postInsertRollback: true,
      sameIdRetry: true,
      immutableOperatorAudit: true,
      privateFromReaders: true,
      nonemptyDownRefused: true,
    });

    for (let n = 2; n < 16; n++) {
      assert.equal(
        (
          await media().request(
            {
              ...input(),
              requestId: nextId(),
              source: { ...input().source, etag: '"version-' + String(n) + '"' },
            },
            request,
          )
        ).status,
        "completed",
      );
    }
    const overflow = {
      ...input(),
      requestId: nextId(),
      source: { ...input().source, etag: '"overflow"' },
    };
    assert.equal((await media().request(overflow, request)).status, "backpressure");
    assert.equal(await count(id(880001)), 16);
    assert.equal((await media().request(input(), request)).status, "completed");
    assert.equal(
      (
        await commands().execute(
          "retire",
          {
            titleId: id(880001),
            expectedVersion: 3,
            mutationId: nextId(),
            reason: "Synthetic capacity check",
          },
          request,
        )
      ).status,
      "completed",
    );
    assert.equal((await media().request(input(), request)).status, "rights_not_approved");
    output("catalog_media_request_capacity", {
      retainedRequests: 16,
      overflowRefused: true,
      replayUsesNoSlot: true,
      retirementNotBlocked: true,
      retiredReplayRefused: true,
    });

    await prepare(id(880002));
    const locked = Promise.withResolvers<undefined>();
    const attempted = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const disputeStore: CatalogWorkflowUnitOfWork = {
      run: (operation, signal) =>
        workflow.run(
          (tx) =>
            operation({
              ...tx,
              async lockTitle(titleId) {
                const found = await tx.lockTitle(titleId);
                locked.resolve(undefined);
                await release.promise;
                return found;
              },
            }),
          signal,
        ),
    };
    const waitingMedia: CatalogMediaUnitOfWork = {
      run: (operation, signal) =>
        mediaStore.run(
          (tx) =>
            operation({
              ...tx,
              async lockTitle(titleId) {
                attempted.resolve(undefined);
                return tx.lockTitle(titleId);
              },
            }),
          signal,
        ),
    };
    const disputed = commands(disputeStore).execute(
      "dispute",
      {
        titleId: id(880002),
        expectedVersion: 3,
        mutationId: nextId(),
        reason: "Synthetic simultaneous dispute",
      },
      request,
    );
    await locked.promise;
    const processing = media(waitingMedia).request(
      { ...input(id(880002)), requestId: nextId() },
      request,
    );
    try {
      await attempted.promise;
    } finally {
      release.resolve(undefined);
    }
    assert.equal((await disputed).status, "completed");
    assert.equal((await processing).status, "rights_not_approved");
    assert.equal(await count(id(880002)), 0);
    output("catalog_media_request_dispute_race", {
      synchronizedTitleLock: true,
      disputeCommitted: true,
      requestRefused: true,
      durableRequests: 0,
      sourceDownloads: 0,
    });
  } finally {
    operator.revoke();
    assert.equal((await database.close()).status, "completed");
  }
}
