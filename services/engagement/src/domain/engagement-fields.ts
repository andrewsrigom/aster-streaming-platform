import { progressIdentifier, progressRecord } from "./progress.js";

export interface EngagementPair {
  readonly profileId: string;
  readonly titleId: string;
}

export function normalizeEngagementPair(value: unknown): EngagementPair | undefined {
  const pair = progressRecord(value, ["profileId", "titleId"]);
  return pair && progressIdentifier(pair["profileId"]) && progressIdentifier(pair["titleId"])
    ? Object.freeze({ profileId: pair["profileId"], titleId: pair["titleId"] })
    : undefined;
}

export function engagementPairKey(pair: EngagementPair): string {
  return `${pair.profileId}:${pair.titleId}`;
}
