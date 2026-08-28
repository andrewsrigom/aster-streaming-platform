import { createAsterPostgresAdapter, type AsterPostgresAdapter } from "@aster/postgres";
import {
  loadLocalRouterTrust,
  loadLocalCatalogPlaybackCredential,
  type AsterLocalRouterTrust,
} from "@aster/http-express";
import { randomUUID } from "node:crypto";
import {
  bindAsterProcessSignals,
  createAsterDeadline,
  createAsterLogger,
  createAsterReadinessController,
  createAsterReadinessMonitor,
  createAsterServiceLifecycle,
  type AsterLogger,
  type AsterProcessSignalBinding,
} from "@aster/runtime";
import { createAsterTelemetry, type AsterTelemetry } from "@aster/telemetry";
import { createPlaybackSessions } from "./application/create-session.js";
import type { PlaybackSessionPorts } from "./application/session-ports.js";
import { playbackRuntimeConfiguration } from "./infrastructure/runtime-configuration.js";
import { createPostgresPlaybackSessions } from "./infrastructure/postgres-sessions.js";
import { createCatalogPublicationClient } from "./infrastructure/catalog-publication-client.js";
import { probePlaybackStore } from "./infrastructure/store-readiness.js";
import { createPlaybackSubgraph } from "./transport/playback-subgraph.js";
import { createPlaybackHttpServer, type PlaybackHttpServer } from "./transport/http-server.js";

interface RuntimeResources {
  readonly database?: AsterPostgresAdapter;
  readonly catalog?: PlaybackSessionPorts["catalog"];
  readonly routerTrust?: AsterLocalRouterTrust;
  readonly telemetry?: AsterTelemetry;
  readonly logger?: AsterLogger;
  readonly terminate?: (code: number) => void;
}

