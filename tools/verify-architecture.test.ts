import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { analyzeSource, scanRepository } from "./verify-architecture.ts";

const repositoryRoot = resolve("/aster-fixture");
const domainFile = resolve(repositoryRoot, "services/catalog/src/domain/title.ts");

test("accepts inward domain imports and ignores package names in comments and strings", () => {
  const violations = analyzeSource({
    filePath: domainFile,
    repositoryRoot,
    sourceText: `
      // import express from "express";
      const documentation = "redis";
      import type { TitleId } from "./title-id.ts";
      export { TitleId } from "./title-id.ts";
      void documentation;
    `,
  });
  assert.deepEqual(violations, []);
});

test("rejects framework and infrastructure clients in domain code", () => {
  const violations = analyzeSource({
    filePath: domainFile,
    repositoryRoot,
    sourceText: `
      import express from "express";
      const redis = await import("@redis/client");
      void express;
      void redis;
    `,
  });
  assert.deepEqual(
    violations.map(({ rule, specifier }) => ({ rule, specifier })),
    [
      { rule: "forbidden-external", specifier: "@redis/client" },
      { rule: "forbidden-external", specifier: "express" },
    ],
  );
});

test("rejects outward layer dependencies", () => {
  const applicationFile = resolve(repositoryRoot, "services/catalog/src/application/load-title.ts");
  const violations = analyzeSource({
    filePath: applicationFile,
    repositoryRoot,
    sourceText: `import { database } from "../infrastructure/database.ts"; void database;`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.rule, "layer-direction");
});

test("rejects relative imports that escape the workspace package", () => {
  const violations = analyzeSource({
    filePath: domainFile,
    repositoryRoot,
    sourceText: `import { progress } from "../../../../engagement/src/domain/progress.ts"; void progress;`,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.rule, "package-escape");
});

test("rejects malformed source instead of analyzing a partial tree", () => {
  assert.throws(() =>
    analyzeSource({
      filePath: domainFile,
      repositoryRoot,
      sourceText: `import { broken from "./broken.ts";`,
    }),
  );
});

test("scans only real source files below approved workspace packages", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "aster-architecture-"));
  context.after(async () => rm(temporaryRoot, { force: true, recursive: true }));
  const sourceDirectory = join(temporaryRoot, "services", "catalog", "src", "domain");
  await mkdir(sourceDirectory, { recursive: true });
  await writeFile(join(sourceDirectory, "title.ts"), `import pino from "pino"; void pino;`, "utf8");
  await writeFile(join(sourceDirectory, "notes.txt"), `import express from "express";`, "utf8");

  const violations = await scanRepository(temporaryRoot);
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.specifier, "pino");
});

test("ignores workspace build/dependency output but still checks application source", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "aster-web-architecture-"));
  context.after(async () => rm(temporaryRoot, { force: true, recursive: true }));
  const web = join(temporaryRoot, "apps", "web");
  for (const directory of [".next", "node_modules", "dist", "test-results"]) {
    await mkdir(join(web, directory), { recursive: true });
    await writeFile(join(web, directory, "compiled.js"), "x".repeat(1_000_001));
  }
  const source = join(web, "src", "domain");
  await mkdir(source, { recursive: true });
  await writeFile(join(source, "invalid.ts"), 'import pg from "pg"; void pg;');
  const violations = await scanRepository(temporaryRoot);
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.specifier, "pg");
});
