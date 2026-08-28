import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import type { AsterPostgresAdapter } from "@aster/postgres";
import { createCatalogCommands } from "../../src/application/commands.js";
import type {
  CatalogWorkflowTransaction,
  CatalogWorkflowUnitOfWork,
} from "../../src/application/operator-ports.js";
import { createLocalCatalogOperator } from "../../src/infrastructure/identity/local-operator.js";
import { createPostgresCatalogWorkflow } from "../../src/infrastructure/persistence/postgres-workflow.js";
import { catalogTestId as id, catalogTestTime as now } from "../rights-fixture.js";
import { hash, metadataFixture, publicationFixture, rightsFacts } from "../workflow-fixture.js";

export async function verifyPublicationRollback(
  admin: Pool,
  database: AsterPostgresAdapter,
): Promise<void> {
  let sequence = 940000;
  const nextId = () => id(sequence++);
  const transactions = createPostgresCatalogWorkflow(database);
  const operator = createLocalCatalogOperator(
    { environment: "local", operatorEnabled: true, actorId: id(3) },
    now,
  );
  const request = {
    credential: operator.credential,
    correlationId: nextId(),
    signal: AbortSignal.timeout(20000),
  };
  const commands = (unit: CatalogWorkflowUnitOfWork = transactions) =>
    createCatalogCommands({
      authority: operator.authority,
      transactions: unit,
      now: () => now,
      nextId,
      digest: hash,
      policy: { commercial: true },
    });
  const app = commands();
  const input = (titleId: string, version: number) => ({
    titleId,
    expectedVersion: version,
    mutationId: nextId(),
  });
  const wrap = (
    decorate: (tx: CatalogWorkflowTransaction) => CatalogWorkflowTransaction,
  ): CatalogWorkflowUnitOfWork => ({
    run: (work, signal) => transactions.run((tx) => work(decorate(tx)), signal),
  });
  const migrate = async (direction: "up" | "down") => {
    const client = await admin.connect();
    try {
      await client.query(
        await readFile(
          new URL(
            `../../../migrations/0008-publication-activations.${direction}.sql`,
            import.meta.url,
          ),
          "utf8",
        ),
      );
    } catch (error) {
      client.release(true);
      throw error;
    }
    client.release();
  };
  const read = async (titleId: string) => {
    const result = await app.inspect({ titleId }, request);
    assert.equal(result.status, "completed");
    return result.value;
  };
  const counts = async (titleId: string) =>
    (
      await admin.query<{ audit: number; receipts: number; outbox: number; history: number }>(
        "SELECT (SELECT count(*)::integer FROM catalog.command_audit WHERE title_id = $1) AS audit, (SELECT count(*)::integer FROM catalog.command_receipts WHERE title_id = $1) AS receipts, (SELECT count(*)::integer FROM catalog.publication_outbox WHERE title_id = $1) AS outbox, (SELECT count(*)::integer FROM catalog.publication_activations WHERE title_id = $1) AS history",
        [titleId],
      )
    ).rows;
  const prepare = async () => {
    const titleId = nextId();
    assert.equal(
      (
        await app.execute(
          "create",
          {
            ...input(titleId, 0),
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
        await app.execute(
          "review",
          {
            ...input(titleId, 2),
            decision: "approve",
            reason: "Synthetic rollback review",
          },
          request,
        )
      ).status,
      "completed",
    );
    const publications = [nextId(), nextId(), nextId()];
    for (const publicationId of publications) {
      const p = publicationFixture(titleId);
      await admin.query(
        "INSERT INTO catalog.publications (id, title_id, rights_revision, source_checksum, manifest_url, validation_report_id, validated_at) VALUES ($1,$2,2,$3,$4,$5,$6)",
        [publicationId, titleId, p.sourceChecksum, p.manifestUrl, nextId(), now],
      );
    }
    const [original, replacement, unused] = publications;
    assert.ok(original && replacement && unused);
    assert.equal(
      (
        await app.execute(
          "media-ready",
          {
            ...input(titleId, 3),
            publicationId: original,
          },
          request,
        )
      ).status,
      "completed",
    );
    assert.equal((await app.execute("publish", input(titleId, 4), request)).status, "completed");
    return { titleId, original, replacement, unused };
  };
  const replace = async (f: Awaited<ReturnType<typeof prepare>>) => {
    assert.equal(
      (
        await app.execute(
          "replace",
          {
            ...input(f.titleId, 5),
            publicationId: f.replacement,
            reason: "Synthetic replacement",
          },
          request,
        )
      ).status,
      "completed",
    );
  };
  const output = (event: string, facts: Record<string, unknown>) =>
    process.stdout.write(JSON.stringify({ event, ...facts }) + "\n");
  try {
    await migrate("down");
    await migrate("up");
    await migrate("down");
    const f = await prepare();
    await migrate("up");
    const history = await admin.query(
      "SELECT title_version, publication_id FROM catalog.publication_activations WHERE title_id = $1",
      [f.titleId],
    );
    assert.deepEqual(history.rows, [{ title_version: 5, publication_id: f.original }]);
    const client = await admin.connect();
    try {
      for (const sql of [
        "INSERT INTO catalog.publication_activations DEFAULT VALUES",
        "UPDATE catalog.publication_activations SET title_version = 1",
        "DELETE FROM catalog.publication_activations",
        "TRUNCATE catalog.publication_activations",
        "SELECT catalog.record_publication_activation()",
      ]) {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE aster_catalog_runtime");
        await assert.rejects(client.query(sql), { code: "42501" });
        await client.query("ROLLBACK");
      }
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    const policy = await admin.query<{ proconfig: string[] }>(
      "SELECT proconfig FROM pg_proc WHERE oid = 'catalog.record_publication_activation()'::regprocedure",
    );
    assert.deepEqual(policy.rows[0]?.proconfig, ["search_path=pg_catalog, pg_temp"]);
    output("catalog_activation_migration", {
      emptyRoundTrip: true,
      backfill: true,
      directWritesDenied: 5,
    });
    await replace(f);
    assert.equal(
      (
        await app.execute(
          "rollback",
          {
            ...input(f.titleId, 6),
            publicationId: f.unused,
            reason: "Unactivated candidate",
          },
          request,
        )
      ).status,
      "media_not_ready",
    );
    // Only disposable fixture data: model future outbox delivery without losing history.
    await admin.query("DELETE FROM catalog.publication_outbox WHERE title_id = $1", [f.titleId]);
    const rollback = {
      ...input(f.titleId, 6),
      publicationId: f.original,
      reason: "Restore prior version",
    };
    const result = await app.execute("rollback", rollback, request);
    assert.equal(result.status, "completed");
    assert.equal(result.value.publicationId, f.original);
    assert.equal(result.value.version, 7);
    assert.deepEqual(await app.execute("rollback", rollback, request), result);
    const after = await counts(f.titleId);
    await assert.rejects(migrate("down"), /Retain publication activation audit/u);
    assert.deepEqual(await counts(f.titleId), after);
    output("catalog_publication_rollback", {
      replacement: true,
      originalRestored: true,
      currentApprovalPreserved: true,
      unactivatedCandidateRejected: true,
      outboxIndependentHistory: true,
      exactReplay: true,
      retainedHistoryDowngradeRefused: true,
    });
    for (const fault of ["throw", "abort", "forged-event"] as const) {
      const controller = new AbortController();
      const failing = commands(
        wrap((tx) => ({
          ...tx,
          async appendPublicationEvent(event) {
            await tx.appendPublicationEvent(
              fault === "forged-event"
                ? { ...event, payload: { ...event.payload, publicationId: f.unused } }
                : event,
            );
            if (fault === "throw") {
              throw new Error("Injected post-trigger failure");
            }
            if (fault === "abort") {
              controller.abort();
            }
          },
        })),
      );
      const before = await counts(f.titleId);
      assert.equal(
        (
          await failing.execute(
            "replace",
            {
              ...input(f.titleId, 7),
              publicationId: f.replacement,
              reason: "Synthetic atomic failure",
            },
            { ...request, signal: controller.signal },
          )
        ).status,
        fault === "abort" ? "cancelled" : "unavailable",
      );
      assert.equal((await read(f.titleId)).publicationId, f.original);
      assert.deepEqual(await counts(f.titleId), before);
    }
    output("catalog_activation_atomicity", {
      postTriggerFailure: true,
      cancellation: true,
      forgedEventRejected: true,
    });
    assert.equal(
      (
        await app.execute(
          "retire",
          {
            ...input(f.titleId, 7),
            reason: "Keep shared integration browse fixture isolated",
          },
          request,
        )
      ).status,
      "completed",
    );
    for (const first of ["rollback", "dispute"] as const) {
      const raced = await prepare();
      await replace(raced);
      const locked = Promise.withResolvers<undefined>();
      const contender = Promise.withResolvers<undefined>();
      const winner = commands(
        wrap((tx) => ({
          ...tx,
          async lockTitle(titleId) {
            const title = await tx.lockTitle(titleId);
            locked.resolve(undefined);
            await contender.promise;
            return title;
          },
        })),
      );
      const loser = commands(
        wrap((tx) => ({
          ...tx,
          lockTitle(titleId) {
            contender.resolve(undefined);
            return tx.lockTitle(titleId);
          },
        })),
      );
      const invoke = (
        executor: ReturnType<typeof commands>,
        kind: "rollback" | "dispute",
        version: number,
      ) =>
        executor.execute(
          kind,
          {
            ...input(raced.titleId, version),
            reason: "Synthetic concurrent recovery",
            ...(kind === "rollback" ? { publicationId: raced.original } : {}),
          },
          request,
        );
      const winning = invoke(winner, first, 6);
      await locked.promise;
      const results = await Promise.all([
        winning,
        invoke(loser, first === "rollback" ? "dispute" : "rollback", 6),
      ]);
      assert.deepEqual(
        results.map((r) => r.status),
        ["completed", "conflict"],
      );
      if (first === "rollback") {
        assert.equal((await invoke(app, "dispute", 7)).status, "completed");
      }
      const final = await read(raced.titleId);
      assert.equal(final.state, "RETIRED");
      assert.equal((await invoke(app, "rollback", final.version)).status, "rights_not_approved");
      output("catalog_rollback_dispute_serialization", {
        first,
        staleContender: "conflict",
        finalState: final.state,
      });
    }
  } finally {
    operator.revoke();
    await database.close();
  }
}
