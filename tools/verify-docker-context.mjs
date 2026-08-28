import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { URL } from "node:url";
import { promisify } from "node:util";

const included = [
  "package.json",
  "LICENSE",
  "packages/sample/package.json",
  "packages/sample/src/nested/port.ts",
  "packages/sample/test/example.test.ts",
  "services/identity/src/main.ts",
  "services/catalog/migrations/001.sql",
  "apps/web/package.json",
  "apps/web/app/nested/page.tsx",
  "apps/web/components/ui/button.tsx",
  "apps/web/scripts/public-artifacts.ts",
  "apps/web/scripts/verify-public-build.ts",
  "apps/web/scripts/package-notices.ts",
  "apps/web/licenses/LGPL-3.0.txt",
  "apps/web/licenses/SOURCES.md",
  "infra/router/generated/supergraph.graphql",
  "evidence/phase-05/generated-media.json",
  "tools/media/hls.mjs",
];
const excluded = [
  "apps/web/test-results/trace.zip",
  "apps/web/playwright-report/index.html",
  "apps/web/.env.local",
  "apps/web/unreviewed.txt",
  "apps/web/licenses/unreviewed.txt",
  "apps/web/public/unreviewed.mp4",
  "packages/sample/private.txt",
  "packages/sample/private.pem",
  "packages/sample/dist/output.js",
  "packages/sample/node_modules/dep/index.js",
  "services/catalog/report.txt",
  "docs/private.md",
  "evidence/phase-05/raw-trace.json",
  "evidence/unreviewed.txt",
  "infra/router/unreviewed.txt",
  "tools/unreviewed.ts",
];

// Exercise Docker's actual matching, not a second imitation of its glob semantics.
// Only synthetic canaries enter this scratch build; no images or containers are created.
const fixture = await mkdtemp(join(tmpdir(), "aster-docker-context-"));
const context = join(fixture, "context");
const output = join(fixture, "output");
try {
  await mkdir(context);
  for (const file of [...included, ...excluded]) {
    await mkdir(dirname(join(context, file)), { recursive: true });
    await writeFile(join(context, file), "aster synthetic context fixture\n");
  }
  await writeFile(
    join(context, ".dockerignore"),
    await readFile(new URL("../.dockerignore", import.meta.url)),
  );
  const dockerfile = join(fixture, "Dockerfile");
  await writeFile(dockerfile, "FROM scratch\nCOPY . /\n");
  await promisify(execFile)(
    "docker",
    [
      "build",
      "--network=none",
      "--output",
      `type=local,dest=${output}`,
      "--file",
      dockerfile,
      context,
    ],
    { timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true },
  );
  const actual = [];
  async function visit(directory, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) {
        await visit(join(directory, entry.name), name + "/");
      } else {
        assert.ok(entry.isFile(), "Unexpected special file in the synthetic context.");
        actual.push(name);
      }
    }
  }
  await visit(output);
  assert.deepEqual(actual.sort(), [...included].sort());
  console.log(
    JSON.stringify({
      check: "docker-context",
      included: included.length,
      excluded: excluded.length,
      status: "ok",
    }),
  );
} finally {
  await rm(fixture, { recursive: true, force: true });
}
