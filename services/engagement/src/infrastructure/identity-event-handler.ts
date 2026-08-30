import { randomUUID } from "node:crypto";
import { EVENT_TOPICS, type IdentityDeliveryHandler } from "@aster/event-delivery";
import type { AsterPostgresAdapter } from "@aster/postgres";
import { createAsterDeadline, type AsterLogger } from "@aster/runtime";
import type { AsterTelemetry, AsterDependencyObservation } from "@aster/telemetry";
import { createIdentityEventConsumer } from "../application/consume-identity-event.js";
import { createIdentityEventInspector } from "./identity-event-wire.js";
import { createPostgresIdentityEvents } from "./postgres-identity-events.js";

export function createIdentityEventHandler(
  database: AsterPostgresAdapter,
  credential: string,
  logger: Pick<AsterLogger, "info">,
  telemetry: Pick<AsterTelemetry, "startDependencyOperation">,
): IdentityDeliveryHandler {
  const inspect = createIdentityEventInspector(credential);
  const consumer = createIdentityEventConsumer({
    inspect,
    store: createPostgresIdentityEvents(database, randomUUID),
  });
  return async ({ key, value, headers, partition, offset, signal }) => {
    const record = {
      topic: EVENT_TOPICS.identity,
      key,
      value,
      headers: headers ?? {},
      partition,
      offset,
    };
    const deadline = createAsterDeadline({ timeoutMs: 2000, parentSignal: signal });
    let observation: AsterDependencyObservation | undefined;
    const inspection = inspect(record);
    try {
      try {
        const metric = telemetry.startDependencyOperation({
          dependency: "broker",
          operation: "consume",
          ...(inspection.status === "valid" && inspection.fact.traceparent !== undefined
            ? { linkedTraceparent: inspection.fact.traceparent }
            : {}),
        });
        if (metric.status === "started") {
          observation = metric.observation;
        }
      } catch {
        /* Optional telemetry cannot change message handling. */
      }
      const outcome = await consumer.handle(record, deadline.signal);
      try {
        logger.info({
          event: "aster.engagement.identity_event",
          ...(inspection.status === "valid"
            ? { eventId: inspection.fact.eventId, requestId: inspection.fact.correlationId }
            : {}),
          outcome: outcome === "retry" ? "degraded" : outcome === "quarantined" ? "rejected" : "ok",
          properties: [["status", outcome]],
        });
        observation?.complete({
          outcome:
            outcome === "retry"
              ? "unavailable"
              : outcome === "quarantined"
                ? "rejected"
                : "success",
        });
      } catch {
        /* No raw event, user identifiers or credentials are logged. */
      }
      if (outcome === "retry" || deadline.signal.aborted) {
        // Throwing keeps the Kafka offset uncommitted; the bounded runtime restarts consumption.
        throw new Error("Identity event requires retry.");
      }
    } finally {
      deadline.dispose();
    }
  };
}
