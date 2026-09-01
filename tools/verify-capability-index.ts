import { lstat, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const CAPABILITY_INDEX_PATH = "docs/00-start-here/CAPABILITY_INDEX.md";
const MAX_INDEX_BYTES = 200_000;
const MAX_LINES = 1_000;
const MAX_LINE_CHARACTERS = 10_000;
const MAX_ROWS = 50;
const MAX_CELL_CHARACTERS = 4_000;
const MAX_DIAGNOSTICS = 100;
const MARKDOWN_LINK = /\[[^\]\n]+\]\((?<target>[^\s)\n]+)\)/gu;
const SEPARATOR_CELL = /^:?-{3,}:?$/u;

export const CAPABILITY_INDEX_COLUMNS = [
  "ID",
  "Capability",
  "Owner",
  "Requirement",
  "Status",
  "Implementation",
  "Adverse test",
  "Evidence",
  "Operations",
] as const;

export const CAPABILITY_INDEX_ROWS = [
  { id: "identity-profiles", owner: "Identity and Profiles", status: "released" },
  { id: "catalog", owner: "Catalog", status: "released" },
  { id: "playback", owner: "Playback", status: "released" },
  { id: "engagement", owner: "Engagement", status: "released" },
  { id: "discovery", owner: "Discovery", status: "released" },
  { id: "router-graphql", owner: "Router", status: "released" },
  { id: "web-accessibility", owner: "Web", status: "released" },
  { id: "media", owner: "Catalog", status: "released" },
  { id: "resilience", owner: "Runtime", status: "released" },
  { id: "observability", owner: "Telemetry", status: "released" },
  {
    id: "repository-workflows",
    owner: "Repository governance",
    status: "released",
  },
] as const;

const TRACEABILITY_COLUMNS = [
  "Requirement",
  "Implementation",
  "Adverse test",
  "Evidence",
  "Operations",
] as const;

type CapabilityIndexColumn = (typeof CAPABILITY_INDEX_COLUMNS)[number];

export type CapabilityIndexRule =
  | "duplicate-id"
  | "duplicate-table"
  | "invalid-header"
  | "invalid-owner"
  | "invalid-row"
  | "invalid-separator"
  | "invalid-status"
  | "line-limit"
  | "missing-id"
  | "missing-link"
  | "missing-table"
  | "missing-value"
  | "row-limit"
  | "source-limit"
  | "unexpected-id"
  | "wrong-order";

export interface CapabilityIndexViolation {
  detail: string;
  line: number;
  rule: CapabilityIndexRule;
}

export interface CapabilityIndexReport {
  rows: number;
  violations: CapabilityIndexViolation[];
}

interface ParsedRow {
  cells: Readonly<Record<CapabilityIndexColumn, string>>;
  line: number;
}

const currentFile = fileURLToPath(import.meta.url);
const defaultRepositoryRoot = resolve(dirname(currentFile), "..");
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

function addViolation(
  violations: CapabilityIndexViolation[],
  violation: CapabilityIndexViolation,
): void {
  if (violations.length >= MAX_DIAGNOSTICS) {
    throw new Error(`capability-index diagnostics exceed ${MAX_DIAGNOSTICS}`);
  }
  violations.push(violation);
}

function tableCells(line: string): string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    return undefined;
  }
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function cellsMatch(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((cell, index) => cell === right[index]);
}

function hasRepositoryRelativeLink(value: string): boolean {
  for (const match of value.matchAll(MARKDOWN_LINK)) {
    const target = match.groups?.["target"];
    if (target?.startsWith("../") || target?.startsWith("./")) {
      return true;
    }
  }
  return false;
}

function parseDataRow(
  cells: readonly string[],
  line: number,
  violations: CapabilityIndexViolation[],
): ParsedRow | undefined {
  if (cells.length !== CAPABILITY_INDEX_COLUMNS.length) {
    addViolation(violations, {
      detail: `expected ${CAPABILITY_INDEX_COLUMNS.length} cells, found ${cells.length}`,
      line,
      rule: "invalid-row",
    });
    return undefined;
  }

  const entries = CAPABILITY_INDEX_COLUMNS.map((column, index) => [column, cells[index] ?? ""]);
  return {
    cells: Object.fromEntries(entries) as Record<CapabilityIndexColumn, string>,
    line,
  };
}

