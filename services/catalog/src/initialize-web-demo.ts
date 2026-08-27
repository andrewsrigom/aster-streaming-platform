import { createReadStream } from "node:fs";
import { readUiSeedReport, seedLocalCatalog } from "./infrastructure/fixtures/local-ui-seed.js";
import { localCatalogDatabase } from "./infrastructure/identity/local-configuration.js";
import { migrateLocalCatalog } from "./infrastructure/persistence/local-migrations.js";

const controller = new AbortController();
const stop = () => {
  controller.abort();
};
const deadline = setTimeout(stop, 25000);
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
try {
  if (process.argv.length !== 2 || process.env["ASTER_CATALOG_UI_SEED_ENABLED"] !== "true") {
    throw new Error("Web demo initialization requires explicit local activation.");
  }
  localCatalogDatabase(process.env, "operator");
  localCatalogDatabase(process.env, "migration");
  // Only the Docker image supplies this frozen, measured technical-fixture report.
  const report = await readUiSeedReport(
    createReadStream(new URL("../../ui-seed-report.json", import.meta.url), {
      highWaterMark: 1024,
    }),
    controller.signal,
  );
  const migration = await migrateLocalCatalog(process.env, controller.signal);
  process.stdout.write(
    JSON.stringify({ event: "aster.catalog.migration_completed", ...migration }) + "\n",
  );
  const result = await seedLocalCatalog(process.env, report, controller.signal);
  process.stdout.write(JSON.stringify({ event: "catalog_ui_seed", ...result }) + "\n");
} catch {
  process.stderr.write(
    JSON.stringify({
      event: "catalog_web_demo_failed",
      code: controller.signal.aborted ? "CANCELLED" : "INITIALIZATION_REJECTED",
    }) + "\n",
  );
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  process.removeListener("SIGTERM", stop);
  process.removeListener("SIGINT", stop);
}
