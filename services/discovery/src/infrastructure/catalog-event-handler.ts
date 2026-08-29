import type { AsterKafkaConsumedRecord } from "@aster/broker-kafka";
import { EVENT_TOPICS } from "@aster/event-delivery";
import { createAsterDeadline, type AsterLogger } from "@aster/runtime";
import type { AsterDependencyObservation, AsterTelemetry } from "@aster/telemetry";
import type {
  CatalogEventProjector,
  CatalogEventStore,
  CatalogSnapshotSource,
} from "../application/catalog-event-ports.js";
import { createCatalogEventConsumer } from "../application/consume-catalog-event.js";
import { inspectCatalogEvent } from "./catalog-event-wire.js";

export function createCatalogEventHandler(
  options: Readonly<{
    source: CatalogSnapshotSource;
    projector: CatalogEventProjector;
    store: CatalogEventStore;
    now: () => number;
    logger: Pick<AsterLogger, "info">;
    telemetry: Pick<AsterTelemetry, "startDependencyOperation">;
  }>,
): (record: AsterKafkaConsumedRecord) => Promise<void> {
  const consumer = createCatalogEventConsumer({
    inspect: inspectCatalogEvent,
    source: options.source,
    projector: options.projector,
    store: options.store,
    now: options.now,
  });
  return async ({ key, value, headers, partition, offset, signal }) => {
    const record = {
      topic: EVENT_TOPICS.catalog,
      key,
      value,
      headers: headers ?? {},
      partition,
      offset,
    };
    const deadline = createAsterDeadline({ timeoutMs: 5000, parentSignal: signal });
    let observation: AsterDependencyObservation | undefined;
    try {
      try {
        const metric = options.telemetry.startDependencyOperation({
          dependency: "broker",
          operation: "consume",
        });
        if (metric.status === "started") {
          observation = metric.observation;
        }
      } catch {
        /* Optional telemetry cannot decide broker acknowledgement. */
      }
      const outcome = await consumer.handle(record, deadline.signal);
      const inspection = inspectCatalogEvent(record);
      try {
        options.logger.info({
          event: "aster.discovery.catalog_event",
          ...(inspection.status === "valid"
            ? { eventId: inspection.fact.eventId, requestId: inspection.fact.correlationId }
            : {}),
          outcome: outcome === "retry" ? "degraded" : outcome === "quarantined" ? "rejected" : "ok",
          properties: [["status", outcome]],
        });
      } catch {
        /* No event bytes, title metadata or credentials are logged. */
      }
      try {
        observation?.complete({
          outcome:
            outcome === "retry"
              ? "unavailable"
              : outcome === "quarantined"
                ? "rejected"
                : "success",
        });
      } catch {
        /* Optional telemetry cannot decide broker acknowledgement. */
      }
      if (outcome === "retry" || deadline.signal.aborted) {
        // Throwing leaves this Kafka offset uncommitted for bounded redelivery.
        throw new Error("Catalog event requires retry.");
      }
    } finally {
      deadline.dispose();
    }
  };
}
