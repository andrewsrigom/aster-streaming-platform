import { lstat, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

export const AI_STATE_FILES = [
  ".ai/CHANGE_PLAN.md",
  ".ai/CONTEXT.md",
  ".ai/CURRENT_STATE.md",
  ".ai/DECISIONS_LEDGER.md",
  ".ai/HANDOFF.md",
  ".ai/PROMPTS.md",
  ".ai/QUALITY_GATES.md",
  ".ai/README.md",
  ".ai/SESSION_LOG.md",
  ".ai/WORK_QUEUE.md",
] as const;

const INACTIVE_CHANGE_PLAN =
  "# Active Change Plan\n\nNo work item is active. Select the first `READY` item from `.ai/WORK_QUEUE.md` before beginning the next change.";
const MAX_DIAGNOSTICS = 200;
const MAX_FILE_BYTES = 1_000_000;
const MAX_QUEUE_ROWS = 500;
const MAX_SESSION_ENTRIES = 1_000;
const MAX_TOTAL_BYTES = 5_000_000;
const REQUIREMENT_ID = /^P\d{2}-R\d{2}$/u;
const REQUIRED_CHANGE_PLAN_SECTIONS = [
  "Outcome",
  "Current behavior",
  "Proposed behavior",
  "Boundaries",
  "Invariants",
  "Failure behavior",
  "Data and contracts",
  "Security and privacy",
  "Implementation steps",
  "Tests",
  "Evidence",
  "Rollback or recovery",
  "Documentation updates",
  "Completion checklist",
] as const;
const REQUIRED_CURRENT_STATE_SECTIONS = [
  "Active phase",
  "Verified",
  "Not implemented",
  "Next outcome",
  "Current risks",
] as const;
const SESSION_SECTIONS = ["Completed", "Evidence", "Next action"] as const;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

const currentFile = fileURLToPath(import.meta.url);
const defaultRepositoryRoot = resolve(dirname(currentFile), "..");

export type AiStateRule =
  | "bounds"
  | "current-state"
  | "file-set"
  | "handoff"
  | "input"
  | "plan"
  | "queue"
  | "queue-blocker"
  | "queue-state"
  | "resume-target"
  | "session-log";

export interface AiStateViolation {
  detail: string;
  file: string;
  line: number;
  rule: AiStateRule;
}

export interface AiStateReport {
  activeRequirement: string | undefined;
  files: number;
  queueItems: number;
  sessionEntries: number;
  status: "error" | "ok";
  targetRequirement: string | undefined;
  violations: AiStateViolation[];
}

interface QueueItem {
  blockers: number[];
  line: number;
  order: number;
  requirement: string;
  status: string;
  workItem: string;
}

interface ValidationSummary {
  activeRequirement: string | undefined;
  queueItems: number;
  sessionEntries: number;
  targetRequirement: string | undefined;
  violations: AiStateViolation[];
}

function addViolation(violations: AiStateViolation[], violation: AiStateViolation): void {
  if (violations.length >= MAX_DIAGNOSTICS) {
    throw new Error(`AI state diagnostics exceed ${MAX_DIAGNOSTICS}`);
  }
  violations.push(violation);
}

function normalized(source: string): string {
  return source.replace(/\r\n?/gu, "\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function sectionCount(source: string, level: number, title: string): number {
  const pattern = new RegExp(`^${"#".repeat(level)} ${escapeRegExp(title)}\\s*$`, "gmu");
  return source.match(pattern)?.length ?? 0;
}

function sectionBody(source: string, title: string): string | undefined {
  const lines = normalized(source).split("\n");
  const start = lines.findIndex((line) => line === `## ${title}`);
  if (start === -1) {
    return undefined;
  }
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join("\n")
    .trim();
}

function metadataValue(source: string, key: string): string | undefined {
  const pattern = new RegExp(`^- ${escapeRegExp(key)}:\\s*(?<value>.+?)\\s*$`, "mu");
  return pattern.exec(source)?.groups?.["value"];
}

function validIsoDate(value: string): boolean {
  const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u.exec(value);
  if (!match?.groups) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) &&
    date.getUTCFullYear() === Number(match.groups["year"]) &&
    date.getUTCMonth() + 1 === Number(match.groups["month"]) &&
    date.getUTCDate() === Number(match.groups["day"])
  );
}