function validateRow(
  row: ParsedRow,
  index: number,
  seenIds: Set<string>,
  violations: CapabilityIndexViolation[],
): void {
  for (const column of CAPABILITY_INDEX_COLUMNS) {
    const value = row.cells[column];
    if (!value) {
      addViolation(violations, {
        detail: `${column} must not be empty`,
        line: row.line,
        rule: "missing-value",
      });
    } else if (value.length > MAX_CELL_CHARACTERS) {
      addViolation(violations, {
        detail: `${column} exceeds ${MAX_CELL_CHARACTERS} characters`,
        line: row.line,
        rule: "invalid-row",
      });
    }
  }

  for (const column of TRACEABILITY_COLUMNS) {
    if (!hasRepositoryRelativeLink(row.cells[column])) {
      addViolation(violations, {
        detail: `${column} must contain a repository-relative Markdown link`,
        line: row.line,
        rule: "missing-link",
      });
    }
  }

  const id = row.cells.ID;
  if (seenIds.has(id)) {
    addViolation(violations, {
      detail: `duplicate capability ID: ${id}`,
      line: row.line,
      rule: "duplicate-id",
    });
  }
  seenIds.add(id);

  const expected = CAPABILITY_INDEX_ROWS.find((capability) => capability.id === id);
  if (!expected) {
    addViolation(violations, {
      detail: `unexpected capability ID: ${id || "<empty>"}`,
      line: row.line,
      rule: "unexpected-id",
    });
    return;
  }

  if (row.cells.Owner !== expected.owner) {
    addViolation(violations, {
      detail: `${id} owner must be ${expected.owner}`,
      line: row.line,
      rule: "invalid-owner",
    });
  }
  if (row.cells.Status !== expected.status) {
    addViolation(violations, {
      detail: `${id} status must be ${expected.status}`,
      line: row.line,
      rule: "invalid-status",
    });
  }
  if (CAPABILITY_INDEX_ROWS[index]?.id !== id) {
    addViolation(violations, {
      detail: `${id} is not in the canonical capability order`,
      line: row.line,
      rule: "wrong-order",
    });
  }
}

