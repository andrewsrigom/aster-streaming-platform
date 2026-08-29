import { discoveryIdentifier, discoveryRecord } from "./title-projection.js";

export type BrokerOffsets = Readonly<Record<string, string>>;
export interface RebuildStart {
  readonly generation: string;
  readonly startedAt: number;
  readonly barrier: BrokerOffsets;
}
export interface RebuildCheckpoint {
  readonly generation: string;
  readonly after: string | null;
  readonly scanComplete: boolean;
  readonly handled: BrokerOffsets;
  readonly rowsApplied: number;
}

const timestamp = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= 253_402_300_799;
const rows = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000;

export function normalizeBrokerOffsets(value: unknown): BrokerOffsets | undefined {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    const names = Reflect.ownKeys(value);
    if (
      names.length > 32 ||
      names.some(
        (name) =>
          typeof name !== "string" || !/^(?:0|[1-9][0-9]{0,3})$/u.test(name) || Number(name) > 1023,
      )
    ) {
      return undefined;
    }
    const record = discoveryRecord(value, names as string[]);
    if (!record) {
      return undefined;
    }
    const normalized: Record<string, string> = {};
    for (const name of [...(names as string[])].sort((a, b) => Number(a) - Number(b))) {
      const offset = record[name];
      if (
        typeof offset !== "string" ||
        !/^(?:0|[1-9][0-9]{0,18})$/u.test(offset) ||
        BigInt(offset) > 9_223_372_036_854_775_807n
      ) {
        return undefined;
      }
      normalized[name] = offset;
    }
    return Object.freeze(normalized);
  } catch {
    return undefined;
  }
}

export function offsetsCover(handled: BrokerOffsets, barrier: BrokerOffsets): boolean {
  return Object.entries(barrier).every(([partition, offset]) => {
    const value = handled[partition];
    return value !== undefined && BigInt(value) >= BigInt(offset);
  });
}

export function normalizeRebuildStart(value: unknown): RebuildStart | undefined {
  try {
    const input = discoveryRecord(value, ["generation", "startedAt", "barrier"]);
    const barrier = input && normalizeBrokerOffsets(input["barrier"]);
    return input &&
      discoveryIdentifier(input["generation"]) &&
      timestamp(input["startedAt"]) &&
      barrier
      ? Object.freeze({
          generation: input["generation"],
          startedAt: input["startedAt"],
          barrier,
        })
      : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeRebuildCheckpoint(value: unknown): RebuildCheckpoint | undefined {
  try {
    const input = discoveryRecord(value, [
      "generation",
      "after",
      "scanComplete",
      "handled",
      "rowsApplied",
    ]);
    const handled = input && normalizeBrokerOffsets(input["handled"]);
    return input &&
      discoveryIdentifier(input["generation"]) &&
      (input["after"] === null || discoveryIdentifier(input["after"])) &&
      typeof input["scanComplete"] === "boolean" &&
      rows(input["rowsApplied"]) &&
      handled
      ? Object.freeze({
          generation: input["generation"],
          after: input["after"],
          scanComplete: input["scanComplete"],
          handled,
          rowsApplied: input["rowsApplied"],
        })
      : undefined;
  } catch {
    return undefined;
  }
}

export function validPromotion(value: unknown): value is Readonly<{
  generation: string;
  completedAt: number;
}> {
  try {
    const input = discoveryRecord(value, ["generation", "completedAt"]);
    return !!input && discoveryIdentifier(input["generation"]) && timestamp(input["completedAt"]);
  } catch {
    return false;
  }
}
