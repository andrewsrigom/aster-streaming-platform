import { createHash } from "node:crypto";
import {
  boundedFixtureFile,
  verifyGeneratedDirectory,
} from "./infrastructure/fixtures/playable-files.js";
import { seedLocalCatalog } from "./infrastructure/fixtures/local-ui-seed.js";
import { localCatalogDatabase } from "./infrastructure/identity/local-configuration.js";
import { PublicationAccessRecoveryError } from "./infrastructure/media/publication-access.js";

const controller = new AbortController();
const stop = () => {
  controller.abort();
};
const deadline = setTimeout(stop, 45000);
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
try {
  if (process.argv.length !== 2 || process.env["ASTER_CATALOG_PLAYABLE_SEED_ENABLED"] !== "true") {
    throw new Error("Playable demo requires explicit local activation.");
  }
  localCatalogDatabase(process.env, "operator");
  localCatalogDatabase(process.env, "migration");
  const signal = controller.signal;
  const report: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(
      await boundedFixtureFile("/fixture/fixture/report.json", 16384, signal),
    ),
  );
  const recipe = await Promise.all(
    ["generate-hls.mjs", "hls-contract.mjs", "fixture-export.mjs"].map((name) =>
      boundedFixtureFile("/app/fixture-recipe/" + name, 32768, signal),
    ),
  );
  const expected = createHash("sha256").update(Buffer.concat(recipe)).digest("hex");
  if (
    !report ||
    typeof report !== "object" ||
    !("generatorChecksum" in report) ||
    report.generatorChecksum !== expected
  ) {
    throw new Error("Generated fixture recipe does not match this image.");
  }
  await verifyGeneratedDirectory("/fixture/fixture", report, signal);
  const result = await seedLocalCatalog(process.env, report, signal);
  process.stdout.write(JSON.stringify({ event: "catalog_playable_seed", ...result }) + "\n");
} catch (error) {
  process.stderr.write(
    JSON.stringify({
      event: "catalog_playable_seed_failed",
      code:
        error instanceof PublicationAccessRecoveryError
          ? "ACCESS_RECOVERY_REQUIRED"
          : controller.signal.aborted
            ? "CANCELLED"
            : "INITIALIZATION_REJECTED",
    }) + "\n",
  );
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  process.removeListener("SIGTERM", stop);
  process.removeListener("SIGINT", stop);
}
