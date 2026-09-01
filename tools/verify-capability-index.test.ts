import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  analyzeCapabilityIndex,
  CAPABILITY_INDEX_COLUMNS,
  CAPABILITY_INDEX_ROWS,
  scanCapabilityIndex,
} from "./verify-capability-index.ts";

function validIndex(): string {
  const rows = CAPABILITY_INDEX_ROWS.map(
    ({ id, owner, status }) =>
      `| ${id} | Capability | ${owner} | [Requirement](../specs/phase.md#requirement) | ${status} | [Source](../../source.ts) | [Test](../../source.test.ts) | [Evidence](../../evidence/check.md) | [Operations](../operations/guide.md) |`,
  );
  return [
    "# Capability Index",
    "",
    "## Capability-to-proof matrix",
    "",
    `| ${CAPABILITY_INDEX_COLUMNS.join(" | ")} |`,
    `| ${CAPABILITY_INDEX_COLUMNS.map(() => "---").join(" | ")} |`,
    ...rows,
    "",
  ].join("\n");
}

test("accepts the exact bounded capability set with linked proof columns", () => {
  const report = analyzeCapabilityIndex(validIndex());
  assert.equal(report.rows, CAPABILITY_INDEX_ROWS.length);
  assert.deepEqual(report.violations, []);
});

test("rejects missing links and non-authoritative owner or status vocabulary", () => {
  const source = validIndex()
    .replace(
      "| catalog | Capability | Catalog | [Requirement]",
      "| catalog | Capability | Search team | [Requirement]",
    )
    .replace(
      "| released locally | [Source](../../source.ts)",
      "| deployed | [Source](https://example.com/source.ts)",
    );
  const report = analyzeCapabilityIndex(source);
  assert.deepEqual(
    report.violations.map(({ rule }) => rule),
    ["invalid-status", "missing-link", "invalid-owner"],
  );
});

test("rejects duplicate, missing, unexpected, and reordered capability IDs", () => {
  const source = validIndex()
    .replace("| catalog | Capability", "| identity-profiles | Capability")
    .replace("| playback | Capability", "| unknown-capability | Capability");
  const report = analyzeCapabilityIndex(source);
  const rules = report.violations.map(({ rule }) => rule);
  assert.ok(rules.includes("duplicate-id"));
  assert.ok(rules.includes("unexpected-id"));
  assert.ok(rules.includes("wrong-order"));
  assert.equal(rules.filter((rule) => rule === "missing-id").length, 2);
});

test("rejects a changed table contract and oversized input", () => {
  const invalidHeader = analyzeCapabilityIndex(
    validIndex().replace("| Operations |", "| Runbook |"),
  );
  assert.equal(invalidHeader.violations[0]?.rule, "invalid-header");

  const oversized = analyzeCapabilityIndex(`|${"x".repeat(200_001)}|`);
  assert.equal(oversized.violations[0]?.rule, "source-limit");
});

test("reads the canonical path from an explicit repository root", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "aster-capability-index-"));
  context.after(async () => rm(root, { force: true, recursive: true }));
  await mkdir(join(root, "docs", "00-start-here"), { recursive: true });
  await writeFile(join(root, "docs", "00-start-here", "CAPABILITY_INDEX.md"), validIndex());

  const report = await scanCapabilityIndex(root);
  assert.equal(report.rows, CAPABILITY_INDEX_ROWS.length);
  assert.deepEqual(report.violations, []);
});

test("rejects malformed UTF-8 at the canonical path", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "aster-capability-encoding-"));
  context.after(async () => rm(root, { force: true, recursive: true }));
  await mkdir(join(root, "docs", "00-start-here"), { recursive: true });
  await writeFile(
    join(root, "docs", "00-start-here", "CAPABILITY_INDEX.md"),
    Buffer.from([0xc3, 0x28]),
  );

  await assert.rejects(scanCapabilityIndex(root), /must be valid UTF-8/u);
});
