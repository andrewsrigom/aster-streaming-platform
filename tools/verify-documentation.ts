import { lstat, readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const IGNORED_DIRECTORIES = new Set([".git", ".turbo", "coverage", "dist", "node_modules"]);
const MAX_DIRECTORY_DEPTH = 20;
const MAX_DOCUMENTS = 1_000;
const MAX_DOCUMENT_BYTES = 1_000_000;
const MAX_TOTAL_BYTES = 20_000_000;
const MAX_LINE_CHARACTERS = 20_000;
const MAX_LINKS_PER_DOCUMENT = 2_000;
const MAX_HEADINGS_PER_DOCUMENT = 500;
const MAX_DIAGNOSTICS = 200;
const MATURITY_CLAIM =
  /\b(?:is|are|was|were|has been|have been)\s+(?:fully\s+)?(?:implemented|verified|released)\b/i;
const UNSUPPORTED_ABSOLUTE_CLAIM =
  /\b(?:fully implemented|fully verified|fully released|battle[- ]tested)\b/i;
const MERGE_MARKER = /^(?:<{7}|={7}|>{7})(?:\s|$)/;
const MARKDOWN_LINK = /!?\[[^\]\n]*\]\(\s*(?<body><[^>\n]+>|[^)\n]*)\)/gu;
const REFERENCE_LINK = /^\s{0,3}\[[^\]\n]+\]:\s*(?<body><[^>\n]+>|\S+)/u;
const REFERENCE_DEFINITION = /^\s{0,3}\[(?<label>[^\]\n]+)\]:\s*(?<body><[^>\n]+>|\S+)/u;
const REFERENCE_USE = /!?\[(?<text>[^\]\n]+)\]\[(?<label>[^\]\n]*)\]/gu;
const CANONICAL_TERMS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bNodeJS\b/gu, replacement: "Node.js" },
  { pattern: /\bNode JS\b/gu, replacement: "Node.js" },
  { pattern: /\bTypescript\b/gu, replacement: "TypeScript" },
  { pattern: /\bJavascript\b/gu, replacement: "JavaScript" },
  { pattern: /\bGithub\b/gu, replacement: "GitHub" },
  { pattern: /\bGraphql\b/gu, replacement: "GraphQL" },
  { pattern: /\b(?:Data Loader|Dataloader)\b/gu, replacement: "DataLoader" },
  { pattern: /\bmicro-service(s?)\b/gu, replacement: "microservice$1" },
  { pattern: /\bWebsocket(s?)\b/gu, replacement: "WebSocket$1" },
  { pattern: /\bPostgres\b/gu, replacement: "PostgreSQL" },
];

const currentFile = fileURLToPath(import.meta.url);
const defaultRepositoryRoot = resolve(dirname(currentFile), "..");
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

export type DocumentationRule =
  | "absolute-link"
  | "broken-link"
  | "empty-document"
  | "escaping-link"
  | "invalid-encoding"
  | "invalid-link"
  | "line-limit"
  | "missing-anchor"
  | "missing-title"
  | "non-canonical-term"
  | "unbalanced-fence"
  | "unqualified-status-claim"
  | "unresolved-merge-marker";

export interface DocumentationViolation {
  file: string;
  line: number;
  rule: DocumentationRule;
  detail: string;
  target?: string;
}

export interface MarkdownLink {
  line: number;
  target: string;
}

export interface MarkdownAnalysis {
  headings: Set<string>;
  links: MarkdownLink[];
  statusClaims: Array<{ line: number; supportTargets: string[] }>;
  violations: DocumentationViolation[];
}

export interface DocumentationReport {
  documents: number;
  headings: number;
  links: number;
  statusClaims: number;
  violations: DocumentationViolation[];
}

interface FenceState {
  character: "`" | "~";
  length: number;
  line: number;
}

interface ParsedDestination {
  fragment: string | undefined;
  path: string;
}

function repositoryPath(repositoryRoot: string, filePath: string): string {
  return relative(repositoryRoot, filePath).split(sep).join("/");
}

function escapesRoot(root: string, target: string): boolean {
  const relativeTarget = relative(root, target);
  return (
    relativeTarget === ".." || relativeTarget.startsWith(`..${sep}`) || isAbsolute(relativeTarget)
  );
}

