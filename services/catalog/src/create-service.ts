import { createAsterPostgresAdapter, type AsterPostgresAdapter } from "@aster/postgres";
import { createAsterRedisAdapter, type AsterRedisAdapter } from "@aster/redis";
import { createLocalEventDelivery, type EventDeliveryLifecycle } from "@aster/event-delivery";
import {
  loadLocalRouterTrust,
  loadLocalCatalogPlaybackTrust,
  loadLocalCatalogDiscoveryTrust,
  createLocalEngagementReadTrust,
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
import { createCatalogPublicQueries } from "./application/public-queries.js";
import { createCachedCatalogPublicEntities } from "./application/public-cache.js";
import { createCatalogPlaybackQueries } from "./application/playback-queries.js";
import { createCatalogEngagementQueries } from "./application/engagement-queries.js";
import { createCatalogDiscoveryQueries } from "./application/discovery-queries.js";
import { catalogRuntimeConfiguration } from "./infrastructure/runtime-configuration.js";
import {
  createPostgresCatalogPublic,
  createPostgresCatalogPublicEntitySource,
} from "./infrastructure/persistence/postgres-public.js";
import { createRedisCatalogPublicCache } from "./infrastructure/cache/redis-public-cache.js";
import {
  catalogCacheDigest,
  catalogCacheToken,
} from "./infrastructure/cache/node-cache-primitives.js";
import { probeCatalogReader } from "./infrastructure/persistence/reader-readiness.js";
import { createPostgresCatalogDiscovery } from "./infrastructure/persistence/postgres-discovery.js";
import { probeCatalogDiscoveryReader } from "./infrastructure/persistence/discovery-readiness.js";
import { createCatalogSubgraph } from "./transport/catalog-subgraph.js";
import { createCatalogHttpServer, type CatalogHttpServer } from "./transport/http-server.js";

interface RuntimeResources {
  readonly database?: AsterPostgresAdapter;
  readonly discoveryDatabase?: AsterPostgresAdapter;
  readonly redis?: AsterRedisAdapter;
  readonly routerTrust?: AsterLocalRouterTrust;
  readonly discoveryTrust?: AsterLocalRouterTrust;
  readonly telemetry?: AsterTelemetry;
  readonly logger?: AsterLogger;
  readonly terminate?: (code: number) => void;
  readonly eventDelivery?: EventDeliveryLifecycle;
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
  let discoveryDatabase: AsterPostgresAdapter | undefined;
  try {
    if (config.discoveryRead) {
      discoveryDatabase =
        resources.discoveryDatabase ??
        createAsterPostgresAdapter({
          connectionString: config.discoveryConnectionString,
          telemetry,
          maxConnections: 1,
          connectionTimeoutMs: 1000,
          statementTimeoutMs: 1000,
          operationTimeoutMs: 2000,
        });
    }
  } catch (error) {
    await Promise.allSettled([
      database.close(AbortSignal.timeout(2000)),
      telemetry.shutdown(AbortSignal.timeout(2000)),
    ]);
    throw error;
  }
  let redis: AsterRedisAdapter | undefined;
  try {
    if (config.cache) {
      redis =
        resources.redis ??
        createAsterRedisAdapter({
          url: config.redisUrl,
          telemetry,
          maxInFlightCommands: 32,
          connectionTimeoutMs: 1_000,
          operationTimeoutMs: 250,
          closeTimeoutMs: 1_000,
          reconnectMaxAttempts: 3,
          reconnectBaseDelayMs: 50,
        });
    }
  } catch (error) {
    await Promise.allSettled([
      discoveryDatabase?.close(AbortSignal.timeout(2000)),
      database.close(AbortSignal.timeout(2000)),
      telemetry.shutdown(AbortSignal.timeout(2000)),
    ]);
    throw error;
  }
  let graph: Awaited<ReturnType<typeof createCatalogSubgraph>>;
  let events: EventDeliveryLifecycle | undefined;
  try {
    if (config.events) {
      events =
        resources.eventDelivery ??
        (await createLocalEventDelivery({
          owner: "catalog",
          connectionString: config.connectionString,
          telemetry,
          logger,
        }));
    }
    graph = await createCatalogSubgraph({
      ...(config.routerTrust
        ? { routerTrust: resources.routerTrust ?? (await loadLocalRouterTrust("catalog")) }
        : {}),
      ...(config.engagementRead
        ? {
            engagement: {
              trust: createLocalEngagementReadTrust(
                "catalog",
                await loadLocalEngagementReadCredential("catalog"),
              ),
              queries: createCatalogEngagementQueries({
                transactions: createPostgresCatalogPublic(database),
                policy: { commercial: true, allowLocalMedia: true },
                now: () => Math.floor(Date.now() / 1000),
              }),
            },
          }
        : {}),
      ...(config.playbackRead
        ? {
            playback: {
              trust: await loadLocalCatalogPlaybackTrust(),
              queries: createCatalogPlaybackQueries({
                transactions: createPostgresCatalogPublic(database),
                policy: { commercial: true, allowLocalMedia: true },
                now: () => Math.floor(Date.now() / 1000),
              }),
            },
          }
        : {}),
      ...(config.discoveryRead && discoveryDatabase
        ? {
            discovery: {
              trust: resources.discoveryTrust ?? (await loadLocalCatalogDiscoveryTrust()),
              queries: createCatalogDiscoveryQueries({
                transactions: createPostgresCatalogDiscovery(discoveryDatabase),
                policy: { commercial: true, allowLocalMedia: true },
                now: () => Math.floor(Date.now() / 1000),
              }),
            },
          }
        : {}),
      queries: createCatalogPublicQueries({
        transactions: createPostgresCatalogPublic(database),
        ...(redis
          ? {
              entities: createCachedCatalogPublicEntities({
                environment: config.environment,
                source: createPostgresCatalogPublicEntitySource(database),
                cache: createRedisCatalogPublicCache(redis),
                digest: catalogCacheDigest,
                token: catalogCacheToken,
                record: (observation) => {
                  telemetry.recordCacheOperation?.({
                    cache: "catalog_public_title",
                    ...observation,
                  });
                },
              }),
            }
          : {}),
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
      events?.close(AbortSignal.timeout(2000)),
      redis?.close(AbortSignal.timeout(2000)),
      discoveryDatabase?.close(AbortSignal.timeout(2000)),
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
      await Promise.all([
        monitor.stop(),
        discoveryMonitor?.stop(),
        cacheMonitor?.stop(),
        events?.stop(),
      ]);
      await graph.stop();
    },
    flushTelemetry: telemetry.lifecycleHooks().flushTelemetry,
    closeDependencies: async (signal) => {
      await events?.close(signal);
      const results = await Promise.all([
        database.close(signal),
        ...(discoveryDatabase ? [discoveryDatabase.close(signal)] : []),
        ...(redis ? [redis.close(signal)] : []),
        telemetry.shutdown(signal),
      ]);
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
      void cacheMonitor?.stop();
      void graph.stop();
      void redis?.close(AbortSignal.timeout(250));
      // A forced deadline is a process boundary, not permission to retain orphaned sockets.
      (resources.terminate ?? ((code) => process.exit(code)))(1);
    },
  });
  const readiness = createAsterReadinessController({ lifecycle, criticalDependencyCount: 1 });
  let previousReadiness = "pending";
  let previousDiscoveryReadiness = "pending";
  let previousCacheReadiness = "pending";
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
  const checkDiscoveryReadiness = async (
    signal: AbortSignal,
  ): Promise<"disabled" | "ready" | "unavailable"> => {
    if (!discoveryDatabase) {
      return "disabled";
    }
    let status: "ready" | "unavailable" = "unavailable";
    try {
      status = await probeCatalogDiscoveryReader(discoveryDatabase, signal);
    } catch {
      /* Optional dependency failures are sanitized below. */
    }
    if (status !== previousDiscoveryReadiness) {
      previousDiscoveryReadiness = status;
      logger.info({
        event: "aster.catalog.discovery_readiness_changed",
        outcome: status === "ready" ? "ok" : "degraded",
        properties: [["state", status]],
      });
    }
    return status;
  };
  const checkCacheReadiness = async (
    signal: AbortSignal,
  ): Promise<"disabled" | "ready" | "unavailable"> => {
    if (!redis) {
      return "disabled";
    }
    let status: "ready" | "unavailable" = "unavailable";
    try {
      const result = redis.snapshot().ready
        ? await redis.probe(signal)
        : await redis.connect(signal);
      status = result.status === "completed" ? "ready" : "unavailable";
    } catch {
      /* Optional cache failure is sanitized and retried by its monitor. */
    }
    if (status !== previousCacheReadiness) {
      previousCacheReadiness = status;
      logger.info({
        event: "aster.catalog.cache_readiness_changed",
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
  const discoveryMonitor = discoveryDatabase
    ? createAsterReadinessMonitor({
        readiness: { setCriticalDependencyState: () => "applied" },
        probes: [
          async (signal) => {
            const status = await checkDiscoveryReadiness(signal);
            return status === "ready" ? "ready" : "unavailable";
          },
        ],
        intervalMs: 5000,
        probeTimeoutMs: 2500,
      })
    : undefined;
  const cacheMonitor = redis
    ? createAsterReadinessMonitor({
        readiness: { setCriticalDependencyState: () => "applied" },
        probes: [
          async (signal) =>
            (await checkCacheReadiness(signal)) === "ready" ? "ready" : "unavailable",
        ],
        intervalMs: 5_000,
        probeTimeoutMs: 1_500,
      })
    : undefined;
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
      const [status] = await Promise.all([
        checkReadiness(deadline.signal),
        checkCacheReadiness(deadline.signal),
      ]);
      if (startupController.signal.aborted) {
        return "stopped";
      }
      lifecycle.markReady();
      monitor.start();
      discoveryMonitor?.start();
      cacheMonitor?.start();
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
    checkDiscoveryReadiness,
    checkCacheReadiness,
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
