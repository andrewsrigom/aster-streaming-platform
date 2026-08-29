import { catalogIdentifier, catalogRecord } from "../domain/values.js";
import type { OperationDecision } from "./graphql-operation.js";

const selection =
  "titleId sourceVersion observedAt visibleUntil document { defaultLocale localizations { locale title synopsis } genres editorialLabels releaseYear publishedAt }";
export const CATALOG_DISCOVERY_SNAPSHOTS = `query DiscoverySnapshots($ids: [ID!]!) { _discoverySnapshots(ids: $ids) { ${selection} } }`;
export const CATALOG_DISCOVERY_EXPORT = `query DiscoveryExport($after: ID) { _discoveryExport(after: $after) { snapshots { ${selection} } endCursor hasNextPage } }`;

export function inspectCatalogDiscoveryOperation(body: unknown): OperationDecision {
  const rejected = { status: "rejected", code: "INVALID_INPUT" } as const;
  try {
    const input = catalogRecord(body, ["query", "operationName", "variables"]);
    if (!input) {
      return rejected;
    }
    if (
      input["query"] === CATALOG_DISCOVERY_EXPORT &&
      input["operationName"] === "DiscoveryExport"
    ) {
      const variables = catalogRecord(input["variables"], ["after"]);
      return variables && (variables["after"] === null || catalogIdentifier(variables["after"]))
        ? { status: "accepted", operation: "query" }
        : rejected;
    }
    const variables = catalogRecord(input["variables"], ["ids"]);
    const ids: unknown = variables?.["ids"];
    if (
      input["query"] !== CATALOG_DISCOVERY_SNAPSHOTS ||
      input["operationName"] !== "DiscoverySnapshots" ||
      !Array.isArray(ids) ||
      ids.length < 1 ||
      ids.length > 2 ||
      Reflect.ownKeys(ids).length !== ids.length + 1
    ) {
      return rejected;
    }
    for (let index = 0; index < ids.length; index++) {
      const entry = Object.getOwnPropertyDescriptor(ids, String(index));
      if (!entry || !("value" in entry) || !catalogIdentifier(entry.value)) {
        return rejected;
      }
    }
    return { status: "accepted", operation: "query" };
  } catch {
    return rejected;
  }
}
