import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ASTER_READINESS_CRITICAL_DEPENDENCY_MAX,
  AsterReadinessError,
  createAsterReadinessController,
  createAsterServiceLifecycle,
  type AsterReadinessControllerOptions,
  type AsterServiceHealthSnapshot,
  type AsterServiceLifecycle,
} from "../src/index.js";

const noopHook = (): Promise<void> => Promise.resolve();
const noopForceClose = (): void => undefined;

function createLifecycle(): AsterServiceLifecycle {
  return createAsterServiceLifecycle({
    forceClose: noopForceClose,
    stopTraffic: noopHook,
  });
}

function captureReadinessError(input: unknown): AsterReadinessError {
  try {
    createAsterReadinessController(input as AsterReadinessControllerOptions);
  } catch (error) {
    assert.equal(error instanceof AsterReadinessError, true);
    return error as AsterReadinessError;
  }
  assert.fail("Expected readiness initialization to fail");
}

function readyHealth(): AsterServiceHealthSnapshot {
  return Object.freeze({
    liveness: "live",
    phase: "ready",
    readiness: "ready",
    reason: "ready",
  });
}

test("rejects missing, unknown, accessor-backed, and excessive readiness options", () => {
  const lifecycle = createLifecycle();
  assert.deepEqual(captureReadinessError(undefined).issues, [
    { option: "<options>", reason: "invalid" },
  ]);
  assert.deepEqual(captureReadinessError({ lifecycle }).issues, [
    { option: "criticalDependencyCount", reason: "missing" },
  ]);
  assert.deepEqual(captureReadinessError({ criticalDependencyCount: 2 }).issues, [
    { option: "lifecycle", reason: "missing" },
  ]);

  const unknown = captureReadinessError({
    criticalDependencyCount: 2,
    lifecycle,
    secretDependencyName: "private-database-topology",
  });
  assert.deepEqual(unknown.issues, [{ option: "<options>", reason: "invalid" }]);
  assert.doesNotMatch(JSON.stringify(unknown), /private-database-topology/u);

  let getterReads = 0;
  const accessorOptions = { lifecycle };
  Object.defineProperty(accessorOptions, "criticalDependencyCount", {
    enumerable: true,
    get(): number {
      getterReads += 1;
      return 2;
    },
  });
  assert.deepEqual(captureReadinessError(accessorOptions).issues, [
    { option: "<options>", reason: "invalid" },
  ]);
  assert.equal(getterReads, 0);

  for (const criticalDependencyCount of [
    0,
    1.5,
    Number.NaN,
    ASTER_READINESS_CRITICAL_DEPENDENCY_MAX + 1,
  ]) {
    assert.deepEqual(captureReadinessError({ criticalDependencyCount, lifecycle }).issues, [
      { option: "criticalDependencyCount", reason: "invalid" },
    ]);
  }
});

test("requires lifecycle operations as own data properties without invoking accessors", () => {
  let getterReads = 0;
  const lifecycle = {
    tryBeginWork: (): undefined => undefined,
  };
  Object.defineProperty(lifecycle, "health", {
    enumerable: true,
    get(): () => AsterServiceHealthSnapshot {
      getterReads += 1;
      return readyHealth;
    },
  });

  assert.deepEqual(captureReadinessError({ criticalDependencyCount: 1, lifecycle }).issues, [
    { option: "lifecycle", reason: "invalid" },
  ]);
  assert.equal(getterReads, 0);
});

test("keeps lifecycle and dependency readiness separate through failure and recovery", () => {
  const lifecycle = createLifecycle();
  const readiness = createAsterReadinessController({
    criticalDependencyCount: 2,
    lifecycle,
  });

  assert.deepEqual(readiness.health(), {
    liveness: "live",
    phase: "starting",
    readiness: "not_ready",
    reason: "starting",
  });
  assert.equal(Object.isFrozen(readiness.health()), true);
  assert.equal(readiness.setCriticalDependencyState(0, "ready"), "applied");
  assert.equal(lifecycle.markReady(), "applied");
  assert.deepEqual(readiness.health(), {
    liveness: "live",
    phase: "ready",
    readiness: "not_ready",
    reason: "dependency_pending",
  });

  assert.equal(readiness.setCriticalDependencyState(1, "unavailable"), "applied");
  assert.deepEqual(readiness.health(), {
    liveness: "live",
    phase: "ready",
    readiness: "not_ready",
    reason: "dependency_unavailable",
  });
  assert.equal(lifecycle.health().phase, "ready");

  assert.equal(readiness.setCriticalDependencyState(1, "ready"), "applied");
  assert.deepEqual(readiness.health(), {
    liveness: "live",
    phase: "ready",
    readiness: "ready",
    reason: "ready",
  });
  assert.equal(readiness.setCriticalDependencyState(0, "unavailable"), "applied");
  assert.equal(readiness.health().reason, "dependency_unavailable");
  assert.equal(readiness.setCriticalDependencyState(0, "ready"), "applied");
  assert.equal(readiness.health().readiness, "ready");
});

