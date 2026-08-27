import {
  bindAsterProcessSignals,
  createAsterDeadline,
  createAsterReadinessController,
  createAsterReadinessMonitor,
  createAsterServiceLifecycle,
  type AsterForceShutdownReason,
  type AsterInFlightWork,
  type AsterLogger,
  type AsterProcessSignalBinding,
  type AsterReadinessMonitor,
  type AsterReadinessMonitorOptions,
  type AsterReadinessSnapshot,
  type AsterShutdownResult,
  type AsterShutdownTrigger,
} from "@aster/runtime";

export interface AsterIdentityDependencyPort {
  connect(signal: AbortSignal): Promise<"ready" | "unavailable">;
  probe(signal: AbortSignal): Promise<"ready" | "unavailable">;
  close(signal: AbortSignal): Promise<void>;
}

export interface AsterIdentityHttpPort {
  listen(signal: AbortSignal): Promise<void>;
  stopTraffic(signal: AbortSignal): Promise<void>;
}

export interface AsterIdentityTelemetryPort {
  flush(signal: AbortSignal): Promise<void>;
  close(signal: AbortSignal): Promise<void>;
}

export interface AsterIdentityRuntimeOptions {
  readonly startupDeadlineMs: number;
  readonly shutdownDeadlineMs?: number;
  readonly postgresql: AsterIdentityDependencyPort;
  readonly redis: AsterIdentityDependencyPort;
  readonly http: AsterIdentityHttpPort;
  readonly telemetry: AsterIdentityTelemetryPort;
  readonly forceClose: () => void;
  readonly logger?: Pick<AsterLogger, "info" | "warn">;
}

export type AsterIdentityStartupResult =
  | Readonly<{ status: "started"; readiness: "not_ready" | "ready" }>
  | Readonly<{ status: "failed" | "stopped" }>;

export interface AsterIdentityRuntime {
  start(): Promise<AsterIdentityStartupResult>;
  health(): AsterReadinessSnapshot;
  tryBeginWork(): AsterInFlightWork | undefined;
  shutdown(trigger?: AsterShutdownTrigger): Promise<AsterShutdownResult>;
  forceShutdown(reason?: AsterForceShutdownReason): Promise<AsterShutdownResult>;
  bindProcessSignals(): AsterProcessSignalBinding;
}

type WaitResult<T> =
  Readonly<{ status: "completed"; value: T }> | Readonly<{ status: "aborted" | "failed" }>;

type MonitorFactory = (options: AsterReadinessMonitorOptions) => AsterReadinessMonitor;

const READINESS_INTERVAL_MS = 10_000;
const READINESS_CYCLE_TIMEOUT_MS = 8_000;
const FAILED_STARTUP = Object.freeze({ status: "failed" } as const);
const STOPPED_STARTUP = Object.freeze({ status: "stopped" } as const);

function waitForSignal<T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
): Promise<WaitResult<T>> {
  if (signal.aborted) {
    return Promise.resolve({ status: "aborted" });
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: WaitResult<T>): void => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onAbort = (): void => {
      finish({ status: "aborted" });
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void Promise.resolve()
      .then(() => (signal.aborted ? undefined : operation()))
      .then(
        (value) => {
          if (signal.aborted) {
            finish({ status: "aborted" });
            return;
          }
          finish({ status: "completed", value: value as T });
        },
        () => {
          finish({ status: "failed" });
        },
      );
  });
}

async function checkDependency(
  dependency: AsterIdentityDependencyPort,
  signal: AbortSignal,
): Promise<"ready" | "unavailable"> {
  const connected = await waitForSignal(() => dependency.connect(signal), signal);
  if (connected.status !== "completed" || connected.value !== "ready") {
    return "unavailable";
  }
  const probed = await waitForSignal(() => dependency.probe(signal), signal);
  return probed.status === "completed" && probed.value === "ready" ? "ready" : "unavailable";
}

