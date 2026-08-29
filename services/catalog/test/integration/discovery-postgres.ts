import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import type { Pool } from "pg";
import { createLocalCatalogDiscoveryTrust, createLocalRouterTrust } from "@aster/http-express";
import type { AsterPostgresAdapter } from "@aster/postgres";
import { createAsterLogger } from "@aster/runtime";
import { createCatalogService } from "../../src/create-service.js";
import { createCatalogDiscoveryQueries } from "../../src/application/discovery-queries.js";
import { createPostgresCatalogDiscovery } from "../../src/infrastructure/persistence/postgres-discovery.js";
import { probeCatalogDiscoveryReader } from "../../src/infrastructure/persistence/discovery-readiness.js";
import { probeCatalogReader } from "../../src/infrastructure/persistence/reader-readiness.js";
import { CATALOG_DISCOVERY_SNAPSHOTS } from "../../src/transport/discovery-operation.js";
import { publicCandidate } from "../public-fixture.js";
import { catalogTestId as id, catalogTestTime as now } from "../rights-fixture.js";

export async function verifyDiscoverySources(
  admin: Pool,
  database: AsterPostgresAdapter,
  publicReader: AsterPostgresAdapter,
  databasePort: number,
): Promise<void> {
  const signal = () => AbortSignal.timeout(2000);
  const output = (event: string, facts: Record<string, unknown>) =>
    process.stdout.write(JSON.stringify({ event, ...facts }) + "\n");
  const migrate = async (direction: "up" | "down") => {
    const client = await admin.connect();
    try {
      await client.query(
        await readFile(
          new URL(`../../../migrations/0010-discovery-reads.${direction}.sql`, import.meta.url),
          "utf8",
        ),
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
  const freePort = async (): Promise<number> => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
    return address.port;
  };
  let time = now + 20;
  const queries = createCatalogDiscoveryQueries({
    transactions: createPostgresCatalogDiscovery(database),
    now: () => time,
    policy: { commercial: true },
  });
  const firstId = id(970000);
  const otherId = id(970001);
  const draftId = id(970002);
  async function seed(n: number, expiry: number | null = null) {
    const titleId = id(n);
    const publicationId = id(n + 10000);
    const candidate = publicCandidate(n);
    const rights = { ...(candidate.rights as object), validUntil: expiry };
    const client = await admin.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO catalog.titles(id,version,state,metadata) VALUES ($1,1,'DRAFT',$2::jsonb)",
        [titleId, JSON.stringify(candidate.metadata)],
      );
      await client.query(
        "INSERT INTO catalog.rights_revisions(id,title_id,revision,status,record) VALUES ($1,$2,2,'APPROVED',$3::jsonb)",
        [id(n + 300), titleId, JSON.stringify(rights)],
      );
      await client.query("INSERT INTO catalog.rights_audit VALUES ($1,2,3,$2,$3,$4)", [
        titleId,
        id(3),
        now,
        id(n + 20000),
      ]);
      await client.query("INSERT INTO catalog.publications VALUES ($1,$2,2,$3,$4,$5,$6)", [
        publicationId,
        titleId,
        "a".repeat(64),
        "https://example.invalid/media/master.m3u8",
        id(n + 30000),
        now,
      ]);
      await client.query(
        "UPDATE catalog.titles SET version=5,state='PUBLISHED',latest_rights_revision=2,rights_revision=2,publication_id=$2 WHERE id=$1",
        [titleId, publicationId],
      );
      await client.query(
        "INSERT INTO catalog.command_audit(id,title_id,title_version,kind,actor_id,occurred_at,correlation_id,mutation_id) VALUES ($1,$2,5,'publish',$3,$4,$5,$6)",
        [id(n + 40000), titleId, id(3), now + 10, id(n + 50000), id(n + 60000)],
      );
      await client.query("INSERT INTO catalog.publication_activations VALUES ($1,5,$2,2)", [
        titleId,
        publicationId,
      ]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  try {
    const present = await admin.query<{ relation: string | null }>(
      "SELECT to_regclass('catalog.discovery_sources')::text AS relation",
    );
    if (present.rows[0]?.relation === null) {
      await migrate("up");
    }
    await admin.query(
      "GRANT aster_catalog_discovery_reader TO aster_catalog_discovery_reader_local",
    );
    assert.equal(await probeCatalogDiscoveryReader(database, signal()), "ready");
    assert.equal(await probeCatalogReader(publicReader, signal()), "ready");
    await seed(970000);
    await seed(970001, now + 21);
    await admin.query(
      "INSERT INTO catalog.titles(id,version,state,metadata) VALUES ($1,1,'DRAFT',$2::jsonb)",
      [draftId, JSON.stringify({ privateDraftCanary: "must-not-cross-owner-view" })],
    );
    const first = await queries.byIds([firstId, otherId], signal());
    assert.ok(first.status === "completed");
    assert.equal(first.value[0]?.document?.publishedAt, now + 10);
    assert.equal(first.value[0].sourceVersion, 5);
    assert.equal(first.value[1]?.visibleUntil, now + 21);
    assert.doesNotMatch(JSON.stringify(first), /manifestUrl|rights|privateDraftCanary|reviewedBy/u);
    const draft = await queries.byIds([draftId, id(979999)], signal());
    assert.ok(draft.status === "completed");
    assert.equal(draft.value[0]?.document, null);
    assert.equal(draft.value[0].sourceVersion, 1);
    assert.equal(draft.value[1], null);
    const viewDraft = await database.transaction(
      async (tx) => ({
        action: "rollback",
        value: await tx.query({
          text: "SELECT candidate,published_at FROM catalog.discovery_sources WHERE title_id=$1::uuid",
          values: [draftId],
        }),
      }),
      signal(),
    );
    assert.ok(viewDraft.status === "rolled_back");
    assert.deepEqual(viewDraft.value.rows, [{ candidate: null, published_at: null }]);
    output("catalog_discovery_source", {
      exactVersion: 5,
      publishedAtFromAudit: now + 10,
      rightsExpiry: now + 21,
      hiddenVersion: 1,
      privateDraftOmitted: true,
      missingNotInvented: true,
    });

    const client = await admin.connect();
    let denied = 0;
    try {
      for (const sql of [
        "SELECT * FROM catalog.titles",
        "SELECT * FROM catalog.public_candidates",
        "SELECT * FROM catalog.command_audit",
        "UPDATE catalog.titles SET version=version+1",
        "CREATE TABLE catalog.forbidden_discovery(id int)",
      ]) {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE aster_catalog_discovery_reader");
        await assert.rejects(client.query(sql), { code: "42501" });
        await client.query("ROLLBACK");
        denied++;
      }
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE aster_catalog_reader");
      await assert.rejects(client.query("SELECT * FROM catalog.discovery_sources"), {
        code: "42501",
      });
      await client.query("ROLLBACK");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    output("catalog_discovery_privileges", {
      forbiddenStatements: denied,
      publicReaderUnchanged: true,
      separateReadOnlyRole: true,
    });

    const page = await queries.exportPage(id(969999), signal());
    assert.ok(page.status === "completed");
    assert.deepEqual(
      page.value.snapshots.map((s) => s.titleId),
      [firstId, otherId],
    );
    assert.equal(page.value.endCursor, otherId);
    assert.equal(page.value.hasNextPage, true);
    const last = await queries.exportPage(otherId, signal());
    assert.ok(last.status === "completed");
    const remaining = await admin.query<{ id: string }>(
      "SELECT id FROM catalog.titles WHERE id > $1::uuid ORDER BY id LIMIT 3",
      [otherId],
    );
    // The full Catalog suite retains other titles; export must include them too.
    assert.equal(last.value.snapshots[0]?.titleId, draftId);
    assert.deepEqual(
      last.value.snapshots.map((s) => s.titleId),
      remaining.rows.slice(0, 2).map((row) => row.id),
    );
    assert.equal(last.value.hasNextPage, remaining.rows.length > 2);
    time = now + 21;
    const expired = await queries.byIds([otherId], signal());
    assert.ok(expired.status === "completed");
    assert.equal(expired.value[0]?.document, null);
    assert.equal(expired.value[0].sourceVersion, 5);
    await admin.query("UPDATE catalog.titles SET version=6,state='RETIRED' WHERE id=$1", [firstId]);
    const retired = await queries.byIds([firstId], signal());
    assert.ok(retired.status === "completed");
    assert.equal(retired.value[0]?.sourceVersion, 6);
    assert.equal(retired.value[0].document, null);
    output("catalog_discovery_export_retirement", {
      pageSizes: [page.value.snapshots.length, last.value.snapshots.length],
      stableCursor: true,
      expiryHiddenWithoutVersionChange: true,
      retiredVersion: 6,
    });

    const count = async () =>
      (await admin.query<{ count: number }>("SELECT count(*)::int AS count FROM catalog.titles"))
        .rows[0]?.count;
    const before = await count();
    await assert.rejects(migrate("up"));
    await migrate("down");
    assert.equal(await count(), before);
    assert.equal(await probeCatalogReader(publicReader, signal()), "ready");
    await migrate("up");
    await admin.query(
      "GRANT aster_catalog_discovery_reader TO aster_catalog_discovery_reader_local",
    );
    assert.equal(await probeCatalogDiscoveryReader(database, signal()), "ready");
    assert.deepEqual(await queries.byIds([firstId], signal()), retired);
    output("catalog_discovery_view_roundtrip", {
      retainedTitles: before,
      dataPreserved: true,
      publicReaderStillReady: true,
      hiddenFencePreserved: true,
    });

    const routerKey = "c".repeat(64);
    const discoveryKey = "d".repeat(64);
    const service = await createCatalogService(
      {
        ASTER_ENVIRONMENT: "local",
        ASTER_CATALOG_LOCAL_ENABLED: "true",
        ASTER_CATALOG_HTTP_PORT: String(await freePort()),
        ASTER_CATALOG_READER_DATABASE_URL:
          "postgresql://aster_catalog_reader_local@127.0.0.1:" + String(databasePort) + "/aster",
        ASTER_CATALOG_READER_DATABASE_PASSWORD: "aster-test-only",
        ASTER_ROUTER_TRUST_ENABLED: "true",
        ASTER_CATALOG_DISCOVERY_READ_ENABLED: "true",
        ASTER_CATALOG_DISCOVERY_READER_DATABASE_URL:
          "postgresql://aster_catalog_discovery_reader_local@127.0.0.1:" +
          String(databasePort) +
          "/aster",
        ASTER_CATALOG_DISCOVERY_READER_DATABASE_PASSWORD: "aster-test-only",
      },
      {
        database: publicReader,
        routerTrust: createLocalRouterTrust("catalog", routerKey),
        discoveryTrust: createLocalCatalogDiscoveryTrust(discoveryKey),
        logger: createAsterLogger({
          service: "catalog",
          version: "0.0.0",
          environment: "integration",
          destination: { write: () => undefined },
        }),
      },
    );
    const post = async (body: object, headers: Record<string, string>) =>
      new Promise<{ readonly status: number; readonly text: string }>((resolve, reject) => {
        const request = httpRequest(
          "http://127.0.0.1:" + String(service.port()) + "/graphql",
          {
            method: "POST",
            headers: { "content-type": "application/json", connection: "close", ...headers },
            signal: AbortSignal.timeout(3000),
          },
          (response) => {
            const chunks: Buffer[] = [];
            response.on("data", (chunk: Buffer) => {
              chunks.push(chunk);
            });
            response.once("error", reject);
            response.once("end", () => {
              resolve({
                status: response.statusCode ?? 500,
                text: Buffer.concat(chunks).toString("utf8"),
              });
            });
          },
        );
        request.once("error", reject);
        request.end(JSON.stringify(body));
      });
    const base = { host: "catalog:3200", "x-aster-csrf": "1" };
    const publicHeaders = {
      ...base,
      origin: "http://127.0.0.1:4000",
      "x-aster-router-credential": routerKey,
    };
    const discoveryHeaders = {
      ...base,
      origin: "http://discovery:3500",
      "x-aster-discovery-credential": discoveryKey,
      "x-aster-correlation-id": id(979998),
    };
    const discoveryBody = {
      query: CATALOG_DISCOVERY_SNAPSHOTS,
      operationName: "DiscoverySnapshots",
      variables: { ids: [firstId, draftId] },
    };
    let membershipRevoked = false;
    try {
      assert.equal(await service.start(), "ready");
      assert.equal(await service.checkDiscoveryReadiness(signal()), "ready");
      const privateRead = await post(discoveryBody, discoveryHeaders);
      assert.equal(privateRead.status, 200);
      const privateJson = JSON.parse(privateRead.text) as {
        data?: { _discoverySnapshots?: { sourceVersion: number; document: unknown }[] };
        errors?: unknown[];
      };
      assert.equal(privateJson.errors, undefined);
      assert.deepEqual(
        privateJson.data?._discoverySnapshots?.map((source) => ({
          sourceVersion: source.sourceVersion,
          document: source.document,
        })),
        [
          { sourceVersion: 6, document: null },
          { sourceVersion: 1, document: null },
        ],
      );
      assert.doesNotMatch(privateRead.text, /manifestUrl|rights|privateDraftCanary|reviewedBy/u);
      assert.equal((await post(discoveryBody, publicHeaders)).status, 400);

      await admin.query(
        "REVOKE aster_catalog_discovery_reader FROM aster_catalog_discovery_reader_local",
      );
      membershipRevoked = true;
      assert.equal(await service.checkDiscoveryReadiness(signal()), "unavailable");
      const unavailable = await post(discoveryBody, discoveryHeaders);
      assert.equal(unavailable.status, 200);
      assert.match(unavailable.text, /UNAVAILABLE/u);
      const publicRead = await post(
        {
          query: "query RuntimeCatalog { titles(first: 1) { edges { node { id } } } }",
          operationName: "RuntimeCatalog",
        },
        publicHeaders,
      );
      assert.equal(publicRead.status, 200);
      assert.doesNotMatch(publicRead.text, /UNAVAILABLE/u);
      await admin.query(
        "GRANT aster_catalog_discovery_reader TO aster_catalog_discovery_reader_local",
      );
      membershipRevoked = false;
      assert.equal(await service.checkDiscoveryReadiness(signal()), "ready");
      output("catalog_discovery_private_runtime", {
        exactOperations: true,
        separateCredential: true,
        separatePoolLimit: 1,
        failureDoesNotBlockPublicCatalog: true,
        recoveryObserved: true,
      });
    } finally {
      if (membershipRevoked) {
        await admin.query(
          "GRANT aster_catalog_discovery_reader TO aster_catalog_discovery_reader_local",
        );
      }
      await service.shutdown();
    }
  } finally {
    await database.close();
    await publicReader.close();
  }
}
