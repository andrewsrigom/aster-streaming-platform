import assert from "node:assert/strict";
import test from "node:test";

import {
  extractCommitSubject,
  validateCommitMessage,
  validateCommitSubject,
} from "./validate-commit-message.ts";

test("accepts documented conventional subjects", () => {
  for (const subject of [
    "feat(catalog): add keyset pagination",
    "fix!: preserve playback authorization",
    "docs(platform): atualiza contrato local",
    "experiment(redis): mede contenção de lease",
  ]) {
    assert.deepEqual(validateCommitSubject(subject), []);
  }
});

test("accepts Git autosquash subjects without weakening the underlying shape", () => {
  assert.deepEqual(validateCommitSubject("fixup! feat(catalog): add keyset pagination"), []);
  assert.notDeepEqual(validateCommitSubject("fixup! WIP"), []);
});

test("rejects unsupported types and malformed descriptions", () => {
  for (const subject of ["feature: add search", "WIP", "feat: Add search", "feat add search"]) {
    assert.notDeepEqual(validateCommitSubject(subject), []);
  }
});

test("rejects subjects beyond the bounded conventional subject length", () => {
  assert.notDeepEqual(validateCommitSubject(`feat: ${"a".repeat(67)}`), []);
});

test("extracts the first non-comment non-empty subject", () => {
  assert.equal(
    extractCommitSubject("\n# template comment\nfeat(repo): add deterministic checks\n\nBody"),
    "feat(repo): add deterministic checks",
  );
});

test("rejects empty, null-containing, and oversized messages", () => {
  assert.notDeepEqual(validateCommitMessage("# comment only\n"), []);
  assert.notDeepEqual(validateCommitMessage("feat: safe\0hidden"), []);
  assert.notDeepEqual(validateCommitMessage(`feat: ${"a".repeat(16_384)}`), []);
});
