import { migrateLocalDiscovery } from "./infrastructure/local-migrations.js";

try {
  const result = await migrateLocalDiscovery(process.env, AbortSignal.timeout(10_000));
  process.stdout.write(JSON.stringify({ event: "aster.discovery.migrated", ...result }) + "\n");
} catch {
  process.stderr.write(
    JSON.stringify({
      event: "aster.discovery.migration_failed",
      code: "DISCOVERY_MIGRATION_FAILED",
    }) + "\n",
  );
  process.exitCode = 1;
}
