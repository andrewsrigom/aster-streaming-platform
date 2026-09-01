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
const MARKDOWN_LINK = /\[(?<label>[^\]\n]+)\]\((?<target>[^\s)\n]+)\)/gu;
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

const TRACEABILITY_COLUMNS = [
  "Requirement",
  "Implementation",
  "Adverse test",
  "Evidence",
  "Operations",
] as const;

type TraceabilityColumn = (typeof TRACEABILITY_COLUMNS)[number];

export const CAPABILITY_INDEX_ROWS = [
  {
    id: "identity-profiles",
    capability: "Profile ownership and lifecycle",
    owner: "Identity and Profiles",
    status: "released",
    targets: {
      Requirement: [
        "../specs/phase-02-identity-profiles.md#p02-r03",
        "../specs/phase-02-identity-profiles.md#p02-r10",
      ],
      Implementation: ["../../services/identity/src/application/profiles.ts"],
      "Adverse test": ["../../services/identity/test/profiles.test.ts"],
      Evidence: ["../../evidence/phase-02/release.txt"],
      Operations: ["../../services/identity/README.md"],
    },
  },
  {
    id: "catalog",
    capability: "Rights-aware title lifecycle",
    owner: "Catalog",
    status: "released",
    targets: {
      Requirement: [
        "../specs/phase-03-catalog-rights.md#p03-r04",
        "../specs/phase-03-catalog-rights.md#p03-r10",
      ],
      Implementation: ["../../services/catalog/src/application/commands.ts"],
      "Adverse test": ["../../services/catalog/test/catalog-workflow.test.ts"],
      Evidence: ["../../evidence/phase-03/release.txt"],
      Operations: ["../../services/catalog/README.md"],
    },
  },
  {
    id: "playback",
    capability: "Owner-authoritative playback sessions",
    owner: "Playback",
    status: "released",
    targets: {
      Requirement: [
        "../specs/phase-07-playback.md#p07-r01",
        "../specs/phase-07-playback.md#p07-r10",
      ],
      Implementation: ["../../services/playback/src/application/create-session.ts"],
      "Adverse test": ["../../services/playback/test/create-session.test.ts"],
      Evidence: ["../../evidence/phase-07/release.md"],
      Operations: ["../../services/playback/README.md"],
    },
  },
  {
    id: "engagement",
    capability: "Profile-owned progress and replay",
    owner: "Engagement",
    status: "released",
    targets: {
      Requirement: [
        "../specs/phase-08-engagement.md#p08-r01",
        "../specs/phase-08-engagement.md#p08-r04",
      ],
      Implementation: ["../../services/engagement/src/application/record-progress.ts"],
      "Adverse test": ["../../services/engagement/test/record-progress.test.ts"],
      Evidence: ["../../evidence/phase-08/release.md"],
      Operations: ["../../services/engagement/README.md"],
    },
  },
  {
    id: "discovery",
    capability: "Independent cached home rails",
    owner: "Discovery",
    status: "released",
    targets: {
      Requirement: [
        "../specs/phase-09-discovery.md#p09-r03",
        "../specs/phase-09-discovery.md#p09-r08",
      ],
      Implementation: ["../../services/discovery/src/application/home-cache.ts"],
      "Adverse test": ["../../services/discovery/test/home-cache.test.ts"],
      Evidence: ["../../evidence/phase-09/web-discovery-release.md"],
      Operations: ["../../services/discovery/README.md"],
    },
  },
  {
    id: "router-graphql",
    capability: "Bounded federated GraphQL execution",
    owner: "Router",
    status: "released",
    targets: {
      Requirement: [
        "../specs/phase-13-graphql-performance-security.md#p13-r03",
        "../specs/phase-13-graphql-performance-security.md#p13-r06",
        "../specs/phase-13-graphql-performance-security.md#p13-r07",
      ],
      Implementation: [
        "../../apps/router/src/demand.ts",
        "../../services/catalog/src/transport/catalog-schema.ts",
      ],
      "Adverse test": [
        "../../apps/router/test/demand.test.ts",
        "../../tools/graphql-query-count-proof.test.mjs",
      ],
      Evidence: ["../../evidence/phase-13/release.md"],
      Operations: ["../../apps/router/README.md"],
    },
  },
  {
    id: "web-accessibility",
    capability: "Accessible Web interaction states",
    owner: "Web",
    status: "released",
    targets: {
      Requirement: ["../specs/phase-05-web-ssr.md#p05-r05", "../specs/phase-05-web-ssr.md#p05-r10"],
      Implementation: ["../../apps/web/features/identity/dialog.tsx"],
      "Adverse test": ["../../apps/web/test/browser/accessibility.spec.ts"],
      Evidence: ["../../evidence/phase-09/web-discovery-release.md"],
      Operations: ["../../apps/web/README.md"],
    },
  },
  {
    id: "media",
    capability: "Rights-gated media processing",
    owner: "Catalog",
    status: "released",
    targets: {
      Requirement: [
        "../specs/phase-06-media-pipeline.md#p06-r01",
        "../specs/phase-06-media-pipeline.md#p06-r10",
      ],
      Implementation: ["../../services/catalog/src/application/process-media.ts"],
      "Adverse test": ["../../services/catalog/test/media-processing.test.ts"],
      Evidence: ["../../evidence/phase-06/release.md"],
      Operations: ["../../services/catalog/MEDIA_PUBLICATION.md"],
    },
  },
  {
    id: "resilience",
    capability: "Deadline-budgeted safe reads",
    owner: "Runtime",
    status: "released",
    targets: {
      Requirement: [
        "../specs/phase-11-resilience.md#p11-r02",
        "../specs/phase-11-resilience.md#p11-r03",
        "../specs/phase-11-resilience.md#p11-r08",
      ],
      Implementation: ["../../packages/runtime/src/safe-read.ts"],
      "Adverse test": ["../../packages/runtime/test/safe-read.test.ts"],
      Evidence: ["../../evidence/phase-11/game-days.md"],
      Operations: ["../operations/RUNBOOKS.md"],
    },
  },
  {
    id: "observability",
    capability: "Bounded metrics, traces, and exporter health",
    owner: "Telemetry",
    status: "released",
    targets: {
      Requirement: [
        "../specs/phase-12-observability.md#p12-r01",
        "../specs/phase-12-observability.md#p12-r08",
        "../specs/phase-12-observability.md#p12-r09",
      ],
      Implementation: ["../../packages/telemetry/src/infrastructure/create-telemetry.ts"],
      "Adverse test": ["../../packages/telemetry/test/telemetry-contract.test.ts"],
      Evidence: ["../../evidence/phase-12/failure-diagnosis.md"],
      Operations: ["../operations/OPERATIONAL_OVERVIEW.md"],
    },
  },
  {
    id: "repository-workflows",
    capability: "Bounded local and protected quality gates",
    owner: "Repository governance",
    status: "released",
    targets: {
      Requirement: [
        "../specs/phase-00-foundation.md#p00-r05",
        "../specs/phase-00-foundation.md#p00-r06",
        "../specs/phase-00-foundation.md#p00-r08",
        "../specs/phase-00-foundation.md#p00-r10",
      ],
      Implementation: ["../../tools/run-quality-gate.ts"],
      "Adverse test": ["../../tools/run-quality-gate.test.ts"],
      Evidence: ["../../evidence/phase-00/clean-checkout-closeout.txt"],
      Operations: ["../operations/REPOSITORY_GOVERNANCE.md"],
    },
  },
] as const satisfies readonly {
  capability: string;
  id: string;
  owner: string;
  status: string;
  targets: Readonly<Record<TraceabilityColumn, readonly string[]>>;
}[];

