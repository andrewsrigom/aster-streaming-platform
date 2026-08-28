import { randomUUID } from "node:crypto";
import {
  eventIdentifier,
  localEventDatabase,
  localEventDeliveryEnabled,
  loadLocalIdentityEventCredential,
} from "@aster/event-delivery";
import { createAsterPostgresAdapter, type AsterPostgresAdapter } from "@aster/postgres";
import { createIdentityEventConsumer } from "./application/consume-identity-event.js";
import { createIdentityEventInspector } from "./infrastructure/identity-event-wire.js";
import { createPostgresIdentityEvents } from "./infrastructure/postgres-identity-events.js";
import { localEngagementDatabase } from "./infrastructure/runtime-configuration.js";

let database: AsterPostgresAdapter | undefined;
try {
  const id = process.argv[2];
  if (
    process.argv.length !== 3 ||
    !eventIdentifier(id) ||
    process.env["ASTER_EVENT_REPLAY_ENABLED"] !== "true" ||
    !localEventDeliveryEnabled(
      process.env["ASTER_EVENTS_ENABLED"],
      process.env["ASTER_ENVIRONMENT"],
    )
  ) {
    throw new Error("Replay requires explicit local activation and one exact record ID.");
  }
  const credential = await loadLocalIdentityEventCredential();
  database = createAsterPostgresAdapter({
    connectionString: localEventDatabase(
      "engagement",
      localEngagementDatabase(process.env, "runtime"),
      "consumer",
    ),
    maxConnections: 1,
    connectionTimeoutMs: 500,
    operationTimeoutMs: 1000,
    statementTimeoutMs: 900,
    telemetry: {
      startDependencyOperation: () => ({ status: "rejected", reason: "telemetry_closed" }),
    },
  });
  const result = await createIdentityEventConsumer({
    inspect: createIdentityEventInspector(credential),
    store: createPostgresIdentityEvents(database, randomUUID),
  }).replay(id, AbortSignal.timeout(5000));
  process.stdout.write(
    JSON.stringify({ event: "aster.engagement.identity_replay", status: result }) + "\n",
  );
  if (result === "retry" || result === "quarantined") {
    process.exitCode = 1;
  }
} catch {
  process.stderr.write(
    JSON.stringify({
      event: "aster.engagement.identity_replay_failed",
      code: "IDENTITY_REPLAY_FAILED",
    }) + "\n",
  );
  process.exitCode = 1;
} finally {
  const result = await database?.close(AbortSignal.timeout(2000));
  if (result && result.status !== "completed" && result.status !== "already_completed") {
    process.exitCode = 1;
  }
}
