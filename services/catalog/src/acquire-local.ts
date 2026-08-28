import { randomUUID } from "node:crypto";
import { createAsterPostgresAdapter, type AsterPostgresAdapter } from "@aster/postgres";
import {
  createAsterObjectStorageAdapter,
  type AsterObjectStorageAdapter,
} from "@aster/object-storage-s3";
import { createAsterLogger } from "@aster/runtime";
import { createAsterTelemetry } from "@aster/telemetry";
import { createCatalogAcquisitions } from "./application/acquire-media.js";
import { catalogIdentifier } from "./domain/values.js";
import { createLocalCatalogOperator } from "./infrastructure/identity/local-operator.js";
import { localCatalogDatabase } from "./infrastructure/identity/local-configuration.js";
import { createPostgresCatalogAcquisitions } from "./infrastructure/persistence/postgres-acquisition.js";
import {
  localMediaStorage,
  prepareLocalMediaStorage,
} from "./infrastructure/media/local-storage.js";
import { runMediaAcquisition } from "./infrastructure/media/run-acquisition.js";
import { prepareDecoder } from "./infrastructure/media/prepare-decoder.js";
import { awaitDecoderCandidate } from "./infrastructure/media/retain-candidate.js";

const controller = new AbortController();
const stop = () => {
  controller.abort();
};
const deadline = setTimeout(stop, process.argv[3] === "--prepare-decoder" ? 1740000 : 420000);
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
const now = () => Math.floor(Date.now() / 1000);
const correlationId = randomUUID();
const traceId = randomUUID().replaceAll("-", "");
const spanId = randomUUID().replaceAll("-", "").slice(0, 16);
const logger = createAsterLogger({
  service: "catalog-acquisition",
  environment: "local",
  version: "0.0.0",
  destination: process.stderr,
  traceContextProvider: () => ({ traceId, spanId, traceFlags: 0 }),
});
const telemetry = createAsterTelemetry({
  serviceName: "catalog-acquisition",
  serviceVersion: "0.0.0",
  environment: "local",
  export: { mode: "none" },
});
let database: AsterPostgresAdapter | undefined;
let storage: AsterObjectStorageAdapter | undefined;
let operator: ReturnType<typeof createLocalCatalogOperator> | undefined;
try {
  const requestId = process.argv[2];
  const preparing = process.argv[3] === "--prepare-decoder";
  if (
    (preparing
      ? process.argv.length !== 4 || process.env["ASTER_MEDIA_PREPARE_DECODER_ENABLED"] !== "true"
      : process.argv.length !== 3) ||
    !catalogIdentifier(requestId) ||
    process.env["ASTER_MEDIA_ACQUISITION_ENABLED"] !== "true"
  ) {
    throw new Error("Local acquisition activation rejected.");
  }
  const connectionString = localCatalogDatabase(process.env, "operator");
  operator = createLocalCatalogOperator(
    {
      environment: "local",
      operatorEnabled: true,
      actorId: "00000000-0000-4000-8000-000000000003",
    },
    now(),
  );
  database = createAsterPostgresAdapter({
    connectionString,
    telemetry,
    maxConnections: 1,
    connectionTimeoutMs: 1000,
    operationTimeoutMs: 3000,
    statementTimeoutMs: 1000,
  });
  const probe = await database.transaction(async (tx) => {
    const result = await tx.query({
      text: "SELECT NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) AND pg_has_role(current_user, 'aster_catalog_runtime', 'USAGE') AND NOT has_schema_privilege(current_user, 'catalog', 'CREATE') AND NOT has_table_privilege(current_user, 'catalog.publications', 'INSERT,UPDATE,DELETE,TRUNCATE') AND NOT has_table_privilege(current_user, 'catalog.media_requests', 'UPDATE,DELETE,TRUNCATE') AND has_table_privilege(current_user, 'catalog.media_acquisitions', 'SELECT') AND has_table_privilege(current_user, 'catalog.media_acquisitions', 'INSERT') AND has_table_privilege(current_user, 'catalog.media_acquisitions', 'UPDATE') AND NOT has_table_privilege(current_user, 'catalog.media_acquisitions', 'DELETE,TRUNCATE') AND NOT COALESCE(has_schema_privilege(current_user, to_regnamespace('identity'), 'USAGE'), false) AS allowed FROM pg_roles WHERE rolname = current_user",
    });
    return {
      action: "rollback",
      value:
        result.rowCount === 1 && (result.rows[0] as Record<string, unknown>)["allowed"] === true,
    };
  }, controller.signal);
  if (probe.status !== "rolled_back" || !probe.value) {
    throw new Error("Invalid local acquisition privileges.");
  }
  storage = createAsterObjectStorageAdapter({
    ...localMediaStorage,
    telemetry,
    maxInFlightOperations: 1,
    maxObjectBytes: 256 * 1024 * 1024,
    operationTimeoutMs: 60000,
    connectionTimeoutMs: 2000,
    uploadQueueSize: 1,
  });
  const acquisitions = createCatalogAcquisitions({
    authority: operator.authority,
    transactions: createPostgresCatalogAcquisitions(database),
    policy: { commercial: true },
    now,
    nextId: randomUUID,
  });
  const request = { credential: operator.credential, signal: controller.signal, correlationId };
  const result = preparing
    ? await prepareDecoder(requestId, "/decoder-input", request, acquisitions, storage)
    : await runMediaAcquisition(
        requestId,
        { credential: operator.credential, signal: controller.signal, correlationId },
        {
          acquisitions,
          storage,
          prepareStorage: prepareLocalMediaStorage,
          onProgress: (progress) =>
            logger.info({
              event: "aster.catalog.media_progress",
              requestId: correlationId,
              durationMs: progress.elapsedMs,
              properties: [["code", String(progress.bytes)]],
            }),
        },
      );
  if (preparing && result.status === "completed") {
    process.stdout.write(
      JSON.stringify({ event: "decoder_input_ready", ...result, correlationId }) + "\n",
    );
    const retained = await awaitDecoderCandidate(requestId, request, acquisitions, storage);
    process.stdout.write(
      JSON.stringify({ event: "decoder_candidate_retained", ...retained, correlationId }) + "\n",
    );
    if (retained.status !== "completed") {
      process.exitCode = 1;
    }
  }
  process.stdout.write(JSON.stringify({ ...result, correlationId }) + "\n");
  if (result.status !== "completed") {
    process.exitCode = 1;
  }
} catch {
  logger.warn({
    event: "aster.catalog.media_failed",
    requestId: correlationId,
    errorCategory: controller.signal.aborted ? "CANCELLED" : "ACQUISITION_FAILED",
  });
  process.stdout.write(
    JSON.stringify({
      status: controller.signal.aborted ? "cancelled" : "unavailable",
      correlationId,
    }) + "\n",
  );
  process.exitCode = 1;
} finally {
  operator?.revoke();
  await storage?.close();
  await database?.close();
  await telemetry.shutdown();
  clearTimeout(deadline);
  process.removeListener("SIGTERM", stop);
  process.removeListener("SIGINT", stop);
}
