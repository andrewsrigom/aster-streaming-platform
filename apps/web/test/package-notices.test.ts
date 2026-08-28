import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { packageWebNotices } from "../scripts/package-notices.ts";

async function fixture(t: TestContext, name = "sample") {
  const root = await mkdtemp(join(tmpdir(), "aster-web-notices-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const web = join(root, "apps/web");
  const standalone = join(web, ".next/standalone");
  const dependency = join(root, "node_modules", name);
  await mkdir(join(web, "licenses"), { recursive: true });
  await mkdir(join(standalone, "node_modules/.pnpm"), { recursive: true });
  await mkdir(dependency, { recursive: true });
  await writeFile(
    join(web, "package.json"),
    JSON.stringify({
      name: "@aster/web",
      version: "0.0.0",
      dependencies: { [name]: "1.0.0" },
    }),
  );
  await writeFile(
    join(dependency, "package.json"),
    JSON.stringify({
      name,
      version: "1.0.0",
      license: "MIT",
    }),
  );
  await writeFile(join(dependency, "LICENSE"), "MIT fixture license\n");
  await writeFile(join(web, "THIRD_PARTY_NOTICES.md"), "Aster fixture notices\n");
  return { root, web, standalone, dependency };
}

test("notice packaging retains original nested licenses and reproducible hashes without code", async (t) => {
  const { web, standalone, dependency } = await fixture(t);
  await mkdir(join(dependency, "dist/vendor"), { recursive: true });
  await writeFile(join(dependency, "dist/vendor/NOTICE.txt"), "Nested vendor fixture\n");
  await writeFile(join(dependency, "dist/index.js"), "private code must not enter notices");
  const result = await packageWebNotices(web, standalone);
  assert.equal(result.packages, 1);
  assert.equal(result.artifacts, 2);
  const path = join(standalone, "THIRD_PARTY_LICENSES/inventory.json");
  const first = await readFile(path, "utf8");
  const inventory = JSON.parse(first) as {
    artifacts: { path: string; sha256: string }[];
  };
  for (const artifact of inventory.artifacts) {
    assert.doesNotMatch(artifact.path, /index\.js/u);
    const body = await readFile(join(standalone, "THIRD_PARTY_LICENSES", artifact.path));
    assert.equal(createHash("sha256").update(body).digest("hex"), artifact.sha256);
  }
  await writeFile(join(standalone, "THIRD_PARTY_LICENSES/stale.txt"), "old generated notice");
  await packageWebNotices(web, standalone);
  assert.equal(await readFile(path, "utf8"), first);
  await assert.rejects(readFile(join(standalone, "THIRD_PARTY_LICENSES/stale.txt")));
});

test("missing, empty and oversized notices fail instead of silently producing an incomplete image", async (t) => {
  const { web, standalone, dependency } = await fixture(t);
  const license = join(dependency, "LICENSE");
  await rm(license);
  await assert.rejects(packageWebNotices(web, standalone), /Missing upstream notice/u);
  await writeFile(license, "");
  await assert.rejects(packageWebNotices(web, standalone), /Invalid notice size/u);
  await writeFile(license, "x".repeat(2 * 1024 * 1024 + 1));
  await assert.rejects(packageWebNotices(web, standalone), /Invalid notice size/u);
});

test("missing required dependencies and path traversal fail; absent optional platforms do not", async (t) => {
  const { web, standalone, dependency } = await fixture(t);
  const file = join(dependency, "package.json");
  for (const dependencies of [{ missing: "1" }, { "../escape": "1" }]) {
    await writeFile(file, JSON.stringify({ name: "sample", version: "1.0.0", dependencies }));
    await assert.rejects(packageWebNotices(web, standalone));
  }
  await writeFile(
    file,
    JSON.stringify({
      name: "sample",
      version: "1.0.0",
      optionalDependencies: { missing: "1" },
    }),
  );
  assert.equal((await packageWebNotices(web, standalone)).packages, 1);
});

test("notice output cannot replace a symlink outside the generated directory", async (t) => {
  const { root, web, standalone } = await fixture(t);
  const outside = join(root, "retained");
  await mkdir(outside);
  await writeFile(join(outside, "sentinel"), "unchanged");
  await symlink(outside, join(standalone, "THIRD_PARTY_LICENSES"), "dir");
  await assert.rejects(packageWebNotices(web, standalone), /real directory/u);
  assert.equal(await readFile(join(outside, "sentinel"), "utf8"), "unchanged");
});

test("native bundle notices require both GPL and LGPL texts", async (t) => {
  const name = "@img/sharp-libvips-linux-x64";
  const { web, standalone, dependency } = await fixture(t, name);
  await writeFile(
    join(dependency, "package.json"),
    JSON.stringify({
      name,
      version: "1.3.3",
      license: "LGPL-3.0-or-later",
    }),
  );
  await rm(join(dependency, "LICENSE"));
  await writeFile(join(dependency, "README.md"), "Native upstream notice fixture\n");
  await writeFile(join(dependency, "versions.json"), '{"vips":"8.18.6"}');
  await assert.rejects(packageWebNotices(web, standalone), /ENOENT/u);
  await writeFile(join(web, "licenses/LGPL-3.0.txt"), "LGPL fixture\n");
  await assert.rejects(packageWebNotices(web, standalone), /ENOENT/u);
  await writeFile(join(web, "licenses/GPL-3.0.txt"), "GPL fixture\n");
  assert.equal((await packageWebNotices(web, standalone)).packages, 1);
});
