import type {
  AsterInFlightCompletionResult,
  AsterInFlightWork,
  AsterLifecyclePhase,
  AsterServiceHealthSnapshot,
  AsterServiceLifecycle,
} from "./service-lifecycle.js";

const ABSENT = Symbol("absent");

export const ASTER_READINESS_CRITICAL_DEPENDENCY_MAX = 32;

export const ASTER_CRITICAL_DEPENDENCY_STATES = Object.freeze([
  "pending",
  "ready",
  "unavailable",
] as const);

export type AsterCriticalDependencyState = (typeof ASTER_CRITICAL_DEPENDENCY_STATES)[number];
export type AsterReadinessTransitionResult = "applied" | "rejected" | "unchanged";
export type AsterReadinessReason =
  AsterServiceHealthSnapshot["reason"] | "dependency_pending" | "dependency_unavailable";

export interface AsterReadinessSnapshot {
  readonly phase: AsterLifecyclePhase;
  readonly liveness: AsterServiceHealthSnapshot["liveness"];
  readonly readiness: AsterServiceHealthSnapshot["readiness"];
  readonly reason: AsterReadinessReason;
}

export interface AsterReadinessControllerOptions {
  readonly criticalDependencyCount: number;
  readonly lifecycle: Pick<AsterServiceLifecycle, "health" | "tryBeginWork">;
}

export interface AsterReadinessController {
  health(): AsterReadinessSnapshot;
  setCriticalDependencyState(
    dependencyIndex: number,
    state: AsterCriticalDependencyState,
  ): AsterReadinessTransitionResult;
  tryBeginWork(): AsterInFlightWork | undefined;
}

export interface AsterReadinessIssue {
  readonly option: "<options>" | "criticalDependencyCount" | "lifecycle";
  readonly reason: "internal" | "invalid" | "missing";
}

export class AsterReadinessError extends Error {
  readonly code = "ASTER_READINESS_INVALID_OPTIONS";
  readonly issues: readonly AsterReadinessIssue[];

  constructor(issues: readonly AsterReadinessIssue[]) {
    super(
      `Runtime readiness configuration is invalid (${issues.length} issue${issues.length === 1 ? "" : "s"}).`,
    );
    this.name = "AsterReadinessError";
    this.issues = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
  }
}

interface NormalizedLifecycle {
  health(): unknown;
  tryBeginWork(): unknown;
}

interface NormalizedReadinessOptions {
  readonly criticalDependencyCount: number;
  readonly lifecycle: NormalizedLifecycle;
}

const OPTION_KEYS = new Set<PropertyKey>(["criticalDependencyCount", "lifecycle"]);
const HEALTH_KEYS = new Set<PropertyKey>(["liveness", "phase", "readiness", "reason"]);

const SNAPSHOTS = Object.freeze({
  dependencyPending: freezeSnapshot("ready", "live", "not_ready", "dependency_pending"),
  dependencyUnavailable: freezeSnapshot("ready", "live", "not_ready", "dependency_unavailable"),
  draining: freezeSnapshot("draining", "live", "not_ready", "draining"),
  failed: freezeSnapshot("failed", "not_live", "not_ready", "startup_failed"),
  ready: freezeSnapshot("ready", "live", "ready", "ready"),
  starting: freezeSnapshot("starting", "live", "not_ready", "starting"),
  stopped: freezeSnapshot("stopped", "not_live", "not_ready", "stopped"),
});

function freezeSnapshot(
  phase: AsterLifecyclePhase,
  liveness: AsterReadinessSnapshot["liveness"],
  readiness: AsterReadinessSnapshot["readiness"],
  reason: AsterReadinessReason,
): AsterReadinessSnapshot {
  return Object.freeze({ liveness, phase, readiness, reason });
}

function configurationError(
  option: AsterReadinessIssue["option"],
  reason: AsterReadinessIssue["reason"],
): AsterReadinessError {
  return new AsterReadinessError([{ option, reason }]);
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
  option: AsterReadinessIssue["option"],
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

function normalizeLifecycle(candidate: unknown): NormalizedLifecycle {
  if (!isObject(candidate) || !hasPlainPrototype(candidate)) {
    throw configurationError("lifecycle", "invalid");
  }
  const health = ownDataValue(candidate, "health", "lifecycle");
  const tryBeginWork = ownDataValue(candidate, "tryBeginWork", "lifecycle");
  if (health === ABSENT || tryBeginWork === ABSENT) {
    throw configurationError("lifecycle", "missing");
  }
  if (typeof health !== "function" || typeof tryBeginWork !== "function") {
    throw configurationError("lifecycle", "invalid");
  }
  return Object.freeze({
    health: (): unknown => Reflect.apply(health, candidate, []),
    tryBeginWork: (): unknown => Reflect.apply(tryBeginWork, candidate, []),
  });
}

function normalizeOptions(input: AsterReadinessControllerOptions): NormalizedReadinessOptions {
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

  const criticalDependencyCount = ownDataValue(input, "criticalDependencyCount", "<options>");
  if (criticalDependencyCount === ABSENT) {
    throw configurationError("criticalDependencyCount", "missing");
  }
  if (
    typeof criticalDependencyCount !== "number" ||
    !Number.isSafeInteger(criticalDependencyCount) ||
    criticalDependencyCount < 1 ||
    criticalDependencyCount > ASTER_READINESS_CRITICAL_DEPENDENCY_MAX
  ) {
    throw configurationError("criticalDependencyCount", "invalid");
  }

  const lifecycle = ownDataValue(input, "lifecycle", "<options>");
  if (lifecycle === ABSENT) {
    throw configurationError("lifecycle", "missing");
  }

  return {
    criticalDependencyCount,
    lifecycle: normalizeLifecycle(lifecycle),
  };
}

function safeOwnDataValue(object: object, key: PropertyKey): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    return descriptor && "value" in descriptor ? descriptor.value : ABSENT;
  } catch {
    return ABSENT;
  }
}

