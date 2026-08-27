import {
  createAsterReadinessController,
  createAsterReadinessMonitor,
  createAsterServiceLifecycle,
} from "../../src/index.js";

const lifecycle = createAsterServiceLifecycle({
  forceClose: () => undefined,
  stopTraffic: () => Promise.resolve(),
});
const readiness = createAsterReadinessController({
  criticalDependencyCount: 1,
  lifecycle,
});
readiness.setCriticalDependencyState(0, "ready");
lifecycle.markReady();
const monitor = createAsterReadinessMonitor({
  intervalMs: 300_000,
  probeTimeoutMs: 1_000,
  probes: [() => Promise.resolve("ready")],
  readiness,
});
monitor.start();
process.stdout.write("STARTED\n");
