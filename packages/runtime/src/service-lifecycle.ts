import type { AsterLogEntry, AsterLogger, AsterLogWriteResult } from "./runtime-logger.js";

const ABSENT = Symbol("absent");
const ASTER_SHUTDOWN_DEADLINE_DEFAULT_MS = 10_000;
const ASTER_SHUTDOWN_DEADLINE_MIN_MS = 100;

export const ASTER_SHUTDOWN_DEADLINE_MAX_MS = 30_000;
export const ASTER_LIFECYCLE_PHASES = Object.freeze([
  "starting",
  "ready",
  "draining",
  "failed",
  "stopped",
] as const);
export const ASTER_SHUTDOWN_STAGES = Object.freeze([
  "stop_traffic",
  "drain_in_flight",
  "stop_consumers",
  "flush_telemetry",
  "close_dependencies",
] as const);

export type AsterLifecyclePhase = (typeof ASTER_LIFECYCLE_PHASES)[number];
export type AsterShutdownStage = (typeof ASTER_SHUTDOWN_STAGES)[number];
export type AsterShutdownTrigger = "manual" | "sigint" | "sigterm";
export type AsterForceShutdownReason = "deadline" | "manual" | "repeated_signal" | "stage_failure";
export type AsterLifecycleTransitionResult = "applied" | "rejected" | "unchanged";
export type AsterInFlightCompletionResult = "already_completed" | "completed";
export type AsterShutdownOutcome = "completed" | "degraded" | "forced";
export type AsterShutdownFailureStage = AsterShutdownStage | "force_close";

export interface AsterServiceHealthSnapshot {
  readonly phase: AsterLifecyclePhase;
  readonly liveness: "live" | "not_live";
  readonly readiness: "not_ready" | "ready";
  readonly reason: "draining" | "ready" | "starting" | "startup_failed" | "stopped";
}

export interface AsterInFlightWork {
  complete(): AsterInFlightCompletionResult;
}

export type AsterShutdownHook = (signal: AbortSignal) => Promise<void>;
export type AsterForceClose = () => void;

export interface AsterServiceLifecycleOptions {
  readonly shutdownDeadlineMs?: number;
  readonly stopTraffic: AsterShutdownHook;
  readonly stopConsumers?: AsterShutdownHook;
  readonly flushTelemetry?: AsterShutdownHook;
  readonly closeDependencies?: AsterShutdownHook;
  readonly forceClose: AsterForceClose;
  readonly logger?: Pick<AsterLogger, "info" | "warn">;
}

export interface AsterShutdownResult {
  readonly failedStages: readonly AsterShutdownFailureStage[];
  readonly forceReason?: AsterForceShutdownReason;
  readonly outcome: AsterShutdownOutcome;
  readonly trigger: AsterShutdownTrigger;
}

export interface AsterServiceLifecycle {
  health(): AsterServiceHealthSnapshot;
  markReady(): AsterLifecycleTransitionResult;
  markStartupFailed(): AsterLifecycleTransitionResult;
  tryBeginWork(): AsterInFlightWork | undefined;
  shutdown(trigger?: AsterShutdownTrigger): Promise<AsterShutdownResult>;
  forceShutdown(reason?: AsterForceShutdownReason): Promise<AsterShutdownResult>;
}

export interface AsterLifecycleIssue {
  readonly option:
    | "<options>"
    | "closeDependencies"
    | "flushTelemetry"
    | "forceClose"
    | "logger"
    | "shutdownDeadlineMs"
    | "stopConsumers"
    | "stopTraffic";
  readonly reason: "internal" | "invalid" | "missing";
}

export class AsterLifecycleError extends Error {
  readonly code = "ASTER_LIFECYCLE_INVALID_OPTIONS";
  readonly issues: readonly AsterLifecycleIssue[];

  constructor(issues: readonly AsterLifecycleIssue[]) {
    super(
      `Runtime lifecycle configuration is invalid (${issues.length} issue${issues.length === 1 ? "" : "s"}).`,
    );
    this.name = "AsterLifecycleError";
    this.issues = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
  }
}

interface NormalizedLifecycleOptions {
  readonly shutdownDeadlineMs: number;
  readonly stopTraffic: AsterShutdownHook;
  readonly stopConsumers: AsterShutdownHook | undefined;
  readonly flushTelemetry: AsterShutdownHook | undefined;
  readonly closeDependencies: AsterShutdownHook | undefined;
  readonly forceClose: AsterForceClose;
  readonly logger: Pick<AsterLogger, "info" | "warn"> | undefined;
}

interface AsterLifecycleScheduler {
  schedule(callback: () => void, delayMs: number): () => void;
}

