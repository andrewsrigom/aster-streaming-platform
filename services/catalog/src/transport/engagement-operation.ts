import { catalogIdentifier, catalogRecord } from "../domain/values.js";
import type { OperationDecision } from "./graphql-operation.js";

export const CATALOG_ENGAGEMENT_OPERATION =
  "query EngagementTitles($ids: [ID!]!) { _engagementTitles(ids: $ids) { code checkedAt expiresAt titles { titleId visible } } }";

export function inspectCatalogEngagementOperation(body: unknown): OperationDecision {
  const input = catalogRecord(body, ["query", "operationName", "variables"]);
  const variables = catalogRecord(input?.["variables"], ["ids"]);
  const ids: unknown = variables?.["ids"];
  if (
    input?.["query"] !== CATALOG_ENGAGEMENT_OPERATION ||
    input["operationName"] !== "EngagementTitles" ||
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
