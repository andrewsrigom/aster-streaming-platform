import { createAsterDeadline, type AsterDeadline, type AsterDeadlineOptions } from "./deadline.js";

const ABSENT = Symbol("absent");

export const ASTER_SAFE_READ_MAX_ATTEMPTS = 3;

export const ASTER_SAFE_READ_OBSERVATION_OUTCOMES = Object.freeze([
  "completed",
  "transient",
  "permanent",
  "cancelled",
  "attempt_timeout",
  "retry_scheduled",
  "budget_exhausted",
] as const);

export type AsterSafeReadObservationOutcome = (typeof ASTER_SAFE_READ_OBSERVATION_OUTCOMES)[number];

export type AsterSafeReadAttemptResult<T> =
  | Readonly<{ status: "completed"; value: T }>
  | Readonly<{ status: "transient" }>
  | Readonly<{ status: "permanent" }>
  | Readonly<{ status: "cancelled" }>;

export type AsterSafeReadResult<T> =
  | Readonly<{ status: "completed"; value: T; attempts: number }>
  | Readonly<{ status: "unavailable"; attempts: number }>
  | Readonly<{ status: "cancelled"; attempts: number }>;

export interface AsterSafeReadObservation {
  readonly attempt: number;
  readonly outcome: AsterSafeReadObservationOutcome;
  readonly delayMs?: number;
}

export interface AsterSafeReadPolicy {
  readonly operationTimeoutMs: number;
  readonly attemptTimeoutMs: number;
  readonly responseReserveMs: number;
  readonly maxAttempts: number;
  readonly baseBackoffMs: number;
  readonly maxBackoffMs: number;
  readonly random: () => number;
  readonly observe?: (observation: AsterSafeReadObservation) => void;
}

export class AsterSafeReadPolicyError extends Error {
  readonly code = "ASTER_SAFE_READ_INVALID_POLICY";

  constructor() {
    super("Safe-read policy is invalid.");
    this.name = "AsterSafeReadPolicyError";
  }
}

interface AsterSafeReadRuntime {
  readonly createDeadline: (options: AsterDeadlineOptions) => AsterDeadline;
  readonly delay: (milliseconds: number, signal: AbortSignal) => Promise<"elapsed" | "cancelled">;
}

interface NormalizedSafeReadPolicy {
  readonly operationTimeoutMs: number;
  readonly attemptTimeoutMs: number;
  readonly responseReserveMs: number;
  readonly maxAttempts: number;
  readonly baseBackoffMs: number;
  readonly maxBackoffMs: number;
  readonly random: () => number;
  readonly observe: ((observation: AsterSafeReadObservation) => void) | undefined;
}

const POLICY_KEYS = new Set<PropertyKey>([
  "operationTimeoutMs",
  "attemptTimeoutMs",
  "responseReserveMs",
  "maxAttempts",
  "baseBackoffMs",
  "maxBackoffMs",
  "random",
  "observe",
]);

const defaultRuntime: AsterSafeReadRuntime = {
  createDeadline: createAsterDeadline,
  delay(milliseconds, signal) {
    if (signal.aborted) {
      return Promise.resolve("cancelled");
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: "elapsed" | "cancelled") => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", cancelled);
        resolve(result);
      };
      const cancelled = () => {
        finish("cancelled");
      };
      const timer = setTimeout(() => {
        finish("elapsed");
      }, milliseconds);
      timer.unref();
      signal.addEventListener("abort", cancelled, { once: true });
      if (signal.aborted) {
        cancelled();
      }
    });
  },
};

function safeInteger(value: number, minimum: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function ownDataValue(value: object, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) {
    return ABSENT;
  }
  if (!("value" in descriptor)) {
    throw new AsterSafeReadPolicyError();
  }
  return descriptor.value;
}