function readLifecyclePhase(lifecycle: NormalizedLifecycle): AsterLifecyclePhase | undefined {
  let candidate: unknown;
  try {
    candidate = lifecycle.health();
  } catch {
    return undefined;
  }
  if (!isObject(candidate) || !hasPlainPrototype(candidate)) {
    return undefined;
  }

  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(candidate);
  } catch {
    return undefined;
  }
  if (keys.length !== HEALTH_KEYS.size || keys.some((key) => !HEALTH_KEYS.has(key))) {
    return undefined;
  }

  const phase = safeOwnDataValue(candidate, "phase");
  const liveness = safeOwnDataValue(candidate, "liveness");
  const readiness = safeOwnDataValue(candidate, "readiness");
  const reason = safeOwnDataValue(candidate, "reason");
  const expected =
    phase === "starting"
      ? SNAPSHOTS.starting
      : phase === "ready"
        ? SNAPSHOTS.ready
        : phase === "draining"
          ? SNAPSHOTS.draining
          : phase === "failed"
            ? SNAPSHOTS.failed
            : phase === "stopped"
              ? SNAPSHOTS.stopped
              : undefined;

  return expected &&
    liveness === expected.liveness &&
    readiness === expected.readiness &&
    reason === expected.reason
    ? expected.phase
    : undefined;
}

function validDependencyState(value: unknown): value is AsterCriticalDependencyState {
  return value === "pending" || value === "ready" || value === "unavailable";
}

function normalizeWorkLease(candidate: unknown): AsterInFlightWork | undefined {
  if (!isObject(candidate) || !hasPlainPrototype(candidate)) {
    return undefined;
  }
  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(candidate);
  } catch {
    return undefined;
  }
  if (keys.length !== 1 || keys[0] !== "complete") {
    return undefined;
  }
  const complete = safeOwnDataValue(candidate, "complete");
  if (typeof complete !== "function") {
    return undefined;
  }

  let completed = false;
  return Object.freeze({
    complete(): AsterInFlightCompletionResult {
      if (completed) {
        return "already_completed";
      }
      completed = true;
      try {
        const result: unknown = Reflect.apply(complete, candidate, []);
        return result === "completed" ? "completed" : "already_completed";
      } catch {
        return "already_completed";
      }
    },
  });
}

export function createAsterReadinessController(
  input: AsterReadinessControllerOptions,
): AsterReadinessController {
  let options: NormalizedReadinessOptions;
  try {
    options = normalizeOptions(input);
  } catch (error) {
    if (error instanceof AsterReadinessError) {
      throw error;
    }
    throw configurationError("<options>", "internal");
  }

  const states = Array.from(
    { length: options.criticalDependencyCount },
    (): AsterCriticalDependencyState => "pending",
  );

  const health = (): AsterReadinessSnapshot => {
    const phase = readLifecyclePhase(options.lifecycle);
    if (!phase) {
      return SNAPSHOTS.failed;
    }
    if (phase !== "ready") {
      return SNAPSHOTS[phase];
    }
    if (states.includes("unavailable")) {
      return SNAPSHOTS.dependencyUnavailable;
    }
    if (states.includes("pending")) {
      return SNAPSHOTS.dependencyPending;
    }
    return SNAPSHOTS.ready;
  };

  return Object.freeze({
    health,
    setCriticalDependencyState(
      dependencyIndex: number,
      state: AsterCriticalDependencyState,
    ): AsterReadinessTransitionResult {
      if (
        !Number.isSafeInteger(dependencyIndex) ||
        dependencyIndex < 0 ||
        dependencyIndex >= states.length ||
        !validDependencyState(state)
      ) {
        return "rejected";
      }
      const phase = readLifecyclePhase(options.lifecycle);
      if (phase !== "starting" && phase !== "ready") {
        return "rejected";
      }
      if (states[dependencyIndex] === state) {
        return "unchanged";
      }
      states[dependencyIndex] = state;
      return "applied";
    },
    tryBeginWork(): AsterInFlightWork | undefined {
      if (health().readiness !== "ready") {
        return undefined;
      }
      try {
        return normalizeWorkLease(options.lifecycle.tryBeginWork());
      } catch {
        return undefined;
      }
    },
  });
}
