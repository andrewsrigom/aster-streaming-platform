import assert from "node:assert/strict";
import { test } from "node:test";
import { selectCurrentOperation } from "./verify-trusted-operations.mjs";

test("runtime proof selects the current operation when a retained version sorts first", () => {
  const retained = { name: "Browse", id: "a-retained", body: "query Browse { retained }" };
  const current = { name: "Browse", id: "z-current", body: "query Browse { current }" };
  const selected = selectCurrentOperation(
    { operations: [retained, current] },
    { operations: [{ name: "Browse", sha256: current.id }] },
    "Browse",
  );

  assert.equal(selected, current);
});

test("runtime proof fails closed for a missing or ambiguous current operation", () => {
  const persisted = {
    operations: [{ name: "Browse", id: "current", body: "query Browse { current }" }],
  };

  assert.throws(() => selectCurrentOperation(persisted, { operations: [] }, "Browse"));
  assert.throws(() =>
    selectCurrentOperation(
      persisted,
      {
        operations: [
          { name: "Browse", sha256: "current" },
          { name: "Browse", sha256: "other" },
        ],
      },
      "Browse",
    ),
  );
});
