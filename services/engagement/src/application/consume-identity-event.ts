import type { IdentityEventPorts, IdentityEventRecord } from "./identity-event-ports.js";

export type IdentityEventOutcome = "applied" | "duplicate" | "ignored" | "quarantined" | "retry";
export function createIdentityEventConsumer(ports: IdentityEventPorts) {
  let active = false;
  async function consume(
    record: IdentityEventRecord,
    signal: AbortSignal,
    replay: boolean,
  ): Promise<IdentityEventOutcome> {
    const stopped = () => signal.aborted;
    if (stopped()) {
      return "retry";
    }
    const inspected = ports.inspect(record);
    if (inspected.status === "oversized") {
      return "retry";
    }
    let reason = inspected.status === "poison" ? inspected.reason : undefined;
    if (inspected.status === "valid") {
      if (!inspected.fact.deleted) {
        return "ignored";
      }
      const result = await ports.store.deleteProfile(inspected.fact, signal);
      if (stopped()) {
        return "retry";
      }
      if (result === "applied" || result === "duplicate") {
        return result;
      }
      if (result !== "conflict") {
        return "retry";
      }
      reason = "identity_conflict";
    }
    if (!reason || replay || stopped()) {
      return "retry";
    }
    const result = await ports.store.quarantine(inspected.record, reason, signal);
    return !stopped() && (result === "stored" || result === "duplicate") ? "quarantined" : "retry";
  }
  return Object.freeze({
    async handle(record: IdentityEventRecord, signal: AbortSignal): Promise<IdentityEventOutcome> {
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
    async replay(id: string, signal: AbortSignal): Promise<IdentityEventOutcome> {
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
        if (result === "retry" || result === "quarantined") {
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
