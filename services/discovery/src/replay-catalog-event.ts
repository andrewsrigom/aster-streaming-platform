import { randomUUID } from "node:crypto";
import { eventIdentifier, localEventDeliveryEnabled } from "@aster/event-delivery";
import { loadLocalCatalogDiscoveryCredential } from "@aster/http-express";
import { createAsterPostgresAdapter, type AsterPostgresAdapter } from "@aster/postgres";
import { createTitleProjector } from "./application/apply-title-snapshot.js";
import { createCatalogEventConsumer } from "./application/consume-catalog-event.js";
import { inspectCatalogEvent } from "./infrastructure/catalog-event-wire.js";
import { createCatalogSnapshotClient } from "./infrastructure/catalog-snapshot-client.js";
import { createPostgresCatalogEvents } from "./infrastructure/postgres-catalog-events.js";
import { createPostgresProjectionUnitOfWork } from "./infrastructure/postgres-projection.js";
import { localDiscoveryDatabase } from "./infrastructure/runtime-configuration.js";

let database: AsterPostgresAdapter | undefined;
try {
  const id = process.argv[2];
  if (
    process.argv.length !== 3 ||
    !eventIdentifier(id) ||
    process.env["ASTER_DISCOVERY_REPLAY_ENABLED"] !== "true" ||
    !localEventDeliveryEnabled(
      process.env["ASTER_EVENTS_ENABLED"],
      process.env["ASTER_ENVIRONMENT"],
    )
  ) {
    throw new Error("Replay requires explicit local activation and one exact record ID.");
  }
  database = createAsterPostgresAdapter({
    connectionString: localDiscoveryDatabase(process.env, "projector"),
    maxConnections: 1,
    connectionTimeoutMs: 500,
    operationTimeoutMs: 1500,
    statementTimeoutMs: 1200,
    telemetry: {
      startDependencyOperation: () => ({ status: "rejected", reason: "telemetry_closed" }),
    },
  });
  const result = await createCatalogEventConsumer({
    inspect: inspectCatalogEvent,
    source: createCatalogSnapshotClient({
      credential: await loadLocalCatalogDiscoveryCredential(),
      now: () => Math.floor(Date.now() / 1_000),
    }),
    projector: createTitleProjector({
      transactions: createPostgresProjectionUnitOfWork(database),
    }),
    store: createPostgresCatalogEvents(database, randomUUID),
    now: () => Math.floor(Date.now() / 1_000),
  }).replay(id, AbortSignal.timeout(5_000));
  process.stdout.write(
    JSON.stringify({ event: "aster.discovery.catalog_replay", status: result }) + "\n",
  );
  if (result === "retry" || result === "quarantined") {
    process.exitCode = 1;
  }
} catch {
  process.stderr.write(
    JSON.stringify({
      event: "aster.discovery.catalog_replay_failed",
      code: "CATALOG_REPLAY_FAILED",
    }) + "\n",
  );
  process.exitCode = 1;
} finally {
  const result = await database?.close(AbortSignal.timeout(2_000));
  if (result && result.status !== "completed" && result.status !== "already_completed") {
    process.exitCode = 1;
  }
}