function parseBlockers(status: string): number[] | undefined {
  if (!status.startsWith("BLOCKED_BY_")) {
    return [];
  }
  const suffix = status.slice("BLOCKED_BY_".length);
  if (!/^\d+(?:_\d+)*$/u.test(suffix)) {
    return undefined;
  }
  return suffix.split("_").map(Number);
}

function parseQueue(source: string, violations: AiStateViolation[]): QueueItem[] {
  const file = ".ai/WORK_QUEUE.md";
  const lines = normalized(source).split("\n");
  const headerIndex = lines.findIndex((line) =>
    /^\|\s*Order\s*\|\s*Work item\s*\|\s*Requirement\s*\|\s*Status\s*\|\s*$/u.test(line),
  );
  if (headerIndex === -1) {
    addViolation(violations, {
      detail: "work queue must contain the canonical four-column table",
      file,
      line: 1,
      rule: "queue",
    });
    return [];
  }
  if (
    !/^\|\s*:?-+:?\s*\|\s*:?-+:?\s*\|\s*:?-+:?\s*\|\s*:?-+:?\s*\|\s*$/u.test(
      lines[headerIndex + 1] ?? "",
    )
  ) {
    addViolation(violations, {
      detail: "work queue table separator is malformed",
      file,
      line: headerIndex + 2,
      rule: "queue",
    });
  }

  const items: QueueItem[] = [];
  for (let index = headerIndex + 2; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line.startsWith("|")) {
      break;
    }
    if (items.length >= MAX_QUEUE_ROWS) {
      addViolation(violations, {
        detail: `work queue exceeds ${MAX_QUEUE_ROWS} rows`,
        file,
        line: index + 1,
        rule: "bounds",
      });
      break;
    }
    if (!line.endsWith("|")) {
      addViolation(violations, {
        detail: "work queue row must end with a table delimiter",
        file,
        line: index + 1,
        rule: "queue",
      });
      continue;
    }
    const cells = line
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length !== 4) {
      addViolation(violations, {
        detail: "work queue row must contain exactly four cells",
        file,
        line: index + 1,
        rule: "queue",
      });
      continue;
    }
    const [orderText = "", workItem = "", requirement = "", status = ""] = cells;
    const order = Number(orderText);
    const blockedStatus = status.startsWith("BLOCKED_BY_");
    const blockers = parseBlockers(status);
    if (
      !Number.isSafeInteger(order) ||
      order < 1 ||
      !workItem ||
      !REQUIREMENT_ID.test(requirement)
    ) {
      addViolation(violations, {
        detail: "work queue row has an invalid order, work item, or requirement ID",
        file,
        line: index + 1,
        rule: "queue",
      });
      continue;
    }
    if (
      !["DONE", "IN_PROGRESS", "READY"].includes(status) &&
      (!blockedStatus || blockers === undefined)
    ) {
      addViolation(violations, {
        detail: "work queue status is not recognized",
        file,
        line: index + 1,
        rule: "queue",
      });
      continue;
    }
    items.push({ blockers: blockers ?? [], line: index + 1, order, requirement, status, workItem });
  }
  if (items.length === 0) {
    addViolation(violations, {
      detail: "work queue must contain at least one work item",
      file,
      line: headerIndex + 3,
      rule: "queue",
    });
  }
  return items;
}

function validateQueue(items: QueueItem[], violations: AiStateViolation[]): QueueItem | undefined {
  const file = ".ai/WORK_QUEUE.md";
  const byOrder = new Map<number, QueueItem>();
  let unfinishedSeen = false;
  for (const [index, item] of items.entries()) {
    if (item.order !== index + 1 || byOrder.has(item.order)) {
      addViolation(violations, {
        detail: "work queue orders must be unique and contiguous from one",
        file,
        line: item.line,
        rule: "queue",
      });
    }
    byOrder.set(item.order, item);
    if (item.status === "DONE") {
      if (unfinishedSeen) {
        addViolation(violations, {
          detail: "completed work must form a prefix of the queue",
          file,
          line: item.line,
          rule: "queue-state",
        });
      }
    } else {
      unfinishedSeen = true;
    }
    for (const blocker of item.blockers) {
      const referenced = byOrder.get(blocker);
      if (!referenced || blocker >= item.order) {
        addViolation(violations, {
          detail: `blocker ${blocker} must reference an earlier queue item`,
          file,
          line: item.line,
          rule: "queue-blocker",
        });
      } else if (referenced.status === "DONE") {
        addViolation(violations, {
          detail: `completed blocker ${blocker} must be removed from the status`,
          file,
          line: item.line,
          rule: "queue-blocker",
        });
      }
    }
  }

  const activeItems = items.filter((item) => item.status === "IN_PROGRESS");
  if (activeItems.length > 1) {
    for (const item of activeItems) {
      addViolation(violations, {
        detail: "only one work item may be IN_PROGRESS",
        file,
        line: item.line,
        rule: "queue-state",
      });
    }
  }
  const earliestUnfinished = items.find((item) => item.status !== "DONE");
  const active = activeItems[0];
  if (active && earliestUnfinished && active.order !== earliestUnfinished.order) {
    addViolation(violations, {
      detail: "the active item must be the earliest unfinished queue item",
      file,
      line: active.line,
      rule: "queue-state",
    });
  }
  if (!active && earliestUnfinished?.status.startsWith("BLOCKED_BY_")) {
    addViolation(violations, {
      detail: "the earliest unfinished queue item cannot be blocked by later work",
      file,
      line: earliestUnfinished.line,
      rule: "queue-state",
    });
  }
  return active;
}

