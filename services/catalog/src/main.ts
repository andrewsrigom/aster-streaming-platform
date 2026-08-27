import { createCatalogService } from "./create-service.js";

let service: Awaited<ReturnType<typeof createCatalogService>> | undefined;
try {
  service = await createCatalogService(process.env);
  service.bindProcessSignals();
  const status = await service.start();
  process.stdout.write(JSON.stringify({ event: "aster.catalog.startup", status }) + "\n");
  if (status === "failed") {
    process.exitCode = 1;
  }
} catch {
  process.stderr.write(
    JSON.stringify({ event: "aster.catalog.startup_failed", code: "CATALOG_STARTUP_FAILED" }) +
      "\n",
  );
  process.exitCode = 1;
  await service?.shutdown();
}