type CapabilityIndexColumn = (typeof CAPABILITY_INDEX_COLUMNS)[number];

export type CapabilityIndexRule =
  | "duplicate-id"
  | "duplicate-table"
  | "invalid-capability"
  | "invalid-header"
  | "invalid-link"
  | "invalid-owner"
  | "invalid-requirement-label"
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

interface MarkdownVisibilityState {
  fence: { character: "`" | "~"; length: number } | undefined;
  htmlComment: boolean;
  htmlEndMarker: ">" | "?>" | "]]>" | undefined;
  htmlTag: string | undefined;
  htmlUntilBlank: boolean;
}

const RAW_HTML_END_TAGS = new Set(["pre", "script", "style", "textarea"]);

const RAW_HTML_UNTIL_BLANK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "base",
  "basefont",
  "blockquote",
  "body",
  "caption",
  "center",
  "col",
  "colgroup",
  "dd",
  "details",
  "dialog",
  "dir",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "frame",
  "frameset",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hr",
  "html",
  "iframe",
  "legend",
  "li",
  "link",
  "main",
  "menu",
  "menuitem",
  "nav",
  "noframes",
  "ol",
  "optgroup",
  "option",
  "p",
  "param",
  "search",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "title",
  "tr",
  "track",
  "ul",
]);

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
  let indentation = 0;
  for (const character of line) {
    if (character === " ") {
      indentation += 1;
    } else if (character === "\t") {
      indentation += 4 - (indentation % 4);
    } else {
      break;
    }
  }
  if (indentation >= 4) {
    return undefined;
  }
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

