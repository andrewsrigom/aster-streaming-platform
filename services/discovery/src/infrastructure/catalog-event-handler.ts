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
import type { createProjectionRebuilder } from "../application/rebuild-projection.js";
import { inspectCatalogEvent } from "./catalog-event-wire.js";

const MAXIMUM_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

export function createCatalogEventHandler(
  options: Readonly<{
    source: CatalogSnapshotSource;
    projector: CatalogEventProjector;
    store: CatalogEventStore;
    now: () => number;
    logger: Pick<AsterLogger, "info">;
    telemetry: Pick<AsterTelemetry, "startDependencyOperation" | "recordEventDelivery">;
    recordHandled: ReturnType<typeof createProjectionRebuilder>["recordHandled"];
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
    const inspection = inspectCatalogEvent(record);
    try {
      try {
        const metric = options.telemetry.startDependencyOperation({
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
        /* Optional telemetry cannot decide broker acknowledgement. */
      }
      const handle = async (): Promise<void> => {
        let outcome = await consumer.handle(record, deadline.signal);
        if (outcome !== "retry") {
          try {
            const next = (BigInt(offset) + 1n).toString();
            const progress = await options.recordHandled(
              { partition, offset: next },
              deadline.signal,
            );
            if (progress.status !== "completed" || progress.value !== "checkpointed") {
              outcome = "retry";
            }
          } catch {
            outcome = "retry";
          }
        }
        try {
          options.logger.info({
            event: "aster.discovery.catalog_event",
            ...(inspection.status === "valid"
              ? { eventId: inspection.fact.eventId, requestId: inspection.fact.correlationId }
              : {}),
            outcome:
              outcome === "retry" ? "degraded" : outcome === "quarantined" ? "rejected" : "ok",
            properties: [["status", outcome]],
          });
        } catch {
          /* No event bytes, title metadata or credentials are logged. */
        }
        const deliveryOutcome =
          outcome === "retry" ? "unavailable" : outcome === "quarantined" ? "rejected" : "success";
        try {
          options.telemetry.recordEventDelivery?.({
            owner: "catalog",
            stage: "consume",
            outcome: deliveryOutcome,
            ...(inspection.status === "valid"
              ? {
                  ageMs: Math.min(
                    MAXIMUM_EVENT_AGE_MS,
                    Math.max(0, (options.now() - inspection.fact.occurredAt) * 1_000),
                  ),
                }
              : {}),
          });
        } catch {
          /* Optional telemetry cannot decide broker acknowledgement. */
        }
        try {
          observation?.complete({ outcome: deliveryOutcome });
        } catch {
          /* Optional telemetry cannot decide broker acknowledgement. */
        }
        if (outcome === "retry" || deadline.signal.aborted) {
          // Throwing leaves this Kafka offset uncommitted for bounded redelivery.
          throw new Error("Catalog event requires retry.");
        }
      };
      if (observation?.run) {
        await observation.run(handle);
      } else {
        await handle();
      }
    } finally {
      deadline.dispose();
    }
  };
}
