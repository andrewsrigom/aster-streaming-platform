import { createHash, randomUUID } from "node:crypto";
import { addAbortSignal, type Readable } from "node:stream";
import { createAsterPostgresAdapter, type AsterPostgresAdapter } from "@aster/postgres";
import { createAsterTelemetry } from "@aster/telemetry";
import { createCatalogCommands } from "../../application/commands.js";
import { createLocalCatalogOperator } from "../identity/local-operator.js";
import { localCatalogDatabase } from "../identity/local-configuration.js";
import { createPostgresCatalogWorkflow } from "../persistence/postgres-workflow.js";
import { validateUiSeedReport } from "./generated-ui-fixture.js";
import { generatedSeed } from "./generated-seed.js";
import { createPlayableSeedPublisher } from "./playable-publisher.js";
import { seedGeneratedCatalog } from "./seed-catalog.js";
import { attestUiSeed } from "./seed-attestation.js";

export async function readUiSeedReport(source: Readable, signal: AbortSignal): Promise<unknown> {
  addAbortSignal(signal, source);
  const parts: Buffer[] = [];
  let size = 0;
  for await (const chunk of source) {
    if (!Buffer.isBuffer(chunk) || (size += chunk.byteLength) > 16384) {
      throw new Error("Generated report exceeds its input bound.");
    }
    parts.push(chunk);
  }
  signal.throwIfAborted();
  const report: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts, size)),
  );
  validateUiSeedReport(report);
  return report;
}

export async function seedLocalCatalog(
  environment: Readonly<Record<string, string | undefined>>,
  report: unknown,
  signal: AbortSignal,
) {
  const playable = environment["ASTER_CATALOG_PLAYABLE_SEED_ENABLED"] === "true";
  if (
    playable
      ? environment["ASTER_CATALOG_UI_SEED_ENABLED"] === "true"
      : environment["ASTER_CATALOG_UI_SEED_ENABLED"] !== "true"
  ) {
    throw new Error("UI seed requires explicit local activation.");
  }
  const operatorUrl = localCatalogDatabase(environment, "operator");
  const adminUrl = localCatalogDatabase(environment, "migration");
  const mode = playable ? "playable" : "evidence";
  const seed = generatedSeed(report, mode);
  signal.throwIfAborted();
  const now = () => Math.floor(Date.now() / 1000);
  const telemetry = createAsterTelemetry({
    serviceName: "catalog-ui-seed",
    serviceVersion: "0.0.0",
    environment: "local",
    export: { mode: "none" },
  });
  const databases: AsterPostgresAdapter[] = [];
  let revoke: (() => void) | undefined;
  let publisher: ReturnType<typeof createPlayableSeedPublisher> | undefined;
  try {
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
      { environment: "local", operatorEnabled: true, actorId: seed.actorId },
      now(),
    );
    revoke = operator.revoke;
    if (playable) {
      publisher = createPlayableSeedPublisher(report, "/fixture/fixture", admin, telemetry);
    }
    const transactions = createPostgresCatalogWorkflow(database);
    const commands = createCatalogCommands({
      authority: operator.authority,
      transactions,
      policy: { commercial: true, allowLocalMedia: playable },
      now,
      nextId: randomUUID,
      digest: (text) => createHash("sha256").update(text).digest("hex"),
    });
    return await seedGeneratedCatalog({
      report,
      mode,
      commands,
      transactions,
      now,
      request: { credential: operator.credential, correlationId: randomUUID(), signal },
      attest: (publication, requestSignal) =>
        publisher
          ? publisher.ensure(publication, requestSignal)
          : attestUiSeed(admin, publication, requestSignal),
    });
  } finally {
    revoke?.();
    await publisher?.close();
    await Promise.all(databases.map((database) => database.close()));
    await telemetry.shutdown();
  }
}
