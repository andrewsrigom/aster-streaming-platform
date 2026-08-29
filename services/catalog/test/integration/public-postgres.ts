import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import type { Pool } from "pg";
import type { AsterPostgresAdapter } from "@aster/postgres";
import { createCatalogCommands } from "../../src/application/commands.js";
import { createCatalogPublicQueries } from "../../src/application/public-queries.js";
import { createLocalCatalogOperator } from "../../src/infrastructure/identity/local-operator.js";
import { createPostgresCatalogWorkflow } from "../../src/infrastructure/persistence/postgres-workflow.js";
import {
  createPostgresCatalogPublic,
  createPostgresCatalogPublicEntitySource,
} from "../../src/infrastructure/persistence/postgres-public.js";
import { catalogTestId as id, catalogTestTime as now } from "../rights-fixture.js";
import { hash, metadataFixture, publicationFixture, rightsFacts } from "../workflow-fixture.js";
import { catalogHttpFixture } from "../catalog-http-fixture.js";

export async function verifyPublicCatalog(
  admin: Pool,
  operatorDatabase: AsterPostgresAdapter,
  reader: AsterPostgresAdapter,
): Promise<void> {
  const output = (event: string, facts: Record<string, unknown>) =>
    process.stdout.write(JSON.stringify({ event, ...facts }) + "\n");
  let sequence = 100000;
  let clock = now;
  const nextId = () => id(sequence++);
  const signal = () => new AbortController().signal;
  const migrations = async (direction: "up" | "down") => {
    const client = await admin.connect();
    try {
      await client.query(
        await readFile(
          new URL(`../../../migrations/0003-public-reads.${direction}.sql`, import.meta.url),
          "utf8",
        ),
      );
      client.release();
    } catch (error) {
      client.release(true);
      throw error;
    }
  };
  const operator = createLocalCatalogOperator(
    { environment: "local", operatorEnabled: true, actorId: id(3) },
    now,
  );
  const commands = createCatalogCommands({
    authority: operator.authority,
    transactions: createPostgresCatalogWorkflow(operatorDatabase),
    policy: { commercial: true },
    now: () => clock,
    nextId,
    digest: hash,
  });
  const request = { credential: operator.credential, correlationId: id(4), signal: signal() };
  const input = (n: number, version: number) => ({
    titleId: id(n),
    expectedVersion: version,
    mutationId: nextId(),
  });
  const prepare = async (
    n: number,
    stage = "PUBLISHED",
    expiry: "title" | "artwork" | null = null,
  ) => {
    const metadata = {
      ...metadataFixture(),
      releaseYear: 2026,
      runtimeSeconds: 12,
      languages: ["en", "pt-BR"],
      accessibility: ["CAPTIONS"],
      editorialLabels: ["synthetic"],
      artwork:
        expiry === "artwork"
          ? {
              url: "https://example.invalid/art.png",
              altText: "Synthetic art",
              rights: rightsFacts({
                assetSourceUrl: "https://example.invalid/art.png",
                validUntil: now + 10,
              }),
            }
          : null,
    };
    assert.equal(
      (
        await commands.execute(
          "create",
          {
            ...input(n, 0),
            metadata,
            rights: rightsFacts({ validUntil: expiry === "title" ? now + 10 : null }),
          },
          request,
        )
      ).status,
      "completed",
    );
    if (stage === "DRAFT") {
      return;
    }
    assert.equal(
      (
        await commands.execute(
          "review",
          { ...input(n, 2), decision: "approve", reason: "Synthetic read test" },
          request,
        )
      ).status,
      "completed",
    );
    if (stage === "RIGHTS_REVIEWED") {
      return;
    }
    const publication = {
      ...publicationFixture(id(n)),
      id: nextId(),
      validationReportId: nextId(),
    };
    await admin.query(
      "INSERT INTO catalog.publications (id, title_id, rights_revision, source_checksum, manifest_url, validation_report_id, validated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [
        publication.id,
        id(n),
        2,
        publication.sourceChecksum,
        publication.manifestUrl,
        publication.validationReportId,
        clock,
      ],
    );
    assert.equal(
      (
        await commands.execute(
          "media-ready",
          { ...input(n, 3), publicationId: publication.id },
          request,
        )
      ).status,
      "completed",
    );
    if (stage === "MEDIA_READY") {
      return;
    }
    assert.equal((await commands.execute("publish", input(n, 4), request)).status, "completed");
  };
  const statements: { text: string; values: readonly (string | number | boolean | null)[] }[] = [];
  const queries = createCatalogPublicQueries({
    policy: { commercial: true },
    now: () => clock,
    transactions: createPostgresCatalogPublic({
      transaction: (work, requestSignal) =>
        reader.transaction(
          (tx) =>
            work({
              query: (query) => {
                statements.push({ text: query.text, values: query.values ?? [] });
                return tx.query(query);
              },
            }),
          requestSignal,
        ),
    }),
  });
  const entitySource = createPostgresCatalogPublicEntitySource(reader);
  try {
    await assert.rejects(migrations("up"));
    await migrations("down");
    await migrations("up");
    await admin.query(
      "CREATE ROLE aster_catalog_reader_fixture LOGIN PASSWORD 'aster-test-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
    );
    await admin.query("GRANT aster_catalog_reader TO aster_catalog_reader_fixture");
    const client = await admin.connect();
    const forbidden = [
      "SELECT * FROM catalog.titles",
      "SELECT * FROM catalog.rights_revisions",
      "SELECT * FROM catalog.rights_audit",
      "SELECT * FROM catalog.command_audit",
      "SELECT * FROM catalog.publications",
      "SELECT * FROM identity.synthetic_private",
      "INSERT INTO catalog.titles DEFAULT VALUES",
      "UPDATE catalog.titles SET state = 'RETIRED'",
      "DELETE FROM catalog.public_candidates",
      "CREATE TABLE catalog.forbidden (id integer)",
    ];
    try {
      for (const sql of forbidden) {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE aster_catalog_reader");
        await assert.rejects(client.query(sql), {
          code: sql === "DELETE FROM catalog.public_candidates" ? "55000" : "42501",
        });
        await client.query("ROLLBACK");
      }
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    output("catalog_public_migration", {
      roundTrip: true,
      duplicateRefused: true,
      forbiddenStatements: forbidden.length,
    });
    const privileges = await admin.query<{ writable: boolean }>(
      "SELECT has_table_privilege('aster_catalog_reader', 'catalog.public_candidates', 'INSERT,UPDATE,DELETE') AS writable",
    );
    assert.equal(privileges.rows[0]?.writable, false);

    await prepare(101, "DRAFT");
    await prepare(102, "RIGHTS_REVIEWED");
    await prepare(103, "MEDIA_READY");
    for (let n = 104; n <= 128; n++) {
      await prepare(n, "PUBLISHED", n === 105 ? "title" : n === 107 ? "artwork" : null);
    }
    const beforeExpiry = await queries.byIds([id(105), id(107)], signal());
    assert.equal(beforeExpiry.status, "completed");
    assert.equal(beforeExpiry.value.filter(Boolean).length, 2);
    assert.ok(beforeExpiry.value[1]?.artwork?.attribution);
    clock = now + 11;
    const first = await queries.browse({ first: 2, after: null }, signal());
    assert.equal(first.status, "completed");
    assert.deepEqual(
      first.value.edges.map((edge) => edge.node.id),
      [id(104), id(106)],
    );
    assert.equal(first.value.pageInfo.hasNextPage, true);
    assert.doesNotMatch(
      JSON.stringify(first.value),
      /reviewedBy|evidenceLocations|sourceChecksum|assetSourceUrl|manifestUrl/u,
    );
    assert.equal(
      (
        await commands.execute(
          "retire",
          { ...input(106, 5), reason: "Cursor title removed" },
          request,
        )
      ).status,
      "completed",
    );
    await prepare(100);
    const next = await queries.browse(
      { first: 2, after: first.value.pageInfo.endCursor },
      signal(),
    );
    assert.equal(next.status, "completed");
    assert.deepEqual(
      next.value.edges.map((edge) => edge.node.id),
      [id(108), id(109)],
    );
    const beforeBatch = statements.length;
    const batch = await queries.byIds(
      [id(128), id(101), id(105), id(107), id(106), id(999), id(104), id(128)],
      signal(),
    );
    assert.equal(batch.status, "completed");
    assert.deepEqual(
      batch.value.map((title) => title?.id ?? null),
      [id(128), null, null, null, null, null, id(104), id(128)],
    );
    assert.equal(statements.length - beforeBatch, 1);
    const fenced = await entitySource.findFences(
      [id(104), id(128), id(999)],
      { now: clock, policy: { commercial: true } },
      signal(),
    );
    assert.equal(fenced.status, "completed");
    assert.deepEqual(
      fenced.value.map((value) => value.id),
      [id(104), id(128)],
    );
    const exact = await entitySource.findManyAtFences(
      fenced.value,
      { now: clock, policy: { commercial: true } },
      signal(),
    );
    assert.equal(exact.status, "completed");
    assert.equal(exact.value.length, 2);
    assert.equal(
      (
        await commands.execute(
          "dispute",
          { ...input(104, 5), reason: "Synthetic rights dispute" },
          request,
        )
      ).status,
      "completed",
    );
    const oldFence = fenced.value[0];
    assert.ok(oldFence);
    const retiredFence = await entitySource.findManyAtFences(
      [oldFence],
      { now: clock, policy: { commercial: true } },
      signal(),
    );
    assert.deepEqual(retiredFence, { status: "completed", value: [] });
    assert.deepEqual(await queries.byIds([id(104)], signal()), {
      status: "completed",
      value: [null],
    });
    output("catalog_public_cache_fence", {
      compactFenceFields: 4,
      exactCandidateRows: exact.value.length,
      staleFenceRowsAfterDispute: retiredFence.value.length,
    });
    const allIds: string[] = [];
    let after: string | null = null;
    for (let pageNumber = 0; pageNumber < 5; pageNumber++) {
      const page = await queries.browse({ first: 7, after }, signal());
      assert.equal(page.status, "completed");
      allIds.push(...page.value.edges.map((edge) => edge.node.id));
      if (!page.value.pageInfo.hasNextPage) {
        break;
      }
      after = page.value.pageInfo.endCursor;
    }
    assert.deepEqual(allIds, [id(100), ...Array.from({ length: 21 }, (_, n) => id(n + 108))]);
    assert.equal(new Set(allIds).size, allIds.length);
    output("catalog_public_visibility", {
      draftReviewedAndMediaReadyExcluded: true,
      expiredTitleAndArtworkExcludedBeforeLimit: true,
      cursorRemovalAndInsertStable: true,
      retirementAndDisputeImmediate: true,
      batchQueries: 1,
      orderedTitles: allIds.length,
      attributionDerived: true,
      internalsExcluded: true,
    });

    await prepare(95);
    await prepare(96);
    const localPrefix =
      "http://127.0.0.1:9001/aster-media-published/publications/" + "a".repeat(64) + "/";
    await admin.query("UPDATE catalog.publications SET manifest_url = $2 WHERE title_id = $1", [
      id(95),
      localPrefix + "master.m3u8",
    ]);
    const artworkRevision = await admin.query<{ record: Record<string, unknown> }>(
      "SELECT record FROM catalog.rights_revisions WHERE title_id = $1 AND revision = 2",
      [id(96)],
    );
    assert.ok(artworkRevision.rows[0]);
    const art = {
      url: localPrefix + "poster-640.jpg",
      altText: "Synthetic local art",
      rights: { ...artworkRevision.rows[0].record, assetSourceUrl: localPrefix + "poster-640.jpg" },
    };
    await admin.query(
      "UPDATE catalog.titles SET metadata = jsonb_set(metadata, '{artwork}', $2::jsonb) WHERE id = $1",
      [id(96), JSON.stringify(art)],
    );
    const hostedPage = await queries.browse({ first: 1, after: null }, signal());
    assert.equal(hostedPage.status, "completed");
    assert.deepEqual(
      hostedPage.value.edges.map((edge) => edge.node.id),
      [id(100)],
    );
    assert.deepEqual(await queries.byIds([id(95), id(96)], signal()), {
      status: "completed",
      value: [null, null],
    });
    const localQueries = createCatalogPublicQueries({
      policy: { commercial: true, allowLocalMedia: true },
      now: () => clock,
      transactions: createPostgresCatalogPublic(reader),
    });
    const localPage = await localQueries.browse({ first: 2, after: null }, signal());
    assert.equal(localPage.status, "completed");
    assert.deepEqual(
      localPage.value.edges.map((edge) => edge.node.id),
      [id(95), id(96)],
    );
    const localBatch = await localQueries.byIds([id(96), id(95)], signal());
    assert.equal(localBatch.status, "completed");
    assert.deepEqual(
      localBatch.value.map((item) => item?.id),
      [id(96), id(95)],
    );
    output("catalog_local_media_visibility", {
      defaultExcludesBeforeLimit: true,
      explicitLocalIncludesManifestAndArtwork: true,
      batchPolicy: true,
    });

    await admin.query(
      "INSERT INTO catalog.titles(id, version, state) SELECT ('10000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 1, 'DRAFT' FROM generate_series(1,2000) n",
    );
    await admin.query("ANALYZE catalog.titles");
    const planStart = statements.length;
    await queries.browse({ first: 7, after: "c1." + id(110) }, signal());
    await queries.byIds([id(128)], signal());
    const plans = [];
    for (const statement of statements.slice(planStart)) {
      const result = await admin.query(
        "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + statement.text,
        [...statement.values],
      );
      plans.push(result.rows);
    }
    const index = await admin.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'catalog_published_titles'",
    );
    assert.match(index.rows[0]?.indexdef ?? "", /WHERE.*PUBLISHED/u);
    output("catalog_public_query_plans", { draftRows: 2000, plans });

    const http = await catalogHttpFixture(queries);
    try {
      const before = statements.length;
      const response = await http.send({
        query:
          "query Entities($items: [_Any!]!) { _entities(representations: $items) { ... on Title { id localized { title } attribution { creator licenseUrl } } } }",
        variables: { items: [128, 104, 110, 128].map((n) => ({ __typename: "Title", id: id(n) })) },
      });
      assert.equal(response.status, 200);
      assert.equal(response.json.errors, undefined);
      const entities = response.json.data?.["_entities"] as ({ id: string } | null)[];
      assert.deepEqual(
        entities.map((entry) => entry?.id ?? null),
        [id(128), null, id(110), id(128)],
      );
      assert.equal(statements.length - before, 1);
      assert.equal(
        (
          await commands.execute(
            "retire",
            { ...input(128, 5), reason: "HTTP takedown proof" },
            request,
          )
        ).status,
        "completed",
      );
      const retired = await http.send({
        query: 'query Detail { title(id: "' + id(128) + '") { id } }',
      });
      assert.deepEqual(retired.json.data, { title: null });
      output("catalog_public_http_postgres", {
        anonymousEntities: response.json.data,
        sqlQueries: 1,
        retirementNextRequest: true,
        correlated: Boolean(http.traces[0]?.correlationId),
      });
    } finally {
      await http.close();
    }

    const blocker = await admin.connect();
    const controller = new AbortController();
    try {
      await blocker.query("BEGIN");
      await blocker.query("LOCK TABLE catalog.rights_revisions IN ACCESS EXCLUSIVE MODE");
      const pending = queries.browse({ first: 1, after: null }, controller.signal);
      const until = performance.now() + 1500;
      for (;;) {
        const waiting = await admin.query<{ count: number }>(
          "SELECT count(*)::integer AS count FROM pg_stat_activity WHERE usename = 'aster_catalog_reader_fixture' AND wait_event_type = 'Lock'",
        );
        if ((waiting.rows[0]?.count ?? 0) > 0) {
          break;
        }
        assert.ok(performance.now() < until, "Public reader did not enter the lock wait.");
        await delay(10);
      }
      controller.abort();
      assert.equal((await pending).status, "cancelled");
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
    }
    assert.equal((await queries.byIds([id(128)], signal())).status, "completed");
    await reader.close();
    assert.equal((await queries.byIds([id(128)], signal())).status, "unavailable");
    output("catalog_public_failures", {
      blockedReadCancelled: true,
      nextReadRecovered: true,
      closedAdapterUnavailable: true,
    });
  } finally {
    await operatorDatabase.close();
    await reader.close();
  }
}