const defaultScheduler: AsterLifecycleScheduler = {
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs);
    return () => {
      clearTimeout(timer);
    };
  },
};

const OPTION_KEYS = new Set<PropertyKey>([
  "shutdownDeadlineMs",
  "stopTraffic",
  "stopConsumers",
  "flushTelemetry",
  "closeDependencies",
  "forceClose",
  "logger",
]);

function isObject(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function ownDataValue(object: object, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor) {
    return ABSENT;
  }
  if (!("value" in descriptor)) {
    throw new AsterLifecycleError([{ option: "<options>", reason: "invalid" }]);
  }
  return descriptor.value;
}

function normalizeOptionalHook(
  options: object,
  option: "closeDependencies" | "flushTelemetry" | "stopConsumers",
): AsterShutdownHook | undefined {
  const candidate = ownDataValue(options, option);
  if (candidate === ABSENT) {
    return undefined;
  }
  if (typeof candidate !== "function") {
    throw new AsterLifecycleError([{ option, reason: "invalid" }]);
  }
  return candidate as AsterShutdownHook;
}

function normalizeRequiredHook(options: object, option: "stopTraffic"): AsterShutdownHook {
  const candidate = ownDataValue(options, option);
  if (candidate === ABSENT) {
    throw new AsterLifecycleError([{ option, reason: "missing" }]);
  }
  if (typeof candidate !== "function") {
    throw new AsterLifecycleError([{ option, reason: "invalid" }]);
  }
  return candidate as AsterShutdownHook;
}

function normalizeLogger(options: object): Pick<AsterLogger, "info" | "warn"> | undefined {
  const candidate = ownDataValue(options, "logger");
  if (candidate === ABSENT) {
    return undefined;
  }
  if (!isObject(candidate) || Array.isArray(candidate)) {
    throw new AsterLifecycleError([{ option: "logger", reason: "invalid" }]);
  }
  const info = ownDataValue(candidate, "info");
  const warn = ownDataValue(candidate, "warn");
  if (typeof info !== "function" || typeof warn !== "function") {
    throw new AsterLifecycleError([{ option: "logger", reason: "invalid" }]);
  }
  const normalizeResult = (result: unknown): AsterLogWriteResult => {
    return result === "written" || result === "filtered" || result === "failed" ? result : "failed";
  };
  return Object.freeze({
    info: (entry: AsterLogEntry): AsterLogWriteResult => {
      const result: unknown = Reflect.apply(info, candidate, [entry]);
      return normalizeResult(result);
    },
    warn: (entry: AsterLogEntry): AsterLogWriteResult => {
      const result: unknown = Reflect.apply(warn, candidate, [entry]);
      return normalizeResult(result);
    },
  });
}

function normalizeOptions(input: AsterServiceLifecycleOptions): NormalizedLifecycleOptions {
  if (!isObject(input) || Array.isArray(input)) {
    throw new AsterLifecycleError([{ option: "<options>", reason: "invalid" }]);
  }
  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(input);
  } catch {
    throw new AsterLifecycleError([{ option: "<options>", reason: "internal" }]);
  }
  if (keys.length > OPTION_KEYS.size || keys.some((key) => !OPTION_KEYS.has(key))) {
    throw new AsterLifecycleError([{ option: "<options>", reason: "invalid" }]);
  }

  const deadlineCandidate = ownDataValue(input, "shutdownDeadlineMs");
  const shutdownDeadlineMs =
    deadlineCandidate === ABSENT ? ASTER_SHUTDOWN_DEADLINE_DEFAULT_MS : deadlineCandidate;
  if (
    typeof shutdownDeadlineMs !== "number" ||
    !Number.isSafeInteger(shutdownDeadlineMs) ||
    shutdownDeadlineMs < ASTER_SHUTDOWN_DEADLINE_MIN_MS ||
    shutdownDeadlineMs > ASTER_SHUTDOWN_DEADLINE_MAX_MS
  ) {
    throw new AsterLifecycleError([{ option: "shutdownDeadlineMs", reason: "invalid" }]);
  }

  const forceCloseCandidate = ownDataValue(input, "forceClose");
  if (forceCloseCandidate === ABSENT) {
    throw new AsterLifecycleError([{ option: "forceClose", reason: "missing" }]);
  }
  if (typeof forceCloseCandidate !== "function") {
    throw new AsterLifecycleError([{ option: "forceClose", reason: "invalid" }]);
  }

  return {
    closeDependencies: normalizeOptionalHook(input, "closeDependencies"),
    flushTelemetry: normalizeOptionalHook(input, "flushTelemetry"),
    forceClose: forceCloseCandidate as AsterForceClose,
    logger: normalizeLogger(input),
    shutdownDeadlineMs,
    stopConsumers: normalizeOptionalHook(input, "stopConsumers"),
    stopTraffic: normalizeRequiredHook(input, "stopTraffic"),
  };
}

