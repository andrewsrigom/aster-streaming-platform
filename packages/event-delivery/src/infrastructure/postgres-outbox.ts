import type { AsterPostgresAdapter, AsterPostgresTransactionResult } from "@aster/postgres";
import type { OutboxClaim, OutboxPort } from "../application/relay.js";
import {
  EVENT_TOPICS,
  eventIdentifier,
  eventRecord,
  eventVersion,
  type EventOwner,
} from "../domain/envelope.js";

function committed<T>(
  result: AsterPostgresTransactionResult<T>,
): result is Readonly<{ status: "committed"; value: T }> {
  return result.status === "committed";
}

export function createPostgresOutbox(
  owner: EventOwner,
  database: Pick<AsterPostgresAdapter, "transaction">,
): OutboxPort {
  if (!Object.hasOwn(EVENT_TOPICS, owner)) {
    throw new Error("Invalid outbox owner.");
  }
  return Object.freeze<OutboxPort>({
    async claim(token, signal) {
      if (!eventIdentifier(token) || signal.aborted) {
        return { status: "unavailable" };
      }
      try {
        const result = await database.transaction<Awaited<ReturnType<OutboxPort["claim"]>>>(
          async (tx) => {
            const rows = await tx.query({
              text: `SELECT ${owner}.claim_outbox($1::uuid) AS result`,
              values: [token],
            });
            const row = rows.rows[0];
            if (rows.rowCount !== 1 || rows.rows.length !== 1 || !eventRecord(row, ["result"])) {
              throw new Error("Invalid outbox result.");
            }
            const response = row["result"];
            if (
              eventRecord(response, ["status"]) &&
              (response["status"] === "busy" || response["status"] === "empty")
            ) {
              return { action: "commit", value: { status: response["status"] } } as const;
            }
            if (!eventRecord(response, ["status", "value"]) || response["status"] !== "claimed") {
              throw new Error("Invalid outbox claim.");
            }
            const value = response["value"];
            if (
              !eventRecord(value, [
                "token",
                "eventId",
                "aggregateId",
                "aggregateVersion",
                "event",
              ]) ||
              value["token"] !== token ||
              !eventIdentifier(value["eventId"]) ||
              !eventIdentifier(value["aggregateId"]) ||
              !eventVersion(value["aggregateVersion"])
            ) {
              throw new Error("Invalid outbox identity.");
            }
            return {
              action: "commit",
              value: { status: "claimed", value: value as unknown as OutboxClaim },
            } as const;
          },
          signal,
        );
        return committed(result) ? result.value : { status: "unavailable" };
      } catch {
        return { status: "unavailable" };
      }
    },
    async acknowledge(claim, signal) {
      if (!eventIdentifier(claim.token) || !eventIdentifier(claim.eventId) || signal.aborted) {
        return "unavailable";
      }
      try {
        const result = await database.transaction(async (tx) => {
          const rows = await tx.query({
            text: `SELECT ${owner}.acknowledge_outbox($1::uuid, $2::uuid) AS acknowledged`,
            values: [claim.token, claim.eventId],
          });
          const row = rows.rows[0];
          if (
            rows.rowCount !== 1 ||
            rows.rows.length !== 1 ||
            !eventRecord(row, ["acknowledged"]) ||
            typeof row["acknowledged"] !== "boolean"
          ) {
            throw new Error("Invalid outbox acknowledgement.");
          }
          return { action: "commit", value: row["acknowledged"] } as const;
        }, signal);
        return committed(result) ? (result.value ? "acknowledged" : "not_owned") : "unavailable";
      } catch {
        return "unavailable";
      }
    },
  });
}
