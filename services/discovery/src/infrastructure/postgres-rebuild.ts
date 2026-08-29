import type {
  AsterPostgresAdapter,
  AsterPostgresTransaction,
  AsterPostgresTransactionDecision,
  AsterPostgresTransactionResult,
} from "@aster/postgres";
import type { ProjectionStoreResult } from "../application/projection-ports.js";
import type { RebuildStore } from "../application/rebuild-ports.js";
import {
  normalizeBrokerOffsets,
  offsetsCover,
  type BrokerOffsets,
} from "../domain/rebuild-state.js";
import { discoveryIdentifier, discoveryRecord } from "../domain/title-projection.js";

const invalid = (): never => {
  throw new Error("Invalid Discovery rebuild state.");
};
function one(result: Readonly<{ rowCount: number; rows: readonly unknown[] }>) {
  return result.rowCount === 1 && result.rows.length === 1 ? result.rows[0] : invalid();
}
function changed(result: Readonly<{ rowCount: number; rows: readonly unknown[] }>): void {
  if (result.rowCount !== 1 || result.rows.length !== 1) {
    invalid();
  }
}
function integer(value: unknown, maximum = 253_402_300_799): number {
  const parsed =
    typeof value === "string" && /^(?:0|[1-9][0-9]{0,11})$/u.test(value) ? Number(value) : value;
  return typeof parsed === "number" &&
    Number.isSafeInteger(parsed) &&
    parsed >= 0 &&
    parsed <= maximum
    ? parsed
    : invalid();
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  return discoveryRecord(value, keys) ?? invalid();
}
function offsets(value: unknown): BrokerOffsets {
  return normalizeBrokerOffsets(value) ?? invalid();
}
function status(value: unknown): "ACTIVE" | "BUILDING" | "PREVIOUS" {
  return value === "ACTIVE" || value === "BUILDING" || value === "PREVIOUS" ? value : invalid();
}

function failure<T>(
  result: AsterPostgresTransactionResult<T>,
  signal: AbortSignal,
): ProjectionStoreResult<never> {
  return {
    status:
      result.status === "indeterminate"
        ? "indeterminate"
        : result.status === "aborted" && signal.aborted
          ? "cancelled"
          : "unavailable",
  };
}

async function transaction<T>(
  database: Pick<AsterPostgresAdapter, "transaction">,
  signal: AbortSignal,
  work: (tx: AsterPostgresTransaction) => Promise<AsterPostgresTransactionDecision<T>>,
): Promise<ProjectionStoreResult<T>> {
  if (signal.aborted) {
    return { status: "cancelled" };
  }
  try {
    const result = await database.transaction(
      work,
      AbortSignal.any([signal, AbortSignal.timeout(1500)]),
    );
    return result.status === "committed" || result.status === "rolled_back"
      ? { status: "completed", value: result.value }
      : failure(result, signal);
  } catch {
    return { status: "indeterminate" };
  }
}