export function createAsterIdentityRuntimeWithMonitor(
  options: AsterIdentityRuntimeOptions,
  createMonitor: MonitorFactory,
): AsterIdentityRuntime {
  // Validate the budget before any listener or client work can start.
  const startupDeadlineMs = options.startupDeadlineMs;
  const validationDeadline = createAsterDeadline({ timeoutMs: startupDeadlineMs });
  validationDeadline.dispose();

  const startupController = new AbortController();
  const isStopping = (): boolean => startupController.signal.aborted;
  const dependencies = [options.postgresql, options.redis] as const;
  let startup: Promise<AsterIdentityStartupResult> | undefined;
  let signalBinding: AsterProcessSignalBinding | undefined;
  let signalCleanupAttached = false;

  const lifecycle = createAsterServiceLifecycle({
    ...(options.shutdownDeadlineMs === undefined
      ? {}
      : { shutdownDeadlineMs: options.shutdownDeadlineMs }),
    ...(options.logger === undefined ? {} : { logger: options.logger }),
    stopTraffic: async (signal): Promise<void> => {
      startupController.abort();
      await options.http.stopTraffic(signal);
    },
    stopConsumers: async (): Promise<void> => {
      await monitor.stop();
    },
    flushTelemetry: (signal) => options.telemetry.flush(signal),
    closeDependencies: async (signal): Promise<void> => {
      const closed = await Promise.allSettled(
        dependencies.map(async (dependency) => dependency.close(signal)),
      );
      let telemetryFailed = false;
      try {
        await options.telemetry.close(signal);
      } catch {
        telemetryFailed = true;
      }
      if (telemetryFailed || closed.some((result) => result.status === "rejected")) {
        throw new Error("Identity runtime dependency closure failed.");
      }
    },
    forceClose: (): void => {
      startupController.abort();
      try {
        void monitor.stop().catch(() => undefined);
      } catch {
        // Continue to the composition-wide last-resort resource owner.
      }
      options.forceClose();
    },
  });
  const readiness = createAsterReadinessController({ criticalDependencyCount: 2, lifecycle });
  const monitor = createMonitor({
    intervalMs: READINESS_INTERVAL_MS,
    probeTimeoutMs: READINESS_CYCLE_TIMEOUT_MS,
    probes: dependencies.map((dependency) => (signal) => checkDependency(dependency, signal)),
    readiness,
  });

  const observeShutdown = (result: Promise<AsterShutdownResult>): Promise<AsterShutdownResult> => {
    if (!signalCleanupAttached) {
      signalCleanupAttached = true;
      const disposeSignals = (): void => {
        signalBinding?.dispose();
      };
      void result.then(disposeSignals, disposeSignals);
    }
    return result;
  };

  const runStartup = async (): Promise<AsterIdentityStartupResult> => {
    const deadline = createAsterDeadline({
      timeoutMs: startupDeadlineMs,
      parentSignal: startupController.signal,
    });
    try {
      const listening = await waitForSignal(
        () => options.http.listen(deadline.signal),
        deadline.signal,
      );
      if (isStopping()) {
        return STOPPED_STARTUP;
      }
      if (listening.status !== "completed") {
        lifecycle.markStartupFailed();
        await observeShutdown(lifecycle.shutdown());
        return FAILED_STARTUP;
      }

      const outcomes = await Promise.all(
        dependencies.map((dependency) => checkDependency(dependency, deadline.signal)),
      );
      if (isStopping() || lifecycle.health().phase !== "starting") {
        return STOPPED_STARTUP;
      }
      outcomes.forEach((outcome, index) => {
        readiness.setCriticalDependencyState(index, outcome);
      });
      lifecycle.markReady();
      let monitorStarted = false;
      try {
        monitorStarted = monitor.start() !== "rejected";
      } catch {
        // A monitor failure cannot advertise an unmonitored dependency as ready.
      }
      if (!monitorStarted) {
        dependencies.forEach((_dependency, index) => {
          readiness.setCriticalDependencyState(index, "unavailable");
        });
      }
      return Object.freeze({ status: "started", readiness: readiness.health().readiness });
    } finally {
      deadline.dispose();
    }
  };

  return Object.freeze({
    start(): Promise<AsterIdentityStartupResult> {
      if (startup) {
        return startup;
      }
      if (lifecycle.health().phase !== "starting") {
        return Promise.resolve(STOPPED_STARTUP);
      }
      startup = runStartup();
      return startup;
    },
    health: () => readiness.health(),
    tryBeginWork: () => readiness.tryBeginWork(),
    shutdown: (trigger?: AsterShutdownTrigger) => observeShutdown(lifecycle.shutdown(trigger)),
    forceShutdown: (reason?: AsterForceShutdownReason) =>
      observeShutdown(lifecycle.forceShutdown(reason)),
    bindProcessSignals(): AsterProcessSignalBinding {
      if (signalBinding) {
        return signalBinding;
      }
      if (lifecycle.health().phase !== "starting" && lifecycle.health().phase !== "ready") {
        throw new Error("Identity runtime is not accepting a process signal owner.");
      }
      signalBinding = bindAsterProcessSignals(lifecycle);
      return signalBinding;
    },
  });
}

export function createAsterIdentityRuntime(
  options: AsterIdentityRuntimeOptions,
): AsterIdentityRuntime {
  return createAsterIdentityRuntimeWithMonitor(options, createAsterReadinessMonitor);
}
