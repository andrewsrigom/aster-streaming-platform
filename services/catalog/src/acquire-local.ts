import { createHash, randomUUID } from "node:crypto";
import { createAsterPostgresAdapter, type AsterPostgresAdapter } from "@aster/postgres";
import {
  createAsterObjectStorageAdapter,
  type AsterObjectStorageAdapter,
} from "@aster/object-storage-s3";
import { createAsterLogger } from "@aster/runtime";
import { createAsterTelemetry, isAsterOtlpMetricsEndpoint } from "@aster/telemetry";
import { createCatalogAcquisitions } from "./application/acquire-media.js";
import { catalogChecksum, catalogIdentifier } from "./domain/values.js";
import { createLocalCatalogOperator } from "./infrastructure/identity/local-operator.js";
import { localCatalogDatabase } from "./infrastructure/identity/local-configuration.js";
import { createPostgresCatalogAcquisitions } from "./infrastructure/persistence/postgres-acquisition.js";
import {
  localMediaStorage,
  prepareLocalMediaStorage,
} from "./infrastructure/media/local-storage.js";
import { runMediaAcquisition } from "./infrastructure/media/run-acquisition.js";
import { createCatalogProcessing } from "./application/process-media.js";
import { createPostgresCatalogProcessing } from "./infrastructure/persistence/postgres-processing.js";
import { runMediaProcessing } from "./infrastructure/media/run-processing.js";
import { ARTWORK_RECIPE_VERSION } from "./domain/media-processing.js";
import { MEDIA_RECIPE_VERSION } from "./domain/media-request.js";

const controller = new AbortController();
const preparing = [
  "--prepare-decoder",
  "--reuse-decoder",
  "--prepare-artwork",
  "--reuse-artwork",
].includes(process.argv[3] ?? "");
const stop = () => {
  controller.abort();
};
const deadline = setTimeout(stop, preparing ? 1740000 : 420000);
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
const now = () => Math.floor(Date.now() / 1000);
const correlationId = randomUUID();
const otlpMetricsEndpoint = process.env["ASTER_OTLP_METRICS_ENDPOINT"];
if (otlpMetricsEndpoint !== undefined && !isAsterOtlpMetricsEndpoint(otlpMetricsEndpoint)) {
  throw new Error("Invalid acquisition telemetry endpoint.");
}
const telemetry = createAsterTelemetry({
  serviceName: "catalog-acquisition",
  serviceVersion: "0.0.0",
  environment: "local",
  ...(otlpMetricsEndpoint === undefined
    ? { export: { mode: "none" as const } }
    : {
        export: {
          mode: "otlp-http" as const,
          endpoint: otlpMetricsEndpoint,
          intervalMs: 5_000,
          timeoutMs: 1_000,
        },
        shutdownTimeoutMs: 2_000,
      }),
});
const logger = createAsterLogger({
  service: "catalog-acquisition",
  environment: "local",
  version: "0.0.0",
  destination: process.stderr,
  traceContextProvider: () => telemetry.activeTraceContext(),
});
let database: AsterPostgresAdapter | undefined;
let storage: AsterObjectStorageAdapter | undefined;
let operator: ReturnType<typeof createLocalCatalogOperator> | undefined;
try {
  const requestId = process.argv[2];
  const reuse = ["--reuse-decoder", "--reuse-artwork"].includes(process.argv[3] ?? "");
  const recipeVersion = ["--prepare-artwork", "--reuse-artwork"].includes(process.argv[3] ?? "")
    ? ARTWORK_RECIPE_VERSION
    : MEDIA_RECIPE_VERSION;
  const selector =
    reuse && catalogChecksum(process.argv[4]) && catalogChecksum(process.argv[5])
      ? { manifestHash: process.argv[4], reportChecksum: process.argv[5] }
      : undefined;
  if (
    (preparing
      ? (reuse ? process.argv.length !== 6 || !selector : process.argv.length !== 4) ||
        process.env["ASTER_MEDIA_PREPARE_DECODER_ENABLED"] !== "true"
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
    poolRole: "operator",
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
  if (preparing) {
    const privileges = await database.transaction(async (tx) => {
      const result = await tx.query({
        text: "SELECT has_table_privilege(current_user, 'catalog.media_processing', 'SELECT') AND has_table_privilege(current_user, 'catalog.media_processing', 'INSERT') AND has_table_privilege(current_user, 'catalog.media_processing', 'UPDATE') AND NOT has_table_privilege(current_user, 'catalog.media_processing', 'DELETE,TRUNCATE') AS allowed",
      });
      return {
        action: "rollback",
        value:
          result.rowCount === 1 && (result.rows[0] as Record<string, unknown>)["allowed"] === true,
      };
    }, controller.signal);
    if (privileges.status !== "rolled_back" || !privileges.value) {
      throw new Error("Invalid local processing privileges.");
    }
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
    ? await runMediaProcessing(requestId, request, {
        processing: createCatalogProcessing({
          recipeVersion,
          authority: operator.authority,
          transactions: createPostgresCatalogProcessing(database),
          policy: { commercial: true },
          now,
          nextId: randomUUID,
          digest: (text) => createHash("sha256").update(text).digest("hex"),
        }),
        acquisitions,
        storage,
        telemetry,
        ...(selector ? { selector } : {}),
        onReady: () =>
          process.stdout.write(
            JSON.stringify({ event: "decoder_input_ready", correlationId }) + "\n",
          ),
      })
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
  process.stdout.write(
    JSON.stringify({
      event:
        preparing &&
        result.status === "completed" &&
        "reused" in result.value &&
        result.value.reused
          ? "decoder_candidate_reused"
          : preparing
            ? "decoder_candidate_retained"
            : "media_acquisition_result",
      ...result,
      correlationId,
    }) + "\n",
  );
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
  await telemetry.forceFlush(AbortSignal.timeout(1_000));
  await telemetry.shutdown();
  clearTimeout(deadline);
  process.removeListener("SIGTERM", stop);
  process.removeListener("SIGINT", stop);
}