function withoutCodeSpans(value: string): string {
  let cursor = 0;
  let visible = "";
  while (cursor < value.length) {
    const opening = value.indexOf("`", cursor);
    if (opening < 0) {
      return `${visible}${value.slice(cursor)}`;
    }
    visible += value.slice(cursor, opening);

    let openingEnd = opening + 1;
    while (value[openingEnd] === "`") {
      openingEnd += 1;
    }
    const delimiterLength = openingEnd - opening;
    let search = openingEnd;
    let closingEnd = -1;
    while (search < value.length) {
      const candidate = value.indexOf("`", search);
      if (candidate < 0) {
        break;
      }
      let candidateEnd = candidate + 1;
      while (value[candidateEnd] === "`") {
        candidateEnd += 1;
      }
      if (candidateEnd - candidate === delimiterLength) {
        closingEnd = candidateEnd;
        break;
      }
      search = candidateEnd;
    }

    if (closingEnd < 0) {
      visible += value.slice(opening, openingEnd);
      cursor = openingEnd;
    } else {
      cursor = closingEnd;
    }
  }
  return visible;
}

function markdownLinks(value: string): { label: string; target: string }[] {
  return [...withoutCodeSpans(value).matchAll(MARKDOWN_LINK)].flatMap((match) => {
    const label = match.groups?.["label"];
    const target = match.groups?.["target"];
    return label && target ? [{ label, target }] : [];
  });
}

function markdownLinkTargets(value: string): string[] {
  return markdownLinks(value).map(({ target }) => target);
}

function requirementLabel(target: string): string {
  const anchor = target.split("#", 2)[1];
  return anchor?.toUpperCase() ?? "";
}

function withoutHtmlComments(line: string, state: MarkdownVisibilityState): string {
  let cursor = 0;
  let visible = "";
  while (cursor < line.length) {
    if (state.htmlComment) {
      const closing = line.indexOf("-->", cursor);
      if (closing < 0) {
        return visible;
      }
      state.htmlComment = false;
      cursor = closing + 3;
      continue;
    }

    const opening = line.indexOf("<!--", cursor);
    if (opening < 0) {
      return `${visible}${line.slice(cursor)}`;
    }
    visible += line.slice(cursor, opening);
    state.htmlComment = true;
    cursor = opening + 4;
  }
  return visible;
}

