import { bindAsterProcessSignals, createAsterServiceLifecycle } from "../../src/index.js";

const keepAlive = setInterval(() => undefined, 1_000);
const lifecycle = createAsterServiceLifecycle({
  closeDependencies: () => {
    process.stdout.write("CLOSE_DEPENDENCIES\n");
    clearInterval(keepAlive);
    return Promise.resolve();
  },
  forceClose: () => {
    process.stdout.write("FORCE_CLOSE\n");
    clearInterval(keepAlive);
  },
  shutdownDeadlineMs: 1_000,
  stopTraffic: () => {
    process.stdout.write("STOP_TRAFFIC\n");
    return Promise.resolve();
  },
});

lifecycle.markReady();
bindAsterProcessSignals(lifecycle);
process.stdout.write("READY\n");