export function createPostgresRebuildStore(
  database: Pick<AsterPostgresAdapter, "transaction">,
): RebuildStore {
  return Object.freeze<RebuildStore>({
    start(value, signal) {
      return transaction(database, signal, async (tx) => {
        const control = record(
          one(
            await tx.query({
              text: `SELECT active_generation::text AS active, building_generation::text AS building,
                previous_generation::text AS previous FROM discovery.generation_control
                WHERE singleton FOR UPDATE`,
            }),
          ),
          ["active", "building", "previous"],
        );
        const active = control["active"],
          building = control["building"],
          previous = control["previous"];
        if (!discoveryIdentifier(active)) {
          return invalid();
        }
        if (building !== null) {
          return { action: "rollback", value: "busy" } as const;
        }
        if (value.generation === active || value.generation === previous) {
          return { action: "rollback", value: "conflict" } as const;
        }
        if (previous !== null) {
          if (!discoveryIdentifier(previous)) {
            return invalid();
          }
          changed(
            await tx.query({
              text: `UPDATE discovery.generation_control SET previous_generation=NULL
                WHERE singleton RETURNING singleton`,
            }),
          );
          changed(
            await tx.query({
              text: `DELETE FROM discovery.generations WHERE id=$1::uuid AND state='PREVIOUS'
                RETURNING id`,
              values: [previous],
            }),
          );
        }
        const activeProgress = record(
          one(
            await tx.query({
              text: `SELECT handled_offsets FROM discovery.generations
                WHERE id=$1::uuid AND state='ACTIVE' FOR UPDATE`,
              values: [active],
            }),
          ),
          ["handled_offsets"],
        );
        const handled = offsets(activeProgress["handled_offsets"]);
        changed(
          await tx.query({
            text: `INSERT INTO discovery.generations(
                id,state,started_at,barrier_offsets,handled_offsets)
              VALUES ($1::uuid,'BUILDING',$2::bigint,$3::jsonb,$4::jsonb) RETURNING id`,
            values: [
              value.generation,
              value.startedAt,
              JSON.stringify(value.barrier),
              JSON.stringify(handled),
            ],
          }),
        );
        changed(
          await tx.query({
            text: `UPDATE discovery.generation_control SET building_generation=$1::uuid
              WHERE singleton AND building_generation IS NULL AND previous_generation IS NULL
              RETURNING singleton`,
            values: [value.generation],
          }),
        );
        return { action: "commit", value: "started" } as const;
      });
    },
    checkpoint(value, signal) {
      return transaction(database, signal, async (tx) => {
        const result = await tx.query({
          text: `SELECT last_title_id::text AS after,scan_complete,handled_offsets,rows_applied
            FROM discovery.generations WHERE id=$1::uuid AND state='BUILDING' FOR UPDATE`,
          values: [value.generation],
        });
        if (result.rowCount === 0 && result.rows.length === 0) {
          return { action: "rollback", value: "conflict" } as const;
        }
        const current = record(one(result), [
          "after",
          "scan_complete",
          "handled_offsets",
          "rows_applied",
        ]);
        const after = current["after"];
        if (
          (after !== null && !discoveryIdentifier(after)) ||
          typeof current["scan_complete"] !== "boolean"
        ) {
          return invalid();
        }
        offsets(current["handled_offsets"]);
        const rowsApplied = integer(current["rows_applied"], 1_000_000);
        if (
          (after !== null && (value.after === null || value.after < after)) ||
          (current["scan_complete"] && !value.scanComplete) ||
          value.rowsApplied < rowsApplied
        ) {
          return { action: "rollback", value: "conflict" } as const;
        }
        changed(
          await tx.query({
            text: `UPDATE discovery.generations SET last_title_id=$2::uuid,scan_complete=$3::boolean,
              rows_applied=$4::integer
              WHERE id=$1::uuid AND state='BUILDING' RETURNING id`,
            values: [value.generation, value.after, value.scanComplete, value.rowsApplied],
          }),
        );
        return { action: "commit", value: "checkpointed" } as const;
      });
    },
    recordHandled(value, signal) {
      return transaction(database, signal, async (tx) => {
        const control = record(
          one(
            await tx.query({
              text: `SELECT active_generation::text AS active,
                building_generation::text AS building
                FROM discovery.generation_control WHERE singleton FOR UPDATE`,
            }),
          ),
          ["active", "building"],
        );
        const active = control["active"];
        const building = control["building"];
        if (!discoveryIdentifier(active) || (building !== null && !discoveryIdentifier(building))) {
          return invalid();
        }
        for (const generation of building === null ? [active] : [active, building]) {
          const current = record(
            one(
              await tx.query({
                text: `SELECT handled_offsets FROM discovery.generations
                  WHERE id=$1::uuid FOR UPDATE`,
                values: [generation],
              }),
            ),
            ["handled_offsets"],
          );
          const handled = offsets(current["handled_offsets"]);
          const partition = String(value.partition);
          const previous = handled[partition];
          if (previous !== undefined && BigInt(previous) >= BigInt(value.offset)) {
            continue;
          }
          changed(
            await tx.query({
              text: `UPDATE discovery.generations SET handled_offsets=$2::jsonb
                WHERE id=$1::uuid RETURNING id`,
              values: [generation, JSON.stringify({ ...handled, [partition]: value.offset })],
            }),
          );
        }
        return { action: "commit", value: "checkpointed" } as const;
      });
    },
    promote(value, signal) {
      return transaction(database, signal, async (tx) => {
        const control = record(
          one(
            await tx.query({
              text: `SELECT active_generation::text AS active,building_generation::text AS building,
                previous_generation::text AS previous FROM discovery.generation_control
                WHERE singleton FOR UPDATE`,
            }),
          ),
          ["active", "building", "previous"],
        );
        if (
          !discoveryIdentifier(control["active"]) ||
          control["building"] !== value.generation ||
          control["previous"] !== null
        ) {
          return { action: "rollback", value: "conflict" } as const;
        }
        const generation = record(
          one(
            await tx.query({
              text: `SELECT started_at,barrier_offsets,handled_offsets,scan_complete
                FROM discovery.generations WHERE id=$1::uuid AND state='BUILDING' FOR UPDATE`,
              values: [value.generation],
            }),
          ),
          ["started_at", "barrier_offsets", "handled_offsets", "scan_complete"],
        );
        if (
          generation["scan_complete"] !== true ||
          value.completedAt < integer(generation["started_at"]) ||
          !offsetsCover(
            offsets(generation["handled_offsets"]),
            offsets(generation["barrier_offsets"]),
          )
        ) {
          return { action: "rollback", value: "conflict" } as const;
        }
        changed(
          await tx.query({
            text: `UPDATE discovery.generations SET state='PREVIOUS'
              WHERE id=$1::uuid AND state='ACTIVE' RETURNING id`,
            values: [control["active"]],
          }),
        );
        changed(
          await tx.query({
            text: `UPDATE discovery.generations SET state='ACTIVE',completed_at=$2::bigint
              WHERE id=$1::uuid AND state='BUILDING' RETURNING id`,
            values: [value.generation, value.completedAt],
          }),
        );
        changed(
          await tx.query({
            text: `UPDATE discovery.generation_control SET active_generation=$1::uuid,
              building_generation=NULL,previous_generation=$2::uuid WHERE singleton RETURNING singleton`,
            values: [value.generation, control["active"]],
          }),
        );
        return { action: "commit", value: "promoted" } as const;
      });
    },
    async state(generation, signal) {
      if (!discoveryIdentifier(generation)) {
        return { status: "completed", value: null };
      }
      return transaction(database, signal, async (tx) => {
        const result = await tx.query({
          text: `SELECT state,barrier_offsets,handled_offsets,last_title_id::text AS after,
            scan_complete,rows_applied FROM discovery.generations WHERE id=$1::uuid`,
          values: [generation],
        });
        if (result.rowCount === 0 && result.rows.length === 0) {
          return { action: "rollback", value: null } as const;
        }
        const value = record(one(result), [
          "state",
          "barrier_offsets",
          "handled_offsets",
          "after",
          "scan_complete",
          "rows_applied",
        ]);
        const after = value["after"];
        if (
          (after !== null && !discoveryIdentifier(after)) ||
          typeof value["scan_complete"] !== "boolean"
        ) {
          return invalid();
        }
        return {
          action: "rollback",
          value: Object.freeze({
            generation,
            state: status(value["state"]),
            barrier: offsets(value["barrier_offsets"]),
            handled: offsets(value["handled_offsets"]),
            after,
            scanComplete: value["scan_complete"],
            rowsApplied: integer(value["rows_applied"], 1_000_000),
          }),
        } as const;
      });
    },
    building(signal) {
      return transaction(database, signal, async (tx) => {
        const result = await tx.query({
          text: `SELECT g.id::text AS generation,g.state,g.barrier_offsets,g.handled_offsets,
            g.last_title_id::text AS after,g.scan_complete,g.rows_applied
            FROM discovery.generation_control c
            JOIN discovery.generations g ON g.id=c.building_generation
            WHERE c.singleton`,
        });
        if (result.rowCount === 0 && result.rows.length === 0) {
          return { action: "rollback", value: null } as const;
        }
        const value = record(one(result), [
          "generation",
          "state",
          "barrier_offsets",
          "handled_offsets",
          "after",
          "scan_complete",
          "rows_applied",
        ]);
        const generation = value["generation"];
        const after = value["after"];
        if (
          !discoveryIdentifier(generation) ||
          value["state"] !== "BUILDING" ||
          (after !== null && !discoveryIdentifier(after)) ||
          typeof value["scan_complete"] !== "boolean"
        ) {
          return invalid();
        }
        return {
          action: "rollback",
          value: Object.freeze({
            generation,
            state: "BUILDING" as const,
            barrier: offsets(value["barrier_offsets"]),
            handled: offsets(value["handled_offsets"]),
            after,
            scanComplete: value["scan_complete"],
            rowsApplied: integer(value["rows_applied"], 1_000_000),
          }),
        } as const;
      });
    },
  });
}