export async function createPlaybackService(
  environment: Readonly<Record<string, string | undefined>>,
  resources: RuntimeResources = {},
) {
  const config = playbackRuntimeConfiguration(environment);
  const logger =
    resources.logger ??
    createAsterLogger({ service: "playback", version: "0.0.0", environment: "local" });
  const telemetry =
    resources.telemetry ??
    createAsterTelemetry({
      serviceName: "playback",
      serviceVersion: "0.0.0",
      environment: "local",
    });
  let database: AsterPostgresAdapter;
  try {
    database =
      resources.database ??
      createAsterPostgresAdapter({
        connectionString: config.connectionString,
        telemetry,
        maxConnections: 4,
        connectionTimeoutMs: 1000,
        statementTimeoutMs: 900,
        operationTimeoutMs: 1000,
      });
  } catch (error) {
    await telemetry.shutdown(AbortSignal.timeout(2000));
    throw error;
  }
  let catalog: PlaybackSessionPorts["catalog"];
  let graph: Awaited<ReturnType<typeof createPlaybackSubgraph>>;
  try {
    catalog =
      resources.catalog ??
      createCatalogPublicationClient({
        credential: await loadLocalCatalogPlaybackCredential(),
      });
    graph = await createPlaybackSubgraph({
      routerTrust: resources.routerTrust ?? (await loadLocalRouterTrust("playback")),
      sessions: createPlaybackSessions({
        catalog,
        sessions: createPostgresPlaybackSessions(database),
        now: () => Math.floor(Date.now() / 1000),
        nextId: randomUUID,
        allowLocalMedia: true,
      }),
      onOperation: (trace) => {
        logger.info({
          event: "aster.playback.graphql_completed",
          operation: trace.operation,
          requestId: trace.correlationId,
          durationMs: trace.durationMs,
          outcome: trace.code === "COMPLETED" ? "ok" : "rejected",
          properties: [
            ["code", trace.code],
            ["trace_id", trace.traceId],
            ["span_id", trace.spanId],
          ],
        });
      },
      onDiagnostic: (code) => {
        logger.warn({ event: "aster.playback.graphql_diagnostic", errorCategory: code });
      },
    });
  } catch (error) {
    await Promise.allSettled([
      database.close(AbortSignal.timeout(2000)),
      telemetry.shutdown(AbortSignal.timeout(2000)),
    ]);
    throw error;
  }
  const startupController = new AbortController();
  let http: PlaybackHttpServer | undefined;
  let binding: AsterProcessSignalBinding | undefined;
  const lifecycle = createAsterServiceLifecycle({
    shutdownDeadlineMs: 10000,
    logger,
    stopTraffic: async (signal) => {
      startupController.abort();
      await http?.stopTraffic(signal);
    },
    stopConsumers: async () => {
      await monitor.stop();
      await graph.stop();
    },
    flushTelemetry: telemetry.lifecycleHooks().flushTelemetry,
    closeDependencies: async (signal) => {
      const results = await Promise.all([database.close(signal), telemetry.shutdown(signal)]);
      if (
        results.some(
          (result) => result.status !== "completed" && result.status !== "already_completed",
        )
      ) {
        throw new Error("Playback resource closure failed.");
      }
    },
    forceClose: () => {
      startupController.abort();
      http?.forceClose();
      void monitor.stop();
      void graph.stop();
      // A forced deadline is a process boundary, not permission to retain orphaned sockets.
      (resources.terminate ?? ((code) => process.exit(code)))(1);
    },
  });
  const readiness = createAsterReadinessController({ lifecycle, criticalDependencyCount: 1 });
  let previousReadiness = "pending";
  const checkReadiness = async (signal: AbortSignal): Promise<"ready" | "unavailable"> => {
    const [storeStatus, ownerStatus] = await Promise.all([
      probePlaybackStore(database, signal).catch(() => "unavailable" as const),
      catalog.currentPublication("00000000-0000-4000-8000-000000000000", signal).then(
        (result) => (result.status === "completed" ? ("ready" as const) : ("unavailable" as const)),
        () => "unavailable" as const,
      ),
    ]);
    const status = storeStatus === "ready" && ownerStatus === "ready" ? "ready" : "unavailable";
    readiness.setCriticalDependencyState(0, status);
    if (status !== previousReadiness) {
      previousReadiness = status;
      logger.info({
        event: "aster.playback.readiness_changed",
        outcome: status === "ready" ? "ok" : "degraded",
        properties: [["state", status]],
      });
    }
    return status;
  };
  const monitor = createAsterReadinessMonitor({
    readiness,
    probes: [checkReadiness],
    intervalMs: 5000,
    probeTimeoutMs: 2500,
  });
  try {
    http = createPlaybackHttpServer({
      host: config.host,
      port: config.port,
      health: () => readiness.health(),
      telemetry,
      onFatalError: () => {
        void lifecycle.forceShutdown("stage_failure");
      },
      graphql: async (request, response, next) => {
        const work = readiness.tryBeginWork();
        if (!work) {
          response.set("Cache-Control", "no-store");
          response.status(503).json({
            errors: [{ message: "Playback unavailable.", extensions: { code: "UNAVAILABLE" } }],
          });
          return;
        }
        try {
          await graph.middleware(request, response, next);
        } finally {
          work.complete();
        }
      },
    });
  } catch (error) {
    await lifecycle.shutdown();
    throw error;
  }
  const server = http;
  let starting: Promise<"ready" | "degraded" | "failed" | "stopped"> | undefined;
  const start = async (): Promise<"ready" | "degraded" | "failed" | "stopped"> => {
    const deadline = createAsterDeadline({
      timeoutMs: 8000,
      parentSignal: startupController.signal,
    });
    try {
      await server.listen(deadline.signal);
      const status = await checkReadiness(deadline.signal);
      if (startupController.signal.aborted) {
        return "stopped";
      }
      lifecycle.markReady();
      monitor.start();
      return status === "ready" ? "ready" : "degraded";
    } catch {
      if (startupController.signal.aborted) {
        return "stopped";
      }
      lifecycle.markStartupFailed();
      await lifecycle.shutdown();
      return "failed";
    } finally {
      deadline.dispose();
    }
  };
  return Object.freeze({
    health: () => readiness.health(),
    port: () => server.port(),
    checkReadiness,
    start: () => {
      starting ??= start();
      return starting;
    },
    async shutdown() {
      try {
        return await lifecycle.shutdown();
      } finally {
        binding?.dispose();
      }
    },
    bindProcessSignals() {
      binding ??= bindAsterProcessSignals(lifecycle);
      return binding;
    },
  });
}
