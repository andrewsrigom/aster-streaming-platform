import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createAsterKafkaBrokerAdapter, type AsterKafkaBrokerAdapter } from "@aster/broker-kafka";
import {
  loadLocalCatalogDiscoveryCredential,
  loadLocalRouterTrust,
  type AsterLocalRouterTrust,
} from "@aster/http-express";
import { createAsterPostgresAdapter, type AsterPostgresAdapter } from "@aster/postgres";
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
import { createTitleProjector } from "./application/apply-title-snapshot.js";
import { createHomeRails } from "./application/home-rails.js";
import type { CatalogSnapshotSource } from "./application/catalog-event-ports.js";
import type { CatalogSnapshotExportSource } from "./application/rebuild-ports.js";
import { createProjectionRebuilder } from "./application/rebuild-projection.js";
import { createProjectionRebuildRunner } from "./application/run-projection-rebuild.js";
import { createTitleSearch } from "./application/search-titles.js";
import { projectionRefreshDue, projectionServiceable } from "./domain/rebuild-state.js";
import { createCatalogEventHandler } from "./infrastructure/catalog-event-handler.js";
import { createCatalogEventRuntime } from "./infrastructure/catalog-event-runtime.js";
import { createCatalogSnapshotClient } from "./infrastructure/catalog-snapshot-client.js";
import { createPostgresCatalogEvents } from "./infrastructure/postgres-catalog-events.js";
import { createPostgresProjectionUnitOfWork } from "./infrastructure/postgres-projection.js";
import { createPostgresHomeRailUnitOfWork } from "./infrastructure/postgres-rails.js";
import { createPostgresRebuildStore } from "./infrastructure/postgres-rebuild.js";
import { createPostgresSearchUnitOfWork } from "./infrastructure/postgres-search.js";
import { createProjectionRebuildRuntime } from "./infrastructure/projection-rebuild-runtime.js";
import { discoveryRuntimeConfiguration } from "./infrastructure/runtime-configuration.js";
import { probeDiscoveryStores } from "./infrastructure/store-readiness.js";
import { createDiscoverySubgraph } from "./transport/discovery-subgraph.js";
import { createDiscoveryHttpServer, type DiscoveryHttpServer } from "./transport/http-server.js";

interface RuntimeResources {
  readonly runtimeDatabase?: AsterPostgresAdapter;
  readonly projectorDatabase?: AsterPostgresAdapter;
  readonly broker?: AsterKafkaBrokerAdapter;
  readonly source?: CatalogSnapshotSource & CatalogSnapshotExportSource;
  readonly routerTrust?: AsterLocalRouterTrust;
  readonly telemetry?: AsterTelemetry;
  readonly logger?: AsterLogger;
  readonly terminate?: (code: number) => void;
}