function stripInlineCode(line: string): string {
  let output = line;
  let index = 0;
  while (index < line.length) {
    const openingIndex = line.indexOf("`", index);
    if (openingIndex === -1) {
      break;
    }
    let delimiterLength = 1;
    while (line.charAt(openingIndex + delimiterLength) === "`") {
      delimiterLength += 1;
    }
    const delimiter = "`".repeat(delimiterLength);
    const closingIndex = line.indexOf(delimiter, openingIndex + delimiterLength);
    if (closingIndex === -1) {
      index = openingIndex + delimiterLength;
      continue;
    }
    const segmentLength = closingIndex + delimiterLength - openingIndex;
    output = `${output.slice(0, openingIndex)}${" ".repeat(segmentLength)}${output.slice(openingIndex + segmentLength)}`;
    index = closingIndex + delimiterLength;
  }
  return output;
}

function destinationFromBody(body: string): string | undefined {
  const trimmed = body.trim();
  if (trimmed.startsWith("<")) {
    const closing = trimmed.indexOf(">");
    return closing > 1 ? trimmed.slice(1, closing) : undefined;
  }
  const match = /^(?<destination>\S+)/u.exec(trimmed);
  return match?.groups?.["destination"];
}

function collectLinks(line: string, lineNumber: number): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  for (const match of stripInlineCode(line).matchAll(MARKDOWN_LINK)) {
    const body = match.groups?.["body"];
    const target = body ? destinationFromBody(body) : undefined;
    if (target) {
      links.push({ line: lineNumber, target });
    }
  }
  const referenceMatch = REFERENCE_LINK.exec(stripInlineCode(line));
  const referenceBody = referenceMatch?.groups?.["body"];
  const referenceTarget = referenceBody ? destinationFromBody(referenceBody) : undefined;
  if (referenceTarget) {
    links.push({ line: lineNumber, target: referenceTarget });
  }
  return links;
}

