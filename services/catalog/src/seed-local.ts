import { createHash, randomUUID } from "node:crypto";
import { addAbortSignal } from "node:stream";
import { createAsterPostgresAdapter, type AsterPostgresAdapter } from "@aster/postgres";
import { createAsterTelemetry } from "@aster/telemetry";
import { createCatalogCommands } from "./application/commands.js";
import { createLocalCatalogOperator } from "./infrastructure/identity/local-operator.js";
import { localCatalogDatabase } from "./infrastructure/identity/local-configuration.js";
import { createPostgresCatalogWorkflow } from "./infrastructure/persistence/postgres-workflow.js";
import {
  UI_SEED_ACTOR_ID,
  validateUiSeedReport,
} from "./infrastructure/fixtures/generated-ui-fixture.js";
import { seedGeneratedCatalog } from "./infrastructure/fixtures/seed-catalog.js";
import { attestUiSeed } from "./infrastructure/fixtures/seed-attestation.js";

const controller = new AbortController();
const stop = () => {
  controller.abort();
};
const deadline = setTimeout(stop, 15000);
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
const now = () => Math.floor(Date.now() / 1000);
const telemetry = createAsterTelemetry({
  serviceName: "catalog-ui-seed",
  serviceVersion: "0.0.0",
  environment: "local",
  export: { mode: "none" },
});
const databases: AsterPostgresAdapter[] = [];
let revoke: (() => void) | undefined;
try {
  if (process.argv.length !== 2 || process.env["ASTER_CATALOG_UI_SEED_ENABLED"] !== "true") {
    throw new Error("UI seed requires explicit local activation.");
  }
  const operatorUrl = localCatalogDatabase(process.env, "operator");
  const adminUrl = localCatalogDatabase(process.env, "migration");
  addAbortSignal(controller.signal, process.stdin);
  const parts: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    if (!Buffer.isBuffer(chunk) || (size += chunk.byteLength) > 16384) {
      throw new Error("Generated report exceeds its input bound.");
    }
    parts.push(chunk);
  }
  const report: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts, size)),
  );
  validateUiSeedReport(report);
  controller.signal.throwIfAborted();
  const connect = (connectionString: string) => {
    const database = createAsterPostgresAdapter({
      connectionString,
      telemetry,
      maxConnections: 1,
      connectionTimeoutMs: 1000,
      operationTimeoutMs: 3000,
      statementTimeoutMs: 1000,
    });
    databases.push(database);
    return database;
  };
  const database = connect(operatorUrl);
  const admin = connect(adminUrl);
  const operator = createLocalCatalogOperator(
    {
      environment: "local",
      operatorEnabled: true,
      actorId: UI_SEED_ACTOR_ID,
    },
    now(),
  );
  revoke = operator.revoke;
  const transactions = createPostgresCatalogWorkflow(database);
  const commands = createCatalogCommands({
    authority: operator.authority,
    transactions,
    policy: { commercial: true },
    now,
    nextId: randomUUID,
    digest: (text) => createHash("sha256").update(text).digest("hex"),
  });
  const result = await seedGeneratedCatalog({
    report,
    commands,
    transactions,
    now,
    request: {
      credential: operator.credential,
      correlationId: randomUUID(),
      signal: controller.signal,
    },
    attest: (publication, signal) => attestUiSeed(admin, publication, signal),
  });
  process.stdout.write(JSON.stringify({ event: "catalog_ui_seed", ...result }) + "\n");
} catch {
  process.stderr.write(
    JSON.stringify({
      event: "catalog_ui_seed_failed",
      code: controller.signal.aborted ? "CANCELLED" : "SEED_REJECTED",
    }) + "\n",
  );
  process.exitCode = 1;
} finally {
  revoke?.();
  await Promise.all(databases.map((database) => database.close()));
  await telemetry.shutdown();
  clearTimeout(deadline);
  process.removeListener("SIGTERM", stop);
  process.removeListener("SIGINT", stop);
}
