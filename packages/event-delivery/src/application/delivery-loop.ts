import type { RelayStep } from "./relay.js";

export interface DeliveryLoopPorts {
  readonly step: (signal: AbortSignal) => Promise<RelayStep>;
  readonly delay: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly random: () => number;
  readonly observe: (result: RelayStep) => void;
}

/** One worker, one cancellable timer, no queued ticks and no restart after stop. */
export function createDeliveryLoop(ports: DeliveryLoopPorts) {
  const controller = new AbortController();
  let running: Promise<void> | undefined;
  let failures = 0;
  const stopped = () => controller.signal.aborted;
  const run = async () => {
    while (!stopped()) {
      let result: RelayStep;
      try {
        result = await ports.step(controller.signal);
      } catch {
        result = stopped() ? "stopped" : "unavailable";
      }
      if (stopped() || result === "stopped") {
        return;
      }
      try {
        ports.observe(result);
      } catch {
        /* Observation cannot acknowledge a fact. */
      }
      const failed = !["delivered", "empty", "busy"].includes(result);
      failures = failed ? Math.min(4, failures + 1) : 0;
      const jitter = Math.min(1, Math.max(0, ports.random()));
      const wait = failed
        ? Math.min(
            5000,
            500 * 2 ** failures + Math.floor((Number.isFinite(jitter) ? jitter : 0) * 250),
          )
        : result === "delivered"
          ? 0
          : 1000;
      try {
        await ports.delay(wait, controller.signal);
      } catch {
        return;
      }
    }
  };
  return Object.freeze({
    start() {
      if (!stopped()) {
        running ??= run();
      }
    },
    async stop() {
      controller.abort();
      await running;
    },
  });
}
