import { migrateLocalEngagement } from "./infrastructure/local-migrations.js";

try {
  const result = await migrateLocalEngagement(process.env, AbortSignal.timeout(10000));
  process.stdout.write(JSON.stringify({ event: "aster.engagement.migrated", ...result }) + "\n");
} catch {
  process.stderr.write(
    JSON.stringify({
      event: "aster.engagement.migration_failed",
      code: "ENGAGEMENT_MIGRATION_FAILED",
    }) + "\n",
  );
  process.exitCode = 1;
}
