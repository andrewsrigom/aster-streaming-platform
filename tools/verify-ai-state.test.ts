import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import { AI_STATE_FILES, scanAiState, validateAiStateSources } from "./verify-ai-state.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const inactiveChangePlan =
  "# Active Change Plan\n\nNo work item is active. Select the first `READY` item from `.ai/WORK_QUEUE.md` before beginning the next change.\n";

async function actualSources(): Promise<Map<string, string>> {
  const sources = new Map<string, string>();
  for (const file of AI_STATE_FILES) {
    sources.set(file, await readFile(resolve(repositoryRoot, file), "utf8"));
  }
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
  for (const [file, source] of await actualSources()) {
    const path = resolve(root, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, source, "utf8");
  }
}

test("the checked-in repository memory passes", async () => {
  const report = await scanAiState(repositoryRoot);
  assert.equal(report.status, "ok");
  assert.equal(report.files, AI_STATE_FILES.length);
  assert.equal(report.activeRequirement, "P00-R08");
  assert.deepEqual(report.violations, []);
});

test("accepts the canonical idle plan with the first ready resume target", async () => {
  const sources = await actualSources();
  const queueFile = ".ai/WORK_QUEUE.md";
  sources.set(
    queueFile,
    replaceRequired(
      requiredSource(sources, queueFile),
      "| 11 | Integrate `.ai/` state checks into the normal contribution workflow | P00-R08 | IN_PROGRESS |",
      "| 11 | Integrate `.ai/` state checks into the normal contribution workflow | P00-R08 | READY |",
    ),
  );
  sources.set(".ai/CHANGE_PLAN.md", inactiveChangePlan);
  assert.deepEqual(validateAiStateSources(sources), []);
});

test("rejects missing and oversized repository memory", async () => {
  const sources = await actualSources();
  sources.delete(".ai/CONTEXT.md");
  sources.set(".ai/PROMPTS.md", "x".repeat(1_000_001));
  const rules = validateAiStateSources(sources).map(({ rule }) => rule);
  assert.ok(rules.includes("file-set"));
  assert.ok(rules.includes("bounds"));
});

test("rejects unknown, duplicate, and multiple active queue states", async () => {
  const sources = await actualSources();
  const file = ".ai/WORK_QUEUE.md";
  const queue = requiredSource(sources, file)
    .replace(
      "| 12 | Document exact bootstrap, check, demo, and cleanup commands | P00-R09 | READY |",
      "| 11 | Document exact bootstrap, check, demo, and cleanup commands | P00-R09 | IN_PROGRESS |",
    )
    .replace("| P00-R10 | BLOCKED_BY_11_12 |", "| P00-R10 | UNKNOWN | ");
  sources.set(file, queue);
  const rules = validateAiStateSources(sources).map(({ rule }) => rule);
  assert.ok(rules.includes("queue"));
  assert.ok(rules.includes("queue-state"));
});

test("rejects completed, missing, and forward blocker references", async () => {
  const sources = await actualSources();
  const file = ".ai/WORK_QUEUE.md";
  sources.set(
    file,
    replaceRequired(requiredSource(sources, file), "BLOCKED_BY_11_12", "BLOCKED_BY_10_14"),
  );
  const blockers = validateAiStateSources(sources).filter(({ rule }) => rule === "queue-blocker");
  assert.equal(blockers.length, 2);
});

test("rejects a mismatched or incomplete active change plan", async () => {
  const sources = await actualSources();
  const file = ".ai/CHANGE_PLAN.md";
  sources.set(
    file,
    requiredSource(sources, file)
      .replace("- Requirement IDs: P00-R08", "- Requirement IDs: P00-R09")
      .replace("- Phase: 00", "- Phase: 01")
      .replace("## Tests", "## Verification"),
  );
  const planViolations = validateAiStateSources(sources).filter(({ rule }) => rule === "plan");
  assert.equal(planViolations.length, 3);
});

test("rejects stale current-state and handoff resume targets", async () => {
  const sources = await actualSources();
  const currentFile = ".ai/CURRENT_STATE.md";
  sources.set(
    currentFile,
    replaceRequired(
      requiredSource(sources, currentFile),
      "Run the P00-R08 repository-memory change through the protected pull-request workflow and close it only after the hosted governance and aggregate checks pass.",
      "Continue the current work without an explicit requirement.",
    ),
  );
  const handoffFile = ".ai/HANDOFF.md";
  sources.set(handoffFile, requiredSource(sources, handoffFile).replaceAll("P00-R08", "P00-R09"));
  const targets = validateAiStateSources(sources).filter(({ rule }) => rule === "resume-target");
  assert.equal(targets.length, 2);
});

test("rejects session regression and missing entry evidence", async () => {
  const sources = await actualSources();
  const file = ".ai/SESSION_LOG.md";
  sources.set(
    file,
    requiredSource(sources, file)
      .replace("## 2026-08-26", "## 2026-08-24")
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

test("emits deterministic sorted diagnostics", async () => {
  const sources = await actualSources();
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
