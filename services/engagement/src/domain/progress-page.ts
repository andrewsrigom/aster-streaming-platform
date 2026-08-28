import { progressIdentifier, progressRecord } from "./progress.js";

export type ProgressListKind = "history" | "continue";
export interface ProgressCursor {
  readonly updatedAt: number;
  readonly id: string;
}
export interface ProgressPageInput {
  readonly profileId: string;
  readonly first: number;
  readonly after: ProgressCursor | null;
}
export const progressTimestamp = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= 253_402_300_799;

// Versioned traversal position, bound to its list; never a credential or durable snapshot.
export function progressCursor(
  profileId: string,
  kind: ProgressListKind,
  position: ProgressCursor,
): string {
  return ["e1", kind, profileId, position.updatedAt, position.id].join(".");
}

export function normalizeProgressPageInput(
  value: unknown,
  kind: ProgressListKind,
): ProgressPageInput | undefined {
  const data = progressRecord(value, ["profileId", "first", "after"]);
  const profileId = data?.["profileId"];
  const first = data?.["first"];
  const after = data?.["after"];
  if (
    !data ||
    !["history", "continue"].includes(kind) ||
    !progressIdentifier(profileId) ||
    typeof first !== "number" ||
    !Number.isInteger(first) ||
    first < 1 ||
    first > 20
  ) {
    return undefined;
  }
  if (after === null) {
    return Object.freeze({ profileId, first, after: null });
  }
  if (typeof after !== "string" || after.length > 128) {
    return undefined;
  }
  const [version, list, profile, time, id, extra] = after.split(".");
  const updatedAt = Number(time);
  if (
    version !== "e1" ||
    list !== kind ||
    profile !== profileId ||
    !progressIdentifier(id) ||
    !progressTimestamp(updatedAt) ||
    String(updatedAt) !== time ||
    extra !== undefined
  ) {
    return undefined;
  }
  return Object.freeze({ profileId, first, after: Object.freeze({ updatedAt, id }) });
}

export function followsProgressCursor(value: ProgressCursor, after: ProgressCursor): boolean {
  return (
    value.updatedAt < after.updatedAt ||
    (value.updatedAt === after.updatedAt && value.id < after.id)
  );
}
