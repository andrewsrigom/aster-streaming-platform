import { createHash, randomUUID } from "node:crypto";
import { createAsterPostgresAdapter, type AsterPostgresAdapter } from "@aster/postgres";
import { createAsterLogger } from "@aster/runtime";
import { createAsterTelemetry } from "@aster/telemetry";
import { createCatalogCommands } from "./application/commands.js";
import { createCatalogMediaRequests } from "./application/request-media.js";
import { createLocalCatalogOperator } from "./infrastructure/identity/local-operator.js";
import { localCatalogDatabase } from "./infrastructure/identity/local-configuration.js";
import { createPostgresCatalogWorkflow } from "./infrastructure/persistence/postgres-workflow.js";
import { createPostgresCatalogMedia } from "./infrastructure/persistence/postgres-media.js";
import { readOperatorInput } from "./transport/operator-input.js";

const controller = new AbortController();
const stop = (): void => {
  controller.abort();
};
const deadline = setTimeout(stop, 10000);
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
const now = (): number => Math.floor(Date.now() / 1000);
const started = performance.now();
const correlationId = randomUUID();
const traceId = randomUUID().replaceAll("-", "");
const spanId = randomUUID().replaceAll("-", "").slice(0, 16);
const logger = createAsterLogger({
  service: "catalog-operator",
  environment: "local",
  version: "0.0.0",
  destination: process.stderr,
  traceContextProvider: () => ({ traceId, spanId, traceFlags: 0 }),
});
let database: AsterPostgresAdapter | undefined;
let failureStatus: "invalid_input" | "unavailable" = "invalid_input";
const telemetry = createAsterTelemetry({
  serviceName: "catalog-operator",
  serviceVersion: "0.0.0",
  environment: "local",
  export: { mode: "none" },
});
try {
  if (process.argv.length !== 2) {
    throw new Error("Unexpected operator arguments.");
  }
  const connectionString = localCatalogDatabase(process.env, "operator");
  const command = await readOperatorInput(process.stdin, controller.signal);
  failureStatus = "unavailable";
  const operator = createLocalCatalogOperator(
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
      text: "SELECT NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) AND pg_has_role(current_user, 'aster_catalog_runtime', 'USAGE') AND NOT has_schema_privilege(current_user, 'catalog', 'CREATE') AND NOT has_table_privilege(current_user, 'catalog.publications', 'INSERT,UPDATE,DELETE') AND NOT has_table_privilege(current_user, 'catalog.command_audit', 'UPDATE,DELETE') AND NOT has_table_privilege(current_user, 'catalog.publication_outbox', 'UPDATE,DELETE') AND NOT COALESCE(has_schema_privilege(current_user, to_regnamespace('identity'), 'USAGE'), false) AS allowed, CASE WHEN to_regclass('catalog.media_requests') IS NULL THEN false ELSE has_table_privilege(current_user, 'catalog.media_requests', 'SELECT') AND has_table_privilege(current_user, 'catalog.media_requests', 'INSERT') AND NOT has_table_privilege(current_user, 'catalog.media_requests', 'UPDATE,DELETE,TRUNCATE') END AS media_allowed FROM pg_roles WHERE rolname = current_user",
    });
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return {
      action: "rollback",
      value:
        result.rowCount === 1 &&
        row?.["allowed"] === true &&
        (command.command !== "request-media" || row["media_allowed"] === true),
    };
  }, controller.signal);
  if (probe.status !== "rolled_back" || !probe.value) {
    throw new Error("Invalid Catalog runtime privileges.");
  }
  const commands = createCatalogCommands({
    authority: operator.authority,
    transactions: createPostgresCatalogWorkflow(database),
    policy: { commercial: true, allowLocalMedia: true },
    now,
    nextId: randomUUID,
    digest: (text) => createHash("sha256").update(text).digest("hex"),
  });
  const request = { credential: operator.credential, correlationId, signal: controller.signal };
  const result =
    command.command === "request-media"
      ? await createCatalogMediaRequests({
          authority: operator.authority,
          transactions: createPostgresCatalogMedia(database),
          policy: { commercial: true, allowLocalMedia: true },
          now,
          digest: (text) => createHash("sha256").update(text).digest("hex"),
        }).request(command.input, request)
      : command.command === "inspect"
        ? await commands.inspect(command.input, request)
        : await commands.execute(command.command, command.input, request);
  operator.revoke();
  logger.info({
    event: "aster.catalog.command_completed",
    operation: command.command,
    requestId: correlationId,
    durationMs: performance.now() - started,
    outcome: result.status === "completed" ? "ok" : "rejected",
    properties: [["code", result.status]],
  });
  process.stdout.write(JSON.stringify(result) + "\n");
  if (result.status !== "completed") {
    process.exitCode = 1;
  }
} catch {
  logger.warn({
    event: "aster.catalog.command_failed",
    requestId: correlationId,
    errorCategory: controller.signal.aborted ? "CANCELLED" : "COMMAND_FAILED",
  });
  process.stdout.write(
    JSON.stringify({ status: controller.signal.aborted ? "cancelled" : failureStatus }) + "\n",
  );
  process.exitCode = 1;
} finally {
  await database?.close();
  await telemetry.shutdown();
  clearTimeout(deadline);
  process.removeListener("SIGTERM", stop);
  process.removeListener("SIGINT", stop);
}
