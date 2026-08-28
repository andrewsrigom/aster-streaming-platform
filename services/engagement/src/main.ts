import { createEngagementService } from "./create-service.js";

let service: Awaited<ReturnType<typeof createEngagementService>> | undefined;
try {
  service = await createEngagementService(process.env);
  service.bindProcessSignals();
  const status = await service.start();
  process.stdout.write(JSON.stringify({ event: "aster.engagement.startup", status }) + "\n");
  if (status === "failed") {
    process.exitCode = 1;
  }
} catch {
  process.stderr.write(
    JSON.stringify({
      event: "aster.engagement.startup_failed",
      code: "ENGAGEMENT_STARTUP_FAILED",
    }) + "\n",
  );
  process.exitCode = 1;
  await service?.shutdown();
}
