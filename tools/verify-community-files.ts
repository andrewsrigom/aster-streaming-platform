import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const MAX_FILE_BYTES = 200_000;
const MAX_VIOLATIONS = 50;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const COMMUNITY_FILES = [
  ".github/ISSUE_TEMPLATE/bug-report.md",
  ".github/ISSUE_TEMPLATE/change-proposal.md",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/PULL_REQUEST_TEMPLATE.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
] as const;

const ISSUE_TEMPLATE_FILES = ["bug-report.md", "change-proposal.md", "config.yml"] as const;
const DUPLICATE_PULL_REQUEST_LOCATIONS = [
  ".github/pull_request_template.md",
  ".github/PULL_REQUEST_TEMPLATE",
  "pull_request_template.md",
  "PULL_REQUEST_TEMPLATE.md",
  "PULL_REQUEST_TEMPLATE",
  "docs/pull_request_template.md",
  "docs/PULL_REQUEST_TEMPLATE.md",
  "docs/PULL_REQUEST_TEMPLATE",
  "docs/templates/PULL_REQUEST_TEMPLATE.md",
] as const;

export type CommunityRule =
  "bounds" | "chooser" | "file-set" | "frontmatter" | "license" | "security" | "topic" | "utf8";

export interface CommunityViolation {
  detail: string;
  file: string;
  rule: CommunityRule;
}

interface IssueFrontmatter {
  assignees: string;
  labels: string;
  name: string;
  about: string;
  title: string;
}

interface IssueTemplateContract {
  about: string;
  headings: readonly string[];
  name: string;
  title: string;
}

const ISSUE_CONTRACTS = new Map<string, IssueTemplateContract>([
  [
    ".github/ISSUE_TEMPLATE/bug-report.md",
    {
      about: "Report reproducible incorrect behavior without disclosing sensitive data",
      headings: [
        "Existing issue",
        "Requirement or user journey",
        "Current behavior",
        "Expected behavior",
        "Reproduction",
        "Environment",
        "Failure and impact",
        "Evidence",
        "Additional context",
      ],
      name: "Bug report",
      title: "[Bug] ",
    },
  ],
  [
    ".github/ISSUE_TEMPLATE/change-proposal.md",
    {
      about: "Propose one bounded product, architecture, reliability, or operational outcome",
      headings: [
        "Problem or opportunity",
        "Requirement or decision",
        "Desired outcome",
        "Boundaries and ownership",
        "Non-goals",
        "Failure, security, and privacy",
        "Alternatives and trade-offs",
        "Verification and evidence",
        "Rollback or recovery",
      ],
      name: "Change proposal",
      title: "[Proposal] ",
    },
  ],
]);

const PULL_REQUEST_HEADINGS = [
  "Requirement or defect",
  "Why",
  "Behavior",
  "Boundaries and ownership",
  "Failure behavior",
  "Security and privacy",
  "Data and migration",
  "Observability",
  "Tests",
  "Evidence",
  "Rollback or roll-forward",
  "Documentation",
  "Contribution declaration",
] as const;

function addViolation(violations: CommunityViolation[], violation: CommunityViolation): void {
  if (violations.length >= MAX_VIOLATIONS) {
    throw new Error(`community violations exceed ${MAX_VIOLATIONS}`);
  }
  violations.push(violation);
}

function unquote(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseIssueFrontmatter(
  file: string,
  source: string,
  violations: CommunityViolation[],
): { body: string; frontmatter?: IssueFrontmatter } {
  const normalized = source.replace(/\r\n?/gu, "\n");
  if (!normalized.startsWith("---\n")) {
    addViolation(violations, {
      detail: "issue template must begin with YAML front matter",
      file,
      rule: "frontmatter",
    });
    return { body: normalized };
  }
  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) {
    addViolation(violations, {
      detail: "issue template front matter is not closed",
      file,
      rule: "frontmatter",
    });
    return { body: normalized };
  }

  const allowedKeys = new Set(["name", "about", "title", "labels", "assignees"]);
  const values = new Map<string, string>();
  for (const line of normalized.slice(4, end).split("\n")) {
    const match = /^(?<key>[a-z_]+):\s*(?<value>.*)$/u.exec(line);
    const key = match?.groups?.["key"];
    const value = match?.groups?.["value"];
    if (!key || value === undefined || !allowedKeys.has(key) || values.has(key)) {
      addViolation(violations, {
        detail: "issue front matter contains an unsupported, duplicate, or malformed field",
        file,
        rule: "frontmatter",
      });
      continue;
    }
    values.set(key, unquote(value));
  }
  for (const key of allowedKeys) {
    if (!values.has(key)) {
      addViolation(violations, {
        detail: `issue front matter is missing ${key}`,
        file,
        rule: "frontmatter",
      });
    }
  }
  if (["name", "about", "title"].some((key) => !(values.get(key) ?? "").trim())) {
    addViolation(violations, {
      detail: "issue name, about, and title must be non-empty",
      file,
      rule: "frontmatter",
    });
  }
  if (values.size !== allowedKeys.size) {
    return { body: normalized.slice(end + 5) };
  }
  return {
    body: normalized.slice(end + 5),
    frontmatter: Object.fromEntries(values) as unknown as IssueFrontmatter,
  };
}