export async function createDiscoveryService(
  environment: Readonly<Record<string, string | undefined>>,
  resources: RuntimeResources = {},
) {
  const config = discoveryRuntimeConfiguration(environment);
  const logger =
    resources.logger ??
    createAsterLogger({ service: "discovery", version: "0.0.0", environment: "local" });
  const telemetry =
    resources.telemetry ??
    createAsterTelemetry({
      serviceName: "discovery",
      serviceVersion: "0.0.0",
      environment: "local",
    });
  const databases: AsterPostgresAdapter[] = [];
  let runtimeDatabase: AsterPostgresAdapter;
  let projectorDatabase: AsterPostgresAdapter;
  try {
    runtimeDatabase =
      resources.runtimeDatabase ??
      createAsterPostgresAdapter({
        connectionString: config.connectionString,
        telemetry,
        // Four admitted GraphQL operations plus one readiness reservation.
        maxConnections: 5,
        connectionTimeoutMs: 1_000,
        statementTimeoutMs: 900,
        operationTimeoutMs: 1_000,
      });
    if (!resources.runtimeDatabase) {
      databases.push(runtimeDatabase);
    }
    projectorDatabase =
      resources.projectorDatabase ??
      createAsterPostgresAdapter({
        connectionString: config.projectorConnectionString,
        telemetry,
        maxConnections: 2,
        connectionTimeoutMs: 1_000,
        statementTimeoutMs: 1_200,
        operationTimeoutMs: 1_500,
      });
    if (!resources.projectorDatabase) {
      databases.push(projectorDatabase);
    }
  } catch (error) {
    await Promise.allSettled([
      ...databases.map((database) => database.close(AbortSignal.timeout(2_000))),
      telemetry.shutdown(AbortSignal.timeout(2_000)),
    ]);
    throw error;
  }

  let broker: AsterKafkaBrokerAdapter | undefined;
  let graph: Awaited<ReturnType<typeof createDiscoverySubgraph>> | undefined;
  try {
    const source =
      resources.source ??
      createCatalogSnapshotClient({ credential: await loadLocalCatalogDiscoveryCredential() });
    broker =
      resources.broker ??
      createAsterKafkaBrokerAdapter({
        brokers: ["broker:19092"],
        clientId: "aster-discovery-events",
        groupId: "aster-discovery-catalog-v1",
        telemetry,
        maxInFlightPublishes: 1,
        maxMessageBytes: 16_384,
        connectionTimeoutMs: 1_000,
        operationTimeoutMs: 2_000,
        closeTimeoutMs: 2_000,
        retryMaxAttempts: 2,
      });
    const rebuildStore = createPostgresRebuildStore(projectorDatabase);
    const rebuilder = createProjectionRebuilder({ store: rebuildStore });
    const projector = createTitleProjector({
      transactions: createPostgresProjectionUnitOfWork(projectorDatabase),
    });
    const events = createCatalogEventRuntime({
      broker,
      logger,
      handle: createCatalogEventHandler({
        source,
        projector,
        store: createPostgresCatalogEvents(projectorDatabase, randomUUID),
        now: () => Math.floor(Date.now() / 1_000),
        logger,
        telemetry,
        recordHandled: rebuilder.recordHandled,
      }),
    });
    const rebuildRunner = createProjectionRebuildRunner({
      store: rebuildStore,
      source,
      projector,
      events,
      now: () => Math.floor(Date.now() / 1_000),
      nextId: randomUUID,
    });
    const rebuildRuntime = createProjectionRebuildRuntime({
      logger,
      rebuild: rebuildRunner.execute,
      async needsRebuild(signal) {
        const building = await rebuildStore.building(signal);
        if (building.status !== "completed") {
          return { status: building.status };
        }
        if (building.value) {
          return { status: "completed", value: true };
        }
        const active = await rebuildStore.active(signal);
        if (active.status !== "completed") {
          return { status: active.status };
        }
        const due = projectionRefreshDue(active.value, Math.floor(Date.now() / 1_000));
        return due === undefined
          ? { status: "indeterminate" }
          : { status: "completed", value: due };
      },
    });
    graph = await createDiscoverySubgraph({
      routerTrust: resources.routerTrust ?? (await loadLocalRouterTrust("discovery")),
      home: createHomeRails({
        transactions: createPostgresHomeRailUnitOfWork(runtimeDatabase),
        monotonicNow: () => performance.now(),
        observe: (observation) => {
          telemetry.recordDiscoveryRail?.(observation);
        },
      }),
      search: createTitleSearch({
        transactions: createPostgresSearchUnitOfWork(runtimeDatabase),
        observeSample: (sample) => {
          telemetry.recordDiscoverySearchSample?.(sample);
        },
      }),
      now: () => Math.floor(Date.now() / 1_000),
      onOperation: (trace) =>
        logger.info({
          event: "aster.discovery.graphql_completed",
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
        logger.warn({ event: "aster.discovery.graphql_diagnostic", errorCategory: code }),
    });

    const startupController = new AbortController();
    let http: DiscoveryHttpServer | undefined;
    let binding: AsterProcessSignalBinding | undefined;
    const lifecycle = createAsterServiceLifecycle({
      shutdownDeadlineMs: 10_000,
      logger,
      stopTraffic: async (signal) => {
        startupController.abort();
        await http?.stopTraffic(signal);
      },
      stopConsumers: async () => {
        await Promise.all([monitor.stop(), rebuildRuntime.stop(), events.stop()]);
        await graph?.stop();
      },
      flushTelemetry: telemetry.lifecycleHooks().flushTelemetry,
      closeDependencies: async (signal) => {
        await events.close(signal);
        const results = await Promise.all([
          runtimeDatabase.close(signal),
          projectorDatabase.close(signal),
          telemetry.shutdown(signal),
        ]);
        if (
          results.some(
            (result) => result.status !== "completed" && result.status !== "already_completed",
          )
        ) {
          throw new Error("Discovery resource closure failed.");
        }
      },
      forceClose: () => {
        startupController.abort();
        http?.forceClose();
        void monitor.stop();
        void rebuildRuntime.stop();
        void events.stop();
        void graph?.stop();
        (resources.terminate ?? ((code) => process.exit(code)))(1);
      },
    });
    const readiness = createAsterReadinessController({ lifecycle, criticalDependencyCount: 3 });
    let previousReadiness = "pending";
    const checkReadiness = async (signal: AbortSignal): Promise<"ready" | "unavailable"> => {
      const storeStatus = await probeDiscoveryStores(
        runtimeDatabase,
        projectorDatabase,
        signal,
      ).catch(() => "unavailable" as const);
      const eventState = events.snapshot().state;
      const eventStatus = eventState === "idle" ? await events.check(signal) : eventState;
      const active = await rebuildStore.active(signal);
      const serviceable =
        active.status === "completed"
          ? projectionServiceable(active.value, Math.floor(Date.now() / 1_000))
          : undefined;
      const projectionStatus = serviceable === true ? "ready" : "unavailable";
      readiness.setCriticalDependencyState(0, storeStatus);
      readiness.setCriticalDependencyState(1, eventStatus === "ready" ? "ready" : "unavailable");
      readiness.setCriticalDependencyState(2, projectionStatus);
      const status =
        storeStatus === "ready" && eventStatus === "ready" && projectionStatus === "ready"
          ? "ready"
          : "unavailable";
      if (status !== previousReadiness) {
        previousReadiness = status;
        logger.info({
          event: "aster.discovery.readiness_changed",
          outcome: status === "ready" ? "ok" : "degraded",
          properties: [["state", status]],
        });
      }
      return status;
    };
    const monitor = createAsterReadinessMonitor({
      readiness,
      probes: [checkReadiness],
      intervalMs: 5_000,
      probeTimeoutMs: 2_500,
    });
    try {
      http = createDiscoveryHttpServer({
        host: config.host,
        port: config.port,
        health: () => readiness.health(),
        telemetry,
        onFatalError: () => void lifecycle.forceShutdown("stage_failure"),
        graphql: async (request, response, next) => {
          const work = readiness.tryBeginWork();
          if (!work) {
            response.set("Cache-Control", "no-store");
            response.status(503).json({
              errors: [{ message: "Discovery unavailable.", extensions: { code: "UNAVAILABLE" } }],
            });
            return;
          }
          try {
            await graph?.middleware(request, response, next);
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
        timeoutMs: 8_000,
        parentSignal: startupController.signal,
      });
      try {
        await server.listen(deadline.signal);
        await events.check(deadline.signal);
        events.start();
        rebuildRuntime.start();
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
  } catch (error) {
    await Promise.allSettled([
      graph?.stop(),
      broker?.close(AbortSignal.timeout(2_000)),
      runtimeDatabase.close(AbortSignal.timeout(2_000)),
      projectorDatabase.close(AbortSignal.timeout(2_000)),
      telemetry.shutdown(AbortSignal.timeout(2_000)),
    ]);
    throw error;
  }
}
