import { profileIdentifier, profileInput } from "../domain/profile.js";
import type { OperationDecision } from "./graphql-operation.js";

export const IDENTITY_ENGAGEMENT_OPERATION =
  "query EngagementProfile($profileId: ID!) { _engagementProfile(profileId: $profileId) { code accountId profileId checkedAt expiresAt } }";

export function inspectIdentityEngagementOperation(value: unknown): OperationDecision {
  const input = profileInput(value, ["query", "operationName", "variables"]);
  const variables = profileInput(input?.["variables"], ["profileId"]);
  return input?.["query"] === IDENTITY_ENGAGEMENT_OPERATION &&
    input["operationName"] === "EngagementProfile" &&
    profileIdentifier(variables?.["profileId"])
    ? { status: "accepted", operation: "query" }
    : { status: "rejected", code: "INVALID_INPUT" };
}
