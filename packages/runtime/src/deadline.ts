const ABSENT = Symbol("absent");

export const ASTER_DEADLINE_MIN_MS = 1;
export const ASTER_DEADLINE_MAX_MS = 300_000;

export type AsterDeadlineDisposalResult = "disposed" | "unchanged";

export type AsterDeadlineIssue = Readonly<{
  option: "<options>" | "<runtime>" | "parentSignal" | "timeoutMs";
  reason: "internal" | "invalid" | "missing";
}>;

export interface AsterDeadlineOptions {
  readonly parentSignal?: AbortSignal;
  readonly timeoutMs: number;
}

export interface AsterDeadline {
  readonly signal: AbortSignal;
  dispose(): AsterDeadlineDisposalResult;
  remainingMs(): number;
}

export class AsterDeadlineError extends Error {
  readonly code = "ASTER_DEADLINE_INVALID_OPTIONS";
  readonly issues: readonly AsterDeadlineIssue[];

  constructor(issues: readonly AsterDeadlineIssue[]) {
    super(
      `Runtime deadline configuration is invalid (${issues.length} issue${issues.length === 1 ? "" : "s"}).`,
    );
    this.name = "AsterDeadlineError";
    this.issues = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
  }
}

interface NormalizedDeadlineOptions {
  readonly parentSignal: AbortSignal | undefined;
  readonly timeoutMs: number;
}

interface AsterDeadlineScheduler {
  now(): number;
  schedule(callback: () => void, delayMs: number): () => void;
}

type DeadlineState = "active" | "disposed" | "parent_aborted" | "timed_out";

const OPTION_KEYS = new Set<PropertyKey>(["parentSignal", "timeoutMs"]);
const ABORT_SIGNAL_ABORTED_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "aborted",
);
const ASTER_DEADLINE_REMAINING = new WeakMap<AbortSignal, () => number>();

const defaultScheduler: AsterDeadlineScheduler = {
  now() {
    return performance.now();
  },
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs);
    timer.unref();
    return () => {
      clearTimeout(timer);
    };
  },
};

function configurationError(
  option: AsterDeadlineIssue["option"],
  reason: AsterDeadlineIssue["reason"],
): AsterDeadlineError {
  return new AsterDeadlineError([{ option, reason }]);
}

function isOptionsObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ownDataValue(object: object, key: PropertyKey): unknown {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(object, key);
  } catch {
    throw configurationError("<options>", "internal");
  }
  if (!descriptor) {
    return ABSENT;
  }
  if (!("value" in descriptor)) {
    throw configurationError("<options>", "invalid");
  }
  return descriptor.value;
}

function isAbortSignal(value: unknown): value is AbortSignal {
  try {
    return value instanceof AbortSignal;
  } catch {
    return false;
  }
}

function normalizeOptions(input: AsterDeadlineOptions): NormalizedDeadlineOptions {
  if (!isOptionsObject(input)) {
    throw configurationError("<options>", "invalid");
  }

  let prototype: unknown;
  let keys: readonly PropertyKey[];
  try {
    prototype = Object.getPrototypeOf(input);
    keys = Reflect.ownKeys(input);
  } catch {
    throw configurationError("<options>", "internal");
  }
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    keys.length > OPTION_KEYS.size ||
    keys.some((key) => !OPTION_KEYS.has(key))
  ) {
    throw configurationError("<options>", "invalid");
  }

  const timeoutMs = ownDataValue(input, "timeoutMs");
  if (timeoutMs === ABSENT) {
    throw configurationError("timeoutMs", "missing");
  }
  if (
    typeof timeoutMs !== "number" ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < ASTER_DEADLINE_MIN_MS ||
    timeoutMs > ASTER_DEADLINE_MAX_MS
  ) {
    throw configurationError("timeoutMs", "invalid");
  }

  const parentSignal = ownDataValue(input, "parentSignal");
  if (parentSignal !== ABSENT && !isAbortSignal(parentSignal)) {
    throw configurationError("parentSignal", "invalid");
  }

  return {
    parentSignal: parentSignal === ABSENT ? undefined : parentSignal,
    timeoutMs,
  };
}

function readMonotonicNow(scheduler: AsterDeadlineScheduler): number {
  let now: unknown;
  try {
    now = scheduler.now();
  } catch {
    throw configurationError("<runtime>", "internal");
  }
  if (typeof now !== "number" || !Number.isFinite(now) || now < 0) {
    throw configurationError("<runtime>", "internal");
  }
  return now;
}

function signalIsAborted(signal: AbortSignal): boolean {
  // The platform getter bypasses caller-owned properties while retaining AbortSignal brand checks.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const getter = ABORT_SIGNAL_ABORTED_DESCRIPTOR?.get;
  if (!getter) {
    throw configurationError("<runtime>", "internal");
  }
  try {
    const aborted: unknown = Reflect.apply(getter, signal, []);
    if (typeof aborted !== "boolean") {
      throw configurationError("<runtime>", "internal");
    }
    return aborted;
  } catch {
    throw configurationError("<runtime>", "internal");
  }
}

