import assert from "node:assert/strict";
import test from "node:test";
import { discoveryGraphqlLogOutcome } from "../src/create-service.js";

test("classifies usable partial GraphQL responses as degraded rather than rejected", () => {
  assert.equal(discoveryGraphqlLogOutcome("COMPLETED"), "ok");
  assert.equal(discoveryGraphqlLogOutcome("PARTIAL"), "degraded");
  assert.equal(discoveryGraphqlLogOutcome("STALE"), "degraded");
  for (const code of ["UNAVAILABLE", "CANCELLED", "INVALID_INPUT"]) {
    assert.equal(discoveryGraphqlLogOutcome(code), "rejected");
  }
});
