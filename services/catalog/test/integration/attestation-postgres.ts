import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import type { Pool } from "pg";
import type { AsterPostgresAdapter } from "@aster/postgres";
import { createCatalogCommands } from "../../src/application/commands.js";
import { createCatalogMediaRequests } from "../../src/application/request-media.js";
import { createCatalogAcquisitions } from "../../src/application/acquire-media.js";
import { createCatalogProcessing } from "../../src/application/process-media.js";
import { createLocalCatalogOperator } from "../../src/infrastructure/identity/local-operator.js";
import { createPostgresCatalogWorkflow } from "../../src/infrastructure/persistence/postgres-workflow.js";
import { createPostgresCatalogMedia } from "../../src/infrastructure/persistence/postgres-media.js";
import { createPostgresCatalogAcquisitions } from "../../src/infrastructure/persistence/postgres-acquisition.js";
import { createPostgresCatalogProcessing } from "../../src/infrastructure/persistence/postgres-processing.js";
import {
  createPostgresMediaAttester,
  requirePublicationApproval,
  attestationFunction,
} from "../../src/infrastructure/persistence/postgres-attestation.js";
import { publicationBundleFixture } from "../publication-fixture.js";
import { catalogTestId as id } from "../rights-fixture.js";
import { hash, rightsFacts } from "../workflow-fixture.js";

