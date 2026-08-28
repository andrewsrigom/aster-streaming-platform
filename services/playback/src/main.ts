import { createPlaybackService } from "./create-service.js";

let service: Awaited<ReturnType<typeof createPlaybackService>> | undefined;
try {
  service = await createPlaybackService(process.env);
  service.bindProcessSignals();
  const status = await service.start();
  process.stdout.write(JSON.stringify({ event: "aster.playback.startup", status }) + "\n");
  if (status === "failed") {
    process.exitCode = 1;
  }
} catch {
  process.stderr.write(
    JSON.stringify({ event: "aster.playback.startup_failed", code: "PLAYBACK_STARTUP_FAILED" }) +
      "\n",
  );
  process.exitCode = 1;
  await service?.shutdown();
}
