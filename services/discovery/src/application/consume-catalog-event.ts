import type {
  CatalogEventFact,
  CatalogEventPorts,
  CatalogEventRecord,
  CatalogPoisonReason,
} from "./catalog-event-ports.js";

export type CatalogEventOutcome = "applied" | "duplicate" | "quarantined" | "retry";
type ProjectOutcome = "applied" | "duplicate" | "retry" | CatalogPoisonReason;

export function createCatalogEventConsumer(ports: CatalogEventPorts) {
  let active = false;

  async function project(fact: CatalogEventFact, signal: AbortSignal): Promise<ProjectOutcome> {
    const source = await ports.source.current(fact.titleId, fact.correlationId, signal);
    if (source.status !== "completed") {
      return "retry";
    }
    if (source.value === null) {
      return "source_absent";
    }
    const result = await ports.projector.apply(
      source.value,
      {
        now: ports.now(),
        event: { id: fact.eventId, titleId: fact.titleId, version: fact.version },
      },
      signal,
    );
    if (result.status !== "completed") {
      return "retry";
    }
    switch (result.value.status) {
      case "applied":
      case "refreshed":
        return "applied";
      case "unchanged":
        return "duplicate";
      case "invalid_input":
        return "source_conflict";
      case "stale":
      case "conflict":
        return "projection_conflict";
      case "invalid_state":
        return "retry";
    }
  }

  async function consume(
    record: CatalogEventRecord,
    signal: AbortSignal,
    replay: boolean,
  ): Promise<CatalogEventOutcome> {
    const stopped = () => signal.aborted;
    if (stopped()) {
      return "retry";
    }
    const inspected = ports.inspect(record);
    if (inspected.status === "oversized") {
      return "retry";
    }
    const result: ProjectOutcome =
      inspected.status === "poison" ? inspected.reason : await project(inspected.fact, signal);
    if (stopped() || result === "retry") {
      return "retry";
    }
    if (result === "applied" || result === "duplicate") {
      return result;
    }
    if (replay) {
      return "retry";
    }
    const stored = await ports.store.quarantine(inspected.record, result, signal);
    return !stopped() && (stored === "stored" || stored === "duplicate") ? "quarantined" : "retry";
  }

  return Object.freeze({
    async handle(record: CatalogEventRecord, signal: AbortSignal): Promise<CatalogEventOutcome> {
      if (active || signal.aborted) {
        return "retry";
      }
      active = true;
      try {
        return await consume(record, signal, false);
      } catch {
        return "retry";
      } finally {
        active = false;
      }
    },
    async replay(id: string, signal: AbortSignal): Promise<CatalogEventOutcome> {
      if (active || signal.aborted) {
        return "retry";
      }
      active = true;
      try {
        const record = await ports.store.readQuarantine(id, signal);
        if (!record) {
          return "retry";
        }
        const result = await consume(record, signal, true);
        if (result !== "applied" && result !== "duplicate") {
          return "retry";
        }
        return (await ports.store.completeReplay(id, signal)) ? result : "retry";
      } catch {
        return "retry";
      } finally {
        active = false;
      }
    },
  });
}
