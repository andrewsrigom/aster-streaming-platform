import { performance } from "node:perf_hooks";
import { createLocalEventDelivery } from "@aster/event-delivery";

import { loadReferenceRuntimeConfig, type ReferenceRuntimeConfigSourceEntry } from "@aster/config";
import { createAsterPostgresAdapter, type AsterPostgresAdapter } from "@aster/postgres";
import { createAsterRedisAdapter } from "@aster/redis";
import {
  createAsterDeadline,
  createAsterLogger,
  createAsterSystemClock,
  createAsterUuidGenerator,
  type AsterForceShutdownReason,
  type AsterShutdownResult,
  type AsterShutdownTrigger,
} from "@aster/runtime";
import { createAsterTelemetry } from "@aster/telemetry";

import {
  createAsterIdentityRuntime,
  type AsterIdentityDependencyPort,
  type AsterIdentityRuntime,
  type AsterIdentityStartupResult,
} from "./reference-runtime.js";
import { createIdentityHttpServer } from "./transport/http-server.js";
import { createLocalIdentityProduct } from "./create-local-product.js";

const SERVICE_VERSION = "0.0.0";
const CLEANUP_DEADLINE_MS = 10_000;

type CloseResult = Readonly<{ status: string }>;
interface OwnedClose {
  close(signal: AbortSignal): Promise<void>;
  isClosed(): boolean;
}
interface DependencyAdapter {
  connect(signal?: AbortSignal): Promise<Readonly<{ status: string }>>;
  probe(signal?: AbortSignal): Promise<Readonly<{ status: string }>>;
  close(signal?: AbortSignal): Promise<CloseResult>;
  readonly transaction?: AsterPostgresAdapter["transaction"];
}

// Internal factory seams are trusted composition code, never caller/environment configuration.
export interface IdentityServiceFactories {
  readonly clock: typeof createAsterSystemClock;
  readonly identifiers: typeof createAsterUuidGenerator;
  readonly logger: typeof createAsterLogger;
  readonly telemetry: typeof createAsterTelemetry;
  readonly postgresql: (
    options: Parameters<typeof createAsterPostgresAdapter>[0],
  ) => DependencyAdapter;
  readonly redis: (options: Parameters<typeof createAsterRedisAdapter>[0]) => DependencyAdapter;
  readonly http: typeof createIdentityHttpServer;
  readonly runtime: typeof createAsterIdentityRuntime;
  readonly terminate: (exitCode: number) => void;
}

const defaultFactories: IdentityServiceFactories = {
  clock: createAsterSystemClock,
  identifiers: createAsterUuidGenerator,
  logger: createAsterLogger,
  telemetry: createAsterTelemetry,
  postgresql: createAsterPostgresAdapter,
  redis: createAsterRedisAdapter,
  http: createIdentityHttpServer,
  runtime: createAsterIdentityRuntime,
  terminate: (exitCode) => process.exit(exitCode),
};

export class AsterIdentityCompositionError extends Error {
  readonly code = "ASTER_IDENTITY_COMPOSITION_FAILED";

  constructor() {
    super("Identity runtime composition failed.");
    this.name = "AsterIdentityCompositionError";
  }
}

function ownClose(operation: (signal: AbortSignal) => Promise<CloseResult>): OwnedClose {
  let closed = false;
  return {
    isClosed: () => closed,
    async close(signal): Promise<void> {
      if (closed) {
        return;
      }
      const result = await operation(signal);
      if (result.status !== "completed" && result.status !== "already_completed") {
        throw new Error("Identity resource closure did not complete.");
      }
      closed = true;
    },
  };
}

function dependencyPort(
  adapter: DependencyAdapter,
  owner: OwnedClose,
): AsterIdentityDependencyPort {
  return {
    connect: async (signal) =>
      (await adapter.connect(signal)).status === "completed" ? "ready" : "unavailable",
    probe: async (signal) =>
      (await adapter.probe(signal)).status === "completed" ? "ready" : "unavailable",
    close: (signal) => owner.close(signal),
  };
}

