import {
  eventIdentifier,
  normalizeEvent,
  type EventEnvelope,
  type EventOwner,
} from "../domain/envelope.js";

export interface OutboxClaim {
  readonly token: string;
  readonly eventId: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly event: unknown;
}
export interface OutboxPort {
  claim(
    token: string,
    signal: AbortSignal,
  ): Promise<
    | Readonly<{ status: "claimed"; value: OutboxClaim }>
    | Readonly<{ status: "empty" | "busy" | "unavailable" }>
  >;
  acknowledge(
    claim: OutboxClaim,
    signal: AbortSignal,
  ): Promise<"acknowledged" | "not_owned" | "unavailable">;
}
export interface RelayPorts {
  readonly outbox: OutboxPort;
  readonly publish: (
    event: EventEnvelope,
    signal: AbortSignal,
  ) => Promise<"acknowledged" | "uncertain" | "unavailable">;
  readonly nextToken: () => string;
}
export type RelayStep =
  | "delivered"
  | "empty"
  | "busy"
  | "unavailable"
  | "uncertain"
  | "not_owned"
  | "invalid"
  | "stopped";

export function createOutboxRelay(owner: EventOwner, ports: RelayPorts) {
  let active = false;
  return Object.freeze({
    async step(signal: AbortSignal): Promise<RelayStep> {
      const stopped = () => signal.aborted;
      if (stopped()) {
        return "stopped";
      }
      if (active) {
        return "busy";
      }
      active = true;
      try {
        const token = ports.nextToken();
        if (!eventIdentifier(token)) {
          return "invalid";
        }
        const result = await ports.outbox.claim(token, signal);
        if (stopped()) {
          return "stopped";
        }
        if (result.status !== "claimed") {
          return result.status;
        }
        const claim = result.value;
        const event = normalizeEvent(owner, claim.event);
        if (
          !event ||
          claim.token !== token ||
          claim.eventId !== event.eventId ||
          claim.aggregateId !== event.aggregate.id ||
          claim.aggregateVersion !== event.aggregate.version
        ) {
          return "invalid";
        }
        const published = await ports.publish(event, signal);
        if (stopped()) {
          return "stopped";
        }
        if (published !== "acknowledged") {
          return published;
        }
        const acknowledged = await ports.outbox.acknowledge(claim, signal);
        return acknowledged === "acknowledged" ? "delivered" : acknowledged;
      } catch {
        return stopped() ? "stopped" : "unavailable";
      } finally {
        active = false;
      }
    },
  });
}
