import assert from "node:assert/strict";
import test from "node:test";

import { commandsForStagedPaths, parseNulSeparatedPaths } from "./check-staged-files.ts";

test("parses bounded NUL-delimited Git output", () => {
  assert.deepEqual(parseNulSeparatedPaths("tools/check.ts\0package.json\0"), [
    "tools/check.ts",
    "package.json",
  ]);
  assert.deepEqual(parseNulSeparatedPaths(""), []);
  assert.throws(() => parseNulSeparatedPaths("tools/check.ts\n"));
});

test("selects only staged source and configuration files", () => {
  assert.deepEqual(
    commandsForStagedPaths([
      "README.md",
      "evidence/result.txt",
      "package.json",
      "tools/check.ts",
      "poster.png",
    ]),
    [
      {
        args: ["exec", "prettier", "--check", "--", "package.json", "tools/check.ts"],
        label: "format",
      },
      {
        args: ["exec", "eslint", "--", "tools/check.ts"],
        label: "lint",
      },
    ],
  );
});

test("returns no command for documentation-only staged changes", () => {
  assert.deepEqual(commandsForStagedPaths(["README.md", "docs/plan.md"]), []);
});

test("deduplicates paths without widening the selected scope", () => {
  const commands = commandsForStagedPaths(["tools/check.ts", "tools/check.ts"]);
  assert.equal(commands.length, 2);
  assert.deepEqual(commands[0]?.args.slice(-1), ["tools/check.ts"]);
  assert.deepEqual(commands[1]?.args.slice(-1), ["tools/check.ts"]);
});

test("rejects traversal, absolute, Windows-separated, and oversized paths", () => {
  for (const path of [
    "../secret.ts",
    "/tmp/secret.ts",
    "tools\\secret.ts",
    `tools/${"a".repeat(4_096)}.ts`,
  ]) {
    assert.throws(() => commandsForStagedPaths([path]));
  }
});

test("rejects an unbounded staged file set", () => {
  assert.throws(() =>
    commandsForStagedPaths(Array.from({ length: 501 }, (_, index) => `tools/file-${index}.ts`)),
  );
});