export function analyzeCapabilityIndex(sourceText: string): CapabilityIndexReport {
  const violations: CapabilityIndexViolation[] = [];
  if (Buffer.byteLength(sourceText, "utf8") > MAX_INDEX_BYTES) {
    addViolation(violations, {
      detail: `capability index exceeds ${MAX_INDEX_BYTES} bytes`,
      line: 1,
      rule: "source-limit",
    });
    return { rows: 0, violations };
  }

  const lines = sourceText.replace(/\r\n?/gu, "\n").split("\n");
  if (lines.length > MAX_LINES) {
    addViolation(violations, {
      detail: `capability index exceeds ${MAX_LINES} lines`,
      line: MAX_LINES + 1,
      rule: "source-limit",
    });
    return { rows: 0, violations };
  }
  for (const [index, line] of lines.entries()) {
    if (line.length > MAX_LINE_CHARACTERS) {
      addViolation(violations, {
        detail: `line exceeds ${MAX_LINE_CHARACTERS} characters`,
        line: index + 1,
        rule: "line-limit",
      });
    }
  }

  const candidateHeaders = lines
    .map((line, index) => ({ cells: tableCells(line), index }))
    .filter(({ cells }) => cells?.[0] === "ID");
  const header = candidateHeaders[0];
  if (!header) {
    addViolation(violations, {
      detail: "the capability-to-proof table header is missing",
      line: 1,
      rule: "missing-table",
    });
    return { rows: 0, violations };
  }
  if (candidateHeaders.length > 1) {
    addViolation(violations, {
      detail: "the capability-to-proof table must appear exactly once",
      line: (candidateHeaders[1]?.index ?? header.index) + 1,
      rule: "duplicate-table",
    });
  }
  if (!header.cells || !cellsMatch(header.cells, CAPABILITY_INDEX_COLUMNS)) {
    addViolation(violations, {
      detail: `table columns must be: ${CAPABILITY_INDEX_COLUMNS.join(", ")}`,
      line: header.index + 1,
      rule: "invalid-header",
    });
    return { rows: 0, violations };
  }

  const separator = tableCells(lines[header.index + 1] ?? "");
  if (
    !separator ||
    separator.length !== CAPABILITY_INDEX_COLUMNS.length ||
    !separator.every((cell) => SEPARATOR_CELL.test(cell))
  ) {
    addViolation(violations, {
      detail: "table header must be followed by one separator cell per column",
      line: header.index + 2,
      rule: "invalid-separator",
    });
    return { rows: 0, violations };
  }

  const parsedRows: ParsedRow[] = [];
  for (let index = header.index + 2; index < lines.length; index += 1) {
    const cells = tableCells(lines[index] ?? "");
    if (!cells) {
      break;
    }
    if (parsedRows.length >= MAX_ROWS) {
      addViolation(violations, {
        detail: `capability rows exceed ${MAX_ROWS}`,
        line: index + 1,
        rule: "row-limit",
      });
      break;
    }
    const row = parseDataRow(cells, index + 1, violations);
    if (row) {
      parsedRows.push(row);
    }
  }

  const seenIds = new Set<string>();
  for (const [index, row] of parsedRows.entries()) {
    validateRow(row, index, seenIds, violations);
  }
  for (const expected of CAPABILITY_INDEX_ROWS) {
    if (!seenIds.has(expected.id)) {
      addViolation(violations, {
        detail: `missing capability ID: ${expected.id}`,
        line: header.index + 1,
        rule: "missing-id",
      });
    }
  }

  return {
    rows: parsedRows.length,
    violations: violations.sort((left, right) =>
      `${String(left.line).padStart(8, "0")}:${left.rule}`.localeCompare(
        `${String(right.line).padStart(8, "0")}:${right.rule}`,
      ),
    ),
  };
}

export async function scanCapabilityIndex(
  repositoryRoot = defaultRepositoryRoot,
): Promise<CapabilityIndexReport> {
  const root = resolve(repositoryRoot);
  const rootMetadata = await stat(root);
  if (!rootMetadata.isDirectory()) {
    throw new Error(`repository root is not a directory: ${root}`);
  }

  const indexPath = resolve(root, CAPABILITY_INDEX_PATH);
  const metadata = await lstat(indexPath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${CAPABILITY_INDEX_PATH} must be a regular checked-in file`);
  }
  if (metadata.size > MAX_INDEX_BYTES) {
    throw new Error(`${CAPABILITY_INDEX_PATH} exceeds ${MAX_INDEX_BYTES} bytes`);
  }

  let sourceText: string;
  try {
    sourceText = utf8Decoder.decode(await readFile(indexPath));
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`${CAPABILITY_INDEX_PATH} must be valid UTF-8`, { cause: error });
    }
    throw error;
  }
  return analyzeCapabilityIndex(sourceText);
}

export async function runCapabilityIndexCheck(
  repositoryRoot = defaultRepositoryRoot,
): Promise<number> {
  try {
    const report = await scanCapabilityIndex(repositoryRoot);
    if (report.violations.length > 0) {
      console.error(
        JSON.stringify({ check: "capability-index", status: "error", ...report }, null, 2),
      );
      return 1;
    }
    console.log(
      JSON.stringify({
        check: "capability-index",
        status: "ok",
        rows: report.rows,
        violations: 0,
      }),
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({ check: "capability-index", status: "error", errors: [message] }, null, 2),
    );
    return 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  const requestedRoot = process.argv[2];
  process.exitCode = requestedRoot
    ? await runCapabilityIndexCheck(resolve(requestedRoot))
    : await runCapabilityIndexCheck();
}
