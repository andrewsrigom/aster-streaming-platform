import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import type { AsterPostgresAdapter } from "@aster/postgres";
import { createCatalogAcquisitions } from "../../src/application/acquire-media.js";
import { createCatalogCommands } from "../../src/application/commands.js";
import { createCatalogProcessing } from "../../src/application/process-media.js";
import { createCatalogMediaRequests } from "../../src/application/request-media.js";
import type { ProcessingUnitOfWork } from "../../src/application/processing-ports.js";
import { originalKey } from "../../src/domain/media-acquisition.js";
import {
  PROCESSING_LEASE_SECONDS,
  ARTWORK_RECIPE_VERSION,
  type ProcessingAttempt,
} from "../../src/domain/media-processing.js";
import { createLocalCatalogOperator } from "../../src/infrastructure/identity/local-operator.js";
import { createPostgresCatalogAcquisitions } from "../../src/infrastructure/persistence/postgres-acquisition.js";
import { createPostgresCatalogMedia } from "../../src/infrastructure/persistence/postgres-media.js";
import { createPostgresCatalogProcessing } from "../../src/infrastructure/persistence/postgres-processing.js";
import { createPostgresCatalogWorkflow } from "../../src/infrastructure/persistence/postgres-workflow.js";
import { catalogTestId as id, catalogTestTime } from "../rights-fixture.js";
import { hash, metadataFixture, rightsFacts } from "../workflow-fixture.js";

