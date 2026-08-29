import { performance } from "node:perf_hooks";
import type { AsterOperationLimitMetricInput } from "@aster/telemetry";

const MAXIMUM_ACTIVE = 2;
const MAXIMUM_WAITERS = 1;
const WAIT_TIMEOUT_MS = 100;

export type SearchConcurrencyAdmission =
  | Readonly<{ status: "acquired"; release: () => void }>
  | Readonly<{ status: "rejected" }>
  | Readonly<{ status: "cancelled" }>
  | Readonly<{ status: "closed" }>;

interface Waiter {
  readonly signal: AbortSignal;
  readonly startedAt: number;
  readonly resolve: (result: SearchConcurrencyAdmission) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly cancel: () => void;
  settled: boolean;
}

export interface SearchConcurrencyLimiterOptions {
  readonly monotonicNow?: () => number;
  readonly recordMetric?: (input: AsterOperationLimitMetricInput) => unknown;
}

export function createSearchConcurrencyLimiter(options: SearchConcurrencyLimiterOptions = {}) {
  const now = options.monotonicNow ?? (() => performance.now());
  const waiters: Waiter[] = [];
  let active = 0;
  let closed = false;

  const record = (
    outcome: AsterOperationLimitMetricInput["outcome"],
    startedAt: number,
    queueBucket: "none" | "one",
  ): void => {
    try {
      const completedAt = now();
      options.recordMetric?.({
        limiter: "concurrency",
        operation: "search_titles",
        outcome,
        durationMs:
          Number.isFinite(completedAt) && completedAt >= startedAt ? completedAt - startedAt : 0,
        queueBucket,
      });
    } catch {
      // Telemetry is never part of admission or release.
    }
  };

  const remove = (waiter: Waiter): void => {
    const index = waiters.indexOf(waiter);
    if (index >= 0) {
      waiters.splice(index, 1);
    }
  };

  const settle = (
    waiter: Waiter,
    result: Exclude<SearchConcurrencyAdmission, { status: "acquired" }>,
  ): void => {
    if (waiter.settled) {
      return;
    }
    waiter.settled = true;
    remove(waiter);
    clearTimeout(waiter.timer);
    waiter.signal.removeEventListener("abort", waiter.cancel);
    record(result.status === "closed" ? "closed" : result.status, waiter.startedAt, "one");
    waiter.resolve(result);
  };

  const permit = (startedAt: number, queueBucket: "none" | "one") => {
    active++;
    let released = false;
    record("allowed", startedAt, queueBucket);
    return Object.freeze({
      status: "acquired" as const,
      release(): void {
        if (released) {
          return;
        }
        released = true;
        active = Math.max(0, active - 1);
        while (!closed && active < MAXIMUM_ACTIVE) {
          const waiter = waiters.shift();
          if (!waiter) {
            break;
          }
          if (waiter.settled) {
            continue;
          }
          if (waiter.signal.aborted) {
            settle(waiter, { status: "cancelled" });
            continue;
          }
          waiter.settled = true;
          clearTimeout(waiter.timer);
          waiter.signal.removeEventListener("abort", waiter.cancel);
          waiter.resolve(permit(waiter.startedAt, "one"));
        }
      },
    });
  };

  return Object.freeze({
    acquire(signal: AbortSignal): Promise<SearchConcurrencyAdmission> {
      const startedAt = now();
      if (closed) {
        record("closed", startedAt, "none");
        return Promise.resolve({ status: "closed" });
      }
      if (signal.aborted) {
        record("cancelled", startedAt, "none");
        return Promise.resolve({ status: "cancelled" });
      }
      if (active < MAXIMUM_ACTIVE) {
        return Promise.resolve(permit(startedAt, "none"));
      }
      if (waiters.length >= MAXIMUM_WAITERS) {
        record("rejected", startedAt, "one");
        return Promise.resolve({ status: "rejected" });
      }
      return new Promise((resolve) => {
        const waiter = {} as Waiter;
        const cancel = () => {
          settle(waiter, { status: "cancelled" });
        };
        Object.assign(waiter, {
          signal,
          startedAt,
          resolve,
          settled: false,
          cancel,
          timer: setTimeout(() => {
            settle(waiter, { status: "rejected" });
          }, WAIT_TIMEOUT_MS),
        });
        waiter.timer.unref();
        waiters.push(waiter);
        signal.addEventListener("abort", cancel, { once: true });
        record("queued", startedAt, "one");
        if (signal.aborted) {
          cancel();
        }
      });
    },
    snapshot: () =>
      Object.freeze({
        active,
        waiting: waiters.length,
        closed,
        maximumActive: MAXIMUM_ACTIVE,
        maximumWaiters: MAXIMUM_WAITERS,
        waitTimeoutMs: WAIT_TIMEOUT_MS,
      }),
    close(): void {
      if (closed) {
        return;
      }
      closed = true;
      for (const waiter of [...waiters]) {
        settle(waiter, { status: "closed" });
      }
    },
  });
}
