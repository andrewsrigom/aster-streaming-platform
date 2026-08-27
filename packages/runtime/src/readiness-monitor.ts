import {
  ASTER_READINESS_CRITICAL_DEPENDENCY_MAX,
  type AsterReadinessController,
} from "./readiness.js";

const ABSENT = Symbol("absent");

export const ASTER_READINESS_MONITOR_INTERVAL_MIN_MS = 100;
export const ASTER_READINESS_MONITOR_INTERVAL_MAX_MS = 300_000;
export const ASTER_READINESS_MONITOR_PROBE_TIMEOUT_MAX_MS = 30_000;
export const ASTER_READINESS_MONITOR_JITTER_RATIO = 0.2;

export type AsterReadinessProbeOutcome = "ready" | "unavailable";
export type AsterReadinessProbe = (signal: AbortSignal) => Promise<AsterReadinessProbeOutcome>;
export type AsterReadinessMonitorStartResult = "rejected" | "started" | "unchanged";
export type AsterReadinessMonitorStopResult = "stopped" | "unchanged";

export interface AsterReadinessMonitorOptions {
  readonly intervalMs: number;
  readonly probeTimeoutMs: number;
  readonly probes: readonly AsterReadinessProbe[];
  readonly readiness: Pick<AsterReadinessController, "setCriticalDependencyState">;
}

export interface AsterReadinessMonitor {
  start(): AsterReadinessMonitorStartResult;
  stop(): Promise<AsterReadinessMonitorStopResult>;
}

export interface AsterReadinessMonitorIssue {
  readonly option: "<options>" | "intervalMs" | "probeTimeoutMs" | "probes" | "readiness";
  readonly reason: "internal" | "invalid" | "missing";
}

export class AsterReadinessMonitorError extends Error {
  readonly code = "ASTER_READINESS_MONITOR_INVALID_OPTIONS";
  readonly issues: readonly AsterReadinessMonitorIssue[];

  constructor(issues: readonly AsterReadinessMonitorIssue[]) {
    super(
      `Runtime readiness monitor configuration is invalid (${issues.length} issue${issues.length === 1 ? "" : "s"}).`,
    );
    this.name = "AsterReadinessMonitorError";
    this.issues = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
  }
}

interface AsterReadinessMonitorRuntime {
  random(): number;
  schedule(callback: () => void, delayMs: number): () => void;
}

interface NormalizedMonitorOptions {
  readonly intervalMs: number;
  readonly probeTimeoutMs: number;
  readonly probes: readonly AsterReadinessProbe[];
  readonly setCriticalDependencyState: (
    dependencyIndex: number,
    state: AsterReadinessProbeOutcome,
  ) => unknown;
}

type MonitorState = "idle" | "running" | "stopped" | "stopping";

const OPTION_KEYS = new Set<PropertyKey>(["intervalMs", "probeTimeoutMs", "probes", "readiness"]);

const defaultRuntime: AsterReadinessMonitorRuntime = Object.freeze({
  random(): number {
    return Math.random();
  },
  schedule(callback: () => void, delayMs: number): () => void {
    const timer = setTimeout(callback, delayMs);
    timer.unref();
    return () => {
      clearTimeout(timer);
    };
  },
});

function configurationError(
  option: AsterReadinessMonitorIssue["option"],
  reason: AsterReadinessMonitorIssue["reason"],
): AsterReadinessMonitorError {
  return new AsterReadinessMonitorError([{ option, reason }]);
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasPlainPrototype(value: object): boolean {
  let prototype: unknown;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch {
    return false;
  }
  return prototype === Object.prototype || prototype === null;
}

function ownDataValue(
  object: object,
  key: PropertyKey,
  option: AsterReadinessMonitorIssue["option"],
): unknown {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(object, key);
  } catch {
    throw configurationError(option, "internal");
  }
  if (!descriptor) {
    return ABSENT;
  }
  if (!("value" in descriptor)) {
    throw configurationError(option, "invalid");
  }
  return descriptor.value;
}

function normalizeInteger(
  options: object,
  option: "intervalMs" | "probeTimeoutMs",
  minimum: number,
  maximum: number,
): number {
  const candidate = ownDataValue(options, option, "<options>");
  if (candidate === ABSENT) {
    throw configurationError(option, "missing");
  }
  if (
    typeof candidate !== "number" ||
    !Number.isSafeInteger(candidate) ||
    candidate < minimum ||
    candidate > maximum
  ) {
    throw configurationError(option, "invalid");
  }
  return candidate;
}

