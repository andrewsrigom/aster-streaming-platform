import type { AsterPostgresAdapter } from "@aster/postgres";
import { eventIdentifier, eventRecord, eventVersion } from "@aster/event-delivery";
import type {
  IdentityEventRecord,
  IdentityEventStore,
} from "../application/identity-event-ports.js";
import { snapshotIdentityRecord } from "./identity-event-wire.js";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const isHex = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length <= max && /^(?:[a-f0-9]{2})*$/u.test(value);
function decodedRecord(value: unknown, id: string): IdentityEventRecord | undefined {
  if (
    !eventRecord(value, ["id", "topic", "partition", "offset", "keyHex", "valueHex", "headers"]) ||
    value["id"] !== id ||
    !isHex(value["valueHex"], 16384) ||
    (value["keyHex"] !== null && !isHex(value["keyHex"], 256))
  ) {
    return undefined;
  }
  const source = value["headers"];
  if (typeof source !== "object" || source === null) {
    return undefined;
  }
  const names = Object.keys(source);
  if (names.length > 8 || !eventRecord(source, names)) {
    return undefined;
  }
  const headers: Record<string, Uint8Array> = {};
  for (const name of names) {
    const bytes = source[name];
    if (!isHex(bytes, 2048)) {
      return undefined;
    }
    headers[name] = Buffer.from(bytes, "hex");
  }
  return snapshotIdentityRecord({
    topic: value["topic"],
    partition: value["partition"],
    offset: value["offset"],
    key: value["keyHex"] === null ? null : Buffer.from(value["keyHex"], "hex"),
    value: Buffer.from(value["valueHex"], "hex"),
    headers,
  } as IdentityEventRecord);
}

export function createPostgresIdentityEvents(
  database: Pick<AsterPostgresAdapter, "transaction">,
  nextId: () => string,
): IdentityEventStore {
  return Object.freeze<IdentityEventStore>({
    async deleteProfile(fact, signal) {
      if (
        signal.aborted ||
        !fact.deleted ||
        ![fact.eventId, fact.accountId, fact.profileId].every(eventIdentifier) ||
        !eventVersion(fact.version) ||
        !Number.isSafeInteger(fact.occurredAt) ||
        fact.occurredAt < 0 ||
        fact.occurredAt > 253402300799
      ) {
        return "unavailable";
      }
      try {
        const result = await database.transaction(async (tx) => {
          const rows = await tx.query({
            text: "SELECT engagement.consume_profile_deletion($1::uuid, $2::uuid, $3::uuid, $4::integer, $5::bigint) AS outcome",
            values: [fact.eventId, fact.accountId, fact.profileId, fact.version, fact.occurredAt],
          });
          const row = rows.rows[0];
          if (rows.rowCount !== 1 || rows.rows.length !== 1 || !eventRecord(row, ["outcome"])) {
            throw new Error("Invalid deletion result.");
          }
          const value = row["outcome"];
          if (
            value !== "applied" &&
            value !== "duplicate" &&
            value !== "conflict" &&
            value !== "full"
          ) {
            throw new Error("Invalid deletion outcome.");
          }
          return {
            action: value === "applied" || value === "duplicate" ? "commit" : "rollback",
            value,
          } as const;
        }, signal);
        if (result.status === "committed") {
          return result.value;
        }
        if (
          result.status === "rolled_back" &&
          (result.value === "conflict" || result.value === "full")
        ) {
          return result.value;
        }
        return "unavailable";
      } catch {
        return "unavailable";
      }
    },
    async quarantine(input, reason, signal) {
      const record = snapshotIdentityRecord(input);
      if (
        signal.aborted ||
        !record ||
        !["signature", "envelope", "identity_conflict"].includes(reason)
      ) {
        return "unavailable";
      }
      try {
        const id = nextId();
        if (!eventIdentifier(id)) {
          return "unavailable";
        }
        const valueHex = hex(record.value);
        const headerJson = JSON.stringify(
          Object.fromEntries(
            Object.entries(record.headers).map(([name, bytes]) => [name, hex(bytes)]),
          ),
        );
        const result = await database.transaction(async (tx) => {
          const rows = await tx.query({
            // Keep exact bounded bytes without exceeding the shared adapter's 4096-character parameter ceiling.
            text: "SELECT engagement.quarantine_identity_record($1::uuid, $2::text, $3::integer, $4::text, $5::text, ($6::text || $7::text || $8::text || $9::text), ($10::text || $11::text || $12::text)::jsonb, $13::text) AS outcome",
            values: [
              id,
              record.topic,
              record.partition,
              record.offset,
              record.key === null ? null : hex(record.key),
              ...Array.from({ length: 4 }, (_, index) =>
                valueHex.slice(index * 4096, (index + 1) * 4096),
              ),
              ...Array.from({ length: 3 }, (_, index) =>
                headerJson.slice(index * 4096, (index + 1) * 4096),
              ),
              reason,
            ],
          });
          const row = rows.rows[0];
          if (rows.rowCount !== 1 || rows.rows.length !== 1 || !eventRecord(row, ["outcome"])) {
            throw new Error("Invalid quarantine result.");
          }
          const value = row["outcome"];
          if (
            value !== "stored" &&
            value !== "duplicate" &&
            value !== "full" &&
            value !== "conflict"
          ) {
            throw new Error("Invalid quarantine outcome.");
          }
          return {
            action: value === "stored" || value === "duplicate" ? "commit" : "rollback",
            value,
          } as const;
        }, signal);
        if (
          result.status === "committed" &&
          (result.value === "stored" || result.value === "duplicate")
        ) {
          return result.value;
        }
        return result.status === "rolled_back" && result.value === "full" ? "full" : "unavailable";
      } catch {
        return "unavailable";
      }
    },
    async readQuarantine(id, signal) {
      if (signal.aborted || !eventIdentifier(id)) {
        return undefined;
      }
      try {
        const result = await database.transaction(async (tx) => {
          const rows = await tx.query({
            text: "SELECT engagement.read_identity_quarantine($1::uuid) AS record",
            values: [id],
          });
          const row = rows.rows[0];
          return {
            action: "rollback",
            value:
              rows.rowCount === 1 && rows.rows.length === 1 && eventRecord(row, ["record"])
                ? decodedRecord(row["record"], id)
                : undefined,
          } as const;
        }, signal);
        return result.status === "rolled_back" ? result.value : undefined;
      } catch {
        return undefined;
      }
    },
    async completeReplay(id, signal) {
      if (signal.aborted || !eventIdentifier(id)) {
        return false;
      }
      try {
        const result = await database.transaction(async (tx) => {
          const rows = await tx.query({
            text: "SELECT engagement.complete_identity_replay($1::uuid) AS removed",
            values: [id],
          });
          const row = rows.rows[0];
          return {
            action: "commit",
            value:
              rows.rowCount === 1 &&
              rows.rows.length === 1 &&
              eventRecord(row, ["removed"]) &&
              row["removed"] === true,
          } as const;
        }, signal);
        return result.status === "committed" && result.value;
      } catch {
        return false;
      }
    },
  });
}
