import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import {
  createAsterKafkaBrokerAdapter,
  type AsterKafkaBrokerAdapter,
  type AsterKafkaConsumedRecord,
} from "@aster/broker-kafka";
import { createAsterPostgresAdapter, type AsterPostgresAdapter } from "@aster/postgres";
import { createAsterDeadline, type AsterLogger } from "@aster/runtime";
import type { AsterObservationOutcome, AsterTelemetry } from "@aster/telemetry";
import { createDeliveryLoop } from "../application/delivery-loop.js";
import { createOutboxRelay, type RelayStep } from "../application/relay.js";
import { EVENT_TOPICS, type EventOwner } from "../domain/envelope.js";
import { createIdentityEventSignature, IDENTITY_EVENT_SIGNATURE } from "./identity-signature.js";
import { createPostgresOutbox } from "./postgres-outbox.js";

export interface EventDeliveryLifecycle {
  start(): void;
  stop(): Promise<void>;
  close(signal: AbortSignal): Promise<void>;
}
export type IdentityDeliveryHandler = (record: AsterKafkaConsumedRecord) => Promise<void>;
interface RuntimeOptions {
  readonly owner: EventOwner;
  readonly connectionString: string;
  readonly telemetry: Pick<AsterTelemetry, "startDependencyOperation" | "recordEventDelivery">;
  readonly logger: Pick<AsterLogger, "info">;
  readonly identityConsumer?: (
    database: AsterPostgresAdapter,
    credential: string,
  ) => IdentityDeliveryHandler;
}

const MAXIMUM_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

function eventAgeMs(occurredAt: string, nowMs: number): number | undefined {
  const ageMs = nowMs - Date.parse(occurredAt);
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= MAXIMUM_EVENT_AGE_MS ? ageMs : undefined;
}

function publicationOutcome(status: string): AsterObservationOutcome {
  switch (status) {
    case "completed":
      return "success";
    case "timed_out":
      return "timeout";
    case "aborted":
      return "cancelled";
    case "rejected":
      return "rejected";
    case "delivery_ambiguous":
    case "unavailable":
      return "unavailable";
    default:
      return "error";
  }
}
// Trusted test seams are not configurable through environment or broker payloads.
interface RuntimeFactories {
  readonly database: typeof createAsterPostgresAdapter;
  readonly broker: typeof createAsterKafkaBrokerAdapter;
  readonly credential: typeof loadLocalIdentityEventCredential;
  readonly delay: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly random: () => number;
  readonly now: () => number;
}

export function localEventDeliveryEnabled(
  value: string | undefined,
  environment: string | undefined,
): boolean {
  if (
    (value !== undefined && value !== "true" && value !== "false") ||
    (value === "true" && environment !== "local")
  ) {
    throw new Error("Invalid local event activation.");
  }
  return value === "true";
}

export function localEventDatabase(
  owner: EventOwner,
  source: string,
  purpose: "relay" | "consumer" = "relay",
): string {
  if (
    !Object.hasOwn(EVENT_TOPICS, owner) ||
    (purpose === "consumer" && owner !== "engagement") ||
    source.length > 2048 ||
    /\s/u.test(source)
  ) {
    throw new Error("Invalid local event database.");
  }
  const url = new URL(source);
  const login = owner === "catalog" ? "aster_catalog_reader_local" : `aster_${owner}_local`;
  if (
    !["postgresql:", "postgres:"].includes(url.protocol) ||
    !["postgres", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username !== login ||
    !url.password ||
    url.pathname !== "/aster" ||
    url.hash ||
    url.search ||
    (url.port !== "" && (Number(url.port) < 1024 || Number(url.port) > 65535))
  ) {
    throw new Error("Invalid local event database.");
  }
  url.username = `aster_${owner}_${purpose}_local`;
  return url.toString();
}

export async function loadLocalIdentityEventCredential(): Promise<string> {
  const file = await open(
    "/run/aster-identity-events/identity.key",
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size !== 64 || (stat.mode & 0o077) !== 0) {
      throw new Error("Invalid Identity event trust file.");
    }
    const bytes = Buffer.alloc(65);
    const { bytesRead } = await file.read(bytes, 0, 65, 0);
    const credential = bytes.subarray(0, bytesRead).toString("utf8");
    if (bytesRead !== 64 || !/^[a-f0-9]{64}$/u.test(credential)) {
      throw new Error("Invalid Identity event trust file.");
    }
    return credential;
  } finally {
    await file.close();
  }
}

