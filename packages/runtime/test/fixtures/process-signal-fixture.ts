import { bindAsterProcessSignals, createAsterServiceLifecycle } from "../../src/index.js";

const keepAlive = setInterval(() => undefined, 1_000);
const forceCloseThrows = process.argv.includes("--force-close-throws");
const lifecycle = createAsterServiceLifecycle({
  closeDependencies: () => {
    process.stdout.write("CLOSE_DEPENDENCIES\n");
    clearInterval(keepAlive);
    return Promise.resolve();
  },
  forceClose: () => {
    process.stdout.write("FORCE_CLOSE\n");
    if (forceCloseThrows) {
      throw new Error("force-close-private-canary");
    }
    clearInterval(keepAlive);
  },
  shutdownDeadlineMs: 1_000,
  stopTraffic: () => {
    process.stdout.write("STOP_TRAFFIC\n");
    return forceCloseThrows ? Promise.reject(new Error("stop-private-canary")) : Promise.resolve();
  },
});

lifecycle.markReady();
bindAsterProcessSignals(lifecycle);
process.stdout.write("READY\n");