function referenceLabel(label: string): string {
  return label.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

function headingSlug(heading: string): string {
  return heading
    .replace(/<[^>]*>/gu, "")
    .replace(/[`*_~]/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/\s+/gu, "-");
}

function addHeading(
  headings: Set<string>,
  occurrences: Map<string, number>,
  heading: string,
): void {
  const base = headingSlug(heading);
  if (!base) {
    return;
  }
  const occurrence = occurrences.get(base) ?? 0;
  occurrences.set(base, occurrence + 1);
  headings.add(occurrence === 0 ? base : `${base}-${occurrence}`);
}

function fenceFromLine(line: string): { character: "`" | "~"; length: number } | undefined {
  const match = /^\s{0,3}(?<fence>`{3,}|~{3,})/u.exec(line);
  const fence = match?.groups?.["fence"];
  if (!fence) {
    return undefined;
  }
  const character = fence[0];
  if (character !== "`" && character !== "~") {
    return undefined;
  }
  return { character, length: fence.length };
}

function isFenceClose(line: string, fence: FenceState): boolean {
  const match = /^\s{0,3}(?<fence>`{3,}|~{3,})\s*$/u.exec(line);
  const candidate = match?.groups?.["fence"];
  return Boolean(candidate && candidate[0] === fence.character && candidate.length >= fence.length);
}

function addViolation(
  violations: DocumentationViolation[],
  violation: DocumentationViolation,
): void {
  if (violations.length >= MAX_DIAGNOSTICS) {
    throw new Error(`documentation diagnostics exceed ${MAX_DIAGNOSTICS}`);
  }
  violations.push(violation);
}

export function analyzeMarkdown(file: string, sourceText: string): MarkdownAnalysis {
  const violations: DocumentationViolation[] = [];
  const links: MarkdownLink[] = [];
  const headings = new Set<string>();
  const headingOccurrences = new Map<string, number>();
  const statusClaims: Array<{ line: number; supportTargets: string[] }> = [];
  const referenceDefinitions = new Map<string, MarkdownLink>();
  const referenceUses: Array<{ label: string; line: number }> = [];
  const lines = sourceText.replace(/\r\n?/gu, "\n").split("\n");
  let fence: FenceState | undefined;
  let firstContentSeen = false;
  let currentSection = "";

  if (sourceText.trim().length === 0) {
    addViolation(violations, {
      file,
      line: 1,
      rule: "empty-document",
      detail: "Markdown documents must not be empty",
    });
    return { headings, links, statusClaims, violations };
  }

  for (const [lineIndex, line] of lines.entries()) {
    const lineNumber = lineIndex + 1;
    if (line.length > MAX_LINE_CHARACTERS) {
      addViolation(violations, {
        file,
        line: lineNumber,
        rule: "line-limit",
        detail: `line exceeds ${MAX_LINE_CHARACTERS} characters`,
      });
      continue;
    }
    if (fence) {
      if (isFenceClose(line, fence)) {
        fence = undefined;
      }
      continue;
    }
    const openingFence = fenceFromLine(line);
    if (openingFence) {
      fence = { ...openingFence, line: lineNumber };
      continue;
    }

    if (!firstContentSeen && line.trim()) {
      firstContentSeen = true;
      if (!/^#\s+\S/u.test(line)) {
        addViolation(violations, {
          file,
          line: lineNumber,
          rule: "missing-title",
          detail: "the first non-empty line must be one top-level title",
        });
      }
    }

    const headingMatch = /^(?<level>#{1,6})\s+(?<heading>.+?)\s*#*\s*$/u.exec(line);
    const heading = headingMatch?.groups?.["heading"];
    if (heading) {
      if (headings.size >= MAX_HEADINGS_PER_DOCUMENT) {
        throw new Error(`${file}: heading count exceeds ${MAX_HEADINGS_PER_DOCUMENT}`);
      }
      addHeading(headings, headingOccurrences, heading);
      if (headingMatch.groups?.["level"] === "##") {
        currentSection = headingSlug(heading);
      }
    }

    const prose = stripInlineCode(line);
    if (MERGE_MARKER.test(prose)) {
      addViolation(violations, {
        file,
        line: lineNumber,
        rule: "unresolved-merge-marker",
        detail: "remove the unresolved merge marker",
      });
    }
    for (const { pattern, replacement } of CANONICAL_TERMS) {
      pattern.lastIndex = 0;
      if (pattern.test(prose)) {
        addViolation(violations, {
          file,
          line: lineNumber,
          rule: "non-canonical-term",
          detail: `use the canonical term ${replacement}`,
        });
      }
    }
    if (UNSUPPORTED_ABSOLUTE_CLAIM.test(prose) && !file.startsWith("evidence/")) {
      addViolation(violations, {
        file,
        line: lineNumber,
        rule: "unqualified-status-claim",
        detail: "replace the absolute maturity claim with a measured, evidence-linked statement",
      });
    }

    const lineLinks = collectLinks(line, lineNumber);
    links.push(...lineLinks);
    const definition = REFERENCE_DEFINITION.exec(prose);
    const definitionLabel = definition?.groups?.["label"];
    const definitionBody = definition?.groups?.["body"];
    const definitionTarget = definitionBody ? destinationFromBody(definitionBody) : undefined;
    if (definitionLabel && definitionTarget) {
      const normalizedLabel = referenceLabel(definitionLabel);
      if (referenceDefinitions.has(normalizedLabel)) {
        addViolation(violations, {
          file,
          line: lineNumber,
          rule: "invalid-link",
          detail: `duplicate Markdown reference definition: ${definitionLabel}`,
        });
      } else {
        referenceDefinitions.set(normalizedLabel, { line: lineNumber, target: definitionTarget });
      }
    }
    if (!definition) {
      for (const match of prose.matchAll(REFERENCE_USE)) {
        const text = match.groups?.["text"];
        const label = match.groups?.["label"];
        if (text !== undefined && label !== undefined) {
          referenceUses.push({ label: referenceLabel(label || text), line: lineNumber });
        }
      }
    }
    if (links.length > MAX_LINKS_PER_DOCUMENT) {
      throw new Error(`${file}: link count exceeds ${MAX_LINKS_PER_DOCUMENT}`);
    }
    if (
      currentSection === "current-status" &&
      MATURITY_CLAIM.test(prose) &&
      !file.startsWith("evidence/")
    ) {
      statusClaims.push({
        line: lineNumber,
        supportTargets: lineLinks.map(({ target }) => target),
      });
    }
  }

  if (fence) {
    addViolation(violations, {
      file,
      line: fence.line,
      rule: "unbalanced-fence",
      detail: `fenced code block opened with ${fence.character.repeat(fence.length)} is not closed`,
    });
  }
  for (const use of referenceUses) {
    const definition = referenceDefinitions.get(use.label);
    if (!definition) {
      addViolation(violations, {
        file,
        line: use.line,
        rule: "invalid-link",
        detail: `Markdown reference link has no definition: ${use.label}`,
      });
    } else {
      links.push({ line: use.line, target: definition.target });
      const statusClaim = statusClaims.find(({ line }) => line === use.line);
      statusClaim?.supportTargets.push(definition.target);
    }
  }
  if (links.length > MAX_LINKS_PER_DOCUMENT) {
    throw new Error(`${file}: link count exceeds ${MAX_LINKS_PER_DOCUMENT}`);
  }
  return { headings, links, statusClaims, violations };
}

function parseLocalDestination(target: string): ParsedDestination | undefined {
  if (/^[A-Za-z][A-Za-z\d+.-]*:/u.test(target) || target.startsWith("//")) {
    return undefined;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    throw new URIError(`invalid URL encoding in ${target}`);
  }
  const hashIndex = decoded.indexOf("#");
  const withoutFragment = hashIndex === -1 ? decoded : decoded.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? undefined : decoded.slice(hashIndex + 1);
  const queryIndex = withoutFragment.indexOf("?");
  return {
    fragment,
    path: queryIndex === -1 ? withoutFragment : withoutFragment.slice(0, queryIndex),
  };
}

async function collectMarkdownFiles(repositoryRoot: string): Promise<string[]> {
  const documents: string[] = [];
  let totalBytes = 0;

  const walk = async (directory: string, depth: number): Promise<void> => {
    if (depth > MAX_DIRECTORY_DEPTH) {
      throw new Error(`documentation directory depth exceeds ${MAX_DIRECTORY_DEPTH}`);
    }
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          await walk(path, depth + 1);
        }
      } else if (entry.isFile() && extname(entry.name).toLocaleLowerCase("en-US") === ".md") {
        const metadata = await stat(path);
        if (metadata.size > MAX_DOCUMENT_BYTES) {
          throw new Error(
            `${repositoryPath(repositoryRoot, path)} exceeds ${MAX_DOCUMENT_BYTES} bytes`,
          );
        }
        totalBytes += metadata.size;
        if (totalBytes > MAX_TOTAL_BYTES) {
          throw new Error(`total Markdown bytes exceed ${MAX_TOTAL_BYTES}`);
        }
        documents.push(path);
        if (documents.length > MAX_DOCUMENTS) {
          throw new Error(`Markdown document count exceeds ${MAX_DOCUMENTS}`);
        }
      }
    }
  };

  await walk(repositoryRoot, 0);
  return documents;
}

function statusSupportPath(
  repositoryRoot: string,
  sourceFile: string,
  target: string,
): string | undefined {
  const parsed = parseLocalDestination(target);
  if (!parsed || !parsed.path || parsed.path.includes("\\") || isAbsolute(parsed.path)) {
    return undefined;
  }
  const resolved = resolve(dirname(sourceFile), parsed.path);
  if (escapesRoot(repositoryRoot, resolved)) {
    return undefined;
  }
  const relativeTarget = repositoryPath(repositoryRoot, resolved);
  return relativeTarget.startsWith("evidence/") || relativeTarget === ".ai/CURRENT_STATE.md"
    ? resolved
    : undefined;
}

async function localTargetMetadata(repositoryRoot: string, target: string) {
  const segments = relative(repositoryRoot, target).split(sep).filter(Boolean);
  let current = repositoryRoot;
  for (const segment of segments) {
    current = resolve(current, segment);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink()) {
      throw new Error("symbolic local Markdown targets are not followed");
    }
  }
  return lstat(target);
}

async function analyzeRepository(repositoryRoot: string): Promise<DocumentationReport> {
  const analyses = new Map<string, MarkdownAnalysis>();
  const violations: DocumentationViolation[] = [];
  let linkCount = 0;
  let headingCount = 0;
  let statusClaimCount = 0;

  for (const filePath of await collectMarkdownFiles(repositoryRoot)) {
    const file = repositoryPath(repositoryRoot, filePath);
    let sourceText: string;
    try {
      sourceText = utf8Decoder.decode(await readFile(filePath));
    } catch (error) {
      if (error instanceof TypeError) {
        addViolation(violations, {
          file,
          line: 1,
          rule: "invalid-encoding",
          detail: "document must be valid UTF-8",
        });
        continue;
      }
      throw error;
    }
    const analysis = analyzeMarkdown(file, sourceText);
    analyses.set(filePath, analysis);
    linkCount += analysis.links.length;
    headingCount += analysis.headings.size;
    statusClaimCount += analysis.statusClaims.length;
    for (const violation of analysis.violations) {
      addViolation(violations, violation);
    }
  }

  for (const [sourceFile, analysis] of analyses) {
    const file = repositoryPath(repositoryRoot, sourceFile);
    for (const { line, target } of analysis.links) {
      if (/^[A-Za-z]:[\\/]/u.test(target) || /^file:/iu.test(target)) {
        addViolation(violations, {
          file,
          line,
          rule: "absolute-link",
          detail: "local Markdown links must use repository-relative forward-slash paths",
          target,
        });
        continue;
      }
      let parsed: ParsedDestination | undefined;
      try {
        parsed = parseLocalDestination(target);
      } catch (error) {
        addViolation(violations, {
          file,
          line,
          rule: "invalid-link",
          detail: error instanceof Error ? error.message : String(error),
          target,
        });
        continue;
      }
      if (!parsed) {
        continue;
      }
      if (parsed.path.includes("\\") || isAbsolute(parsed.path) || parsed.path.startsWith("/")) {
        addViolation(violations, {
          file,
          line,
          rule: "absolute-link",
          detail: "local Markdown links must use repository-relative forward-slash paths",
          target,
        });
        continue;
      }
      const targetFile = parsed.path ? resolve(dirname(sourceFile), parsed.path) : sourceFile;
      if (escapesRoot(repositoryRoot, targetFile)) {
        addViolation(violations, {
          file,
          line,
          rule: "escaping-link",
          detail: "local Markdown link escapes the repository root",
          target,
        });
        continue;
      }
      try {
        const metadata = await localTargetMetadata(repositoryRoot, targetFile);
        if (!metadata.isFile() && !metadata.isDirectory()) {
          throw new Error("not a regular file or directory");
        }
      } catch (error) {
        addViolation(violations, {
          file,
          line,
          rule:
            error instanceof Error && error.message.includes("symbolic")
              ? "invalid-link"
              : "broken-link",
          detail:
            error instanceof Error && error.message.includes("symbolic")
              ? error.message
              : "local Markdown target does not exist",
          target,
        });
        continue;
      }
      if (parsed.fragment && extname(targetFile).toLocaleLowerCase("en-US") === ".md") {
        let targetAnalysis = analyses.get(targetFile);
        if (!targetAnalysis) {
          const targetText = utf8Decoder.decode(await readFile(targetFile));
          targetAnalysis = analyzeMarkdown(repositoryPath(repositoryRoot, targetFile), targetText);
          analyses.set(targetFile, targetAnalysis);
        }
        const anchor = headingSlug(parsed.fragment);
        if (!anchor || !targetAnalysis.headings.has(anchor)) {
          addViolation(violations, {
            file,
            line,
            rule: "missing-anchor",
            detail: "local Markdown heading fragment does not exist",
            target,
          });
        }
      }
    }

    for (const claim of analysis.statusClaims) {
      let supported = false;
      for (const target of claim.supportTargets) {
        let supportPath: string | undefined;
        try {
          supportPath = statusSupportPath(repositoryRoot, sourceFile, target);
        } catch {
          supportPath = undefined;
        }
        if (!supportPath) {
          continue;
        }
        try {
          if ((await localTargetMetadata(repositoryRoot, supportPath)).isFile()) {
            supported = true;
            break;
          }
        } catch {
          continue;
        }
      }
      if (!supported) {
        addViolation(violations, {
          file,
          line: claim.line,
          rule: "unqualified-status-claim",
          detail:
            "implemented, verified, and released claims in Current status require a local evidence or current-state link on the same line",
        });
      }
    }
  }

  return {
    documents: analyses.size,
    headings: headingCount,
    links: linkCount,
    statusClaims: statusClaimCount,
    violations: violations.sort((left, right) =>
      `${left.file}:${String(left.line).padStart(8, "0")}:${left.rule}`.localeCompare(
        `${right.file}:${String(right.line).padStart(8, "0")}:${right.rule}`,
      ),
    ),
  };
}

export async function scanDocumentation(
  repositoryRoot = defaultRepositoryRoot,
): Promise<DocumentationReport> {
  const resolvedRoot = resolve(repositoryRoot);
  const metadata = await stat(resolvedRoot);
  if (!metadata.isDirectory()) {
    throw new Error(`repository root is not a directory: ${resolvedRoot}`);
  }
  return analyzeRepository(resolvedRoot);
}

export async function runDocumentationCheck(
  repositoryRoot = defaultRepositoryRoot,
): Promise<number> {
  try {
    const report = await scanDocumentation(repositoryRoot);
    if (report.violations.length > 0) {
      console.error(
        JSON.stringify({ check: "documentation", status: "error", ...report }, null, 2),
      );
      return 1;
    }
    console.log(
      JSON.stringify({
        check: "documentation",
        status: "ok",
        documents: report.documents,
        headings: report.headings,
        links: report.links,
        statusClaims: report.statusClaims,
        violations: 0,
      }),
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({ check: "documentation", status: "error", errors: [message] }, null, 2),
    );
    return 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  const requestedRoot = process.argv[2];
  process.exitCode = requestedRoot
    ? await runDocumentationCheck(resolve(requestedRoot))
    : await runDocumentationCheck();
}