function validateChangePlan(
  source: string,
  active: QueueItem | undefined,
  activePhase: string | undefined,
  violations: AiStateViolation[],
): void {
  const file = ".ai/CHANGE_PLAN.md";
  const normalizedSource = normalized(source).trim();
  if (!active) {
    if (normalizedSource !== INACTIVE_CHANGE_PLAN) {
      addViolation(violations, {
        detail: "an idle queue requires the canonical inactive change plan",
        file,
        line: 1,
        rule: "plan",
      });
    }
    return;
  }
  if (!/^# Work Item: \S.+$/mu.test(normalizedSource)) {
    addViolation(violations, {
      detail: "active change plan must name its work item",
      file,
      line: 1,
      rule: "plan",
    });
  }
  if (metadataValue(normalizedSource, "Status") !== "IN_PROGRESS") {
    addViolation(violations, {
      detail: "active change plan status must be IN_PROGRESS",
      file,
      line: 1,
      rule: "plan",
    });
  }
  if (!activePhase || metadataValue(normalizedSource, "Phase") !== activePhase) {
    addViolation(violations, {
      detail: "active change plan phase must match the current active phase",
      file,
      line: 1,
      rule: "plan",
    });
  }
  const requirementIds = metadataValue(normalizedSource, "Requirement IDs") ?? "";
  if (!new RegExp(`\\b${escapeRegExp(active.requirement)}\\b`, "u").test(requirementIds)) {
    addViolation(violations, {
      detail: `active plan must reference ${active.requirement}`,
      file,
      line: 1,
      rule: "plan",
    });
  }
  for (const section of REQUIRED_CHANGE_PLAN_SECTIONS) {
    if (sectionCount(normalizedSource, 2, section) !== 1) {
      addViolation(violations, {
        detail: `active plan must contain one ${section} section`,
        file,
        line: 1,
        rule: "plan",
      });
    }
  }
  if (/<(?:Outcome|Owner|Phase|Requirement IDs)>/u.test(normalizedSource)) {
    addViolation(violations, {
      detail: "active change plan contains an unresolved template placeholder",
      file,
      line: 1,
      rule: "plan",
    });
  }
}

function validateCurrentState(
  source: string,
  targetRequirement: string | undefined,
  violations: AiStateViolation[],
): string | undefined {
  const file = ".ai/CURRENT_STATE.md";
  const normalizedSource = normalized(source);
  if (!normalizedSource.startsWith("# Current State\n")) {
    addViolation(violations, {
      detail: "current state must use the canonical title",
      file,
      line: 1,
      rule: "current-state",
    });
  }
  const updated = /^Last updated:\s*(?<date>\d{4}-\d{2}-\d{2})\s*$/mu.exec(normalizedSource)
    ?.groups?.["date"];
  if (!updated || !validIsoDate(updated)) {
    addViolation(violations, {
      detail: "current state must contain a valid ISO Last updated date",
      file,
      line: 1,
      rule: "current-state",
    });
  }
  for (const section of REQUIRED_CURRENT_STATE_SECTIONS) {
    if (sectionCount(normalizedSource, 2, section) !== 1) {
      addViolation(violations, {
        detail: `current state must contain one ${section} section`,
        file,
        line: 1,
        rule: "current-state",
      });
    }
  }
  const activePhase = /\*\*Phase (?<phase>\d{2})\b/u.exec(
    sectionBody(normalizedSource, "Active phase") ?? "",
  )?.groups?.["phase"];
  if (!activePhase) {
    addViolation(violations, {
      detail: "current state must identify one numeric active phase",
      file,
      line: 1,
      rule: "current-state",
    });
  }
  const nextOutcome = sectionBody(normalizedSource, "Next outcome") ?? "";
  if (targetRequirement && !nextOutcome.includes(targetRequirement)) {
    addViolation(violations, {
      detail: `next outcome must identify ${targetRequirement}`,
      file,
      line: 1,
      rule: "resume-target",
    });
  }
  if (activePhase && targetRequirement && !targetRequirement.startsWith(`P${activePhase}-`)) {
    addViolation(violations, {
      detail: `${targetRequirement} must belong to active Phase ${activePhase}`,
      file,
      line: 1,
      rule: "resume-target",
    });
  }
  return activePhase;
}

