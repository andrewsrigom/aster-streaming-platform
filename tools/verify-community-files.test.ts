import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import {
  COMMUNITY_FILES,
  scanCommunityFiles,
  validateCommunitySources,
} from "./verify-community-files.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");

async function actualSources(): Promise<Map<string, string>> {
  const sources = new Map<string, string>();
  for (const file of COMMUNITY_FILES) {
    sources.set(file, await readFile(resolve(repositoryRoot, file), "utf8"));
  }
  return sources;
}

function requiredSource(sources: ReadonlyMap<string, string>, file: string): string {
  const source = sources.get(file);
  assert.ok(source, `missing test source: ${file}`);
  return source;
}

async function writeFixture(root: string): Promise<void> {
  for (const [file, source] of await actualSources()) {
    const path = resolve(root, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, source, "utf8");
  }
}

test("the checked-in community contract passes", async () => {
  assert.deepEqual(await scanCommunityFiles(repositoryRoot), []);
});

test("rejects missing and unexpected community files", async () => {
  const sources = await actualSources();
  sources.delete("SECURITY.md");
  sources.set("docs/templates/PULL_REQUEST_TEMPLATE.md", "# Duplicate\n");
  const rules = validateCommunitySources(sources).map(({ rule }) => rule);
  assert.ok(rules.includes("file-set"));
});

test("rejects malformed or drifted issue front matter", async () => {
  const sources = await actualSources();
  const file = ".github/ISSUE_TEMPLATE/bug-report.md";
  sources.set(file, requiredSource(sources, file).replace("about:", "description:"));
  assert.ok(validateCommunitySources(sources).some(({ rule }) => rule === "frontmatter"));
});

test("rejects missing pull-request topics and enabled blank issues", async () => {
  const sources = await actualSources();
  const pullRequest = ".github/PULL_REQUEST_TEMPLATE.md";
  sources.set(
    pullRequest,
    requiredSource(sources, pullRequest).replace("## Failure behavior", "## Notes"),
  );
  sources.set(".github/ISSUE_TEMPLATE/config.yml", "blank_issues_enabled: true\n");
  const rules = validateCommunitySources(sources).map(({ rule }) => rule);
  assert.ok(rules.includes("topic"));
  assert.ok(rules.includes("chooser"));
});

test("rejects weakened licensing and public security guidance", async () => {
  const sources = await actualSources();
  sources.set(
    "CONTRIBUTING.md",
    requiredSource(sources, "CONTRIBUTING.md").replace("provide it under", "retain it outside"),
  );
  sources.set(
    "SECURITY.md",
    requiredSource(sources, "SECURITY.md").replace(
      "Do not publish vulnerabilities",
      "Publish vulnerabilities",
    ),
  );
  const rules = validateCommunitySources(sources).map(({ rule }) => rule);
  assert.ok(rules.includes("license"));
  assert.ok(rules.includes("security"));
});

test("rejects oversized community content", async () => {
  const sources = await actualSources();
  sources.set("CONTRIBUTING.md", "x".repeat(200_001));
  assert.ok(validateCommunitySources(sources).some(({ rule }) => rule === "bounds"));
});

test("rejects malformed UTF-8, duplicate templates, and symbolic community files", async () => {
  const invalidRoot = await mkdtemp(join(tmpdir(), "aster-community-invalid-"));
  const symbolicRoot = await mkdtemp(join(tmpdir(), "aster-community-symbolic-"));
  try {
    await writeFixture(invalidRoot);
    await writeFile(resolve(invalidRoot, "SECURITY.md"), Buffer.from([0xff, 0xfe]));
    await mkdir(resolve(invalidRoot, "docs"), { recursive: true });
    await writeFile(resolve(invalidRoot, "docs", "pull_request_template.md"), "# Duplicate\n");
    const invalidViolations = await scanCommunityFiles(invalidRoot);
    assert.ok(invalidViolations.some(({ rule }) => rule === "utf8"));
    assert.ok(invalidViolations.some(({ rule }) => rule === "file-set"));

    await writeFixture(symbolicRoot);
    const pullRequest = resolve(symbolicRoot, ".github", "PULL_REQUEST_TEMPLATE.md");
    await unlink(pullRequest);
    await symlink("../CONTRIBUTING.md", pullRequest);
    assert.ok((await scanCommunityFiles(symbolicRoot)).some(({ rule }) => rule === "bounds"));
  } finally {
    await rm(invalidRoot, { force: true, recursive: true });
    await rm(symbolicRoot, { force: true, recursive: true });
  }
});