function normalizePolicy(input: unknown): NormalizedSafeReadPolicy {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      throw new AsterSafeReadPolicyError();
    }
    const prototype = Reflect.getPrototypeOf(input);
    const keys = Reflect.ownKeys(input);
    if (
      (prototype !== Object.prototype && prototype !== null) ||
      keys.length < 7 ||
      keys.length > POLICY_KEYS.size ||
      keys.some((key) => !POLICY_KEYS.has(key))
    ) {
      throw new AsterSafeReadPolicyError();
    }
    const operationTimeoutMs = ownDataValue(input, "operationTimeoutMs");
    const attemptTimeoutMs = ownDataValue(input, "attemptTimeoutMs");
    const responseReserveMs = ownDataValue(input, "responseReserveMs");
    const maxAttempts = ownDataValue(input, "maxAttempts");
    const baseBackoffMs = ownDataValue(input, "baseBackoffMs");
    const maxBackoffMs = ownDataValue(input, "maxBackoffMs");
    const random = ownDataValue(input, "random");
    const observe = ownDataValue(input, "observe");
    if (
      typeof operationTimeoutMs !== "number" ||
      !safeInteger(operationTimeoutMs, 1, 300_000) ||
      typeof attemptTimeoutMs !== "number" ||
      !safeInteger(attemptTimeoutMs, 1, operationTimeoutMs) ||
      typeof responseReserveMs !== "number" ||
      !safeInteger(responseReserveMs, 0, operationTimeoutMs) ||
      attemptTimeoutMs + responseReserveMs > operationTimeoutMs ||
      typeof maxAttempts !== "number" ||
      !safeInteger(maxAttempts, 1, ASTER_SAFE_READ_MAX_ATTEMPTS) ||
      typeof baseBackoffMs !== "number" ||
      !safeInteger(baseBackoffMs, 0, 30_000) ||
      typeof maxBackoffMs !== "number" ||
      !safeInteger(maxBackoffMs, baseBackoffMs, 30_000) ||
      typeof random !== "function" ||
      (observe !== ABSENT && typeof observe !== "function")
    ) {
      throw new AsterSafeReadPolicyError();
    }
    return Object.freeze({
      operationTimeoutMs,
      attemptTimeoutMs,
      responseReserveMs,
      maxAttempts,
      baseBackoffMs,
      maxBackoffMs,
      random: random as () => number,
      observe:
        observe === ABSENT ? undefined : (observe as (value: AsterSafeReadObservation) => void),
    });
  } catch (error) {
    if (error instanceof AsterSafeReadPolicyError) {
      throw error;
    }
    throw new AsterSafeReadPolicyError();
  }
}

function observe(policy: NormalizedSafeReadPolicy, observation: AsterSafeReadObservation): void {
  try {
    policy.observe?.(Object.freeze(observation));
  } catch {
    // Optional observation cannot change dependency behavior.
  }
}

function attemptResult<T>(value: unknown): AsterSafeReadAttemptResult<T> {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return { status: "permanent" };
    }
    const prototype = Reflect.getPrototypeOf(value);
    const keys = Reflect.ownKeys(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return { status: "permanent" };
    }
    const status = ownDataValue(value, "status");
    if (status === "completed" && keys.length === 2 && keys.includes("value")) {
      const completed = ownDataValue(value, "value");
      return completed === ABSENT ? { status: "permanent" } : { status, value: completed as T };
    }
    return keys.length === 1 &&
      (status === "transient" || status === "permanent" || status === "cancelled")
      ? { status }
      : { status: "permanent" };
  } catch {
    return { status: "permanent" };
  }
}

async function runAttempt<T>(
  attempt: (signal: AbortSignal, attempt: number) => Promise<AsterSafeReadAttemptResult<T>>,
  deadline: AsterDeadline,
  number: number,
): Promise<AsterSafeReadAttemptResult<T> | "aborted"> {
  if (deadline.signal.aborted) {
    return "aborted";
  }
  let removeAbort = (): void => undefined;
  const aborted = new Promise<"aborted">((resolve) => {
    const listener = () => {
      resolve("aborted");
    };
    deadline.signal.addEventListener("abort", listener, { once: true });
    removeAbort = () => {
      deadline.signal.removeEventListener("abort", listener);
    };
  });
  const work = Promise.resolve()
    .then(() => attempt(deadline.signal, number))
    .then(
      (result) => attemptResult<T>(result),
      () => ({ status: "permanent" }) as const,
    );
  try {
    return await Promise.race([work, aborted]);
  } finally {
    removeAbort();
    void work.catch(() => undefined);
  }
}

