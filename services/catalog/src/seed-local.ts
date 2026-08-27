import { readUiSeedReport, seedLocalCatalog } from "./infrastructure/fixtures/local-ui-seed.js";

const controller = new AbortController();
const stop = () => {
  controller.abort();
};
const deadline = setTimeout(stop, 15000);
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
try {
  if (process.argv.length !== 2 || process.env["ASTER_CATALOG_UI_SEED_ENABLED"] !== "true") {
    throw new Error("UI seed requires explicit local activation.");
  }
  const report = await readUiSeedReport(process.stdin, controller.signal);
  const result = await seedLocalCatalog(process.env, report, controller.signal);
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
  clearTimeout(deadline);
  process.removeListener("SIGTERM", stop);
  process.removeListener("SIGINT", stop);
}
