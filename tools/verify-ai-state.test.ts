import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import { AI_STATE_FILES, scanAiState, validateAiStateSources } from "./verify-ai-state.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const inactiveChangePlan =
  "# Active Change Plan\n\nNo work item is active. Select the first `READY` item from `.ai/WORK_QUEUE.md` before beginning the next change.\n";

function canonicalSources(active = true): Map<string, string> {
  const sources = new Map<string, string>();
  for (const file of AI_STATE_FILES) {
    sources.set(file, `# ${file}\n`);
  }
  sources.set(
    ".ai/WORK_QUEUE.md",
    [
      "# Work Queue",
      "",
      "Only one item may be `IN_PROGRESS`.",
      "",
      "| Order | Work item | Requirement | Status |",
      "|---:|---|---|---|",
      "| 1 | Completed foundation | P00-R01 | DONE |",
      `| 2 | Current foundation | P00-R02 | ${active ? "IN_PROGRESS" : "READY"} |`,
      "| 3 | Next foundation | P00-R03 | READY |",
      "| 4 | Close foundation | P00-R04 | BLOCKED_BY_2_3 |",
      "",
    ].join("\n"),
  );
  sources.set(
    ".ai/CHANGE_PLAN.md",
    active
      ? [
          "# Work Item: Validate fixture state",
          "",
          "- Status: IN_PROGRESS",
          "- Owner: Repository governance",
          "- Phase: 00",
          "- Requirement IDs: P00-R02",
          "- Created: 2026-08-26",
          "- Updated: 2026-08-26",
          "",
          "## Outcome",
          "Fixture outcome.",
          "## Current behavior",
          "Fixture current behavior.",
          "## Proposed behavior",
          "Fixture proposed behavior.",
          "## Boundaries",
          "- Fixture boundary.",
          "## Invariants",
          "- Fixture invariant.",
          "## Failure behavior",
          "| Failure | Expected behavior | Telemetry |",
          "|---|---|---|",
          "| Fixture | Fail | Diagnostic |",
          "## Data and contracts",
          "- None.",
          "## Security and privacy",
          "- Fixture input only.",
          "## Implementation steps",
          "1. Validate.",
          "## Tests",
          "- Fixture test.",
          "## Evidence",
          "- Fixture evidence.",
          "## Rollback or recovery",
          "Restore the fixture.",
          "## Documentation updates",
          "- Fixture documentation.",
          "## Completion checklist",
          "- [ ] Fixture complete",
          "",
        ].join("\n")
      : inactiveChangePlan,
  );
  sources.set(
    ".ai/CURRENT_STATE.md",
    [
      "# Current State",
      "",
      "Last updated: 2026-08-26",
      "",
      "## Active phase",
      "",
      "**Phase 00 — Foundation**",
      "",
      "## Verified",
      "",
      "- Fixture baseline.",
      "",
      "## Not implemented",
      "",
      "- Fixture application.",
      "",
      "## Next outcome",
      "",
      "Execute P00-R02 fixture validation.",
      "",
      "## Current risks",
      "",
      "- Fixture risk.",
      "",
    ].join("\n"),
  );
  sources.set(
    ".ai/HANDOFF.md",
    [
      "# Handoff",
      "",
      "Continue P00-R02 fixture validation.",
      "",
      "## Resume point",
      "",
      "1. Continue P00-R02 fixture validation.",
      "",
      "## Do not do yet",
      "",
      "- Do not broaden the fixture.",
      "",
    ].join("\n"),
  );
  sources.set(
    ".ai/SESSION_LOG.md",
    [
      "# Session Log",
      "",
      "Append new entries at the top.",
      "",
      "## 2026-08-26 — Fixture entry",
      "",
      "### Completed",
      "",
      "- Fixture work.",
      "",
      "### Evidence",
      "",
      "- Fixture evidence.",
      "",
      "### Next action",
      "",
      "Continue P00-R02.",
      "",
    ].join("\n"),
  );
  return sources;
}

function requiredSource(sources: ReadonlyMap<string, string>, file: string): string {
  const source = sources.get(file);
  assert.ok(source, `missing test source: ${file}`);
  return source;
}

function replaceRequired(source: string, search: string, replacement: string): string {
  assert.ok(source.includes(search), `fixture does not contain ${search}`);
  return source.replace(search, replacement);
}

async function writeFixture(root: string): Promise<void> {
  for (const [file, source] of canonicalSources()) {
    const path = resolve(root, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, source, "utf8");
  }
}

test("the checked-in repository memory passes", async () => {
  const report = await scanAiState(repositoryRoot);
  assert.equal(report.status, "ok");
  assert.equal(report.files, AI_STATE_FILES.length);
  assert.deepEqual(report.violations, []);
});

test("accepts canonical active and idle repository memory", () => {
  assert.deepEqual(validateAiStateSources(canonicalSources(true)), []);
  assert.deepEqual(validateAiStateSources(canonicalSources(false)), []);
});