function visibleMarkdownLines(lines: readonly string[]): string[] {
  const state: MarkdownVisibilityState = {
    fence: undefined,
    htmlComment: false,
    htmlEndMarker: undefined,
    htmlTag: undefined,
    htmlUntilBlank: false,
  };
  return lines.map((line) => {
    if (state.fence) {
      const closing = new RegExp(
        `^ {0,3}${state.fence.character}{${state.fence.length},}\\s*$`,
        "u",
      );
      if (closing.test(line)) {
        state.fence = undefined;
      }
      return "";
    }

    if (state.htmlEndMarker) {
      if (line.includes(state.htmlEndMarker)) {
        state.htmlEndMarker = undefined;
      }
      return "";
    }

    const uncommented = withoutHtmlComments(line, state);
    if (state.htmlUntilBlank) {
      if (!uncommented.trim()) {
        state.htmlUntilBlank = false;
      }
      return "";
    }
    if (state.htmlTag) {
      const closing = new RegExp(`</${state.htmlTag}\\s*>`, "iu");
      if (closing.test(uncommented)) {
        state.htmlTag = undefined;
      }
      return "";
    }

    const htmlEndMarker = /^ {0,3}<\?/u.test(uncommented)
      ? "?>"
      : /^ {0,3}<!\[CDATA\[/u.test(uncommented)
        ? "]]>"
        : /^ {0,3}<![A-Z]/u.test(uncommented)
          ? ">"
          : undefined;
    if (htmlEndMarker) {
      if (!uncommented.includes(htmlEndMarker)) {
        state.htmlEndMarker = htmlEndMarker;
      }
      return "";
    }

    const htmlTag = /^ {0,3}<(?<tag>[A-Za-z][A-Za-z0-9-]*)\b/u.exec(uncommented)?.groups?.["tag"];
    if (htmlTag && RAW_HTML_END_TAGS.has(htmlTag.toLowerCase())) {
      if (!new RegExp(`</${htmlTag}\\s*>`, "iu").test(uncommented)) {
        state.htmlTag = htmlTag;
      }
      return "";
    }

    if (htmlTag && RAW_HTML_UNTIL_BLANK_TAGS.has(htmlTag.toLowerCase())) {
      state.htmlUntilBlank = true;
      return "";
    }

    if (/^ {0,3}<\/?[A-Za-z][A-Za-z0-9-]*(?:\s+[^<>]*)?\/?>\s*$/u.test(uncommented)) {
      state.htmlUntilBlank = true;
      return "";
    }

    const opening = /^ {0,3}(?<delimiter>`{3,}|~{3,})/u.exec(uncommented)?.groups?.["delimiter"];
    if (opening) {
      state.fence = {
        character: opening[0] as "`" | "~",
        length: opening.length,
      };
      return "";
    }
    return uncommented;
  });
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
    if (
      !markdownLinkTargets(row.cells[column]).some(
        (target) => target.startsWith("../") || target.startsWith("./"),
      )
    ) {
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
  if (row.cells.Capability !== expected.capability) {
    addViolation(violations, {
      detail: `${id} capability must be ${expected.capability}`,
      line: row.line,
      rule: "invalid-capability",
    });
  }
  if (row.cells.Status !== expected.status) {
    addViolation(violations, {
      detail: `${id} status must be ${expected.status}`,
      line: row.line,
      rule: "invalid-status",
    });
  }
  for (const column of TRACEABILITY_COLUMNS) {
    const actualTargets = markdownLinkTargets(row.cells[column]);
    if (!cellsMatch(actualTargets, expected.targets[column])) {
      addViolation(violations, {
        detail: `${id} ${column} links must match the reviewed capability destination`,
        line: row.line,
        rule: "invalid-link",
      });
    }
  }
  const actualRequirementLabels = markdownLinks(row.cells.Requirement).map(({ label }) => label);
  const expectedRequirementLabels = expected.targets.Requirement.map(requirementLabel);
  if (!cellsMatch(actualRequirementLabels, expectedRequirementLabels)) {
    addViolation(violations, {
      detail: `${id} requirement labels must match their reviewed destinations`,
      line: row.line,
      rule: "invalid-requirement-label",
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

  const visibleLines = visibleMarkdownLines(lines);

  const candidateHeaders = visibleLines
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

  const separator = tableCells(visibleLines[header.index + 1] ?? "");
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
  for (let index = header.index + 2; index < visibleLines.length; index += 1) {
    const cells = tableCells(visibleLines[index] ?? "");
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
