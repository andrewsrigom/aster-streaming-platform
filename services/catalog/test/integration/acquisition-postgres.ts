import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import type { AsterPostgresAdapter } from "@aster/postgres";
import { createCatalogAcquisitions } from "../../src/application/acquire-media.js";
import type { AcquisitionUnitOfWork } from "../../src/application/acquisition-ports.js";
import { createCatalogCommands } from "../../src/application/commands.js";
import { createCatalogMediaRequests } from "../../src/application/request-media.js";
import { ACQUISITION_LEASE_SECONDS, originalKey } from "../../src/domain/media-acquisition.js";
import { createLocalCatalogOperator } from "../../src/infrastructure/identity/local-operator.js";
import { createPostgresCatalogAcquisitions } from "../../src/infrastructure/persistence/postgres-acquisition.js";
import { createPostgresCatalogMedia } from "../../src/infrastructure/persistence/postgres-media.js";
import { createPostgresCatalogWorkflow } from "../../src/infrastructure/persistence/postgres-workflow.js";
import { catalogTestId as id, catalogTestTime } from "../rights-fixture.js";
import { hash, metadataFixture, rightsFacts } from "../workflow-fixture.js";

export async function verifyAcquisitions(
  admin: Pool,
  database: AsterPostgresAdapter,
): Promise<void> {
  let time = catalogTestTime;
  let sequence = 890100;
  const nextId = () => id(sequence++);
  const now = () => time;
  const operator = createLocalCatalogOperator(
    { environment: "local", operatorEnabled: true, actorId: id(3) },
    now(),
  );
  const request = {
    credential: operator.credential,
    signal: new AbortController().signal,
    correlationId: id(4),
  };
  const common = {
    authority: operator.authority,
    now,
    policy: { commercial: true },
    nextId,
    digest: hash,
  };
  const commands = createCatalogCommands({
    ...common,
    transactions: createPostgresCatalogWorkflow(database),
  });
  const media = createCatalogMediaRequests({
    ...common,
    transactions: createPostgresCatalogMedia(database),
  });
  const store = createPostgresCatalogAcquisitions(database);
  const acquisitions = (transactions: AcquisitionUnitOfWork = store) =>
    createCatalogAcquisitions({ ...common, transactions });
  const original = { sha256: "a".repeat(64), bytes: 1000, key: originalKey("a".repeat(64)) };
  async function prepare() {
    const titleId = nextId();
    assert.equal(
      (
        await commands.execute(
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
        await commands.execute(
          "review",
          {
            titleId,
            expectedVersion: 2,
            mutationId: nextId(),
            decision: "approve",
            reason: "Synthetic acquisition review",
          },
          request,
        )
      ).status,
      "completed",
    );
    const requestId = nextId();
    assert.equal(
      (
        await media.request(
          {
            requestId,
            titleId,
            expectedVersion: 3,
            rightsRevision: 2,
            recipeVersion: "hls-avc-aac-v1",
            source: {
              url: "https://example.invalid/source.mp4",
              bytes: original.bytes,
              etag: '"fixture-v1"',
              sha256: original.sha256,
              container: "mp4",
            },
          },
          request,
        )
      ).status,
      "completed",
    );
    return { requestId, titleId };
  }
  const output = (event: string, data: Record<string, unknown>) =>
    process.stdout.write(JSON.stringify({ event, ...data }) + "\n");
  try {
    const first = await prepare();
    assert.equal(
      (await acquisitions().claim(first.requestId, { ...request, credential: {} })).status,
      "unauthorized",
    );
    const raced = await Promise.all(
      Array.from({ length: 8 }, () => acquisitions().claim(first.requestId, request)),
    );
    const winners = raced.filter((item) => item.status === "completed");
    assert.equal(winners.length, 1);
    assert.equal(raced.filter((item) => item.status === "backpressure").length, 7);
    const attempt = winners[0];
    assert.ok(attempt);
    assert.equal(attempt.status, "completed");
    assert.equal(attempt.value.number, 1);
    const second = await prepare();
    assert.equal((await acquisitions().claim(second.requestId, request)).status, "backpressure");
    assert.equal((await acquisitions().check(attempt.value.id, request)).status, "completed");
    assert.equal(
      (await acquisitions().complete(attempt.value.id, { ...original, bytes: 999 }, request))
        .status,
      "invalid_input",
    );
    const completed = await acquisitions().complete(attempt.value.id, original, request);
    assert.equal(completed.status, "completed");
    assert.equal(completed.value.status, "SUCCEEDED");
    assert.deepEqual(await acquisitions().complete(attempt.value.id, original, request), completed);
    assert.deepEqual(await acquisitions().claim(first.requestId, request), completed);
    output("catalog_acquisition_concurrency", {
      callers: 8,
      admitted: 1,
      globalSlot: true,
      invalidResultRefused: true,
      completedReplay: true,
    });

    let active = await acquisitions().claim(second.requestId, request);
    assert.equal(active.status, "completed");
    const stale = active.value.id;
    time += ACQUISITION_LEASE_SECONDS;
    assert.equal((await acquisitions().complete(stale, original, request)).status, "conflict");
    active = await acquisitions().claim(second.requestId, request);
    assert.equal(active.status, "completed");
    assert.equal(active.value.number, 2);
    assert.equal((await acquisitions().complete(stale, original, request)).status, "conflict");
    const history = await store.run(
      async (tx) => ({ status: "completed", value: await tx.listAcquisitions(second.requestId) }),
      request.signal,
    );
    assert.equal(history.status, "completed");
    assert.equal(history.value[0]?.failure, "LEASE_EXPIRED");
    assert.equal(
      (await acquisitions().fail(active.value.id, "NETWORK_FAILURE", request)).status,
      "completed",
    );
    active = await acquisitions().claim(second.requestId, request);
    assert.equal(active.status, "completed");
    assert.equal(active.value.number, 3);
    time += ACQUISITION_LEASE_SECONDS;
    const exhausted = await acquisitions().claim(second.requestId, request);
    assert.equal(exhausted.status, "completed");
    assert.equal(exhausted.value.status, "FAILED");
    assert.equal(exhausted.value.failure, "LEASE_EXPIRED");
    assert.equal(
      (await acquisitions().claim(second.requestId, request)).status,
      "invalid_transition",
    );
    output("catalog_acquisition_recovery", {
      expiredLeaseRecovered: true,
      staleCompletionRefused: true,
      attempts: 3,
      retryBudgetEnforced: true,
      finalExpiredAttemptRetired: true,
    });

    const third = await prepare();
    active = await acquisitions().claim(third.requestId, request);
    assert.equal(active.status, "completed");
    assert.equal(
      (
        await commands.execute(
          "dispute",
          {
            titleId: third.titleId,
            expectedVersion: 3,
            mutationId: nextId(),
            reason: "Synthetic rights dispute during acquisition",
          },
          request,
        )
      ).status,
      "completed",
    );
    assert.equal(
      (await acquisitions().check(active.value.id, request)).status,
      "rights_not_approved",
    );
    assert.equal(
      (await acquisitions().complete(active.value.id, original, request)).status,
      "rights_not_approved",
    );
    assert.equal(
      (await acquisitions().fail(active.value.id, "RIGHTS_REVOKED", request)).status,
      "completed",
    );
    assert.equal(
      (await acquisitions().claim(third.requestId, request)).status,
      "rights_not_approved",
    );
    const fourth = await prepare();
    active = await acquisitions().claim(fourth.requestId, request);
    assert.equal(active.status, "completed");
    assert.equal(
      (await acquisitions().fail(active.value.id, "CHECKSUM_MISMATCH", request)).status,
      "completed",
    );
    assert.equal(
      (await acquisitions().claim(fourth.requestId, request)).status,
      "invalid_transition",
    );
    output("catalog_acquisition_rights", {
      disputeStopsCompletion: true,
      failureAuditRetained: true,
      deterministicFailureNotRetried: true,
    });

    const fifth = await prepare();
    const injected: AcquisitionUnitOfWork = {
      run: (work, signal) =>
        store.run(
          (tx) =>
            work({
              ...tx,
              async insertAcquisition(value) {
                await tx.insertAcquisition(value);
                throw new Error("Injected post-insert failure");
              },
            }),
          signal,
        ),
    };
    assert.equal(
      (await acquisitions(injected).claim(fifth.requestId, request)).status,
      "unavailable",
    );
    active = await acquisitions().claim(fifth.requestId, request);
    assert.equal(active.status, "completed");
    assert.equal(active.value.number, 1);
    assert.equal(
      (await acquisitions().fail(active.value.id, "INTERNAL_FAILURE", request)).status,
      "completed",
    );
    const reader = await admin.query<{ private: boolean; retained: boolean }>(
      "SELECT NOT has_table_privilege('aster_catalog_reader_local', 'catalog.media_acquisitions', 'SELECT,INSERT,UPDATE,DELETE') AS private, NOT has_table_privilege('aster_catalog_local', 'catalog.media_acquisitions', 'DELETE,TRUNCATE') AS retained",
    );
    assert.deepEqual(reader.rows[0], { private: true, retained: true });
    const guard = await admin.connect();
    try {
      await assert.rejects(
        guard.query(
          await readFile(
            new URL("../../../migrations/0005-media-acquisitions.down.sql", import.meta.url),
            "utf8",
          ),
        ),
        { code: "P0001" },
      );
    } finally {
      await guard.query("ROLLBACK");
      guard.release();
    }
    const editorial = await admin.query<{ version: number; publication_id: string | null }>(
      "SELECT version, publication_id FROM catalog.titles WHERE id = $1",
      [first.titleId],
    );
    assert.deepEqual(editorial.rows[0], { version: 3, publication_id: null });
    output("catalog_acquisition_audit", {
      failedClaimRolledBack: true,
      readerPrivate: true,
      noDeleteGrant: true,
      nonemptyDownRefused: true,
      noPublicationAuthority: true,
    });
  } finally {
    operator.revoke();
    await database.close();
  }
}
