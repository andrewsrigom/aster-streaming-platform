import { setTimeout as delay } from "node:timers/promises";
import type { AsterKafkaBrokerAdapter } from "@aster/broker-kafka";
import { EVENT_TOPICS } from "@aster/event-delivery";
import { createAsterDeadline, type AsterLogger } from "@aster/runtime";
import type { ProjectionStoreResult } from "../application/projection-ports.js";
import { normalizeBrokerOffsets, type BrokerOffsets } from "../domain/rebuild-state.js";

type RuntimeState = "idle" | "ready" | "unavailable" | "stopped";
type Broker = Pick<
  AsterKafkaBrokerAdapter,
  "connect" | "offsets" | "startConsumer" | "stopConsumer" | "snapshot" | "close"
>;

export function createCatalogEventRuntime(
  options: Readonly<{
    broker: Broker;
    handle: Parameters<Broker["startConsumer"]>[0]["handle"];
    logger: Pick<AsterLogger, "info">;
    wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
    random?: () => number;
  }>,
) {
  const controller = new AbortController();
  const wait =
    options.wait ??
    (async (milliseconds: number, signal: AbortSignal) => {
      await delay(milliseconds, undefined, { signal });
    });
  const random = options.random ?? Math.random;
  let running: Promise<void> | undefined;
  let stopWork: Promise<void> | undefined;
  let closeWork: Promise<void> | undefined;
  let state: RuntimeState = "idle";
  let failures = 0;
  const stopped = () => controller.signal.aborted;

  const observe = (next: RuntimeState) => {
    if (next === state) {
      return;
    }
    state = next;
    try {
      options.logger.info({
        event: "aster.discovery.catalog_consumer_state",
        outcome: next === "ready" || next === "stopped" ? "ok" : "degraded",
        properties: [["state", next]],
      });
    } catch {
      /* Observation cannot start or acknowledge a consumer. */
    }
  };

  const step = async (signal: AbortSignal): Promise<RuntimeState> => {
    const deadline = createAsterDeadline({ timeoutMs: 5000, parentSignal: signal });
    try {
      if (
        options.broker.snapshot().state !== "ready" &&
        (await options.broker.connect(deadline.signal)).status !== "completed"
      ) {
        return "unavailable";
      }
      if (options.broker.snapshot().consumerState !== "running") {
        const started = await options.broker.startConsumer(
          { topic: EVENT_TOPICS.catalog, fromBeginning: true, handle: options.handle },
          deadline.signal,
        );
        if (started.status !== "completed") {
          return "unavailable";
        }
      }
      return "ready";
    } catch {
      return "unavailable";
    } finally {
      deadline.dispose();
    }
  };

  const run = async () => {
    while (!stopped()) {
      const result = await step(controller.signal);
      if (stopped()) {
        break;
      }
      observe(result);
      failures = result === "ready" ? 0 : Math.min(4, failures + 1);
      const jitter = Math.min(1, Math.max(0, random()));
      const waitMs =
        result === "ready"
          ? 1000
          : Math.min(
              5000,
              500 * 2 ** failures + Math.floor((Number.isFinite(jitter) ? jitter : 0) * 250),
            );
      try {
        await wait(waitMs, controller.signal);
      } catch {
        break;
      }
    }
    observe("stopped");
  };

  const stop = (): Promise<void> => {
    if (stopWork) {
      return stopWork;
    }
    controller.abort();
    stopWork = (async () => {
      await running;
      const result = await options.broker.stopConsumer(AbortSignal.timeout(2000));
      if (result.status !== "completed") {
        throw new Error("Catalog event consumer stop did not complete.");
      }
      observe("stopped");
    })();
    return stopWork;
  };

  return Object.freeze({
    start() {
      if (!controller.signal.aborted) {
        running ??= run();
      }
    },
    stop,
    async check(signal: AbortSignal): Promise<RuntimeState> {
      if (signal.aborted || stopped()) {
        return "stopped";
      }
      const result = await step(signal);
      observe(result);
      return result;
    },
    async barrier(signal: AbortSignal): Promise<ProjectionStoreResult<BrokerOffsets>> {
      const cancelled = () => signal.aborted;
      if (cancelled()) {
        return { status: "cancelled" };
      }
      const deadline = createAsterDeadline({ timeoutMs: 2000, parentSignal: signal });
      try {
        if (options.broker.snapshot().state !== "ready") {
          return { status: "unavailable" };
        }
        const result = await options.broker.offsets(
          { topic: EVENT_TOPICS.catalog },
          deadline.signal,
        );
        if (result.status !== "completed") {
          return {
            status: result.status === "aborted" && cancelled() ? "cancelled" : "unavailable",
          };
        }
        const offsets = normalizeBrokerOffsets(result.value);
        return offsets ? { status: "completed", value: offsets } : { status: "indeterminate" };
      } catch {
        return { status: "indeterminate" };
      } finally {
        deadline.dispose();
      }
    },
    close(signal: AbortSignal): Promise<void> {
      closeWork ??= (async () => {
        await stop();
        const result = await options.broker.close(signal);
        if (result.status !== "completed" && result.status !== "already_completed") {
          throw new Error("Catalog event broker close did not complete.");
        }
      })();
      return closeWork;
    },
    snapshot: () => Object.freeze({ state }),
  });
}