function healthSnapshot(phase: AsterLifecyclePhase): AsterServiceHealthSnapshot {
  switch (phase) {
    case "starting":
      return Object.freeze({
        liveness: "live",
        phase,
        readiness: "not_ready",
        reason: "starting",
      });
    case "ready":
      return Object.freeze({
        liveness: "live",
        phase,
        readiness: "ready",
        reason: "ready",
      });
    case "draining":
      return Object.freeze({
        liveness: "live",
        phase,
        readiness: "not_ready",
        reason: "draining",
      });
    case "failed":
      return Object.freeze({
        liveness: "not_live",
        phase,
        readiness: "not_ready",
        reason: "startup_failed",
      });
    case "stopped":
      return Object.freeze({
        liveness: "not_live",
        phase,
        readiness: "not_ready",
        reason: "stopped",
      });
  }
}

function frozenShutdownResult(
  trigger: AsterShutdownTrigger,
  failedStages: readonly AsterShutdownFailureStage[],
  forceReason: AsterForceShutdownReason | undefined,
): AsterShutdownResult {
  const outcome: AsterShutdownOutcome = forceReason
    ? "forced"
    : failedStages.length > 0
      ? "degraded"
      : "completed";
  return Object.freeze({
    failedStages: Object.freeze([...failedStages]),
    ...(forceReason ? { forceReason } : {}),
    outcome,
    trigger,
  });
}

function validShutdownTrigger(value: unknown): value is AsterShutdownTrigger {
  return value === "manual" || value === "sigint" || value === "sigterm";
}

function validForceReason(value: unknown): value is AsterForceShutdownReason {
  return (
    value === "deadline" ||
    value === "manual" ||
    value === "repeated_signal" ||
    value === "stage_failure"
  );
}

function stageFailureRequiresForceClose(stage: AsterShutdownFailureStage): boolean {
  return stage === "stop_traffic" || stage === "stop_consumers" || stage === "close_dependencies";
}

