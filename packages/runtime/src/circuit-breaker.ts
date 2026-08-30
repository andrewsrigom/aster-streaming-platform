import { performance } from "node:perf_hooks";

const ABSENT = Symbol("absent");

export const ASTER_CIRCUIT_BREAKER_STATES = Object.freeze(["closed", "open", "half_open"] as const);

export const ASTER_CIRCUIT_BREAKER_EVENTS = Object.freeze([
  "success",
  "failure",
  "ignored",
  "ignored_stale",
  "opened",
  "rejected_open",
  "half_opened",
  "rejected_half_open",
  "closed",
  "reopened",
] as const);

export const ASTER_CIRCUIT_BREAKER_MAX_SAMPLES = 64;

export type AsterCircuitBreakerState = (typeof ASTER_CIRCUIT_BREAKER_STATES)[number];
export type AsterCircuitBreakerEvent = (typeof ASTER_CIRCUIT_BREAKER_EVENTS)[number];
export type AsterCircuitBreakerOutcome = "success" | "failure" | "ignored";

export interface AsterCircuitBreakerObservation {
  readonly event: AsterCircuitBreakerEvent;
  readonly state: AsterCircuitBreakerState;
}

export interface AsterCircuitBreakerPolicy {
  readonly samplingWindowMs: number;
  readonly minimumThroughput: number;
  readonly failureRateThresholdPercentage: number;
  readonly openDurationMs: number;
  readonly now?: () => number;
  readonly observe?: (observation: AsterCircuitBreakerObservation) => void;
}

export interface AsterCircuitBreakerActionResult<T> {
  readonly outcome: AsterCircuitBreakerOutcome;
  readonly value: T;
}

export type AsterCircuitBreakerExecutionResult<T> =
  | Readonly<{ status: "completed"; value: T }>
  | Readonly<{ status: "rejected"; reason: "open" | "half_open" | "cancelled" }>
  | Readonly<{ status: "failed" }>;

export interface AsterCircuitBreakerSnapshot {
  readonly state: AsterCircuitBreakerState;
  readonly sampleCount: number;
  readonly failureCount: number;
  readonly openRemainingMs: number;
}

export interface AsterCircuitBreaker {
  execute<T>(
    signal: AbortSignal,
    action: (signal: AbortSignal) => Promise<AsterCircuitBreakerActionResult<T>>,
  ): Promise<AsterCircuitBreakerExecutionResult<T>>;
  snapshot(): AsterCircuitBreakerSnapshot;
}

export class AsterCircuitBreakerPolicyError extends Error {
  readonly code = "ASTER_CIRCUIT_BREAKER_INVALID_POLICY";

  constructor() {
    super("Circuit-breaker policy is invalid.");
    this.name = "AsterCircuitBreakerPolicyError";
  }
}

interface NormalizedPolicy {
  readonly samplingWindowMs: number;
  readonly minimumThroughput: number;
  readonly failureRateThresholdPercentage: number;
  readonly openDurationMs: number;
  readonly initialNow: number;
  readonly now: () => number;
  readonly observe: ((observation: AsterCircuitBreakerObservation) => void) | undefined;
}

interface Sample {
  readonly atMs: number;
  readonly failed: boolean;
}

interface Permit {
  readonly generation: number;
  readonly state: "closed" | "half_open";
}

const POLICY_KEYS = new Set<PropertyKey>([
  "samplingWindowMs",
  "minimumThroughput",
  "failureRateThresholdPercentage",
  "openDurationMs",
  "now",
  "observe",
]);
const ABORT_SIGNAL_ABORTED_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "aborted",
);

function ownDataValue(value: object, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) {
    return ABSENT;
  }
  if (!("value" in descriptor)) {
    throw new AsterCircuitBreakerPolicyError();
  }
  return descriptor.value;
}

function safeInteger(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum
  );
}

function validTime(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= Number.MAX_SAFE_INTEGER
  );
}

