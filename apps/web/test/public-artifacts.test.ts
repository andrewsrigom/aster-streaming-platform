import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { publicArtifactFindings, verifyPublicBuild } from "../scripts/public-artifacts.ts";

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "aster-public-artifact-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("artifact scan distinguishes public operations from private configuration and credentials", () => {
  assert.deepEqual(
    publicArtifactFindings(
      "query Profiles { profiles { activeProfileId } } http://127.0.0.1:4000/graphql",
    ),
    [],
  );
  for (const [rule, value] of [
    ["server-configuration", "ASTER_WEB_ROUTER_URL"],
    ["private-transport", "x-aster-router-credential"],
    ["private-endpoint", "http://router:4000/graphql"],
    ["database-endpoint", "postgresql://test-only@postgres:5432/aster"],
    ["session-cookie", "aster_local_session=test-only-cookie"],
    ["private-key", ["-----BEGIN", "PRIVATE KEY-----"].join(" ")],
    ["access-key", "AKIA" + "A".repeat(16)],
    ["github-token", "ghp_" + "a".repeat(32)],
    ["jwt", `eyJ${"a".repeat(16)}.${"b".repeat(16)}.${"c".repeat(16)}`],
    ["test-instrumentation", "axe-core"],
  ] as const) {
    assert.ok(publicArtifactFindings(value).includes(rule));
    const escaped = Array.from(
      value,
      (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
    ).join("");
    assert.ok(publicArtifactFindings(JSON.stringify(escaped)).includes(rule));
  }
  assert.deepEqual(publicArtifactFindings("public catalog", ["private-fixture"]), []);
  assert.deepEqual(publicArtifactFindings('"private-fixture"', ["private-fixture"]), [
    "private-fixture-value",
  ]);
  assert.throws(() => publicArtifactFindings("x".repeat(4 * 1024 * 1024 + 1)));
  assert.throws(() => publicArtifactFindings("", [""]));
});

test("build scan covers lazy chunks and CSS, records hashes, and cannot pass missing or empty output", async (t) => {
  const root = await fixture(t);
  await assert.rejects(verifyPublicBuild(join(root, "absent")));
  await assert.rejects(verifyPublicBuild(root), /no JavaScript/u);
  await mkdir(join(root, "chunks"));
  await writeFile(join(root, "chunks", "main.js"), "");
  await assert.rejects(verifyPublicBuild(root), /empty JavaScript/u);
  await writeFile(join(root, "chunks", "main.js"), 'console.log("public");');
  await writeFile(join(root, "chunks", "lazy.js"), 'console.log("Profiles");');
  await writeFile(join(root, "chunks", "main.css"), "body{color:#fff}");
  const result = await verifyPublicBuild(root);
  assert.equal(result.javascriptFiles, 2);
  assert.equal(result.assets.length, 3);
  assert.ok(result.assets.every((asset) => /^[a-f\d]{64}$/u.test(asset.sha256)));
  await writeFile(join(root, "chunks", "lazy.js"), 'const canary="ASTER_WEB_ROUTER_URL"');
  await assert.rejects(verifyPublicBuild(root), /server-configuration.*Values redacted/u);
  await writeFile(join(root, "chunks", "lazy.js"), 'console.log("Profiles");');
  await writeFile(join(root, "chunks", "main.css"), "/* http://identity:3100/graphql */");
  await assert.rejects(verifyPublicBuild(root), /private-endpoint/u);
});

test("build scan refuses maps, external links, invalid UTF-8 and oversized artifacts", async (t) => {
  const root = await fixture(t);
  const file = join(root, "main.js");
  await writeFile(file, "public;");
  const map = join(root, "main.js.map");
  await writeFile(map, "{}");
  await assert.rejects(verifyPublicBuild(root), /source maps/u);
  await rm(map);
  const link = join(root, "external.js");
  await symlink(file, link);
  await assert.rejects(verifyPublicBuild(root), /link or special/u);
  await rm(link);
  await writeFile(file, Buffer.from([0xff]));
  await assert.rejects(verifyPublicBuild(root));
  await writeFile(file, "x".repeat(4 * 1024 * 1024 + 1));
  await assert.rejects(verifyPublicBuild(root), /byte bound/u);
});