function createLifecycle(
  options: AsterServiceLifecycleOptions,
  scheduler: AsterLifecycleScheduler,
): AsterServiceLifecycle {
  let normalized: NormalizedLifecycleOptions;
  try {
    normalized = normalizeOptions(options);
  } catch (error) {
    if (error instanceof AsterLifecycleError) {
      throw error;
    }
    throw new AsterLifecycleError([{ option: "<options>", reason: "internal" }]);
  }

  let phase: AsterLifecyclePhase = "starting";
  let inFlight = 0;
  let resolveDrained: (() => void) | undefined;
  let shutdownPromise: Promise<AsterShutdownResult> | undefined;
  let requestForce: ((reason: AsterForceShutdownReason) => void) | undefined;

  const report = (level: "info" | "warn", entry: AsterLogEntry): void => {
    try {
      normalized.logger?.[level](entry);
    } catch {
      // Lifecycle progress and its deadline never depend on a log destination.
    }
  };

  const completeWork = (): void => {
    if (inFlight > 0) {
      inFlight -= 1;
    }
    if (inFlight === 0) {
      resolveDrained?.();
      resolveDrained = undefined;
    }
  };

  const tryBeginWork = (): AsterInFlightWork | undefined => {
    if (phase !== "ready" || inFlight >= Number.MAX_SAFE_INTEGER) {
      return undefined;
    }
    inFlight += 1;
    let completed = false;
    return Object.freeze({
      complete(): AsterInFlightCompletionResult {
        if (completed) {
          return "already_completed";
        }
        completed = true;
        completeWork();
        return "completed";
      },
    });
  };

  const waitForDrain = (): Promise<void> => {
    if (inFlight === 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      resolveDrained = resolve;
    });
  };

  const runShutdown = async (trigger: AsterShutdownTrigger): Promise<AsterShutdownResult> => {
    if (phase !== "failed") {
      phase = "draining";
    }
    report("info", {
      event: "aster.lifecycle.shutdown_started",
      operation: "runtime.lifecycle",
      outcome: "ok",
      properties: [["trigger", trigger]],
    });

    const controller = new AbortController();
    const failedStages: AsterShutdownFailureStage[] = [];
    let forceReason: AsterForceShutdownReason | undefined;
    let resolveForced: (() => void) | undefined;
    const forced = new Promise<void>((resolve) => {
      resolveForced = resolve;
    });

    requestForce = (reason): void => {
      if (forceReason) {
        return;
      }
      forceReason = reason;
      controller.abort();
      try {
        normalized.forceClose();
      } catch {
        failedStages.push("force_close");
        report("warn", {
          event: "aster.lifecycle.stage_failed",
          operation: "runtime.lifecycle",
          outcome: "degraded",
          properties: [["stage", "force_close"]],
        });
      }
      report("warn", {
        event: "aster.lifecycle.shutdown_forced",
        operation: "runtime.lifecycle",
        outcome: "degraded",
        properties: [["reason", reason]],
      });
      resolveForced?.();
    };

    let cancelDeadline: () => void;
    try {
      cancelDeadline = scheduler.schedule(() => {
        requestForce?.("deadline");
      }, normalized.shutdownDeadlineMs);
    } catch {
      requestForce("deadline");
      cancelDeadline = () => undefined;
    }

    const raceHook = async (
      stage: AsterShutdownStage,
      hook: AsterShutdownHook | (() => Promise<void>),
    ): Promise<boolean> => {
      const completion = Promise.resolve()
        .then(() => hook(controller.signal))
        .then(
          () => false,
          () => {
            failedStages.push(stage);
            report("warn", {
              event: "aster.lifecycle.stage_failed",
              operation: "runtime.lifecycle",
              outcome: "degraded",
              properties: [["stage", stage]],
            });
            return false;
          },
        );
      return await Promise.race([completion, forced.then(() => true)]);
    };

    const stages: ReadonlyArray<
      readonly [stage: AsterShutdownStage, hook: AsterShutdownHook | (() => Promise<void>)]
    > = [
      ["stop_traffic", normalized.stopTraffic],
      ["drain_in_flight", waitForDrain],
      ...(normalized.stopConsumers
        ? ([["stop_consumers", normalized.stopConsumers]] as const)
        : []),
      ...(normalized.flushTelemetry
        ? ([["flush_telemetry", normalized.flushTelemetry]] as const)
        : []),
      ...(normalized.closeDependencies
        ? ([["close_dependencies", normalized.closeDependencies]] as const)
        : []),
    ];

    for (const [stage, hook] of stages) {
      if (await raceHook(stage, hook)) {
        break;
      }
      if (forceReason) {
        break;
      }
    }

    if (!forceReason && failedStages.some(stageFailureRequiresForceClose)) {
      requestForce("stage_failure");
    }

    cancelDeadline();
    phase = "stopped";
    requestForce = undefined;
    const result = frozenShutdownResult(trigger, failedStages, forceReason);
    report(result.outcome === "completed" ? "info" : "warn", {
      event: "aster.lifecycle.shutdown_completed",
      operation: "runtime.lifecycle",
      outcome: result.outcome === "completed" ? "ok" : "degraded",
      properties: [
        ["outcome", result.outcome],
        ["trigger", result.trigger],
      ],
    });
    return result;
  };

  const shutdown = (trigger: AsterShutdownTrigger = "manual"): Promise<AsterShutdownResult> => {
    const normalizedTrigger = validShutdownTrigger(trigger) ? trigger : "manual";
    shutdownPromise ??= runShutdown(normalizedTrigger);
    return shutdownPromise;
  };

  const forceShutdown = (
    reason: AsterForceShutdownReason = "manual",
  ): Promise<AsterShutdownResult> => {
    const normalizedReason = validForceReason(reason) ? reason : "manual";
    const result = shutdown("manual");
    requestForce?.(normalizedReason);
    return result;
  };

  return Object.freeze({
    forceShutdown,
    health: () => healthSnapshot(phase),
    markReady(): AsterLifecycleTransitionResult {
      if (phase === "ready") {
        return "unchanged";
      }
      if (phase !== "starting") {
        return "rejected";
      }
      phase = "ready";
      report("info", {
        event: "aster.lifecycle.ready",
        operation: "runtime.lifecycle",
        outcome: "ok",
        properties: [["phase", phase]],
      });
      return "applied";
    },
    markStartupFailed(): AsterLifecycleTransitionResult {
      if (phase === "failed") {
        return "unchanged";
      }
      if (phase !== "starting") {
        return "rejected";
      }
      phase = "failed";
      report("warn", {
        event: "aster.lifecycle.startup_failed",
        operation: "runtime.lifecycle",
        outcome: "error",
        properties: [["phase", phase]],
      });
      return "applied";
    },
    shutdown,
    tryBeginWork,
  });
}

export function createAsterServiceLifecycle(
  options: AsterServiceLifecycleOptions,
): AsterServiceLifecycle {
  return createLifecycle(options, defaultScheduler);
}

export function createAsterServiceLifecycleWithScheduler(
  options: AsterServiceLifecycleOptions,
  scheduler: AsterLifecycleScheduler,
): AsterServiceLifecycle {
  return createLifecycle(options, scheduler);
}
