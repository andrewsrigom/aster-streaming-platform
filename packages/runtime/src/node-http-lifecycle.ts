import type { AsterForceClose, AsterShutdownHook } from "./service-lifecycle.js";

const MAX_PROTOTYPE_DEPTH = 12;

export interface AsterNodeHttpServer {
  close(callback: (error?: Error) => void): unknown;
  closeAllConnections(): void;
}

export interface AsterNodeHttpLifecycleHooks {
  readonly forceClose: AsterForceClose;
  readonly stopTraffic: AsterShutdownHook;
}

export interface AsterNodeHttpLifecycleIssue {
  readonly option: "server";
  readonly reason: "internal" | "invalid";
}

export class AsterNodeHttpLifecycleError extends Error {
  readonly code = "ASTER_NODE_HTTP_LIFECYCLE_INVALID";
  readonly issues: readonly AsterNodeHttpLifecycleIssue[];

  constructor(issues: readonly AsterNodeHttpLifecycleIssue[]) {
    super("Node.js HTTP lifecycle configuration is invalid.");
    this.name = "AsterNodeHttpLifecycleError";
    this.issues = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
  }
}

function isObject(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function bindDataMethod(
  receiver: object,
  name: "close" | "closeAllConnections",
): (...arguments_: unknown[]) => unknown {
  let current: object | null = receiver;
  for (let depth = 0; current && depth < MAX_PROTOTYPE_DEPTH; depth += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(current, name);
    if (descriptor) {
      if (!("value" in descriptor) || typeof descriptor.value !== "function") {
        throw new AsterNodeHttpLifecycleError([{ option: "server", reason: "invalid" }]);
      }
      return (...arguments_: unknown[]): unknown =>
        Reflect.apply(descriptor.value as (...values: unknown[]) => unknown, receiver, arguments_);
    }
    const prototype: unknown = Object.getPrototypeOf(current);
    current = isObject(prototype) ? prototype : null;
  }
  throw new AsterNodeHttpLifecycleError([{ option: "server", reason: "invalid" }]);
}

export function createAsterNodeHttpLifecycleHooks(
  server: AsterNodeHttpServer,
): AsterNodeHttpLifecycleHooks {
  if (!isObject(server) || Array.isArray(server)) {
    throw new AsterNodeHttpLifecycleError([{ option: "server", reason: "invalid" }]);
  }

  let invokeClose: (...arguments_: unknown[]) => unknown;
  let invokeCloseAllConnections: (...arguments_: unknown[]) => unknown;
  try {
    invokeClose = bindDataMethod(server, "close");
    invokeCloseAllConnections = bindDataMethod(server, "closeAllConnections");
  } catch (error) {
    if (error instanceof AsterNodeHttpLifecycleError) {
      throw error;
    }
    throw new AsterNodeHttpLifecycleError([{ option: "server", reason: "internal" }]);
  }

  let closePromise: Promise<void> | undefined;
  let forceCloseStarted = false;

  const startClose = (): Promise<void> => {
    if (closePromise) {
      return closePromise;
    }
    closePromise = new Promise<void>((resolve, reject) => {
      try {
        invokeClose((error?: Error): void => {
          if (error) {
            reject(new Error("Node.js HTTP server close failed."));
            return;
          }
          resolve();
        });
      } catch {
        reject(new Error("Node.js HTTP server close failed."));
      }
    });
    void closePromise.catch(() => undefined);
    return closePromise;
  };

  return Object.freeze({
    forceClose(): void {
      if (forceCloseStarted) {
        return;
      }
      forceCloseStarted = true;
      void startClose();
      invokeCloseAllConnections();
    },
    stopTraffic: async (): Promise<void> => {
      await startClose();
    },
  });
}