function requireHeadings(
  file: string,
  source: string,
  headings: readonly string[],
  violations: CommunityViolation[],
): void {
  for (const heading of headings) {
    if (!source.includes(`\n## ${heading}\n`)) {
      addViolation(violations, {
        detail: `required section is missing: ${heading}`,
        file,
        rule: "topic",
      });
    }
  }
}

function validateIssueTemplate(
  file: string,
  source: string,
  contract: IssueTemplateContract,
  violations: CommunityViolation[],
): void {
  const { body, frontmatter } = parseIssueFrontmatter(file, source, violations);
  if (frontmatter) {
    for (const key of ["name", "about", "title"] as const) {
      if (frontmatter[key] !== contract[key]) {
        addViolation(violations, {
          detail: `${key} does not match the reviewed issue contract`,
          file,
          rule: "frontmatter",
        });
      }
    }
    if (frontmatter.labels !== "" || frontmatter.assignees !== "") {
      addViolation(violations, {
        detail: "issue templates must not invent labels or assignees before remote governance",
        file,
        rule: "frontmatter",
      });
    }
  }
  requireHeadings(file, body, contract.headings, violations);
  if (!/SECURITY\.md/iu.test(body) || !/public issue/iu.test(body)) {
    addViolation(violations, {
      detail: "issue template must redirect private security reports",
      file,
      rule: "security",
    });
  }
}

function validatePullRequestTemplate(source: string, violations: CommunityViolation[]): void {
  const file = ".github/PULL_REQUEST_TEMPLATE.md";
  requireHeadings(file, source, PULL_REQUEST_HEADINGS, violations);
  for (const phrase of [
    "Owning context",
    "Authoritative data",
    "Trust boundaries",
    "Deadlines, cancellation, retry safety, and concurrency effects",
    "Raw artifact paths or hosted links",
    "MIT License",
  ]) {
    if (!source.includes(phrase)) {
      addViolation(violations, {
        detail: `pull-request contract is missing: ${phrase}`,
        file,
        rule: phrase === "MIT License" ? "license" : "topic",
      });
    }
  }
  if (!/credentials, tokens, personal data, private exploit details/iu.test(source)) {
    addViolation(violations, {
      detail: "pull-request declaration must prohibit sensitive public data",
      file,
      rule: "security",
    });
  }
}

export function validateCommunitySources(
  sources: ReadonlyMap<string, string>,
): CommunityViolation[] {
  const violations: CommunityViolation[] = [];
  const expected = new Set<string>(COMMUNITY_FILES);
  for (const file of COMMUNITY_FILES) {
    if (!sources.has(file)) {
      addViolation(violations, {
        detail: "required community file is missing",
        file,
        rule: "file-set",
      });
    }
  }
  for (const file of sources.keys()) {
    if (!expected.has(file)) {
      addViolation(violations, { detail: "unexpected community file", file, rule: "file-set" });
    }
  }

  for (const [file, source] of sources) {
    if (Buffer.byteLength(source, "utf8") > MAX_FILE_BYTES) {
      addViolation(violations, {
        detail: `community file exceeds ${MAX_FILE_BYTES} bytes`,
        file,
        rule: "bounds",
      });
      continue;
    }
    const issueContract = ISSUE_CONTRACTS.get(file);
    if (issueContract) {
      validateIssueTemplate(file, source, issueContract, violations);
    }
  }

  const chooser = sources.get(".github/ISSUE_TEMPLATE/config.yml");
  if (
    chooser !== undefined &&
    chooser.replace(/\r\n?/gu, "\n").trim() !== "blank_issues_enabled: false\ncontact_links: []"
  ) {
    addViolation(violations, {
      detail: "issue chooser must disable blank contributor issues without unverified contacts",
      file: ".github/ISSUE_TEMPLATE/config.yml",
      rule: "chooser",
    });
  }

  const pullRequest = sources.get(".github/PULL_REQUEST_TEMPLATE.md");
  if (pullRequest !== undefined) {
    validatePullRequestTemplate(pullRequest, violations);
  }

  const contributing = sources.get("CONTRIBUTING.md");
  if (
    contributing !== undefined &&
    (!/provide it under the repository's \[MIT License\]\(LICENSE\)/u.test(contributing) ||
      !/Media contributions additionally require the rights record/u.test(contributing))
  ) {
    addViolation(violations, {
      detail: "contribution licensing must preserve MIT and separate media rights",
      file: "CONTRIBUTING.md",
      rule: "license",
    });
  }

  const security = sources.get("SECURITY.md");
  if (
    security !== undefined &&
    (!/Do not publish vulnerabilities, exploit details/iu.test(security) ||
      !/GitHub private vulnerability reporting is enabled/iu.test(security) ||
      !/https:\/\/github\.com\/andrewsrigom\/aster-streaming-platform\/security\/advisories\/new/iu.test(
        security,
      ))
  ) {
    addViolation(violations, {
      detail:
        "security policy must prohibit public disclosure and preserve the verified private channel",
      file: "SECURITY.md",
      rule: "security",
    });
  }
  return violations.sort((left, right) =>
    `${left.file}:${left.rule}:${left.detail}`.localeCompare(
      `${right.file}:${right.rule}:${right.detail}`,
    ),
  );
}