export async function verifyProcessing(admin: Pool, database: AsterPostgresAdapter): Promise<void> {
  let time = catalogTestTime;
  let sequence = 900100;
  const nextId = () => id(sequence++);
  const now = () => time;
  const makeOperator = () =>
    createLocalCatalogOperator(
      { environment: "local", operatorEnabled: true, actorId: id(3) },
      now(),
    );
  let operator = makeOperator();
  let request = {
    credential: operator.credential,
    signal: new AbortController().signal,
    correlationId: id(4),
  };
  const common = {
    authority: {
      authorize: (credential: unknown, current: number) =>
        operator.authority.authorize(credential, current),
    },
    now,
    policy: { commercial: true },
    nextId,
    digest: hash,
  };
  function expireLease() {
    time += PROCESSING_LEASE_SECONDS;
    operator.revoke();
    operator = makeOperator();
    request = { ...request, credential: operator.credential };
  }
  const commands = createCatalogCommands({
    ...common,
    transactions: createPostgresCatalogWorkflow(database),
  });
  const media = createCatalogMediaRequests({
    ...common,
    transactions: createPostgresCatalogMedia(database),
  });
  const acquisitions = createCatalogAcquisitions({
    ...common,
    transactions: createPostgresCatalogAcquisitions(database),
  });
  const store = createPostgresCatalogProcessing(database);
  const processing = (transactions: ProcessingUnitOfWork = store) =>
    createCatalogProcessing({ ...common, transactions });
  const candidate = (attempt: ProcessingAttempt) => ({
    prefix: "candidates/" + attempt.processingKey + "/" + "b".repeat(64) + "/",
    reportChecksum: "c".repeat(64),
    files: 3,
    bytes: 1000,
    publicationAuthority: false,
  });
  async function prepare(checksum = hash(String(sequence))) {
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
            rights: rightsFacts({ sourceChecksum: checksum }),
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
            reason: "Synthetic processing review",
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
              bytes: 1000,
              etag: '"fixture"',
              sha256: checksum,
              container: "mp4",
            },
          },
          request,
        )
      ).status,
      "completed",
    );
    const acquired = await acquisitions.claim(requestId, request);
    assert.equal(acquired.status, "completed");
    assert.equal(
      (
        await acquisitions.complete(
          acquired.value.id,
          {
            sha256: checksum,
            bytes: 1000,
            key: originalKey(checksum),
          },
          request,
        )
      ).status,
      "completed",
    );
    return { titleId, requestId, acquisitionId: acquired.value.id, checksum };
  }
  const output = (event: string, values: Record<string, unknown>) =>
    process.stdout.write(JSON.stringify({ event, ...values }) + "\n");
  try {
    const first = await prepare();
    assert.equal(
      (await processing().claim(first.acquisitionId, { ...request, credential: {} })).status,
      "unauthorized",
    );
    const raced = await Promise.all(
      Array.from({ length: 8 }, () => processing().claim(first.acquisitionId, request)),
    );
    const winners = raced.filter((result) => result.status === "completed");
    assert.equal(winners.length, 1);
    assert.equal(raced.filter((result) => result.status === "backpressure").length, 7);
    const active = winners[0];
    assert.ok(active);
    assert.equal(active.value.status, "RUNNING");
    assert.equal((await processing().check(active.value.id, request)).status, "completed");
    assert.equal(
      (
        await processing().complete(
          active.value.id,
          {
            ...candidate(active.value),
            publicationAuthority: true,
          },
          request,
        )
      ).status,
      "invalid_input",
    );
    const success = await processing().complete(active.value.id, candidate(active.value), request);
    assert.equal(success.status, "completed");
    assert.equal(success.value.status, "SUCCEEDED");
    assert.deepEqual(await processing().claim(first.acquisitionId, request), success);
    assert.deepEqual(
      await processing().complete(active.value.id, candidate(active.value), request),
      success,
    );
    assert.equal(
      (
        await processing().complete(
          active.value.id,
          {
            ...candidate(active.value),
            reportChecksum: "d".repeat(64),
          },
          request,
        )
      ).status,
      "conflict",
    );
    const sameBytes = await prepare(first.checksum);
    assert.deepEqual(await processing().claim(sameBytes.acquisitionId, request), success);
    assert.equal(
      (
        await commands.execute(
          "dispute",
          {
            titleId: sameBytes.titleId,
            expectedVersion: 3,
            mutationId: nextId(),
            reason: "Synthetic reuse dispute",
          },
          request,
        )
      ).status,
      "completed",
    );
    assert.equal(
      (await processing().claim(sameBytes.acquisitionId, request)).status,
      "rights_not_approved",
    );
    output("catalog_processing_idempotency", {
      callers: 8,
      admitted: 1,
      exactReplay: true,
      conflictingCompletionRefused: true,
      sameBytesReused: true,
      requestingRightsRechecked: true,
      publicationAuthority: false,
    });

    const artwork = createCatalogProcessing({
      ...common,
      transactions: store,
      recipeVersion: ARTWORK_RECIPE_VERSION,
    });
    const artworkClaim = await artwork.claim(first.acquisitionId, request);
    assert.equal(artworkClaim.status, "completed");
    assert.equal(artworkClaim.value.recipeVersion, ARTWORK_RECIPE_VERSION);
    assert.notEqual(artworkClaim.value.processingKey, active.value.processingKey);
    assert.equal((await processing().check(artworkClaim.value.id, request)).status, "conflict");
    assert.equal((await artwork.check(active.value.id, request)).status, "conflict");
    const blockedSource = await prepare();
    assert.equal(
      (await processing().claim(blockedSource.acquisitionId, request)).status,
      "backpressure",
    );
    const artworkDone = await artwork.complete(
      artworkClaim.value.id,
      { ...candidate(artworkClaim.value), files: 5 },
      request,
    );
    assert.equal(artworkDone.status, "completed");
    assert.deepEqual(await artwork.claim(first.acquisitionId, request), artworkDone);
    assert.deepEqual(await processing().claim(first.acquisitionId, request), success);
    assert.equal(
      (await artwork.claim(sameBytes.acquisitionId, request)).status,
      "rights_not_approved",
    );
    output("catalog_artwork_recipe_isolation", {
      separateKey: true,
      sameGlobalSlot: true,
      exactReplay: true,
      hlsUnchanged: true,
      crossRecipeCompletionRefused: true,
      currentRightsRequired: true,
    });

    const second = await prepare();
    let current = await processing().claim(second.acquisitionId, request);
    assert.equal(current.status, "completed");
    const stale = current.value;
    expireLease();
    assert.equal(
      (await processing().complete(stale.id, candidate(stale), request)).status,
      "conflict",
    );
    current = await processing().claim(second.acquisitionId, request);
    assert.equal(current.status, "completed");
    assert.equal(current.value.number, 2);
    assert.equal(
      (await processing().complete(stale.id, candidate(stale), request)).status,
      "conflict",
    );
    assert.equal(
      (await processing().fail(current.value.id, "STORAGE_FAILURE", request)).status,
      "completed",
    );
    current = await processing().claim(second.acquisitionId, request);
    assert.equal(current.status, "completed");
    assert.equal(current.value.number, 3);
    expireLease();
    const exhausted = await processing().claim(second.acquisitionId, request);
    assert.equal(exhausted.status, "completed");
    assert.equal(exhausted.value.failure, "LEASE_EXPIRED");
    assert.equal(
      (await processing().claim(second.acquisitionId, request)).status,
      "invalid_transition",
    );
    output("catalog_processing_recovery", {
      staleCompletionRefused: true,
      attempts: 3,
      finalLeaseRetired: true,
    });

    const third = await prepare();
    current = await processing().claim(third.acquisitionId, request);
    assert.equal(current.status, "completed");
    assert.equal(
      (
        await commands.execute(
          "dispute",
          {
            titleId: third.titleId,
            expectedVersion: 3,
            mutationId: nextId(),
            reason: "Synthetic processing dispute",
          },
          request,
        )
      ).status,
      "completed",
    );
    assert.equal(
      (await processing().check(current.value.id, request)).status,
      "rights_not_approved",
    );
    assert.equal(
      (await processing().complete(current.value.id, candidate(current.value), request)).status,
      "rights_not_approved",
    );
    assert.equal(
      (await processing().fail(current.value.id, "RIGHTS_REVOKED", request)).status,
      "completed",
    );

    const fourth = await prepare();
    const injected: ProcessingUnitOfWork = {
      run: (work, signal) =>
        store.run(
          (tx) =>
            work({
              ...tx,
              async insertProcessing(value) {
                await tx.insertProcessing(value);
                throw new Error("Injected failure");
              },
            }),
          signal,
        ),
    };
    assert.equal(
      (await processing(injected).claim(fourth.acquisitionId, request)).status,
      "unavailable",
    );
    current = await processing().claim(fourth.acquisitionId, request);
    assert.equal(current.status, "completed");
    assert.equal(current.value.number, 1);
    assert.equal(
      (await processing().fail(current.value.id, "CANCELLED", request)).status,
      "completed",
    );
    current = await processing().claim(fourth.acquisitionId, request);
    assert.equal(current.status, "completed");
    assert.equal(current.value.number, 2);
    assert.equal(
      (await processing().fail(current.value.id, "INVALID_OUTPUT", request)).status,
      "completed",
    );
    assert.equal(
      (await processing().claim(fourth.acquisitionId, request)).status,
      "invalid_transition",
    );

    const grants = await admin.query(
      "SELECT NOT has_table_privilege('aster_catalog_reader_local', 'catalog.media_processing', 'SELECT,INSERT,UPDATE,DELETE') AS private, NOT has_table_privilege('aster_catalog_local', 'catalog.media_processing', 'DELETE,TRUNCATE') AS retained, NOT has_table_privilege('aster_catalog_local', 'catalog.publications', 'INSERT,UPDATE,DELETE') AS unattested",
    );
    assert.deepEqual(grants.rows[0], { private: true, retained: true, unattested: true });
    const guard = await admin.connect();
    try {
      await assert.rejects(
        guard.query(
          await readFile(
            new URL("../../../migrations/0006-media-processing.down.sql", import.meta.url),
            "utf8",
          ),
        ),
        { code: "P0001" },
      );
    } finally {
      await guard.query("ROLLBACK");
      guard.release();
    }
    const editorial = await admin.query(
      "SELECT version, publication_id FROM catalog.titles WHERE id = $1",
      [first.titleId],
    );
    assert.deepEqual(editorial.rows[0], { version: 3, publication_id: null });
    output("catalog_processing_audit", {
      rollback: true,
      cancellationRetried: true,
      terminalInvalidOutput: true,
      rightsRaceRefused: true,
      readerPrivate: true,
      nonemptyDownRefused: true,
      noEditorialChanges: true,
    });
  } finally {
    operator.revoke();
    await database.close();
  }
}
