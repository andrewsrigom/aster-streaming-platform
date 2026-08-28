import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { analyzeMarkdown, scanDocumentation } from "./verify-documentation.ts";

test("accepts canonical prose and ignores terminology inside code", () => {
  const analysis = analyzeMarkdown(
    "README.md",
    [
      "# Fixture",
      "",
      "TypeScript uses Node.js and GraphQL.",
      "",
      "```text",
      "NodeJS Typescript Github",
      "```",
      "",
      "Use `Javascript` only as a literal example.",
    ].join("\n"),
  );
  assert.deepEqual(analysis.violations, []);
});

test("rejects missing titles, mismatched fences, merge markers, and terminology drift", () => {
  const analysis = analyzeMarkdown(
    "docs/broken.md",
    ["Intro with NodeJS.", "<<<<<<< ours", "```ts", "const value = true;", "~~~"].join("\n"),
  );
  assert.deepEqual(
    analysis.violations.map(({ rule }) => rule),
    ["missing-title", "non-canonical-term", "unresolved-merge-marker", "unbalanced-fence"],
  );
});

test("accepts closed issue-template front matter without weakening title checks", () => {
  const valid = analyzeMarkdown(
    ".github/ISSUE_TEMPLATE/bug-report.md",
    '---\nname: Bug report\nabout: Report behavior\ntitle: "[Bug] "\nlabels: ""\nassignees: ""\n---\n\n# Bug report\n',
  );
  assert.deepEqual(valid.violations, []);

  const missingTitle = analyzeMarkdown(
    ".github/ISSUE_TEMPLATE/bug-report.md",
    "---\nname: Bug report\n---\n\nDescribe the bug.\n",
  );
  assert.equal(missingTitle.violations[0]?.rule, "missing-title");

  const unrelatedFrontmatter = analyzeMarkdown(
    "docs/status.md",
    "---\nname: Status\n---\n\n# Status\n",
  );
  assert.equal(unrelatedFrontmatter.violations[0]?.rule, "missing-title");
});

test("rejects unqualified absolute maturity claims", () => {
  const analysis = analyzeMarkdown(
    "docs/status.md",
    "# Status\n\nThe entire platform is fully implemented.",
  );
  assert.equal(analysis.violations[0]?.rule, "unqualified-status-claim");
});

test("rejects undefined reference links", () => {
  const analysis = analyzeMarkdown(
    "README.md",
    "# Fixture\n\nRead the [missing reference][details].",
  );
  assert.equal(analysis.violations[0]?.rule, "invalid-link");
});

test("validates existing files and local heading fragments", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "aster-docs-valid-"));
  context.after(async () => rm(root, { force: true, recursive: true }));
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(
    join(root, "README.md"),
    "# Fixture\n\nSee [design](docs/design.md#request-flow).",
    "utf8",
  );
  await writeFile(join(root, "docs", "design.md"), "# Design\n\n## Request flow\n", "utf8");

  const report = await scanDocumentation(root);
  assert.equal(report.documents, 2);
  assert.equal(report.links, 1);
  assert.deepEqual(report.violations, []);
});

test("excludes generated Next output without exempting authored Web documentation", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "aster-docs-next-"));
  context.after(async () => rm(root, { force: true, recursive: true }));
  const web = join(root, "apps", "web");
  const notices = join(web, ".next", "standalone", "THIRD_PARTY_LICENSES");
  await mkdir(notices, { recursive: true });
  await writeFile(join(notices, "LICENSE.md"), "Original upstream terms, not Aster prose.");
  await writeFile(join(web, "README.md"), "Authored text still needs a title.");
  const report = await scanDocumentation(root);
  assert.equal(report.documents, 1);
  assert.deepEqual(
    report.violations.map(({ file, rule }) => ({ file, rule })),
    [{ file: "apps/web/README.md", rule: "missing-title" }],
  );
});

test("rejects missing files, missing fragments, and repository escape", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "aster-docs-links-"));
  context.after(async () => rm(root, { force: true, recursive: true }));
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(
    join(root, "README.md"),
    [
      "# Fixture",
      "",
      "[missing](docs/missing.md)",
      "[anchor](docs/design.md#unknown)",
      "[escape](../outside.md)",
      "[windows](C:\\outside.md)",
    ].join("\n"),
    "utf8",
  );
  await writeFile(join(root, "docs", "design.md"), "# Design\n\n## Known\n", "utf8");

  const report = await scanDocumentation(root);
  assert.deepEqual(
    report.violations.map(({ rule }) => rule),
    ["broken-link", "missing-anchor", "escaping-link", "absolute-link"],
  );
});

test("requires checked-in support for explicit current-status maturity claims", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "aster-docs-status-"));
  context.after(async () => rm(root, { force: true, recursive: true }));
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(join(root, "evidence"), { recursive: true });
  await writeFile(join(root, "evidence", "check.txt"), "PASS\n", "utf8");
  await writeFile(
    join(root, "docs", "supported.md"),
    "# Supported\n\n## Current status\n\nThe check is verified by [evidence](../evidence/check.txt).",
    "utf8",
  );
  await writeFile(
    join(root, "docs", "unsupported.md"),
    "# Unsupported\n\n## Current status\n\nThe application is implemented.",
    "utf8",
  );

  const report = await scanDocumentation(root);
  assert.equal(report.statusClaims, 2);
  assert.deepEqual(
    report.violations.map(({ file, rule }) => ({ file, rule })),
    [{ file: "docs/unsupported.md", rule: "unqualified-status-claim" }],
  );
});

test("rejects malformed UTF-8 rather than scanning replacement characters", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "aster-docs-encoding-"));
  context.after(async () => rm(root, { force: true, recursive: true }));
  await writeFile(join(root, "README.md"), Buffer.from([0xc3, 0x28]));

  const report = await scanDocumentation(root);
  assert.equal(report.violations[0]?.rule, "invalid-encoding");
});
