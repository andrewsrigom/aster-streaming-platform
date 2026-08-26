import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseNulSeparatedSecretPaths, scanSecrets, scanText } from "./scan-secrets.ts";

function secretFixture(prefix: string, length: number): string {
  return `${prefix}${"A".repeat(length)}`;
}

test("detects high-confidence provider credentials without returning matched values", () => {
  const aws = secretFixture("AKIA", 16);
  const github = secretFixture("ghp_", 36);
  const findings = scanText("fixture.env", `AWS=${aws}\nGITHUB=${github}\n`);
  assert.deepEqual(
    findings.map(({ rule }) => rule),
    ["aws-access-key", "github-token"],
  );
  assert.equal(JSON.stringify(findings).includes(aws), false);
  assert.equal(JSON.stringify(findings).includes(github), false);
});

test("detects private keys, credential URLs, and generic assignments", () => {
  const source = [
    ["-----BEGIN RSA ", "PRIVATE KEY-----"].join(""),
    ["DATABASE_URL=postgresql://aster:", "long-password", "@database/aster"].join(""),
    ["client_", "secret=", "actual-sensitive-value"].join(""),
  ].join("\n");
  assert.deepEqual(
    scanText("fixture.env", source).map(({ rule }) => rule),
    ["private-key", "connection-credentials", "generic-assignment"],
  );
});

test("accepts explicit non-secret placeholders", () => {
  const source = [
    "PASSWORD=${ASTER_PASSWORD}",
    "API_KEY=replace-me",
    "CLIENT_SECRET=<provided-by-secret-store>",
    "AUTH_TOKEN=not-a-secret",
  ].join("\n");
  assert.deepEqual(scanText(".env.example", source), []);
});

test("reports line numbers without including assigned values", () => {
  const value = "sensitive-value-123";
  const findings = scanText("fixture.env", `SAFE=true\nPASSWORD=${value}\n`);
  assert.equal(findings[0]?.line, 2);
  assert.equal(findings[0].detail.includes(value), false);
});

test("parses bounded NUL-delimited Git paths", () => {
  assert.deepEqual(parseNulSeparatedSecretPaths("README.md\0docs/guide.md\0", 2), [
    "README.md",
    "docs/guide.md",
  ]);
  assert.throws(() => parseNulSeparatedSecretPaths("README.md", 1));
  assert.throws(() => parseNulSeparatedSecretPaths("../outside\0", 1));
  assert.throws(() => parseNulSeparatedSecretPaths("one\0two\0", 1));
});

test("reads staged index bytes and detects a safe synthetic fixture", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "aster-secret-index-"));
  context.after(async () => rm(root, { force: true, recursive: true }));
  const synthetic = secretFixture("AKIA", 16);
  await writeFile(join(root, "fixture.env"), `CREDENTIAL=${synthetic}\n`, "utf8");
  assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: root }).status, 0);
  assert.equal(spawnSync("git", ["add", "fixture.env"], { cwd: root }).status, 0);

  const findings = await scanSecrets(root, "staged");
  assert.equal(findings[0]?.rule, "aws-access-key");
  assert.equal(JSON.stringify(findings).includes(synthetic), false);
});
