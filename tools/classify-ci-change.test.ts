import assert from "node:assert/strict";
import test from "node:test";

import { classifyChangedPaths, GIT_DIFF_FILTER, parseChangedPaths } from "./classify-ci-change.ts";

test("classifies Markdown, evidence, skills, and repository memory as documentation only", () => {
  assert.deepEqual(
    classifyChangedPaths([
      "README.md",
      "docs/operations/LOCAL_DEVELOPMENT.md",
      "evidence/phase-00/check.txt",
      "skills/testing.md",
      ".ai/CURRENT_STATE.md",
    ]),
    { changedFiles: 5, full: false, reason: "docs-only" },
  );
});

test("requires full quality for source, manifest, workflow, and environment templates", () => {
  for (const path of [
    "tools/check.ts",
    "package.json",
    ".github/workflows/ci.yml",
    ".env.example",
  ]) {
    assert.deepEqual(classifyChangedPaths([path]), {
      changedFiles: 1,
      full: true,
      reason: "executable-change",
    });
  }
});

test("fails safe to full quality for an empty diff", () => {
  assert.deepEqual(classifyChangedPaths([]), {
    changedFiles: 0,
    full: true,
    reason: "empty-diff",
  });
});

test("deduplicates changed paths before classification", () => {
  assert.equal(classifyChangedPaths(["README.md", "README.md"]).changedFiles, 1);
});

test("rejects unsafe or unbounded changed paths", () => {
  assert.throws(() => classifyChangedPaths(["../outside.md"]));
  assert.throws(() => classifyChangedPaths(["C:\\outside.md"]));
  assert.throws(() => classifyChangedPaths(Array.from({ length: 5_001 }, () => "README.md")));
});

test("parses bounded NUL-delimited Git diff output", () => {
  assert.deepEqual(parseChangedPaths("README.md\0tools/check.ts\0"), [
    "README.md",
    "tools/check.ts",
  ]);
  assert.deepEqual(parseChangedPaths(""), []);
  assert.throws(() => parseChangedPaths("README.md"));
});

test("includes deleted paths in the Git change set", () => {
  assert.equal(GIT_DIFF_FILTER, "ACMRD");
});
