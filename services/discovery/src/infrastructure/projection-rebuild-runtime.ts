import { setTimeout as delay } from "node:timers/promises";
import type { AsterLogger } from "@aster/runtime";
import type { ProjectionStoreResult } from "../application/projection-ports.js";
import type {
  ProjectionRebuildRunOutcome,
  createProjectionRebuildRunner,
} from "../application/run-projection-rebuild.js";

type RuntimeState = "idle" | "rebuilding" | "ready" | "unavailable" | "stopped";

export function createProjectionRebuildRuntime(
  options: Readonly<{
    needsRebuild(signal: AbortSignal): Promise<ProjectionStoreResult<boolean>>;
    rebuild: ReturnType<typeof createProjectionRebuildRunner>["execute"];
    logger: Pick<AsterLogger, "info">;
    wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  }>,
) {
  const controller = new AbortController();
  const wait =
    options.wait ??
    (async (milliseconds: number, signal: AbortSignal) => {
      await delay(milliseconds, undefined, { signal });
    });
  let running: Promise<void> | undefined;
  let state: RuntimeState = "idle";
  let failures = 0;
  const stopped = () => controller.signal.aborted;
  const observe = (next: RuntimeState) => {
    if (state === next) {
      return;
    }
    state = next;
    try {
      options.logger.info({
        event: "aster.discovery.rebuild_state",
        outcome: next === "ready" || next === "stopped" ? "ok" : "degraded",
        properties: [["state", next]],
      });
    } catch {
      // Observation cannot advance or promote a generation.
    }
  };
  const completed = (
    result: ProjectionStoreResult<ProjectionRebuildRunOutcome>,
  ): ProjectionRebuildRunOutcome["status"] | undefined =>
    result.status === "completed" ? result.value.status : undefined;
  const run = async () => {
    while (!stopped()) {
      let waitMs = 5_000;
      try {
        const needed = await options.needsRebuild(controller.signal);
        if (needed.status === "completed" && !needed.value) {
          failures = 0;
          observe("ready");
        } else if (needed.status === "completed") {
          observe("rebuilding");
          const result = await options.rebuild(controller.signal);
          const outcome = completed(result);
          if (outcome === "promoted") {
            failures = 0;
            observe("ready");
          } else if (outcome === "catchup_pending" || outcome === "busy") {
            waitMs = 250;
          } else {
            failures = Math.min(4, failures + 1);
            waitMs = Math.min(5_000, 500 * 2 ** failures);
            observe("unavailable");
          }
        } else {
          failures = Math.min(4, failures + 1);
          waitMs = Math.min(5_000, 500 * 2 ** failures);
          observe("unavailable");
        }
      } catch {
        failures = Math.min(4, failures + 1);
        waitMs = Math.min(5_000, 500 * 2 ** failures);
        observe("unavailable");
      }
      try {
        await wait(waitMs, controller.signal);
      } catch {
        break;
      }
    }
    observe("stopped");
  };
  return Object.freeze({
    start() {
      if (!stopped()) {
        running ??= run();
      }
    },
    async stop(): Promise<void> {
      controller.abort();
      await running;
      observe("stopped");
    },
    snapshot: () => Object.freeze({ state }),
  });
}