test("unavailable dominates pending without exposing dependency identity", () => {
  const lifecycle = createLifecycle();
  const readiness = createAsterReadinessController({
    criticalDependencyCount: 2,
    lifecycle,
  });
  lifecycle.markReady();
  readiness.setCriticalDependencyState(1, "unavailable");

  const snapshot = readiness.health();
  assert.deepEqual(Reflect.ownKeys(snapshot).sort(), ["liveness", "phase", "readiness", "reason"]);
  assert.equal(snapshot.reason, "dependency_unavailable");
  assert.doesNotMatch(JSON.stringify(snapshot), /postgres|redis|dependencyIndex/u);
});

test("returns stable transition outcomes for invalid, repeated, and terminal updates", async () => {
  const lifecycle = createLifecycle();
  const readiness = createAsterReadinessController({
    criticalDependencyCount: 1,
    lifecycle,
  });

  assert.equal(readiness.setCriticalDependencyState(-1, "ready"), "rejected");
  assert.equal(readiness.setCriticalDependencyState(1, "ready"), "rejected");
  assert.equal(readiness.setCriticalDependencyState(0.5, "ready"), "rejected");
  assert.equal(readiness.setCriticalDependencyState(0, "unknown" as "ready"), "rejected");
  assert.equal(readiness.setCriticalDependencyState(0, "pending"), "unchanged");
  assert.equal(readiness.setCriticalDependencyState(0, "ready"), "applied");
  lifecycle.markReady();

  const shutdown = lifecycle.shutdown();
  assert.equal(readiness.setCriticalDependencyState(0, "unavailable"), "rejected");
  assert.deepEqual(readiness.health(), {
    liveness: "live",
    phase: "draining",
    readiness: "not_ready",
    reason: "draining",
  });
  await shutdown;
  assert.equal(readiness.setCriticalDependencyState(0, "ready"), "rejected");
  assert.equal(readiness.health().reason, "stopped");
});

test("delegates work leases only while lifecycle and every critical gate are ready", async () => {
  const lifecycle = createLifecycle();
  const readiness = createAsterReadinessController({
    criticalDependencyCount: 2,
    lifecycle,
  });

  assert.equal(readiness.tryBeginWork(), undefined);
  lifecycle.markReady();
  assert.equal(readiness.tryBeginWork(), undefined);
  readiness.setCriticalDependencyState(0, "ready");
  assert.equal(readiness.tryBeginWork(), undefined);
  readiness.setCriticalDependencyState(1, "ready");

  const lease = readiness.tryBeginWork();
  assert.ok(lease);
  assert.equal(Object.isFrozen(lease), true);
  assert.equal(lease.complete(), "completed");
  assert.equal(lease.complete(), "already_completed");

  readiness.setCriticalDependencyState(1, "unavailable");
  assert.equal(readiness.tryBeginWork(), undefined);
  await lifecycle.shutdown();
});

test("fails closed for malformed or throwing lifecycle providers", () => {
  let snapshotGetterReads = 0;
  const hostileSnapshot = {};
  Object.defineProperty(hostileSnapshot, "phase", {
    enumerable: true,
    get(): string {
      snapshotGetterReads += 1;
      return "ready";
    },
  });
  const malformed = createAsterReadinessController({
    criticalDependencyCount: 1,
    lifecycle: {
      health: () => hostileSnapshot as AsterServiceHealthSnapshot,
      tryBeginWork: () => undefined,
    },
  });
  assert.deepEqual(malformed.health(), {
    liveness: "not_live",
    phase: "failed",
    readiness: "not_ready",
    reason: "startup_failed",
  });
  assert.equal(snapshotGetterReads, 0);
  assert.equal(malformed.setCriticalDependencyState(0, "ready"), "rejected");

  const throwing = createAsterReadinessController({
    criticalDependencyCount: 1,
    lifecycle: {
      health(): AsterServiceHealthSnapshot {
        throw new Error("private-provider-detail");
      },
      tryBeginWork(): undefined {
        throw new Error("private-provider-detail");
      },
    },
  });
  assert.equal(throwing.health().reason, "startup_failed");
  assert.equal(throwing.tryBeginWork(), undefined);
  assert.doesNotMatch(JSON.stringify(throwing.health()), /private-provider-detail/u);
});

test("captures lifecycle operations at construction and sanitizes invalid work leases", () => {
  let healthCalls = 0;
  const lifecycle = {
    health(): AsterServiceHealthSnapshot {
      healthCalls += 1;
      return readyHealth();
    },
    tryBeginWork: (): { unexpected: string } => ({ unexpected: "private-lease-detail" }),
  };
  const readiness = createAsterReadinessController({
    criticalDependencyCount: 1,
    lifecycle: lifecycle as unknown as Pick<AsterServiceLifecycle, "health" | "tryBeginWork">,
  });
  lifecycle.health = (): AsterServiceHealthSnapshot => {
    throw new Error("replacement-must-not-run");
  };
  readiness.setCriticalDependencyState(0, "ready");

  assert.equal(readiness.health().readiness, "ready");
  assert.equal(healthCalls > 0, true);
  assert.equal(readiness.tryBeginWork(), undefined);
});

test("readiness declarations contain only repository-owned runtime contracts", async () => {
  const declaration = await readFile(new URL("../src/readiness.d.ts", import.meta.url), "utf8");
  assert.match(declaration, /AsterReadinessController/u);
  assert.doesNotMatch(declaration, /express|pg|redis|kafka|opentelemetry|pino/u);
});