function signalIsAborted(value: unknown): boolean | undefined {
  try {
    if (!(value instanceof AbortSignal)) {
      return undefined;
    }
    // The platform getter bypasses caller-owned properties while retaining the brand check.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const getter = ABORT_SIGNAL_ABORTED_DESCRIPTOR?.get;
    const aborted: unknown = getter ? Reflect.apply(getter, value, []) : undefined;
    return typeof aborted === "boolean" ? aborted : undefined;
  } catch {
    return undefined;
  }
}

function normalizePolicy(input: unknown): NormalizedPolicy {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      throw new AsterCircuitBreakerPolicyError();
    }
    const prototype = Reflect.getPrototypeOf(input);
    const keys = Reflect.ownKeys(input);
    if (
      (prototype !== Object.prototype && prototype !== null) ||
      keys.length < 4 ||
      keys.length > POLICY_KEYS.size ||
      keys.some((key) => !POLICY_KEYS.has(key))
    ) {
      throw new AsterCircuitBreakerPolicyError();
    }
    const samplingWindowMs = ownDataValue(input, "samplingWindowMs");
    const minimumThroughput = ownDataValue(input, "minimumThroughput");
    const failureRateThresholdPercentage = ownDataValue(input, "failureRateThresholdPercentage");
    const openDurationMs = ownDataValue(input, "openDurationMs");
    const now = ownDataValue(input, "now");
    const observe = ownDataValue(input, "observe");
    if (
      !safeInteger(samplingWindowMs, 100, 300_000) ||
      !safeInteger(minimumThroughput, 1, ASTER_CIRCUIT_BREAKER_MAX_SAMPLES) ||
      !safeInteger(failureRateThresholdPercentage, 1, 100) ||
      !safeInteger(openDurationMs, 100, 300_000) ||
      (now !== ABSENT && typeof now !== "function") ||
      (observe !== ABSENT && typeof observe !== "function")
    ) {
      throw new AsterCircuitBreakerPolicyError();
    }
    const clock = now === ABSENT ? () => performance.now() : (now as () => number);
    const initialNow = clock();
    if (!validTime(initialNow)) {
      throw new AsterCircuitBreakerPolicyError();
    }
    return Object.freeze({
      samplingWindowMs,
      minimumThroughput,
      failureRateThresholdPercentage,
      openDurationMs,
      initialNow,
      now: clock,
      observe:
        observe === ABSENT
          ? undefined
          : (observe as (observation: AsterCircuitBreakerObservation) => void),
    });
  } catch (error) {
    if (error instanceof AsterCircuitBreakerPolicyError) {
      throw error;
    }
    throw new AsterCircuitBreakerPolicyError();
  }
}

function actionResult<T>(value: unknown): AsterCircuitBreakerActionResult<T> | undefined {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return undefined;
    }
    const prototype = Reflect.getPrototypeOf(value);
    const keys = Reflect.ownKeys(value);
    if (
      (prototype !== Object.prototype && prototype !== null) ||
      keys.length !== 2 ||
      !keys.includes("outcome") ||
      !keys.includes("value")
    ) {
      return undefined;
    }
    const outcome = ownDataValue(value, "outcome");
    const result = ownDataValue(value, "value");
    return result !== ABSENT &&
      (outcome === "success" || outcome === "failure" || outcome === "ignored")
      ? { outcome, value: result as T }
      : undefined;
  } catch {
    return undefined;
  }
}

