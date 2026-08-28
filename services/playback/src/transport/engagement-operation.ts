import { playbackIdentifier } from "../domain/session.js";

export const PLAYBACK_ENGAGEMENT_OPERATION =
  "query EngagementSession($sessionId: ID!, $titleId: ID!) { _engagementSession(sessionId: $sessionId, titleId: $titleId) { code sessionId titleId checkedAt createdAt expiresAt } }";
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Reflect.ownKeys(value).length !== keys.length
  ) {
    return false;
  }
  return keys.every((key) => {
    const field = Object.getOwnPropertyDescriptor(value, key);
    return field && "value" in field;
  });
}
export function inspectPlaybackEngagementOperation(value: unknown) {
  try {
    if (
      exact(value, ["query", "operationName", "variables"]) &&
      value["query"] === PLAYBACK_ENGAGEMENT_OPERATION &&
      value["operationName"] === "EngagementSession" &&
      exact(value["variables"], ["sessionId", "titleId"]) &&
      playbackIdentifier(value["variables"]["sessionId"]) &&
      playbackIdentifier(value["variables"]["titleId"])
    ) {
      return { status: "accepted", operation: "query" } as const;
    }
  } catch {
    // Hostile object descriptors are not a valid parsed HTTP body.
  }
  return { status: "rejected", code: "INVALID_INPUT" } as const;
}