export async function verifyAttestation(
  admin: Pool,
  database: AsterPostgresAdapter,
  restricted: AsterPostgresAdapter,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  let sequence = 930000;
  const nextId = () => id(sequence++);
  const titleId = nextId();
  const f = publicationBundleFixture(titleId, now);
  const operator = createLocalCatalogOperator(
    { environment: "local", operatorEnabled: true, actorId: id(3) },
    now,
  );
  const request = {
    credential: operator.credential,
    correlationId: nextId(),
    signal: AbortSignal.timeout(30000),
  };
  const common = {
    authority: operator.authority,
    policy: { commercial: true, allowLocalMedia: true },
    now: () => Math.floor(Date.now() / 1000),
    nextId,
    digest: hash,
  };
  const commands = createCatalogCommands({
    ...common,
    transactions: createPostgresCatalogWorkflow(database),
  });
  const attester = createPostgresMediaAttester(restricted);
  const input = (expectedVersion: number) => ({ titleId, expectedVersion, mutationId: nextId() });
  const output = (event: string, facts: Record<string, unknown>) =>
    process.stdout.write(JSON.stringify({ event, ...facts }) + "\n");
  const migration = async (direction: "up" | "down") => {
    const client = await admin.connect();
    try {
      await client.query(
        await readFile(
          new URL(`../../../migrations/0007-media-attestations.${direction}.sql`, import.meta.url),
          "utf8",
        ),
      );
    } catch (error) {
      client.release(true);
      throw error;
    }
    client.release();
  };
  try {
    await migration("down");
    await migration("up");
    await admin.query("GRANT aster_catalog_attester TO aster_catalog_attester_local");
    await attester.probe(request.signal);
    const functionPolicy = await admin.query<{ public_execute: boolean; settings: string[] }>(
      "SELECT has_function_privilege('aster_catalog_reader_local', $1, 'EXECUTE') AS public_execute, proconfig AS settings FROM pg_proc WHERE oid = $1::regprocedure",
      [attestationFunction],
    );
    assert.equal(functionPolicy.rows[0]?.public_execute, false);
    assert.deepEqual(functionPolicy.rows[0].settings, ["search_path=pg_catalog, pg_temp"]);
    for (const text of [
      "UPDATE catalog.titles SET state = 'PUBLISHED'",
      "INSERT INTO catalog.publications DEFAULT VALUES",
      "DELETE FROM catalog.media_attestations",
      "UPDATE catalog.rights_revisions SET status = 'APPROVED'",
      "CREATE TABLE catalog.forbidden_attester (id integer)",
      "SELECT * FROM identity.synthetic_private",
    ]) {
      const denied = await restricted.transaction(async (tx) => {
        await tx.query({ text });
        return { action: "rollback", value: false };
      }, request.signal);
      assert.notEqual(denied.status, "rolled_back");
    }
    await admin.query("GRANT UPDATE (version) ON catalog.titles TO aster_catalog_attester_local");
    try {
      await assert.rejects(attester.probe(request.signal));
    } finally {
      await admin.query(
        "REVOKE UPDATE (version) ON catalog.titles FROM aster_catalog_attester_local",
      );
    }
    output("catalog_attester_isolation", {
      noEditorialWrites: true,
      noCrossContextRead: true,
      publicExecuteDenied: true,
      safeSearchPath: true,
      excessColumnGrantRejected: true,
      emptyMigrationRoundTrip: true,
    });

    assert.equal(
      (
        await commands.execute(
          "create",
          {
            ...input(0),
            metadata: {
              ...f.metadata,
              artwork: { ...f.metadata.artwork, rights: rightsFacts(f.metadata.artwork.rights) },
            },
            rights: rightsFacts(f.rights),
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
          { ...input(2), decision: "approve", reason: "Synthetic independent publication review" },
          request,
        )
      ).status,
      "completed",
    );
    const requestId = nextId();
    assert.equal(
      (
        await createCatalogMediaRequests({
          ...common,
          transactions: createPostgresCatalogMedia(database),
        }).request(
          {
            requestId,
            titleId,
            expectedVersion: 3,
            rightsRevision: 2,
            recipeVersion: "hls-avc-aac-v1",
            source: {
              url: f.rights.assetSourceUrl,
              bytes: f.identity.bytes,
              sha256: f.identity.sha256,
              container: "mp4",
              etag: '"synthetic-publication"',
            },
          },
          request,
        )
      ).status,
      "completed",
    );
    const acquisitions = createCatalogAcquisitions({
      ...common,
      transactions: createPostgresCatalogAcquisitions(database),
    });
    const acquisition = await acquisitions.claim(requestId, request);
    assert.equal(acquisition.status, "completed");
    assert.equal(
      (
        await acquisitions.complete(
          acquisition.value.id,
          {
            sha256: f.identity.sha256,
            bytes: f.identity.bytes,
            key: "originals/sha256/" + f.identity.sha256,
          },
          request,
        )
      ).status,
      "completed",
    );
    const attempts: string[] = [];
    for (const [recipeVersion, candidate] of [
      ["hls-avc-aac-v1", f.bundle.hls],
      ["frame-jpeg-v1", f.bundle.artwork],
    ] as const) {
      const processing = createCatalogProcessing({
        ...common,
        transactions: createPostgresCatalogProcessing(database),
        recipeVersion,
      });
      const attempt = await processing.claim(acquisition.value.id, request);
      assert.equal(attempt.status, "completed");
      assert.equal(
        (
          await processing.complete(
            attempt.value.id,
            {
              prefix: candidate.prefix,
              reportChecksum: candidate.reportChecksum,
              files: candidate.files.length,
              bytes: candidate.files.reduce((sum, file) => sum + file.bytes, 0),
              publicationAuthority: false,
            },
            request,
          )
        ).status,
        "completed",
      );
      attempts.push(attempt.value.id);
    }
    const selection = {
      titleId,
      expectedVersion: 3,
      hlsAttemptId: attempts[0] as string,
      artworkAttemptId: attempts[1] as string,
    };
    const source = await attester.read(selection, request.signal);
    requirePublicationApproval(source, f.bundle, now);
    assert.throws(() => {
      requirePublicationApproval({ ...source, rightsRevision: 1 }, f.bundle, now);
    });
    const register = (patch = {}) =>
      attester.register(
        { ...selection, ...patch },
        f.bundle,
        2,
        { publicationId: nextId(), reportId: nextId(), actorId: id(6), correlationId: nextId() },
        request.signal,
      );
    await assert.rejects(register({ expectedVersion: 2 }));
    const publicationId = await register();
    assert.equal(await register(), publicationId);
    const stored = await admin.query<{
      state: string;
      publication_id: string | null;
      count: number;
    }>(
      "SELECT state, publication_id, (SELECT count(*)::integer FROM catalog.media_attestations WHERE title_id = $1) AS count FROM catalog.titles WHERE id = $1",
      [titleId],
    );
    assert.equal(stored.rows[0]?.count, 1);
    assert.equal(stored.rows[0].publication_id, null);
    assert.equal(stored.rows[0].state, "RIGHTS_REVIEWED");
    assert.equal(
      (await commands.execute("media-ready", { ...input(3), publicationId }, request)).status,
      "completed",
    );
    assert.equal((await commands.execute("publish", input(4), request)).status, "completed");
    await assert.rejects(migration("down"));
    output("catalog_attestation_activation", {
      publicationId,
      independentlyRegistered: true,
      exactReplay: true,
      registrationDoesNotActivate: true,
      normalOperatorPublish: true,
      retainedAuditDowngradeRejected: true,
    });

    const blocker = await admin.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM catalog.titles WHERE id = $1 FOR UPDATE", [titleId]);
      const disputed = commands.execute(
        "dispute",
        { ...input(5), reason: "Synthetic publication race" },
        request,
      );
      const until = performance.now() + 2000;
      for (;;) {
        const waiting = await admin.query<{ count: number }>(
          "SELECT count(*)::integer AS count FROM pg_stat_activity WHERE usename = 'aster_catalog_fixture' AND wait_event_type = 'Lock'",
        );
        if ((waiting.rows[0]?.count ?? 0) > 0) {
          break;
        }
        assert.ok(performance.now() < until);
        await delay(5);
      }
      const racing = register({ expectedVersion: 5 });
      const rejected = assert.rejects(racing);
      await blocker.query("COMMIT");
      assert.equal((await disputed).status, "completed");
      await rejected;
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
    }
    await assert.rejects(register({ expectedVersion: 6 }));
    const final = await admin.query<{ state: string; count: number }>(
      "SELECT state, (SELECT count(*)::integer FROM catalog.media_attestations WHERE title_id = $1) AS count FROM catalog.titles WHERE id = $1",
      [titleId],
    );
    assert.equal(final.rows[0]?.state, "RETIRED");
    assert.equal(final.rows[0].count, 1);
    output("catalog_attestation_dispute_race", {
      serializedOnTitle: true,
      staleAndRevokedRegistrationRejected: true,
      retainedAttestations: 1,
    });
  } finally {
    operator.revoke();
    await database.close();
    await restricted.close();
  }
}
