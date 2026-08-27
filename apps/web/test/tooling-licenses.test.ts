import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";

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
