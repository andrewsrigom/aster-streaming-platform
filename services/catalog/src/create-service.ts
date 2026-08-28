import { createAsterPostgresAdapter, type AsterPostgresAdapter } from "@aster/postgres";
import { loadLocalRouterTrust } from "@aster/http-express";
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
import { createCatalogPublicQueries } from "./application/public-queries.js";
import { catalogRuntimeConfiguration } from "./infrastructure/runtime-configuration.js";
import { createPostgresCatalogPublic } from "./infrastructure/persistence/postgres-public.js";
import { probeCatalogReader } from "./infrastructure/persistence/reader-readiness.js";
import { createCatalogSubgraph } from "./transport/catalog-subgraph.js";
import { createCatalogHttpServer, type CatalogHttpServer } from "./transport/http-server.js";

interface RuntimeResources {
  readonly database?: AsterPostgresAdapter;
  readonly telemetry?: AsterTelemetry;
  readonly logger?: AsterLogger;
  readonly terminate?: (code: number) => void;
}

export async function createCatalogService(
  environment: Readonly<Record<string, string | undefined>>,
  resources: RuntimeResources = {},
) {
  const config = catalogRuntimeConfiguration(environment);
  const logger =
    resources.logger ??
    createAsterLogger({ service: "catalog", version: "0.0.0", environment: "local" });
  const telemetry =
    resources.telemetry ??
    createAsterTelemetry({ serviceName: "catalog", serviceVersion: "0.0.0", environment: "local" });
  let database: AsterPostgresAdapter;
  try {
    database =
      resources.database ??
      createAsterPostgresAdapter({
        connectionString: config.connectionString,
        telemetry,
        maxConnections: 4,
        connectionTimeoutMs: 1000,
        statementTimeoutMs: 1000,
        operationTimeoutMs: 3000,
      });
  } catch (error) {
    await telemetry.shutdown(AbortSignal.timeout(2000));
    throw error;
  }
  let graph: Awaited<ReturnType<typeof createCatalogSubgraph>>;
  try {
    graph = await createCatalogSubgraph({
      ...(config.routerTrust ? { routerTrust: await loadLocalRouterTrust("catalog") } : {}),
      queries: createCatalogPublicQueries({
        transactions: createPostgresCatalogPublic(database),
        policy: { commercial: true, allowLocalMedia: true },
        now: () => Math.floor(Date.now() / 1000),
      }),
      onOperation: (trace) => {
        logger.info({
          event: "aster.catalog.graphql_completed",
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
        logger.warn({ event: "aster.catalog.graphql_diagnostic", errorCategory: code });
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
  let http: CatalogHttpServer | undefined;
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
        throw new Error("Catalog resource closure failed.");
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
    let status: "ready" | "unavailable" = "unavailable";
    try {
      status = await probeCatalogReader(database, signal);
    } catch {
      /* Dependency failures are sanitized below. */
    }
    readiness.setCriticalDependencyState(0, status);
    if (status !== previousReadiness) {
      previousReadiness = status;
      logger.info({
        event: "aster.catalog.readiness_changed",
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
    probeTimeoutMs: 3500,
  });
  try {
    http = createCatalogHttpServer({
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
            errors: [{ message: "Catalog unavailable.", extensions: { code: "UNAVAILABLE" } }],
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