test("rejects missing and oversized repository memory", () => {
  const sources = canonicalSources();
  sources.delete(".ai/CONTEXT.md");
  sources.set(".ai/PROMPTS.md", "x".repeat(1_000_001));
  const rules = validateAiStateSources(sources).map(({ rule }) => rule);
  assert.ok(rules.includes("file-set"));
  assert.ok(rules.includes("bounds"));
});

test("rejects unknown, duplicate, and multiple active queue states", () => {
  const sources = canonicalSources();
  const file = ".ai/WORK_QUEUE.md";
  const queue = requiredSource(sources, file)
    .replace(
      "| 3 | Next foundation | P00-R03 | READY |",
      "| 2 | Next foundation | P00-R03 | IN_PROGRESS |",
    )
    .replace("| P00-R04 | BLOCKED_BY_2_3 |", "| P00-R04 | UNKNOWN | ");
  sources.set(file, queue);
  const rules = validateAiStateSources(sources).map(({ rule }) => rule);
  assert.ok(rules.includes("queue"));
  assert.ok(rules.includes("queue-state"));
});

test("rejects completed, missing, and forward blocker references", () => {
  const sources = canonicalSources();
  const file = ".ai/WORK_QUEUE.md";
  sources.set(
    file,
    replaceRequired(requiredSource(sources, file), "BLOCKED_BY_2_3", "BLOCKED_BY_1_5"),
  );
  const blockers = validateAiStateSources(sources).filter(({ rule }) => rule === "queue-blocker");
  assert.equal(blockers.length, 2);
});

test("rejects a mismatched or incomplete active change plan", () => {
  const sources = canonicalSources();
  const file = ".ai/CHANGE_PLAN.md";
  sources.set(
    file,
    requiredSource(sources, file)
      .replace("- Requirement IDs: P00-R02", "- Requirement IDs: P00-R03")
      .replace("- Phase: 00", "- Phase: 01")
      .replace("## Tests", "## Verification"),
  );
  const planViolations = validateAiStateSources(sources).filter(({ rule }) => rule === "plan");
  assert.equal(planViolations.length, 3);
});

test("rejects stale current-state and handoff resume targets", () => {
  const sources = canonicalSources();
  const currentFile = ".ai/CURRENT_STATE.md";
  sources.set(
    currentFile,
    replaceRequired(
      requiredSource(sources, currentFile),
      "Execute P00-R02 fixture validation.",
      "Continue the current work without an explicit requirement.",
    ),
  );
  const handoffFile = ".ai/HANDOFF.md";
  sources.set(
    handoffFile,
    replaceRequired(
      requiredSource(sources, handoffFile),
      "1. Continue P00-R02 fixture validation.",
      "1. Continue P00-R03 instead.",
    ),
  );
  const targets = validateAiStateSources(sources).filter(({ rule }) => rule === "resume-target");
  assert.equal(targets.length, 2);
});

test("rejects session regression and missing entry evidence", () => {
  const sources = canonicalSources();
  const file = ".ai/SESSION_LOG.md";
  sources.set(
    file,
    requiredSource(sources, file)
      .replace(
        "Append new entries at the top.",
        [
          "Append new entries at the top.",
          "",
          "## 2026-08-24 — Older entry in the wrong position",
          "",
          "### Completed",
          "- Older work.",
          "### Evidence",
          "- Older evidence.",
          "### Next action",
          "- Continue.",
        ].join("\n"),
      )
      .replace("### Evidence", "### Notes"),
  );
  const sessions = validateAiStateSources(sources).filter(({ rule }) => rule === "session-log");
  assert.equal(sessions.length, 2);
});

test("rejects malformed UTF-8 and symbolic repository memory files", async (context) => {
  const invalidRoot = await mkdtemp(join(tmpdir(), "aster-ai-state-invalid-"));
  const symbolicRoot = await mkdtemp(join(tmpdir(), "aster-ai-state-symbolic-"));
  context.after(async () => {
    await rm(invalidRoot, { force: true, recursive: true });
    await rm(symbolicRoot, { force: true, recursive: true });
  });

  await writeFixture(invalidRoot);
  await writeFile(resolve(invalidRoot, ".ai", "CONTEXT.md"), Buffer.from([0xff, 0xfe]));
  assert.ok((await scanAiState(invalidRoot)).violations.some(({ rule }) => rule === "input"));

  await writeFixture(symbolicRoot);
  const planPath = resolve(symbolicRoot, ".ai", "CHANGE_PLAN.md");
  await unlink(planPath);
  await symlink("CONTEXT.md", planPath);
  assert.ok((await scanAiState(symbolicRoot)).violations.some(({ rule }) => rule === "input"));
});

test("emits deterministic sorted diagnostics", () => {
  const sources = canonicalSources();
  sources.delete(".ai/CURRENT_STATE.md");
  sources.delete(".ai/HANDOFF.md");
  const violations = validateAiStateSources(sources);
  const keys = violations.map(
    ({ file, line, rule, detail }) => `${file}:${String(line).padStart(8, "0")}:${rule}:${detail}`,
  );
  assert.deepEqual(
    keys,
    [...keys].sort((left, right) => left.localeCompare(right)),
  );
});