function createDeadline(
  input: AsterDeadlineOptions,
  scheduler: AsterDeadlineScheduler,
): AsterDeadline {
  let options: NormalizedDeadlineOptions;
  try {
    options = normalizeOptions(input);
  } catch (error) {
    if (error instanceof AsterDeadlineError) {
      throw error;
    }
    throw configurationError("<options>", "internal");
  }

  const startedAt = readMonotonicNow(scheduler);
  const expiresAt = startedAt + options.timeoutMs;
  if (!Number.isFinite(expiresAt)) {
    throw configurationError("<runtime>", "internal");
  }

  const controller = new AbortController();
  let state: DeadlineState = "active";
  let lastRemainingMs = options.timeoutMs;
  let cancelTimer = (): void => undefined;
  let removeParentListener = (): void => undefined;

  const releaseResources = (): void => {
    const cancel = cancelTimer;
    cancelTimer = () => undefined;
    try {
      cancel();
    } catch {
      // Cleanup is best effort and never exposes scheduler details.
    }
    const remove = removeParentListener;
    removeParentListener = () => undefined;
    try {
      remove();
    } catch {
      // Cleanup is best effort and never exposes parent-signal details.
    }
  };

  const finish = (nextState: Exclude<DeadlineState, "active">): boolean => {
    if (state !== "active") {
      return false;
    }
    state = nextState;
    lastRemainingMs = 0;
    releaseResources();
    if (nextState !== "disposed") {
      controller.abort();
    }
    return true;
  };

  const parentAbortListener = (): void => {
    finish("parent_aborted");
  };
  const isActive = (): boolean => state === "active";

  const parentSignal = options.parentSignal;
  const parentRemainingMs = parentSignal ? ASTER_DEADLINE_REMAINING.get(parentSignal) : undefined;
  if (parentSignal) {
    if (signalIsAborted(parentSignal)) {
      finish("parent_aborted");
    } else {
      try {
        EventTarget.prototype.addEventListener.call(parentSignal, "abort", parentAbortListener, {
          once: true,
        });
        removeParentListener = (): void => {
          EventTarget.prototype.removeEventListener.call(
            parentSignal,
            "abort",
            parentAbortListener,
          );
        };
      } catch {
        finish("parent_aborted");
        throw configurationError("<runtime>", "internal");
      }
    }
  }

  if (isActive()) {
    let scheduledCancellation: unknown;
    try {
      scheduledCancellation = scheduler.schedule(() => {
        finish("timed_out");
      }, options.timeoutMs);
    } catch {
      finish("timed_out");
      throw configurationError("<runtime>", "internal");
    }
    if (typeof scheduledCancellation !== "function") {
      finish("timed_out");
      throw configurationError("<runtime>", "internal");
    }
    if (isActive()) {
      cancelTimer = scheduledCancellation as () => void;
    } else {
      try {
        Reflect.apply(scheduledCancellation, undefined, []);
      } catch {
        // The deadline is already finite; never reflect scheduler cleanup failures.
      }
    }
  }

  const deadline = Object.freeze({
    dispose(): AsterDeadlineDisposalResult {
      return finish("disposed") ? "disposed" : "unchanged";
    },
    remainingMs(): number {
      if (state !== "active") {
        return 0;
      }
      let now: number;
      try {
        now = readMonotonicNow(scheduler);
      } catch {
        finish("timed_out");
        return 0;
      }
      const remaining = expiresAt - now;
      if (remaining <= 0) {
        finish("timed_out");
        return 0;
      }
      let inheritedRemaining = Number.POSITIVE_INFINITY;
      if (parentRemainingMs) {
        try {
          inheritedRemaining = parentRemainingMs();
        } catch {
          finish("parent_aborted");
          return 0;
        }
        if (!Number.isSafeInteger(inheritedRemaining) || inheritedRemaining <= 0) {
          finish("parent_aborted");
          return 0;
        }
      }
      lastRemainingMs = Math.min(lastRemainingMs, Math.ceil(remaining), inheritedRemaining);
      return lastRemainingMs;
    },
    signal: controller.signal,
  });
  ASTER_DEADLINE_REMAINING.set(controller.signal, deadline.remainingMs);
  return deadline;
}

export function createAsterDeadline(options: AsterDeadlineOptions): AsterDeadline {
  return createDeadline(options, defaultScheduler);
}

export function createAsterDeadlineWithSchedulerForTest(
  options: AsterDeadlineOptions,
  scheduler: AsterDeadlineScheduler,
): AsterDeadline {
  return createDeadline(options, scheduler);
}
