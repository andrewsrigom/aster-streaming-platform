import { migrateLocalCatalog } from "./infrastructure/persistence/local-migrations.js";

const controller = new AbortController();
const stop = (): void => {
  controller.abort();
};
const deadline = setTimeout(stop, 10000);
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
try {
  if (process.argv.length !== 2) {
    throw new Error("Unexpected migration arguments.");
  }
  const result = await migrateLocalCatalog(process.env, controller.signal);
  process.stdout.write(
    JSON.stringify({ event: "aster.catalog.migration_completed", ...result }) + "\n",
  );
} catch {
  process.stderr.write(
    JSON.stringify({ event: "aster.catalog.migration_failed", code: "CATALOG_MIGRATION_FAILED" }) +
      "\n",
  );
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  process.removeListener("SIGTERM", stop);
  process.removeListener("SIGINT", stop);
}
