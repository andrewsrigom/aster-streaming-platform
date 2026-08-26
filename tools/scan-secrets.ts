import { spawnSync } from "node:child_process";
import { lstat, readFile, readlink } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const MAX_ALL_FILES = 10_000;
const MAX_STAGED_FILES = 500;
const MAX_PATH_BYTES = 4_096;
const MAX_GIT_OUTPUT_BYTES = 2_000_000;
const MAX_FILE_BYTES = 2_000_000;
const MAX_TOTAL_BYTES = 50_000_000;
const MAX_FINDINGS = 100;
const MAX_LINE_CHARACTERS = 20_000;
const BINARY_SAMPLE_BYTES = 8_192;

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

export type SecretRule =
  | "aws-access-key"
  | "connection-credentials"
  | "generic-assignment"
  | "github-token"
  | "google-api-key"
  | "private-key"
  | "slack-token"
  | "stripe-live-key";

export interface SecretFinding {
  detail: string;
  file: string;
  line: number;
  rule: SecretRule;
}

interface SecretPattern {
  pattern: RegExp;
  rule: Exclude<SecretRule, "generic-assignment">;
}

const SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    pattern: /-----BEGIN (?:DSA |EC |OPENSSH |RSA )?PRIVATE KEY-----/gu,
    rule: "private-key",
  },
  { pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/gu, rule: "aws-access-key" },
  {
    pattern: /\b(?:gh[pousr]_[A-Za-z\d_]{30,255}|github_pat_[A-Za-z\d_]{20,255})\b/gu,
    rule: "github-token",
  },
  { pattern: /\bsk_live_[A-Za-z\d]{20,}\b/gu, rule: "stripe-live-key" },
  { pattern: /\bxox[baprs]-[A-Za-z\d-]{20,}\b/gu, rule: "slack-token" },
  { pattern: /\bAIza[A-Za-z\d_-]{35}\b/gu, rule: "google-api-key" },
  {
    pattern: /\b(?:mongodb(?:\+srv)?|mysql|postgres(?:ql)?|redis):\/\/[^:\s/@]+:[^@\s/]{8,}@/giu,
    rule: "connection-credentials",
  },
];

const GENERIC_ASSIGNMENT =
  /\b(?:access[_-]?token|api[_-]?key|auth[_-]?token|client[_-]?secret|password|passwd|private[_-]?key|secret)\b\s*[:=]\s*["']?(?<value>[^\s"'`,;#]{8,})/giu;

function lineNumberAt(text: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text.charCodeAt(cursor) === 10) {
      line += 1;
    }
  }
  return line;
}

function isPlaceholder(value: string): boolean {
  const normalized = value.toLocaleLowerCase("en-US").replace(/[}>),.]+$/gu, "");
  return (
    normalized.startsWith("$") ||
    normalized.startsWith("%") ||
    normalized.startsWith("<") ||
    normalized.startsWith("{{") ||
    normalized.startsWith("your_") ||
    normalized.includes("changeme") ||
    normalized.includes("change-me") ||
    normalized.includes("dummy") ||
    normalized.includes("example") ||
    normalized.includes("not-a-secret") ||
    normalized.includes("placeholder") ||
    normalized.includes("redacted") ||
    normalized.includes("replace") ||
    normalized.includes("sample") ||
    normalized.includes("test-only") ||
    /^x+$/u.test(normalized)
  );
}

function addFinding(findings: SecretFinding[], finding: SecretFinding): void {
  if (findings.length >= MAX_FINDINGS) {
    throw new Error(`secret findings exceed ${MAX_FINDINGS}`);
  }
  findings.push(finding);
}

export function scanText(file: string, text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const line of text.replace(/\r\n?/gu, "\n").split("\n")) {
    if (line.length > MAX_LINE_CHARACTERS) {
      throw new Error(`${file}: line exceeds ${MAX_LINE_CHARACTERS} characters`);
    }
  }

  for (const { pattern, rule } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      addFinding(findings, {
        detail: `possible ${rule} detected; matched value is redacted`,
        file,
        line: lineNumberAt(text, match.index),
        rule,
      });
    }
  }

  GENERIC_ASSIGNMENT.lastIndex = 0;
  for (const match of text.matchAll(GENERIC_ASSIGNMENT)) {
    const value = match.groups?.["value"];
    if (value && !isPlaceholder(value)) {
      addFinding(findings, {
        detail: "possible credential assignment detected; assigned value is redacted",
        file,
        line: lineNumberAt(text, match.index),
        rule: "generic-assignment",
      });
    }
  }
  return findings;
}

