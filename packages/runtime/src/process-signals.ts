import type {
  AsterServiceLifecycle,
  AsterShutdownResult,
  AsterShutdownTrigger,
} from "./service-lifecycle.js";

export type AsterProcessSignal = "SIGINT" | "SIGTERM";
export type AsterProcessSignalDisposalResult = "disposed" | "unchanged";

export interface AsterProcessSignalBinding {
  completion(): Promise<AsterShutdownResult> | undefined;
  dispose(): AsterProcessSignalDisposalResult;
}

export interface AsterProcessSignalBindingIssue {
  readonly reason: "already_bound" | "registration_failed";
}

export class AsterProcessSignalBindingError extends Error {
  readonly code = "ASTER_PROCESS_SIGNAL_BINDING_INVALID";
  readonly issues: readonly AsterProcessSignalBindingIssue[];

  constructor(issues: readonly AsterProcessSignalBindingIssue[]) {
    super("Process signal binding is invalid.");
    this.name = "AsterProcessSignalBindingError";
    this.issues = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
  }
}

interface AsterProcessSignalTarget {
  exitCode: null | number | string | undefined;
  off(signal: AsterProcessSignal, listener: () => void): unknown;
  on(signal: AsterProcessSignal, listener: () => void): unknown;
}

const activeTargets = new WeakSet<object>();

function safeRemove(
  target: AsterProcessSignalTarget,
  signal: AsterProcessSignal,
  listener: () => void,
): void {
  try {
    target.off(signal, listener);
  } catch {
    // Disposal remains best effort because signal cleanup must not extend shutdown.
  }
}

function bindAsterProcessSignalsToTarget(
  lifecycle: AsterServiceLifecycle,
  target: AsterProcessSignalTarget,
): AsterProcessSignalBinding {
  if (activeTargets.has(target)) {
    throw new AsterProcessSignalBindingError([{ reason: "already_bound" }]);
  }

  let disposed = false;
  let installedSigint = false;
  let installedSigterm = false;
  let shutdownCompletion: Promise<AsterShutdownResult> | undefined;

  const dispose = (): AsterProcessSignalDisposalResult => {
    if (disposed) {
      return "unchanged";
    }
    disposed = true;
    if (installedSigint) {
      safeRemove(target, "SIGINT", onSigint);
    }
    if (installedSigterm) {
      safeRemove(target, "SIGTERM", onSigterm);
    }
    activeTargets.delete(target);
    return "disposed";
  };

  const onSignal = (signal: AsterShutdownTrigger, conventionalExitCode: number): void => {
    if (shutdownCompletion) {
      void lifecycle.forceShutdown("repeated_signal").catch(() => undefined);
      return;
    }
    try {
      target.exitCode = conventionalExitCode;
    } catch {
      // Exit-code assignment is advisory; bounded shutdown remains authoritative.
    }
    shutdownCompletion = lifecycle.shutdown(signal);
    void shutdownCompletion.then(dispose, dispose);
  };

  function onSigint(): void {
    onSignal("sigint", 130);
  }

  function onSigterm(): void {
    onSignal("sigterm", 143);
  }

  activeTargets.add(target);
  try {
    target.on("SIGINT", onSigint);
    installedSigint = true;
    target.on("SIGTERM", onSigterm);
    installedSigterm = true;
  } catch {
    dispose();
    throw new AsterProcessSignalBindingError([{ reason: "registration_failed" }]);
  }

  return Object.freeze({
    completion: () => shutdownCompletion,
    dispose,
  });
}

export function bindAsterProcessSignals(
  lifecycle: AsterServiceLifecycle,
): AsterProcessSignalBinding {
  return bindAsterProcessSignalsToTarget(lifecycle, process);
}

export const bindAsterProcessSignalsToTargetForTest = bindAsterProcessSignalsToTarget;
