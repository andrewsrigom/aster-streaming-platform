import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { promisify } from "node:util";
import { runGeneratedMediaFixture } from "./run-media-fixture.mjs";

const execute = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
assert.ok(args.length === 2 || (args.length === 4 && args[2] === "--report"));
assert.equal(args[0], "--project");
const project = args[1];
assert.match(project, /^aster(?:-[a-z0-9][a-z0-9-]{0,47})?$/);
const compose = ["compose", "-f", "infra/compose/compose.yml", "--project-name", project];
const docker = async (args, timeout = 15000, input) => {
  const pending = execute("docker", args, {
    cwd: root,
    timeout,
    killSignal: "SIGKILL",
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  pending.child.stdin.end(input);
  const result = await pending;
  return result.stdout.trim();
};
const id = await docker([...compose, "ps", "--quiet", "postgres"]);
assert.match(id, /^[a-f0-9]{64}$/);
const database = JSON.parse(await docker(["inspect", id]))[0];
assert.equal(database.Config.Labels["com.docker.compose.project"], project);
assert.equal(database.Config.Labels["com.docker.compose.service"], "postgres");
assert.equal(database.Config.Labels["com.aster.environment"], "local");
assert.equal(database.State.Health.Status, "healthy");
let report;
if (args[2] === "--report") {
  const file = await stat(args[3]);
  assert.ok(file.isFile() && file.size > 0 && file.size <= 16384);
  report = JSON.parse(await readFile(args[3], "utf8"));
} else {
  report = await runGeneratedMediaFixture();
}
assert.ok(Buffer.byteLength(JSON.stringify(report)) <= 16384);
await docker([...compose, "build", "catalog-init"], 180000);
const output = await docker(
  [
    ...compose,
    "run",
    "--rm",
    "--no-deps",
    "-T",
    "--env",
    "ASTER_CATALOG_UI_SEED_ENABLED=true",
    "--env",
    "ASTER_CATALOG_DATABASE_URL=postgresql://aster_catalog_local@postgres:5432/aster",
    "--env",
    "ASTER_CATALOG_DATABASE_PASSWORD=aster-test-only",
    "catalog-init",
    "./dist/src/seed-local.js",
  ],
  30000,
  JSON.stringify(report),
);
process.stdout.write(output + "\n");