function normalizeProbes(candidate: unknown): readonly AsterReadinessProbe[] {
  let isArray: boolean;
  try {
    isArray = Array.isArray(candidate);
  } catch {
    throw configurationError("probes", "internal");
  }
  if (!isArray) {
    throw configurationError("probes", "invalid");
  }
  const probeArray = candidate as readonly AsterReadinessProbe[];
  const length = ownDataValue(probeArray, "length", "probes");
  if (
    typeof length !== "number" ||
    !Number.isSafeInteger(length) ||
    length < 1 ||
    length > ASTER_READINESS_CRITICAL_DEPENDENCY_MAX
  ) {
    throw configurationError("probes", "invalid");
  }
  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(probeArray);
  } catch {
    throw configurationError("probes", "internal");
  }
  if (
    keys.length !== length + 1 ||
    keys.some((key) => {
      if (key === "length") {
        return false;
      }
      return typeof key !== "string" || !/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= length;
    })
  ) {
    throw configurationError("probes", "invalid");
  }

  const probes: AsterReadinessProbe[] = [];
  for (let index = 0; index < length; index += 1) {
    const probe = ownDataValue(probeArray, String(index), "probes");
    if (typeof probe !== "function") {
      throw configurationError("probes", "invalid");
    }
    probes.push(probe as AsterReadinessProbe);
  }
  return Object.freeze(probes);
}

function normalizeReadiness(
  candidate: unknown,
): NormalizedMonitorOptions["setCriticalDependencyState"] {
  if (!isObject(candidate) || !hasPlainPrototype(candidate)) {
    throw configurationError("readiness", "invalid");
  }
  const transition = ownDataValue(candidate, "setCriticalDependencyState", "readiness");
  if (transition === ABSENT) {
    throw configurationError("readiness", "missing");
  }
  if (typeof transition !== "function") {
    throw configurationError("readiness", "invalid");
  }
  return (dependencyIndex, state): unknown =>
    Reflect.apply(transition, candidate, [dependencyIndex, state]);
}

function normalizeOptions(input: AsterReadinessMonitorOptions): NormalizedMonitorOptions {
  if (!isObject(input) || !hasPlainPrototype(input)) {
    throw configurationError("<options>", "invalid");
  }
  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(input);
  } catch {
    throw configurationError("<options>", "internal");
  }
  if (keys.length > OPTION_KEYS.size || keys.some((key) => !OPTION_KEYS.has(key))) {
    throw configurationError("<options>", "invalid");
  }

  const intervalMs = normalizeInteger(
    input,
    "intervalMs",
    ASTER_READINESS_MONITOR_INTERVAL_MIN_MS,
    ASTER_READINESS_MONITOR_INTERVAL_MAX_MS,
  );
  const probeTimeoutMs = normalizeInteger(
    input,
    "probeTimeoutMs",
    1,
    ASTER_READINESS_MONITOR_PROBE_TIMEOUT_MAX_MS,
  );
  if (probeTimeoutMs > intervalMs) {
    throw configurationError("probeTimeoutMs", "invalid");
  }

  const probes = ownDataValue(input, "probes", "<options>");
  if (probes === ABSENT) {
    throw configurationError("probes", "missing");
  }
  const readiness = ownDataValue(input, "readiness", "<options>");
  if (readiness === ABSENT) {
    throw configurationError("readiness", "missing");
  }

  return {
    intervalMs,
    probeTimeoutMs,
    probes: normalizeProbes(probes),
    setCriticalDependencyState: normalizeReadiness(readiness),
  };
}

function computeJitteredDelay(intervalMs: number, runtime: AsterReadinessMonitorRuntime): number {
  let random: unknown;
  try {
    random = runtime.random();
  } catch {
    throw configurationError("<options>", "internal");
  }
  if (typeof random !== "number" || !Number.isFinite(random) || random < 0 || random >= 1) {
    throw configurationError("<options>", "internal");
  }
  const multiplier =
    1 - ASTER_READINESS_MONITOR_JITTER_RATIO + 2 * random * ASTER_READINESS_MONITOR_JITTER_RATIO;
  return Math.max(1, Math.round(intervalMs * multiplier));
}

function safelyCancel(cancel: () => void): void {
  try {
    cancel();
  } catch {
    // Timer cleanup is best effort and never exposes scheduler details.
  }
}

async function executeProbe(
  probe: AsterReadinessProbe,
  signal: AbortSignal,
): Promise<AsterReadinessProbeOutcome | undefined> {
  if (signal.aborted) {
    return undefined;
  }
  let removeAbortListener: () => void;
  let resolveAborted: (() => void) | undefined;
  const aborted = new Promise<undefined>((resolve) => {
    resolveAborted = () => {
      resolve(undefined);
    };
  });
  const listener = (): void => {
    resolveAborted?.();
  };
  try {
    EventTarget.prototype.addEventListener.call(signal, "abort", listener, { once: true });
    removeAbortListener = (): void => {
      try {
        EventTarget.prototype.removeEventListener.call(signal, "abort", listener);
      } catch {
        // The monitor owns a real signal; cleanup failure cannot escape the cycle.
      }
    };
  } catch {
    return "unavailable";
  }
  const completion = Promise.resolve()
    .then(() => Reflect.apply(probe, undefined, [signal]) as unknown)
    .then<AsterReadinessProbeOutcome, AsterReadinessProbeOutcome>(
      (outcome) => (outcome === "ready" ? "ready" : "unavailable"),
      () => "unavailable",
    );
  try {
    return await Promise.race([completion, aborted]);
  } finally {
    removeAbortListener();
  }
}