export function parseNulSeparatedSecretPaths(output: string, maximumFiles: number): string[] {
  if (Buffer.byteLength(output, "utf8") > MAX_GIT_OUTPUT_BYTES) {
    throw new Error(`Git path output exceeds ${MAX_GIT_OUTPUT_BYTES} bytes`);
  }
  if (!output) {
    return [];
  }
  if (!output.endsWith("\0")) {
    throw new Error("Git path output is not NUL terminated");
  }
  const paths = output.slice(0, -1).split("\0");
  if (paths.length > maximumFiles) {
    throw new Error(`secret-scan file count exceeds ${maximumFiles}`);
  }
  for (const path of paths) {
    if (
      !path ||
      path.includes("\0") ||
      path.includes("\uFFFD") ||
      path.includes("\\") ||
      isAbsolute(path) ||
      path === ".." ||
      path.startsWith("../") ||
      path.includes("/../") ||
      Buffer.byteLength(path, "utf8") > MAX_PATH_BYTES
    ) {
      throw new Error("Git returned an unsafe or malformed path");
    }
  }
  return paths;
}

function gitPaths(mode: "all" | "staged", root: string): string[] {
  const args =
    mode === "staged"
      ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]
      : ["ls-files", "--cached", "--others", "--exclude-standard", "-z"];
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    timeout: 10_000,
    windowsHide: true,
  });
  if (result.error) {
    throw new Error(`unable to list ${mode} files: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "unknown Git failure").trim();
    throw new Error(`Git ${mode} file query failed: ${detail}`);
  }
  return parseNulSeparatedSecretPaths(
    result.stdout,
    mode === "staged" ? MAX_STAGED_FILES : MAX_ALL_FILES,
  );
}

async function workingTreeBytes(path: string, root: string): Promise<Buffer> {
  const absolutePath = resolve(root, path);
  const metadata = await lstat(absolutePath);
  if (metadata.isSymbolicLink()) {
    return Buffer.from(await readlink(absolutePath), "utf8");
  }
  if (!metadata.isFile()) {
    return Buffer.alloc(0);
  }
  if (metadata.size > MAX_FILE_BYTES) {
    throw new Error(`${path} exceeds ${MAX_FILE_BYTES} bytes`);
  }
  return readFile(absolutePath);
}

function stagedBytes(path: string, root: string): Buffer {
  const result = spawnSync("git", ["show", `:${path}`], {
    cwd: root,
    encoding: "buffer",
    maxBuffer: MAX_FILE_BYTES + 1,
    timeout: 10_000,
    windowsHide: true,
  });
  if (result.error) {
    throw new Error(`unable to read staged file ${path}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`unable to read staged file ${path}`);
  }
  if (result.stdout.length > MAX_FILE_BYTES) {
    throw new Error(`${path} exceeds ${MAX_FILE_BYTES} bytes`);
  }
  return result.stdout;
}

function isBinary(bytes: Buffer): boolean {
  return bytes.subarray(0, BINARY_SAMPLE_BYTES).includes(0);
}

export async function scanSecrets(root: string, mode: "all" | "staged"): Promise<SecretFinding[]> {
  const findings: SecretFinding[] = [];
  let totalBytes = 0;
  for (const path of gitPaths(mode, root)) {
    let bytes: Buffer;
    try {
      bytes = mode === "staged" ? stagedBytes(path, root) : await workingTreeBytes(path, root);
    } catch (error) {
      if (mode === "all" && (error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      throw error;
    }
    totalBytes += bytes.length;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error(`secret-scan input exceeds ${MAX_TOTAL_BYTES} total bytes`);
    }
    if (!bytes.length || isBinary(bytes)) {
      continue;
    }
    let text: string;
    try {
      text = utf8Decoder.decode(bytes);
    } catch {
      continue;
    }
    for (const finding of scanText(path, text)) {
      addFinding(findings, finding);
    }
  }
  return findings.sort((left, right) =>
    `${left.file}:${String(left.line).padStart(8, "0")}:${left.rule}`.localeCompare(
      `${right.file}:${String(right.line).padStart(8, "0")}:${right.rule}`,
    ),
  );
}

export async function runSecretCheck(mode: "all" | "staged"): Promise<number> {
  try {
    const findings = await scanSecrets(repositoryRoot, mode);
    if (findings.length > 0) {
      console.error(JSON.stringify({ check: "secrets", status: "error", mode, findings }, null, 2));
      return 1;
    }
    console.log(JSON.stringify({ check: "secrets", status: "ok", mode, findings: 0 }));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({ check: "secrets", status: "error", mode, errors: [message] }, null, 2),
    );
    return 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  const mode = process.argv[2];
  if (mode !== "--all" && mode !== "--staged") {
    console.error("usage: node tools/scan-secrets.ts --all|--staged");
    process.exitCode = 2;
  } else {
    process.exitCode = await runSecretCheck(mode === "--all" ? "all" : "staged");
  }
}