function validateHandoff(
  source: string,
  targetRequirement: string | undefined,
  violations: AiStateViolation[],
): void {
  const file = ".ai/HANDOFF.md";
  const normalizedSource = normalized(source);
  if (!normalizedSource.startsWith("# Handoff\n")) {
    addViolation(violations, {
      detail: "handoff must use the canonical title",
      file,
      line: 1,
      rule: "handoff",
    });
  }
  for (const section of ["Resume point", "Do not do yet"] as const) {
    if (sectionCount(normalizedSource, 2, section) !== 1) {
      addViolation(violations, {
        detail: `handoff must contain one ${section} section`,
        file,
        line: 1,
        rule: "handoff",
      });
    }
  }
  if (targetRequirement && !normalizedSource.includes(targetRequirement)) {
    addViolation(violations, {
      detail: `handoff must identify ${targetRequirement}`,
      file,
      line: 1,
      rule: "resume-target",
    });
  }
}

function validateSessionLog(source: string, violations: AiStateViolation[]): number {
  const file = ".ai/SESSION_LOG.md";
  const normalizedSource = normalized(source);
  if (!normalizedSource.startsWith("# Session Log\n")) {
    addViolation(violations, {
      detail: "session log must use the canonical title",
      file,
      line: 1,
      rule: "session-log",
    });
  }
  const lines = normalizedSource.split("\n");
  const entries: Array<{ date: string; index: number; line: number }> = [];
  for (const [index, line] of lines.entries()) {
    if (!line.startsWith("## ")) {
      continue;
    }
    const match = /^## (?<date>\d{4}-\d{2}-\d{2}) — \S.+$/u.exec(line);
    const date = match?.groups?.["date"];
    if (!date || !validIsoDate(date)) {
      addViolation(violations, {
        detail: "session entry heading must use a valid ISO date and title",
        file,
        line: index + 1,
        rule: "session-log",
      });
      continue;
    }
    entries.push({ date, index, line: index + 1 });
  }
  if (entries.length === 0 || entries.length > MAX_SESSION_ENTRIES) {
    addViolation(violations, {
      detail: `session log entry count must be between 1 and ${MAX_SESSION_ENTRIES}`,
      file,
      line: 1,
      rule: "bounds",
    });
  }
  for (const [entryIndex, entry] of entries.entries()) {
    const previous = entries[entryIndex - 1];
    if (previous && entry.date > previous.date) {
      addViolation(violations, {
        detail: "session entries must be reverse chronological",
        file,
        line: entry.line,
        rule: "session-log",
      });
    }
    const end = entries[entryIndex + 1]?.index ?? lines.length;
    const body = lines.slice(entry.index + 1, end).join("\n");
    for (const section of SESSION_SECTIONS) {
      if (sectionCount(body, 3, section) !== 1) {
        addViolation(violations, {
          detail: `session entry must contain one ${section} section`,
          file,
          line: entry.line,
          rule: "session-log",
        });
      }
    }
  }
  return entries.length;
}