async function closePartialResources(owners: readonly OwnedClose[]): Promise<boolean> {
  const deadline = createAsterDeadline({ timeoutMs: CLEANUP_DEADLINE_MS });
  // Construction may have failed before opening any referenced handle. Keep only this cleanup alive.
  const keepAlive = setTimeout(() => undefined, CLEANUP_DEADLINE_MS);
  let onAbort: (() => void) | undefined;
  try {
    await Promise.race([
      Promise.allSettled(owners.map((owner) => owner.close(deadline.signal))),
      new Promise<void>((resolve) => {
        onAbort = () => {
          resolve();
        };
        deadline.signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
    return owners.every((owner) => owner.isClosed());
  } finally {
    if (onAbort) {
      deadline.signal.removeEventListener("abort", onAbort);
    }
    clearTimeout(keepAlive);
    deadline.dispose();
  }
}

export async function createIdentityServiceWithFactories(
  entries: readonly ReferenceRuntimeConfigSourceEntry[],
  overrides: Partial<IdentityServiceFactories> = {},
): Promise<AsterIdentityRuntime> {
  const configuration = loadReferenceRuntimeConfig(entries);
  const factories = { ...defaultFactories, ...overrides };
  const owners: OwnedClose[] = [];
  try {
    const clock = factories.clock();
    const identifiers = factories.identifiers();
    const logger = factories.logger({
      service: configuration.serviceName,
      version: SERVICE_VERSION,
      environment: configuration.environment,
    });
    const telemetry = factories.telemetry({
      serviceName: configuration.serviceName,
      serviceVersion: SERVICE_VERSION,
      environment: configuration.environment === "integration" ? "test" : configuration.environment,
      ...(configuration.otlpMetricsEndpoint === undefined
        ? { export: { mode: "none" as const } }
        : {
            export: {
              mode: "otlp-http" as const,
              endpoint: configuration.otlpMetricsEndpoint,
              intervalMs: 5_000,
              timeoutMs: 1_000,
            },
            shutdownTimeoutMs: 2_000,
          }),
    });
    const telemetryOwner = ownClose((signal) => telemetry.shutdown(signal));
    owners.push(telemetryOwner);
    const postgresql = factories.postgresql({
      connectionString: configuration.databaseUrl,
      telemetry,
    });
    const postgresqlOwner = ownClose((signal) => postgresql.close(signal));
    owners.push(postgresqlOwner);
    let product: Awaited<ReturnType<typeof createLocalIdentityProduct>> | undefined;
    let productOwner: OwnedClose | undefined;
    if (configuration.localDemo) {
      const transaction = postgresql.transaction;
      if (!transaction) {
        throw new AsterIdentityCompositionError();
      }
      product = await createLocalIdentityProduct(
        configuration,
        { transaction },
        clock,
        identifiers,
        logger,
      );
      const ownedProduct = product;
      productOwner = ownClose(async () => {
        await ownedProduct.stop();
        return { status: "completed" };
      });
      owners.push(productOwner);
    }
    const redis = factories.redis({ url: configuration.redisUrl, telemetry });
    const redisOwner = ownClose((signal) => redis.close(signal));
    owners.push(redisOwner);
    const events = configuration.localDemo?.eventDelivery
      ? await createLocalEventDelivery({
          owner: "identity",
          connectionString: configuration.databaseUrl,
          telemetry,
          logger,
        })
      : undefined;
    const eventOwner = events
      ? ownClose(async (signal) => {
          await events.close(signal);
          return { status: "completed" };
        })
      : undefined;
    if (eventOwner) {
      owners.push(eventOwner);
    }
    const enforceTerminalFallback = (result: AsterShutdownResult): AsterShutdownResult => {
      if (result.failedStages.includes("force_close")) {
        factories.terminate(
          result.trigger === "sigint" ? 130 : result.trigger === "sigterm" ? 143 : 1,
        );
      }
      return result;
    };
    const http = factories.http({
      host: configuration.httpHost,
      port: configuration.httpPort,
      telemetry,
      health: () => runtime.health(),
      onFatalError: () => {
        process.exitCode = 1;
        void runtime.forceShutdown().then(enforceTerminalFallback, () => {
          factories.terminate(1);
        });
      },
      ...(product
        ? {
            graphql: async (request, response, next) => {
              const lease = runtime.tryBeginWork();
              if (!lease) {
                response
                  .set("Cache-Control", "no-store")
                  .status(503)
                  .json({
                    errors: [
                      { message: "Identity unavailable.", extensions: { code: "UNAVAILABLE" } },
                    ],
                  });
                return;
              }
              try {
                await product.middleware(request, response, next);
              } finally {
                lease.complete();
              }
            },
          }
        : {}),
    });
    const httpOwner = ownClose(async (signal) => {
      await Promise.all([http.stopTraffic(signal), productOwner?.close(signal)]);
      return { status: "completed" };
    });
    owners.push(httpOwner);
    const runtime = factories.runtime({
      ...(events && eventOwner
        ? {
            events: {
              start: () => {
                events.start();
              },
              stop: () => events.stop(),
              close: (signal: AbortSignal) => eventOwner.close(signal),
            },
          }
        : {}),
      startupDeadlineMs: configuration.startupDeadlineMs,
      logger,
      postgresql: {
        ...dependencyPort(postgresql, postgresqlOwner),
        probe: (signal) =>
          product
            ? product.probe(signal)
            : dependencyPort(postgresql, postgresqlOwner).probe(signal),
      },
      redis: dependencyPort(redis, redisOwner),
      http: {
        listen: (signal) => http.listen(signal),
        stopTraffic: (signal) => httpOwner.close(signal),
      },
      telemetry: {
        async flush(signal): Promise<void> {
          const result = await telemetry.forceFlush(signal);
          if (result.status !== "completed" && result.status !== "already_completed") {
            throw new Error("Identity telemetry flush did not complete.");
          }
        },
        close: (signal) => telemetryOwner.close(signal),
      },
      forceClose(): void {
        http.forceClose();
        const remaining = [
          ...(eventOwner ? [eventOwner] : []),
          ...(productOwner ? [productOwner] : []),
          postgresqlOwner,
          redisOwner,
          telemetryOwner,
        ].filter((owner) => !owner.isClosed());
        for (const owner of remaining) {
          void owner.close(new AbortController().signal).catch(() => undefined);
        }
        if (remaining.length > 0) {
          // Adapters offer bounded asynchronous close, not synchronous resource disposal.
          throw new Error("Identity shutdown requires process termination.");
        }
      },
    });
    let startup: Promise<AsterIdentityStartupResult> | undefined;
    return Object.freeze({
      start(): Promise<AsterIdentityStartupResult> {
        if (startup) {
          return startup;
        }
        const startedAt = clock.now().toISOString();
        const started = performance.now();
        startup = runtime.start().then((result) => {
          try {
            logger.info({
              event: "aster.identity.startup_completed",
              eventId: identifiers.generate(),
              durationMs: performance.now() - started,
              outcome:
                result.status === "started" && result.readiness === "ready" ? "ok" : "degraded",
              properties: [
                ["started_at", startedAt],
                ["status", result.status],
              ],
            });
          } catch {
            // Optional logging never changes startup or cleanup ownership.
          }
          if (result.status === "failed" && !owners.every((owner) => owner.isClosed())) {
            factories.terminate(1);
          }
          return result;
        });
        return startup;
      },
      health: () => runtime.health(),
      tryBeginWork: () => runtime.tryBeginWork(),
      shutdown: (trigger?: AsterShutdownTrigger) =>
        runtime.shutdown(trigger).then(enforceTerminalFallback),
      forceShutdown: (reason?: AsterForceShutdownReason) =>
        runtime.forceShutdown(reason).then(enforceTerminalFallback),
      bindProcessSignals: () => runtime.bindProcessSignals(),
    });
  } catch {
    if (!(await closePartialResources(owners))) {
      factories.terminate(1);
    }
    throw new AsterIdentityCompositionError();
  }
}

export function createAsterIdentityService(
  entries: readonly ReferenceRuntimeConfigSourceEntry[],
): Promise<AsterIdentityRuntime> {
  return createIdentityServiceWithFactories(entries);
}
