import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { createExpressHttpAdapter, type AsterExpressGraphqlMiddleware } from "@aster/http-express";
import { createAsterNodeHttpLifecycleHooks, type AsterReadinessSnapshot } from "@aster/runtime";
import {
  ASTER_HTTP_METHODS,
  ASTER_HTTP_ROUTES,
  type AsterHttpMethod,
  type AsterHttpObservation,
  type AsterHttpRoute,
  type AsterTelemetry,
} from "@aster/telemetry";

export interface CatalogHttpServerOptions {
  readonly host: "127.0.0.1" | "0.0.0.0";
  readonly port: number;
  readonly health: () => AsterReadinessSnapshot;
  readonly telemetry: Pick<AsterTelemetry, "startHttpRequest">;
  readonly onFatalError: () => void;
  readonly graphql?: AsterExpressGraphqlMiddleware;
}

export interface CatalogHttpServer {
  listen(signal: AbortSignal): Promise<void>;
  stopTraffic(signal: AbortSignal): Promise<void>;
  forceClose(): void;
  port(): number | undefined;
}

function observeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  telemetry: Pick<AsterTelemetry, "startHttpRequest">,
): AsterHttpObservation | undefined {
  const method = request.method;
  const route = request.url?.split("?", 1)[0];
  if (
    !ASTER_HTTP_METHODS.some((value) => value === method) ||
    !ASTER_HTTP_ROUTES.some((value) => value === route)
  ) {
    return undefined;
  }
  try {
    const started = telemetry.startHttpRequest({
      method: method as AsterHttpMethod,
      route: route as AsterHttpRoute,
      ...(typeof request.headers["traceparent"] === "string"
        ? { traceparent: request.headers["traceparent"] }
        : {}),
    });
    if (started.status !== "started") {
      return undefined;
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
    return started.observation;
  } catch {
    // The HTTP boundary remains available when instrumentation fails.
    return undefined;
  }
}

export function createCatalogHttpServer(options: CatalogHttpServerOptions): CatalogHttpServer {
  const adapter = createExpressHttpAdapter({ healthSnapshotProvider: options.health });
  if (options.graphql) {
    adapter.mountGraphql(options.graphql);
  }
  const server = createServer(
    {
      maxHeaderSize: 16_384,
      requestTimeout: 10_000,
      headersTimeout: 5_000,
      keepAliveTimeout: 5_000,
      connectionsCheckingInterval: 1_000,
    },
    (request, response) => {
      const observation = observeRequest(request, response, options.telemetry);
      const serve = (): void => {
        adapter.requestListener(request, response);
      };
      if (observation?.run) {
        observation.run(serve);
      } else {
        serve();
      }
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
        return Promise.reject(new Error("Catalog HTTP startup was cancelled."));
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
          reject(new Error("Catalog HTTP listener could not start."));
        };
        const onAbort = (): void => {
          cleanup();
          binding.abort();
          reject(new Error("Catalog HTTP startup was cancelled."));
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
