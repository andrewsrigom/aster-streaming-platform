import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import { reviewedLicensePackages, verifyReviewedLockVersions } from "../scripts/license-policy.ts";

test("every package-specific exception rejects missing or additional unreviewed lock versions", async () => {
  const lock = await readFile(new URL("../../../pnpm-lock.yaml", import.meta.url), "utf8");
  verifyReviewedLockVersions(lock);
  assert.equal(reviewedLicensePackages.length, 29);
  for (const { name } of reviewedLicensePackages) {
    assert.throws(() => {
      verifyReviewedLockVersions(lock + "\n  '" + name + "@99.0.0':\n");
    });
  }
  assert.throws(() => {
    verifyReviewedLockVersions("");
  });
});

test("installed exception packages retain the reviewed version and license metadata", async () => {
  const store = new URL("../../../node_modules/.pnpm/", import.meta.url);
  const directories = await readdir(store);
  const checked = new Set<string>();
  for (const reviewed of reviewedLicensePackages) {
    const prefix = reviewed.name.replace("/", "+") + "@" + reviewed.version;
    for (const directory of directories.filter(
      (name) => name === prefix || name.startsWith(prefix + "_"),
    )) {
      const manifest = JSON.parse(
        await readFile(
          new URL(directory + "/node_modules/" + reviewed.name + "/package.json", store),
          "utf8",
        ),
      ) as Manifest;
      assert.equal(manifest.name, reviewed.name);
      assert.equal(manifest.version, reviewed.version);
      assert.equal(manifest.license, reviewed.license);
      checked.add(reviewed.name);
    }
  }
  for (const name of ["@axe-core/playwright", "axe-core", "caniuse-lite", "lightningcss"]) {
    assert.ok(checked.has(name), name);
  }
});

interface Manifest {
  name: string;
  version: string;
  license: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

test("ADR-0019 exceptions remain exact, unmodified dev-only tools without install hooks", async () => {
  const require = createRequire(import.meta.url);
  const adapterPath = require.resolve("@axe-core/playwright");
  const enginePath = createRequire(adapterPath).resolve("axe-core/package.json");
  const own = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as Manifest;
  assert.equal(own.devDependencies?.["@axe-core/playwright"], "4.13.0");
  assert.ok(own.scripts?.["build"]?.includes("node ./scripts/package-notices.ts"));
  for (const [path, name] of [
    [join(dirname(adapterPath), "../package.json"), "@axe-core/playwright"],
    [enginePath, "axe-core"],
  ]) {
    assert.ok(path && name);
    const manifest = JSON.parse(await readFile(path, "utf8")) as Manifest;
    assert.equal(manifest.name, name);
    assert.equal(manifest.version, "4.13.0");
    assert.equal(manifest.license, "MPL-2.0");
    assert.equal(own.dependencies?.[name], undefined);
    for (const hook of ["preinstall", "install", "postinstall"]) {
      assert.equal(manifest.scripts?.[hook], undefined);
    }
    assert.match(
      await readFile(join(dirname(path), "LICENSE"), "utf8"),
      /Mozilla Public License, version 2\.0/u,
    );
  }
  const lock = await readFile(new URL("../../../pnpm-lock.yaml", import.meta.url), "utf8");
  const packages = [
    ...lock.matchAll(/^ {2}'?(@axe-core\/playwright|axe-core)@([^:'\s(]+)[^:]*:/gmu),
  ];
  assert.deepEqual([...new Set(packages.map((entry) => `${entry[1]}@${entry[2]}`))].sort(), [
    "@axe-core/playwright@4.13.0",
    "axe-core@4.13.0",
  ]);
});
