import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import type { AsterPostgresAdapter } from "@aster/postgres";
import { createCatalogCommands } from "../../src/application/commands.js";
import { createCatalogPublicQueries } from "../../src/application/public-queries.js";
import { createLocalCatalogOperator } from "../../src/infrastructure/identity/local-operator.js";
import { createPostgresCatalogWorkflow } from "../../src/infrastructure/persistence/postgres-workflow.js";
import { createPostgresCatalogPublic } from "../../src/infrastructure/persistence/postgres-public.js";
import { probeCatalogReader } from "../../src/infrastructure/persistence/reader-readiness.js";
import { catalogRecord } from "../../src/domain/values.js";
import { catalogTestId as id, catalogTestTime as now } from "../rights-fixture.js";
import { hash, metadataFixture, rightsFacts } from "../workflow-fixture.js";

export async function verifySourceCandidates(
  admin: Pool,
  database: AsterPostgresAdapter,
  reader: AsterPostgresAdapter,
  media?: string,
): Promise<void> {
  let sequence = 90000;
  const nextId = () => id(sequence++);
  const operator = createLocalCatalogOperator(
    { environment: "local", operatorEnabled: true, actorId: id(3) },
    now,
  );
  const request = {
    credential: operator.credential,
    correlationId: nextId(),
    signal: AbortSignal.timeout(15000),
  };
  const app = createCatalogCommands({
    authority: operator.authority,
    transactions: createPostgresCatalogWorkflow(database),
    policy: { commercial: true },
    now: () => now,
    nextId,
    digest: hash,
  });
  const queries = createCatalogPublicQueries({
    transactions: createPostgresCatalogPublic(reader),
    policy: { commercial: true },
    now: () => now,
  });
  const input = (titleId: string, expectedVersion: number) => ({
    titleId,
    expectedVersion,
    mutationId: nextId(),
  });
  try {
    // The public migration round-trip recreates the NOLOGIN reader group and drops membership.
    await admin.query("GRANT aster_catalog_reader TO aster_catalog_reader_local");
    assert.equal(await probeCatalogReader(reader, request.signal), "ready");
    const candidates: unknown = JSON.parse(
      await readFile(new URL("../../../examples/candidate-sources.json", import.meta.url), "utf8"),
    );
    assert.ok(Array.isArray(candidates) && candidates.length === 2);
    for (const value of candidates) {
      const candidate = catalogRecord(value, [
        "titleId",
        "reviewDate",
        "reviewer",
        "decision",
        "unresolved",
        "metadata",
        "rights",
      ]);
      assert.ok(candidate && typeof candidate["titleId"] === "string");
      const titleId = candidate["titleId"];
      assert.equal(
        (
          await app.execute(
            "create",
            { ...input(titleId, 0), metadata: candidate["metadata"], rights: candidate["rights"] },
            request,
          )
        ).status,
        "completed",
      );
      assert.equal(
        (
          await app.execute(
            "review",
            {
              ...input(titleId, 2),
              decision: "clarify",
              reason:
                "Exact source asset and credits require verification; see candidate-sources evidence.",
            },
            request,
          )
        ).status,
        "completed",
      );
      assert.equal(
        (
          await app.execute(
            "review",
            { ...input(titleId, 3), decision: "approve", reason: "Attempt premature approval" },
            request,
          )
        ).status,
        "rights_not_approved",
      );
      assert.equal(
        (await app.execute("publish", input(titleId, 3), request)).status,
        "rights_not_approved",
      );
      const history = await admin.query<{ status: string }>(
        "SELECT status FROM catalog.rights_revisions WHERE title_id = $1 ORDER BY revision DESC LIMIT 1",
        [titleId],
      );
      assert.equal(history.rows[0]?.status, "NEEDS_CLARIFICATION");
      const visible = await queries.byIds([titleId], request.signal);
      assert.equal(visible.status, "completed");
      assert.deepEqual(visible.value, [null]);
    }
    process.stdout.write(
      JSON.stringify({
        event: "catalog_candidate_reviews",
        reviewed: 2,
        state: "NEEDS_CLARIFICATION",
        incompleteApprovalRejected: true,
        publicInvisible: true,
        filmDownloads: 0,
      }) + "\n",
    );
    if (media === undefined || media === "") {
      return;
    }
    assert.ok(Buffer.byteLength(media) <= 16384);
    const report = JSON.parse(media) as Record<string, unknown>;
    assert.equal(report["event"], "generated_hls_verified");
    assert.equal(report["recipe"], "aster-generated-hls-v1");
    assert.equal(report["repeatable"], true);
    assert.equal(report["durationSeconds"], 6);
    assert.equal(typeof report["sourceChecksum"], "string");
    assert.match(String(report["sourceChecksum"]), /^[a-f0-9]{64}$/u);
    const titleId = id(81000);
    const created = await app.execute(
      "create",
      {
        ...input(titleId, 0),
        metadata: {
          ...metadataFixture(),
          runtimeSeconds: 6,
          languages: ["en"],
          accessibility: ["CAPTIONS"],
          editorialLabels: ["synthetic-fixture"],
        },
        rights: rightsFacts({
          sourceChecksum: String(report["sourceChecksum"]),
          evidenceLocations: ["evidence/phase-03/generated-media.txt"],
        }),
      },
      request,
    );
    assert.equal(created.status, "completed");
    assert.equal(
      (
        await app.execute(
          "review",
          {
            ...input(titleId, 2),
            decision: "approve",
            reason: "Synthetic generated fixture only; not third-party film approval.",
          },
          request,
        )
      ).status,
      "completed",
    );
    const publicationId = nextId();
    assert.equal(
      (await app.execute("media-ready", { ...input(titleId, 3), publicationId }, request)).status,
      "media_not_ready",
    );
    await admin.query(
      "INSERT INTO catalog.publications (id, title_id, rights_revision, source_checksum, manifest_url, validation_report_id, validated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [
        publicationId,
        titleId,
        2,
        report["sourceChecksum"],
        "https://fixture.invalid/aster-generated-hls-v1/master.m3u8",
        nextId(),
        now,
      ],
    );
    assert.equal(
      (await app.execute("media-ready", { ...input(titleId, 3), publicationId }, request)).status,
      "completed",
    );
    assert.equal((await app.execute("publish", input(titleId, 4), request)).status, "completed");
    const published = await queries.byIds([titleId], request.signal);
    assert.equal(published.status, "completed");
    assert.equal(published.value[0]?.id, titleId);
    assert.equal(published.value[0].runtimeSeconds, 6);
    assert.equal(published.value[0].attribution.creator, "Synthetic creator");
    assert.equal(
      (
        await app.execute(
          "retire",
          { ...input(titleId, 5), reason: "Technical fixture verification complete" },
          request,
        )
      ).status,
      "completed",
    );
    const retired = await queries.byIds([titleId], request.signal);
    assert.equal(retired.status, "completed");
    assert.deepEqual(retired.value, [null]);
    const events = await admin.query<{ event_type: string }>(
      "SELECT event_type FROM catalog.publication_outbox WHERE title_id = $1 ORDER BY title_version",
      [titleId],
    );
    assert.equal(events.rows.length, 2);
    process.stdout.write(
      JSON.stringify({
        event: "catalog_generated_publication",
        sourceChecksum: report["sourceChecksum"],
        sameApplicationContract: true,
        absentAttestationRejected: true,
        publishedAndRetired: true,
        derivedAttribution: published.value[0].attribution,
        events: events.rows,
      }) + "\n",
    );
  } finally {
    operator.revoke();
    await database.close();
    await reader.close();
  }
}