async function readBoundedFile(root: string, file: string): Promise<string> {
  const path = resolve(root, file);
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${file} must be a regular file`);
  }
  if (metadata.size > MAX_FILE_BYTES) {
    throw new Error(`${file} exceeds ${MAX_FILE_BYTES} bytes`);
  }
  const bytes = await readFile(path);
  try {
    return utf8Decoder.decode(bytes);
  } catch {
    throw new Error(`${file} is not valid UTF-8`);
  }
}

export async function scanCommunityFiles(root = repositoryRoot): Promise<CommunityViolation[]> {
  const violations: CommunityViolation[] = [];
  const issueDirectory = resolve(root, ".github", "ISSUE_TEMPLATE");
  const issueDirectoryMetadata = await lstat(issueDirectory);
  if (!issueDirectoryMetadata.isDirectory() || issueDirectoryMetadata.isSymbolicLink()) {
    throw new Error(".github/ISSUE_TEMPLATE must be a regular directory");
  }
  const entries = await readdir(issueDirectory, { withFileTypes: true });
  const names = entries.map(({ name }) => name).sort();
  if (JSON.stringify(names) !== JSON.stringify([...ISSUE_TEMPLATE_FILES].sort())) {
    addViolation(violations, {
      detail: "issue-template directory does not match the reviewed file set",
      file: ".github/ISSUE_TEMPLATE",
      rule: "file-set",
    });
  }

  let canonicalPullRequestPath: string | undefined;
  try {
    canonicalPullRequestPath = await realpath(resolve(root, ".github/PULL_REQUEST_TEMPLATE.md"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  for (const duplicate of DUPLICATE_PULL_REQUEST_LOCATIONS) {
    try {
      const duplicatePath = resolve(root, duplicate);
      const duplicateMetadata = await lstat(duplicatePath);
      if (
        canonicalPullRequestPath &&
        !duplicateMetadata.isSymbolicLink() &&
        (await realpath(duplicatePath)) === canonicalPullRequestPath
      ) {
        continue;
      }
      addViolation(violations, {
        detail: "duplicate pull-request template location must be removed",
        file: duplicate,
        rule: "file-set",
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  const sources = new Map<string, string>();
  for (const file of COMMUNITY_FILES) {
    try {
      sources.set(file, await readBoundedFile(root, file));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      addViolation(violations, {
        detail,
        file,
        rule: /UTF-8/u.test(detail)
          ? "utf8"
          : /exceeds|regular file/u.test(detail)
            ? "bounds"
            : "file-set",
      });
    }
  }
  for (const violation of validateCommunitySources(sources)) {
    addViolation(violations, violation);
  }
  return violations.sort((left, right) =>
    `${left.file}:${left.rule}:${left.detail}`.localeCompare(
      `${right.file}:${right.rule}:${right.detail}`,
    ),
  );
}

export async function runCommunityCheck(root = repositoryRoot): Promise<number> {
  try {
    const violations = await scanCommunityFiles(root);
    if (violations.length > 0) {
      console.error(JSON.stringify({ check: "community", status: "error", violations }, null, 2));
      return 1;
    }
    console.log(
      JSON.stringify({
        check: "community",
        files: COMMUNITY_FILES.length,
        status: "ok",
        violations: 0,
      }),
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({ check: "community", status: "error", errors: [message] }, null, 2),
    );
    return 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  process.exitCode = await runCommunityCheck();
}