function validateSources(sources: ReadonlyMap<string, string>): ValidationSummary {
  const violations: AiStateViolation[] = [];
  let totalBytes = 0;
  for (const file of AI_STATE_FILES) {
    const source = sources.get(file);
    if (source === undefined) {
      addViolation(violations, {
        detail: "required repository memory file is missing",
        file,
        line: 1,
        rule: "file-set",
      });
      continue;
    }
    const bytes = Buffer.byteLength(source, "utf8");
    totalBytes += bytes;
    if (bytes === 0 || bytes > MAX_FILE_BYTES || source.includes("\0")) {
      addViolation(violations, {
        detail: `repository memory file must contain 1 to ${MAX_FILE_BYTES} UTF-8 bytes without NUL`,
        file,
        line: 1,
        rule: "bounds",
      });
    }
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    addViolation(violations, {
      detail: `repository memory exceeds ${MAX_TOTAL_BYTES} total bytes`,
      file: ".ai",
      line: 1,
      rule: "bounds",
    });
  }

  const queueSource = sources.get(".ai/WORK_QUEUE.md") ?? "";
  const items = parseQueue(queueSource, violations);
  const active = validateQueue(items, violations);
  const firstReady = items.find((item) => item.status === "READY");
  const targetRequirement = active?.requirement ?? firstReady?.requirement;
  const activePhase = validateCurrentState(
    sources.get(".ai/CURRENT_STATE.md") ?? "",
    targetRequirement,
    violations,
  );
  validateChangePlan(sources.get(".ai/CHANGE_PLAN.md") ?? "", active, activePhase, violations);
  validateHandoff(sources.get(".ai/HANDOFF.md") ?? "", targetRequirement, violations);
  const sessionEntries = validateSessionLog(sources.get(".ai/SESSION_LOG.md") ?? "", violations);

  return {
    activeRequirement: active?.requirement,
    queueItems: items.length,
    sessionEntries,
    targetRequirement,
    violations: violations.sort((left, right) =>
      `${left.file}:${String(left.line).padStart(8, "0")}:${left.rule}:${left.detail}`.localeCompare(
        `${right.file}:${String(right.line).padStart(8, "0")}:${right.rule}:${right.detail}`,
      ),
    ),
  };
}

export function validateAiStateSources(sources: ReadonlyMap<string, string>): AiStateViolation[] {
  return validateSources(sources).violations;
}

async function readBoundedFile(root: string, file: string): Promise<string> {
  const path = resolve(root, file);
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("must be a regular non-symbolic file");
  }
  if (metadata.size === 0 || metadata.size > MAX_FILE_BYTES) {
    throw new Error(`must contain 1 to ${MAX_FILE_BYTES} bytes`);
  }
  const bytes = await readFile(path);
  try {
    return utf8Decoder.decode(bytes);
  } catch {
    throw new Error("must contain valid UTF-8");
  }
}

export async function scanAiState(repositoryRoot = defaultRepositoryRoot): Promise<AiStateReport> {
  const sources = new Map<string, string>();
  const inputViolations: AiStateViolation[] = [];
  for (const file of AI_STATE_FILES) {
    try {
      sources.set(file, await readBoundedFile(repositoryRoot, file));
    } catch (error) {
      addViolation(inputViolations, {
        detail: error instanceof Error ? error.message : "could not read bounded file",
        file,
        line: 1,
        rule: "input",
      });
    }
  }
  const summary = validateSources(sources);
  const violations = [...inputViolations, ...summary.violations].sort((left, right) =>
    `${left.file}:${String(left.line).padStart(8, "0")}:${left.rule}:${left.detail}`.localeCompare(
      `${right.file}:${String(right.line).padStart(8, "0")}:${right.rule}:${right.detail}`,
    ),
  );
  return {
    activeRequirement: summary.activeRequirement,
    files: sources.size,
    queueItems: summary.queueItems,
    sessionEntries: summary.sessionEntries,
    status: violations.length === 0 ? "ok" : "error",
    targetRequirement: summary.targetRequirement,
    violations,
  };
}

export async function runAiStateCheck(repositoryRoot = defaultRepositoryRoot): Promise<number> {
  try {
    const report = await scanAiState(repositoryRoot);
    const output = {
      check: "ai-state",
      status: report.status,
      files: report.files,
      queueItems: report.queueItems,
      sessionEntries: report.sessionEntries,
      activeRequirement: report.activeRequirement ?? null,
      targetRequirement: report.targetRequirement ?? null,
      violations: report.violations,
    };
    const writer = report.status === "ok" ? console.log : console.error;
    writer(JSON.stringify(output));
    return report.status === "ok" ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ check: "ai-state", status: "error", errors: [message] }));
    return 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  process.exitCode = await runAiStateCheck();
}
