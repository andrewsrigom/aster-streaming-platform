import { createHash, randomUUID } from "node:crypto";
import { createLocalEventDelivery, type EventDeliveryLifecycle } from "@aster/event-delivery";
import { createAsterPostgresAdapter, type AsterPostgresAdapter } from "@aster/postgres";
import {
  loadLocalRouterTrust,
  loadLocalEngagementReadCredential,
  type AsterLocalRouterTrust,
} from "@aster/http-express";
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
import { createProgressRecorder } from "./application/record-progress.js";
import { createProgressQueries } from "./application/read-progress.js";
import { createWatchlistQueries } from "./application/read-watchlist.js";
import { createWatchlistWriter } from "./application/set-watchlist.js";
import { createEngagementFieldQueries } from "./application/read-engagement-fields.js";
import { createPostgresEngagementFields } from "./infrastructure/postgres-engagement-fields.js";
import { createPostgresWatchlist } from "./infrastructure/postgres-watchlist.js";
import { createPostgresProgressRead } from "./infrastructure/postgres-progress-read.js";
import type { ProgressPorts, ProgressCatalog } from "./application/progress-ports.js";
import { DEFAULT_PROGRESS_POLICY } from "./domain/progress.js";
import { createPostgresProgress } from "./infrastructure/postgres-progress.js";
import { createProgressOwnerClients } from "./infrastructure/owner-clients.js";
import { engagementRuntimeConfiguration } from "./infrastructure/runtime-configuration.js";
import { probeEngagementStore } from "./infrastructure/store-readiness.js";
import { createIdentityEventHandler } from "./infrastructure/identity-event-handler.js";
import { createEngagementSubgraph } from "./transport/engagement-subgraph.js";
import { createEngagementHttpServer, type EngagementHttpServer } from "./transport/http-server.js";

interface RuntimeResources {
  readonly database?: AsterPostgresAdapter;
  readonly owners?: Pick<ProgressPorts, "identity" | "playback"> &
    Readonly<{ catalog: ProgressCatalog }>;
  readonly routerTrust?: AsterLocalRouterTrust;
  readonly telemetry?: AsterTelemetry;
  readonly logger?: AsterLogger;
  readonly terminate?: (code: number) => void;
  readonly eventDelivery?: EventDeliveryLifecycle;
}
export async function createEngagementService(
  environment: Readonly<Record<string, string | undefined>>,
  resources: RuntimeResources = {},
) {
  const config = engagementRuntimeConfiguration(environment);
  const logger =
    resources.logger ??
    createAsterLogger({ service: "engagement", version: "0.0.0", environment: "local" });
  const telemetry =
    resources.telemetry ??
    createAsterTelemetry({
      serviceName: "engagement",
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
  let graph: Awaited<ReturnType<typeof createEngagementSubgraph>>;
  let events: EventDeliveryLifecycle | undefined;
  try {
    if (config.events) {
      events =
        resources.eventDelivery ??
        (await createLocalEventDelivery({
          owner: "engagement",
          connectionString: config.connectionString,
          telemetry,
          logger,
          identityConsumer: (store, credential) =>
            createIdentityEventHandler(store, credential, logger, telemetry),
        }));
    }
    const owners =
      resources.owners ??
      createProgressOwnerClients({
        identityCredential: await loadLocalEngagementReadCredential("identity"),
        playbackCredential: await loadLocalEngagementReadCredential("playback"),
        catalogCredential: await loadLocalEngagementReadCredential("catalog"),
      });
    const watchlistPorts = {
      identity: owners.identity,
      catalog: owners.catalog,
      store: createPostgresWatchlist(database),
      now: () => Math.floor(Date.now() / 1000),
      nextId: randomUUID,
      digest: (value: string) => createHash("sha256").update(value).digest("hex"),
    };
    graph = await createEngagementSubgraph({
      routerTrust: resources.routerTrust ?? (await loadLocalRouterTrust("engagement")),
      fields: createEngagementFieldQueries({
        identity: owners.identity,
        catalog: owners.catalog,
        store: createPostgresEngagementFields(database),
        now: watchlistPorts.now,
      }),
      watchlist: {
        writer: createWatchlistWriter(watchlistPorts),
        queries: createWatchlistQueries(watchlistPorts),
      },
      recorder: createProgressRecorder({
        ...owners,
        ...createPostgresProgress(database),
        now: () => Math.floor(Date.now() / 1000),
        nextId: randomUUID,
        digest: (value) => createHash("sha256").update(value).digest("hex"),
        policy: DEFAULT_PROGRESS_POLICY,
        limits: { receiptSeconds: 3600, maximumReceipts: 1024, maximumOutbox: 1024 },
      }),
      queries: createProgressQueries({
        identity: owners.identity,
        catalog: owners.catalog,
        store: createPostgresProgressRead(database),
        now: () => Math.floor(Date.now() / 1000),
      }),
      onOperation: (trace) =>
        logger.info({
          event: "aster.engagement.graphql_completed",
          operation: trace.operation,
          requestId: trace.correlationId,
          durationMs: trace.durationMs,
          outcome: trace.code === "COMPLETED" ? "ok" : "rejected",
          properties: [
            ["code", trace.code],
            ["trace_id", trace.traceId],
            ["span_id", trace.spanId],
          ],
        }),
      onDiagnostic: (code) =>
        logger.warn({ event: "aster.engagement.graphql_diagnostic", errorCategory: code }),
    });
  } catch (error) {
    await Promise.allSettled([
      events?.close(AbortSignal.timeout(2000)),
      database.close(AbortSignal.timeout(2000)),
      telemetry.shutdown(AbortSignal.timeout(2000)),
    ]);
    throw error;
  }
  const startupController = new AbortController();
  let http: EngagementHttpServer | undefined;
  let binding: AsterProcessSignalBinding | undefined;
  const lifecycle = createAsterServiceLifecycle({
    shutdownDeadlineMs: 10000,
    logger,
    stopTraffic: async (signal) => {
      startupController.abort();
      await http?.stopTraffic(signal);
    },
    stopConsumers: async () => {
      await Promise.all([monitor.stop(), events?.stop()]);
      await graph.stop();
    },
    flushTelemetry: telemetry.lifecycleHooks().flushTelemetry,
    closeDependencies: async (signal) => {
      await events?.close(signal);
      const results = await Promise.all([database.close(signal), telemetry.shutdown(signal)]);
      if (
        results.some(
          (result) => result.status !== "completed" && result.status !== "already_completed",
        )
      ) {
        throw new Error("Engagement resource closure failed.");
      }
    },
    forceClose: () => {
      startupController.abort();
      http?.forceClose();
      void monitor.stop();
      void graph.stop();
      (resources.terminate ?? ((code) => process.exit(code)))(1);
    },
  });
  const readiness = createAsterReadinessController({ lifecycle, criticalDependencyCount: 1 });
  let previousReadiness = "pending";
  // Owners are current per-request checks. Their failure rejects a save, never health/media traffic.
  const checkReadiness = async (signal: AbortSignal): Promise<"ready" | "unavailable"> => {
    const status = await probeEngagementStore(database, signal).catch(() => "unavailable" as const);
    readiness.setCriticalDependencyState(0, status);
    if (status !== previousReadiness) {
      previousReadiness = status;
      logger.info({
        event: "aster.engagement.readiness_changed",
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
    probeTimeoutMs: 1500,
  });
  try {
    http = createEngagementHttpServer({
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
            errors: [{ message: "Engagement unavailable.", extensions: { code: "UNAVAILABLE" } }],
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
      events?.start();
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
