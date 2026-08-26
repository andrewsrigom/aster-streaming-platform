import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  cleanFoundation,
  FOUNDATION_GENERATED_PATHS,
  validateCleanupArguments,
} from "./clean-foundation.mjs";

async function fixtureRoot(context) {
  const root = await mkdtemp(join(tmpdir(), "aster-foundation-clean-"));
  context.after(async () => rm(root, { force: true, recursive: true }));
  await writeFile(join(root, "package.json"), "{}\n", "utf8");
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
  return root;
}

test("removes only allowlisted generated foundation paths", async (context) => {
  const root = await fixtureRoot(context);
  await mkdir(join(root, ".turbo", "cache"), { recursive: true });
  await mkdir(join(root, "node_modules", "fixture"), { recursive: true });
  await writeFile(join(root, ".turbo", "cache", "entry"), "generated", "utf8");
  await writeFile(join(root, "node_modules", "fixture", "index.js"), "generated", "utf8");
  await writeFile(join(root, "README.md"), "# Keep\n", "utf8");

  assert.deepEqual((await cleanFoundation(root)).removed, FOUNDATION_GENERATED_PATHS);
  await assert.rejects(lstat(join(root, ".turbo")), { code: "ENOENT" });
  await assert.rejects(lstat(join(root, "node_modules")), { code: "ENOENT" });
  assert.equal(await readFile(join(root, "README.md"), "utf8"), "# Keep\n");
});

test("is idempotent when generated paths are absent", async (context) => {
  const root = await fixtureRoot(context);
  assert.deepEqual(await cleanFoundation(root), { removed: [] });
});

test("rejects path arguments at the command boundary", () => {
  assert.doesNotThrow(() => validateCleanupArguments([]));
  assert.throws(() => validateCleanupArguments(["../outside"]), /does not accept path arguments/u);
});

test("rejects an unmarked root before deleting anything", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "aster-foundation-unmarked-"));
  context.after(async () => rm(root, { force: true, recursive: true }));
  await mkdir(join(root, ".turbo"));

  await assert.rejects(cleanFoundation(root), /repository marker package\.json/u);
  assert.ok((await lstat(join(root, ".turbo"))).isDirectory());
});

test("unlinks a generated-path symlink without traversing its target", async (context) => {
  const root = await fixtureRoot(context);
  const externalRoot = await mkdtemp(join(tmpdir(), "aster-foundation-external-"));
  context.after(async () => rm(externalRoot, { force: true, recursive: true }));
  await writeFile(join(externalRoot, "preserved.txt"), "preserved\n", "utf8");
  await symlink(externalRoot, join(root, ".turbo"));

  assert.deepEqual((await cleanFoundation(root)).removed, [".turbo"]);
  await assert.rejects(lstat(join(root, ".turbo")), { code: "ENOENT" });
  assert.equal(await readFile(join(externalRoot, "preserved.txt"), "utf8"), "preserved\n");
});