function retryDelay(policy: NormalizedSafeReadPolicy, failedAttempt: number): number | undefined {
  let sample: unknown;
  try {
    sample = policy.random();
  } catch {
    return undefined;
  }
  if (typeof sample !== "number" || !Number.isFinite(sample) || sample < 0 || sample > 1) {
    return undefined;
  }
  const ceiling = Math.min(
    policy.maxBackoffMs,
    policy.baseBackoffMs * 2 ** Math.max(0, failedAttempt - 1),
  );
  return Math.ceil(ceiling / 2 + (ceiling / 2) * sample);
}

async function executeSafeRead<T>(
  policy: AsterSafeReadPolicy,
  signal: AbortSignal,
  attempt: (signal: AbortSignal, attempt: number) => Promise<AsterSafeReadAttemptResult<T>>,
  runtime: AsterSafeReadRuntime,
): Promise<AsterSafeReadResult<T>> {
  const normalized = normalizePolicy(policy);
  const operation = runtime.createDeadline({
    parentSignal: signal,
    timeoutMs: normalized.operationTimeoutMs,
  });
  let attempts = 0;
  try {
    if (operation.signal.aborted) {
      return { status: signal.aborted ? "cancelled" : "unavailable", attempts };
    }
    while (attempts < normalized.maxAttempts) {
      attempts += 1;
      const current = runtime.createDeadline({
        parentSignal: operation.signal,
        timeoutMs: normalized.attemptTimeoutMs,
      });
      const result = await runAttempt(attempt, current, attempts);
      const attemptTimedOut = result === "aborted" && !operation.signal.aborted;
      current.dispose();

      if (result === "aborted") {
        observe(normalized, {
          attempt: attempts,
          outcome: attemptTimedOut ? "attempt_timeout" : "cancelled",
        });
        return {
          status: signal.aborted ? "cancelled" : "unavailable",
          attempts,
        };
      }
      observe(normalized, { attempt: attempts, outcome: result.status });
      if (result.status === "completed") {
        return { status: "completed", value: result.value, attempts };
      }
      if (result.status === "cancelled") {
        return { status: signal.aborted ? "cancelled" : "unavailable", attempts };
      }
      if (result.status === "permanent" || attempts >= normalized.maxAttempts) {
        return { status: "unavailable", attempts };
      }

      const delayMs = retryDelay(normalized, attempts);
      if (delayMs === undefined) {
        observe(normalized, { attempt: attempts, outcome: "permanent" });
        return { status: "unavailable", attempts };
      }
      const requiredBudget = delayMs + normalized.attemptTimeoutMs + normalized.responseReserveMs;
      if (operation.remainingMs() < requiredBudget) {
        observe(normalized, { attempt: attempts, outcome: "budget_exhausted" });
        return { status: "unavailable", attempts };
      }
      observe(normalized, { attempt: attempts, outcome: "retry_scheduled", delayMs });
      let delayResult: "elapsed" | "cancelled";
      try {
        delayResult = await runtime.delay(delayMs, operation.signal);
      } catch {
        return { status: "unavailable", attempts };
      }
      if (delayResult !== "elapsed") {
        observe(normalized, { attempt: attempts, outcome: "cancelled" });
        return { status: signal.aborted ? "cancelled" : "unavailable", attempts };
      }
      if (operation.remainingMs() < normalized.attemptTimeoutMs + normalized.responseReserveMs) {
        observe(normalized, { attempt: attempts, outcome: "budget_exhausted" });
        return { status: "unavailable", attempts };
      }
    }
    return { status: "unavailable", attempts };
  } finally {
    operation.dispose();
  }
}

export function runAsterSafeRead<T>(
  policy: AsterSafeReadPolicy,
  signal: AbortSignal,
  attempt: (signal: AbortSignal, attempt: number) => Promise<AsterSafeReadAttemptResult<T>>,
): Promise<AsterSafeReadResult<T>> {
  return executeSafeRead(policy, signal, attempt, defaultRuntime);
}

export function runAsterSafeReadWithRuntimeForTest<T>(
  policy: AsterSafeReadPolicy,
  signal: AbortSignal,
  attempt: (signal: AbortSignal, attempt: number) => Promise<AsterSafeReadAttemptResult<T>>,
  runtime: AsterSafeReadRuntime,
): Promise<AsterSafeReadResult<T>> {
  return executeSafeRead(policy, signal, attempt, runtime);
}