export async function createLocalEventDelivery(
  options: RuntimeOptions,
  overrides: Partial<RuntimeFactories> = {},
): Promise<EventDeliveryLifecycle> {
  const relayUrl = localEventDatabase(options.owner, options.connectionString);
  if ((options.owner === "engagement") !== (options.identityConsumer !== undefined)) {
    throw new Error("Identity consumer belongs to Engagement.");
  }
  const factories: RuntimeFactories = {
    database: createAsterPostgresAdapter,
    broker: createAsterKafkaBrokerAdapter,
    credential: loadLocalIdentityEventCredential,
    delay: async (milliseconds, signal) => {
      await delay(milliseconds, undefined, { signal });
    },
    random: Math.random,
    now: Date.now,
    ...overrides,
  };
  const credential = options.owner === "catalog" ? undefined : await factories.credential();
  const signature = credential === undefined ? undefined : createIdentityEventSignature(credential);
  const databases: AsterPostgresAdapter[] = [];
  let broker: AsterKafkaBrokerAdapter | undefined;
  try {
    const database = (connectionString: string, poolRole: "relay" | "consumer") => {
      const result = factories.database({
        connectionString,
        telemetry: options.telemetry,
        poolRole,
        maxConnections: 1,
        connectionTimeoutMs: 500,
        statementTimeoutMs: 900,
        operationTimeoutMs: 1000,
        closeTimeoutMs: 2000,
      });
      databases.push(result);
      return result;
    };
    const outbox = createPostgresOutbox(options.owner, database(relayUrl, "relay"));
    const handler =
      options.identityConsumer && credential
        ? options.identityConsumer(
            database(
              localEventDatabase(options.owner, options.connectionString, "consumer"),
              "consumer",
            ),
            credential,
          )
        : undefined;
    broker = factories.broker({
      brokers: ["broker:19092"],
      clientId: `aster-${options.owner}-events`,
      groupId: handler ? "aster-engagement-identity-v1" : `aster-${options.owner}-relay-v1`,
      telemetry: options.telemetry,
      maxInFlightPublishes: 1,
      maxMessageBytes: 16384,
      connectionTimeoutMs: 1000,
      operationTimeoutMs: 2000,
      closeTimeoutMs: 2000,
      retryMaxAttempts: 2,
    });
    const transport = broker;
    const relay = createOutboxRelay(options.owner, {
      outbox,
      nextToken: randomUUID,
      async publish(event, signal) {
        const key = Buffer.from(event.aggregate.id),
          value = Buffer.from(JSON.stringify(event));
        const result = await transport.publish(
          {
            topic: EVENT_TOPICS[options.owner],
            key,
            value,
            ...(options.owner === "identity" && signature
              ? { headers: { [IDENTITY_EVENT_SIGNATURE]: signature.sign(key, value) } }
              : {}),
          },
          signal,
        );
        const ageMs = eventAgeMs(event.occurredAt, factories.now());
        try {
          options.telemetry.recordEventDelivery?.({
            owner: options.owner,
            stage: "publish",
            outcome: publicationOutcome(result.status),
            ...(ageMs === undefined ? {} : { ageMs }),
          });
        } catch {
          /* Optional telemetry cannot decide outbox acknowledgement. */
        }
        try {
          options.logger.info({
            event: "aster.events.publication",
            eventId: event.eventId,
            requestId: event.correlationId,
            outcome: result.status === "completed" ? "ok" : "degraded",
            properties: [
              ["owner", options.owner],
              ["status", result.status],
            ],
          });
        } catch {
          /* Logging never decides whether a pending fact is removed. */
        }
        return result.status === "completed"
          ? "acknowledged"
          : result.status === "delivery_ambiguous"
            ? "uncertain"
            : "unavailable";
      },
    });
    let previous: RelayStep | undefined;
    const loop = createDeliveryLoop({
      delay: factories.delay,
      random: factories.random,
      async step(signal) {
        const deadline = createAsterDeadline({ timeoutMs: 7000, parentSignal: signal });
        try {
          if (
            transport.snapshot().state !== "ready" &&
            (await transport.connect(deadline.signal)).status !== "completed"
          ) {
            return "unavailable";
          }
          let consumerAvailable = true;
          if (handler && transport.snapshot().consumerState !== "running") {
            const started = await transport.startConsumer(
              { topic: EVENT_TOPICS.identity, fromBeginning: true, handle: handler },
              deadline.signal,
            );
            consumerAvailable = started.status === "completed";
          }
          // A recovering inbound group must not prevent independent committed facts from leaving.
          const result = await relay.step(deadline.signal);
          return consumerAvailable ? result : "unavailable";
        } finally {
          deadline.dispose();
        }
      },
      observe(status) {
        if (status !== previous) {
          previous = status;
          options.logger.info({
            event: "aster.events.relay_state",
            outcome: ["delivered", "empty", "busy"].includes(status) ? "ok" : "degraded",
            properties: [
              ["owner", options.owner],
              ["state", status],
            ],
          });
        }
      },
    });
    return Object.freeze<EventDeliveryLifecycle>({
      start: () => {
        loop.start();
      },
      async stop() {
        await loop.stop();
        const result = await transport.stopConsumer(AbortSignal.timeout(2000));
        if (result.status !== "completed") {
          throw new Error("Event consumer stop did not complete.");
        }
      },
      async close(signal) {
        await loop.stop();
        const results = await Promise.all([
          transport.close(signal),
          ...databases.map((db) => db.close(signal)),
        ]);
        if (
          results.some(
            (result) => result.status !== "completed" && result.status !== "already_completed",
          )
        ) {
          throw new Error("Event resource closure did not complete.");
        }
      },
    });
  } catch (error) {
    await Promise.allSettled([
      broker?.close(AbortSignal.timeout(2000)),
      ...databases.map((db) => db.close(AbortSignal.timeout(2000))),
    ]);
    throw error;
  }
}