export function createAsterCircuitBreaker(policy: AsterCircuitBreakerPolicy): AsterCircuitBreaker {
  const normalized = normalizePolicy(policy);
  let lastNow = normalized.initialNow;
  let state: AsterCircuitBreakerState = "closed";
  let generation = 0;
  let openUntilMs = 0;
  let halfOpenActive = false;
  let samples: Sample[] = [];

  const now = (): number => {
    try {
      const value = normalized.now();
      if (validTime(value) && value >= lastNow) {
        lastNow = value;
      }
    } catch {
      // A failed clock freezes breaker time; bounded samples and open rejection remain safe.
    }
    return lastNow;
  };

  const observe = (event: AsterCircuitBreakerEvent): void => {
    try {
      normalized.observe?.(Object.freeze({ event, state }));
    } catch {
      // Optional observation cannot change dependency admission.
    }
  };

  const prune = (atMs: number): void => {
    const oldest = atMs - normalized.samplingWindowMs;
    samples = samples.filter((sample) => sample.atMs >= oldest);
  };

  const toOpen = (atMs: number, event: "opened" | "reopened"): void => {
    generation += 1;
    state = "open";
    halfOpenActive = false;
    openUntilMs = Math.min(Number.MAX_SAFE_INTEGER, atMs + normalized.openDurationMs);
    samples = [];
    observe(event);
  };

  const acquire = (
    aborted: boolean,
  ): Permit | Readonly<{ status: "rejected"; reason: "open" | "half_open" | "cancelled" }> => {
    if (aborted) {
      return Object.freeze({ status: "rejected", reason: "cancelled" });
    }
    const atMs = now();
    if (state === "closed") {
      return Object.freeze({ generation, state });
    }
    if (state === "open") {
      if (atMs < openUntilMs) {
        observe("rejected_open");
        return Object.freeze({ status: "rejected", reason: "open" });
      }
      generation += 1;
      state = "half_open";
      halfOpenActive = true;
      observe("half_opened");
      return Object.freeze({ generation, state });
    }
    if (halfOpenActive) {
      observe("rejected_half_open");
      return Object.freeze({ status: "rejected", reason: "half_open" });
    }
    halfOpenActive = true;
    return Object.freeze({ generation, state });
  };

  const complete = (permit: Permit, outcome: AsterCircuitBreakerOutcome): void => {
    const atMs = now();
    if (permit.generation !== generation || permit.state !== state) {
      observe("ignored_stale");
      return;
    }
    if (state === "half_open") {
      halfOpenActive = false;
      if (outcome === "success") {
        generation += 1;
        state = "closed";
        openUntilMs = 0;
        samples = [];
        observe("closed");
      } else {
        observe(outcome === "failure" ? "failure" : "ignored");
        toOpen(atMs, "reopened");
      }
      return;
    }
    observe(outcome);
    if (outcome === "ignored") {
      return;
    }
    prune(atMs);
    samples.push(Object.freeze({ atMs, failed: outcome === "failure" }));
    if (samples.length > ASTER_CIRCUIT_BREAKER_MAX_SAMPLES) {
      samples = samples.slice(-ASTER_CIRCUIT_BREAKER_MAX_SAMPLES);
    }
    if (samples.length < normalized.minimumThroughput) {
      return;
    }
    const failures = samples.reduce((count, sample) => count + Number(sample.failed), 0);
    if (failures * 100 >= normalized.failureRateThresholdPercentage * samples.length) {
      toOpen(atMs, "opened");
    }
  };

  return Object.freeze({
    async execute<T>(
      signal: AbortSignal,
      action: (signal: AbortSignal) => Promise<AsterCircuitBreakerActionResult<T>>,
    ): Promise<AsterCircuitBreakerExecutionResult<T>> {
      const aborted = signalIsAborted(signal);
      if (aborted === undefined || typeof action !== "function") {
        return Object.freeze({ status: "failed" });
      }
      const permit = acquire(aborted);
      if ("status" in permit) {
        return permit;
      }
      try {
        const result = actionResult<T>(await action(signal));
        if (!result) {
          complete(permit, signalIsAborted(signal) === true ? "ignored" : "failure");
          return Object.freeze({ status: "failed" });
        }
        complete(permit, result.outcome);
        return Object.freeze({ status: "completed", value: result.value });
      } catch {
        complete(permit, signalIsAborted(signal) === true ? "ignored" : "failure");
        return Object.freeze({ status: "failed" });
      }
    },
    snapshot(): AsterCircuitBreakerSnapshot {
      const atMs = now();
      if (state === "closed") {
        prune(atMs);
      }
      const failures = samples.reduce((count, sample) => count + Number(sample.failed), 0);
      return Object.freeze({
        state,
        sampleCount: samples.length,
        failureCount: failures,
        openRemainingMs: state === "open" ? Math.max(0, Math.ceil(openUntilMs - atMs)) : 0,
      });
    },
  });
}
