import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { createExpressHttpAdapter } from "@aster/http-express";
import { createAsterNodeHttpLifecycleHooks, type AsterReadinessSnapshot } from "@aster/runtime";
import {
  ASTER_HTTP_METHODS,
  ASTER_HTTP_ROUTES,
  type AsterHttpMethod,
  type AsterHttpRoute,
  type AsterTelemetry,
} from "@aster/telemetry";

import type { AsterIdentityHttpPort } from "../reference-runtime.js";

export interface IdentityHttpServerOptions {
  readonly host: "127.0.0.1" | "0.0.0.0";
  readonly port: number;
  readonly health: () => AsterReadinessSnapshot;
  readonly telemetry: Pick<AsterTelemetry, "startHttpRequest">;
  readonly onFatalError: () => void;
}

export interface IdentityHttpServer extends AsterIdentityHttpPort {
  forceClose(): void;
  port(): number | undefined;
}

function observeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  telemetry: Pick<AsterTelemetry, "startHttpRequest">,
): void {
  const method = request.method;
  const route = request.url?.split("?", 1)[0];
  if (
    !ASTER_HTTP_METHODS.some((value) => value === method) ||
    !ASTER_HTTP_ROUTES.some((value) => value === route)
  ) {
    return;
  }
  try {
    const started = telemetry.startHttpRequest({
      method: method as AsterHttpMethod,
      route: route as AsterHttpRoute,
    });
    if (started.status !== "started") {
      return;
    }
    const complete = (): void => {
      response.off("finish", complete);
      response.off("close", complete);
      try {
        started.observation.complete({
          statusCode: response.statusCode,
          outcome: !response.writableFinished
            ? "cancelled"
            : response.statusCode >= 500
              ? "error"
              : response.statusCode >= 400
                ? "rejected"
                : "success",
        });
      } catch {
        // Optional instrumentation cannot change the HTTP response or resource cleanup.
      }
    };
    response.once("finish", complete);
    response.once("close", complete);
  } catch {
    // The HTTP boundary remains available when instrumentation fails.
  }
}

export function createIdentityHttpServer(options: IdentityHttpServerOptions): IdentityHttpServer {
  const adapter = createExpressHttpAdapter({ healthSnapshotProvider: options.health });
  const server = createServer(
    {
      maxHeaderSize: 16_384,
      requestTimeout: 10_000,
      headersTimeout: 5_000,
      keepAliveTimeout: 5_000,
      connectionsCheckingInterval: 1_000,
    },
    (request, response) => {
      observeRequest(request, response, options.telemetry);
      adapter.requestListener(request, response);
    },
  );
  server.maxConnections = 128;
  server.maxRequestsPerSocket = 100;
  server.setTimeout(10_000, (socket) => socket.destroy());
  const hooks = createAsterNodeHttpLifecycleHooks(server);
  const binding = new AbortController();
  let hasListened = false;
  let stopping = false;
  let startup: Promise<void> | undefined;

  server.on("error", () => {
    if (hasListened && !stopping) {
      options.onFatalError();
    }
  });

  return Object.freeze({
    listen(signal: AbortSignal): Promise<void> {
      if (startup) {
        return startup;
      }
      if (stopping || signal.aborted) {
        return Promise.reject(new Error("Identity HTTP startup was cancelled."));
      }
      startup = new Promise<void>((resolve, reject) => {
        const cleanup = (): void => {
          signal.removeEventListener("abort", onAbort);
          server.off("error", onError);
          server.off("listening", onListening);
        };
        const onError = (): void => {
          cleanup();
          binding.abort();
          reject(new Error("Identity HTTP listener could not start."));
        };
        const onAbort = (): void => {
          cleanup();
          binding.abort();
          reject(new Error("Identity HTTP startup was cancelled."));
        };
        const onListening = (): void => {
          hasListened = true;
          // The startup dependency deadline must not close an already-live health listener.
          cleanup();
          resolve();
        };
        signal.addEventListener("abort", onAbort, { once: true });
        server.once("error", onError);
        server.once("listening", onListening);
        try {
          server.listen({ host: options.host, port: options.port, signal: binding.signal });
        } catch {
          onError();
        }
      });
      return startup;
    },
    async stopTraffic(signal: AbortSignal): Promise<void> {
      stopping = true;
      if (!hasListened) {
        binding.abort();
        return;
      }
      await hooks.stopTraffic(signal);
    },
    forceClose(): void {
      stopping = true;
      if (!hasListened) {
        binding.abort();
        return;
      }
      hooks.forceClose();
    },
    port(): number | undefined {
      const address = server.address();
      return address && typeof address === "object" ? address.port : undefined;
    },
  });
}
