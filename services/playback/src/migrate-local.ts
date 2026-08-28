import { migrateLocalPlayback } from "./infrastructure/local-migrations.js";

try {
  const result = await migrateLocalPlayback(process.env, AbortSignal.timeout(10000));
  process.stdout.write(JSON.stringify({ event: "aster.playback.migrated", ...result }) + "\n");
} catch {
  process.stderr.write(
    JSON.stringify({
      event: "aster.playback.migration_failed",
      code: "PLAYBACK_MIGRATION_FAILED",
    }) + "\n",
  );
  process.exitCode = 1;
}
