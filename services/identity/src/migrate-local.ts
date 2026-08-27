import { REFERENCE_RUNTIME_CONFIG_OWNED_PREFIXES, loadReferenceRuntimeConfig } from "@aster/config";

import { migrateLocalIdentity } from "./infrastructure/persistence/local-migrations.js";

const controller = new AbortController();
const stop = (): void => {
  controller.abort();
};
const deadline = setTimeout(stop, 10_000);
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
try {
  const configuration = loadReferenceRuntimeConfig(
    Object.entries(process.env).filter(([name]) =>
      REFERENCE_RUNTIME_CONFIG_OWNED_PREFIXES.some((prefix) => name.startsWith(prefix)),
    ),
  );
  const result = await migrateLocalIdentity(configuration, controller.signal);
  process.stdout.write(
    JSON.stringify({ event: "aster.identity.migration_completed", applied: result.applied }) + "\n",
  );
} catch {
  process.stderr.write(
    JSON.stringify({
      event: "aster.identity.migration_failed",
      code: "IDENTITY_MIGRATION_FAILED",
    }) + "\n",
  );
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  process.removeListener("SIGTERM", stop);
  process.removeListener("SIGINT", stop);
}
