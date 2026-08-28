import { catalogIdentifier, catalogRecord } from "../domain/values.js";
import type { OperationDecision } from "./graphql-operation.js";

export const CATALOG_PLAYBACK_OPERATION =
  "query PlaybackPublications($ids: [ID!]!) { _playbackPublications(ids: $ids) { titleId publicationId titleVersion manifestUrl checkedAt validUntil } }";

export function inspectCatalogPlaybackOperation(body: unknown): OperationDecision {
  const input = catalogRecord(body, ["query", "operationName", "variables"]);
  const variables = catalogRecord(input?.["variables"], ["ids"]);
  const ids: unknown = variables?.["ids"];
  if (
    input?.["query"] !== CATALOG_PLAYBACK_OPERATION ||
    input["operationName"] !== "PlaybackPublications" ||
    !Array.isArray(ids) ||
    ids.length < 1 ||
    ids.length > 20 ||
    Array.from({ length: ids.length }, (_, index) =>
      Object.getOwnPropertyDescriptor(ids, String(index)),
    ).some((entry) => !entry || !("value" in entry) || !catalogIdentifier(entry.value))
  ) {
    return { status: "rejected", code: "INVALID_INPUT" };
  }
  return { status: "accepted", operation: "query" };
}