function createMonitor(
  input: AsterReadinessMonitorOptions,
  runtime: AsterReadinessMonitorRuntime,
): AsterReadinessMonitor {
  let options: NormalizedMonitorOptions;
  try {
    options = normalizeOptions(input);
  } catch (error) {
    if (error instanceof AsterReadinessMonitorError) {
      throw error;
    }
    throw configurationError("<options>", "internal");
  }

  let state: MonitorState = "idle";
  let cancelScheduled = (): void => undefined;
  let currentAbort: (() => void) | undefined;
  let currentCycle: Promise<void> | undefined;

  const markRemainingUnavailable = (fromIndex = 0): void => {
    for (let index = fromIndex; index < options.probes.length; index += 1) {
      try {
        options.setCriticalDependencyState(index, "unavailable");
      } catch {
        // Readiness publication cannot break monitor stop or scheduling.
      }
    }
  };

  const stopAfterRuntimeFailure = (): void => {
    markRemainingUnavailable();
    state = "stopped";
    safelyCancel(cancelScheduled);
    cancelScheduled = () => undefined;
    currentAbort?.();
  };

  const scheduleNext = (): boolean => {
    let delayMs: number;
    try {
      delayMs = computeJitteredDelay(options.intervalMs, runtime);
    } catch {
      stopAfterRuntimeFailure();
      return false;
    }

    const scheduleState = { firedSynchronously: false };
    const callback = (): void => {
      scheduleState.firedSynchronously = true;
      cancelScheduled = () => undefined;
      if (state !== "running" || currentCycle) {
        return;
      }
      const cycle = runCycle();
      currentCycle = cycle;
      void cycle.finally(() => {
        if (currentCycle === cycle) {
          currentCycle = undefined;
        }
      });
    };

    let cancel: unknown;
    try {
      cancel = runtime.schedule(callback, delayMs);
    } catch {
      stopAfterRuntimeFailure();
      return false;
    }
    if (typeof cancel !== "function") {
      stopAfterRuntimeFailure();
      return false;
    }
    const normalizedCancel = cancel as () => void;
    if (scheduleState.firedSynchronously) {
      safelyCancel(normalizedCancel);
      stopAfterRuntimeFailure();
      return false;
    } else {
      cancelScheduled = normalizedCancel;
    }
    return true;
  };

  const runCycle = async (): Promise<void> => {
    const controller = new AbortController();
    currentAbort = (): void => {
      controller.abort();
    };
    let cancelDeadline = (): void => undefined;
    const deadlineState = { firedSynchronously: false };
    try {
      const cancel = runtime.schedule(() => {
        deadlineState.firedSynchronously = true;
        controller.abort();
      }, options.probeTimeoutMs);
      if (typeof cancel !== "function") {
        controller.abort();
        stopAfterRuntimeFailure();
      } else {
        cancelDeadline = cancel;
        if (deadlineState.firedSynchronously) {
          stopAfterRuntimeFailure();
        }
      }
    } catch {
      controller.abort();
      stopAfterRuntimeFailure();
    }

    try {
      for (let index = 0; index < options.probes.length; index += 1) {
        const probe = options.probes[index];
        if (!probe) {
          markRemainingUnavailable(index);
          return;
        }
        const outcome = await executeProbe(probe, controller.signal);
        if (state !== "running") {
          return;
        }
        if (!outcome) {
          markRemainingUnavailable(index);
          return;
        }
        try {
          options.setCriticalDependencyState(index, outcome);
        } catch {
          // A malformed readiness publisher fails closed without stopping later probes.
        }
      }
    } finally {
      safelyCancel(cancelDeadline);
      currentAbort = undefined;
      if (state === "running") {
        scheduleNext();
      }
    }
  };

  return Object.freeze({
    start(): AsterReadinessMonitorStartResult {
      if (state === "running") {
        return "unchanged";
      }
      if (state !== "idle") {
        return "rejected";
      }
      state = "running";
      return scheduleNext() ? "started" : "rejected";
    },
    async stop(): Promise<AsterReadinessMonitorStopResult> {
      if (state === "stopped" || state === "stopping") {
        return "unchanged";
      }
      state = "stopping";
      safelyCancel(cancelScheduled);
      cancelScheduled = () => undefined;
      currentAbort?.();
      await currentCycle;
      state = "stopped";
      return "stopped";
    },
  });
}

export function createAsterReadinessMonitor(
  options: AsterReadinessMonitorOptions,
): AsterReadinessMonitor {
  return createMonitor(options, defaultRuntime);
}

export function createAsterReadinessMonitorWithRuntime(
  options: AsterReadinessMonitorOptions,
  runtime: AsterReadinessMonitorRuntime,
): AsterReadinessMonitor {
  return createMonitor(options, runtime);
}
