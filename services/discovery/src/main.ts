import { createDiscoveryService } from "./create-service.js";

let service: Awaited<ReturnType<typeof createDiscoveryService>> | undefined;
try {
  service = await createDiscoveryService(process.env);
  service.bindProcessSignals();
  const status = await service.start();
  process.stdout.write(JSON.stringify({ event: "aster.discovery.startup", status }) + "\n");
  if (status === "failed") {
    process.exitCode = 1;
  }
} catch {
  process.stderr.write(
    JSON.stringify({
      event: "aster.discovery.startup_failed",
      code: "DISCOVERY_STARTUP_FAILED",
    }) + "\n",
  );
  process.exitCode = 1;
  await service?.shutdown();
}
