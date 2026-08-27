import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { resolveSchemaBaseline } from "./resolve-schema-baseline.ts";

test("manual feature/main histories select an earlier contract; event baselines stay explicit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aster-ci-schema-"));
  const execute = promisify(execFile);
  const git = async (...args: string[]): Promise<string> =>
    (
      await execute("git", args, {
        cwd: directory,
        encoding: "utf8",
        timeout: 5000,
        maxBuffer: 4096,
        windowsHide: true,
      })
    ).stdout.trim();
  const commit = async (content: string): Promise<string> => {
    await writeFile(join(directory, "api.graphql"), content);
    await git("add", "api.graphql");
    await git(
      "-c",
      "user.name=Aster fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "test: change synthetic schema",
    );
    return git("rev-parse", "HEAD");
  };
  try {
    await git("init", "--quiet", "-b", "main");
    const initial = await commit("type Query { previous: String }");
    await git("update-ref", "refs/remotes/origin/main", initial);
    await assert.rejects(resolveSchemaBaseline(directory));
    await git("switch", "-c", "feature");
    const feature = await commit("type Query { rewritten: String }");
    assert.equal(await resolveSchemaBaseline(directory), initial);
    assert.equal(await resolveSchemaBaseline(directory, ""), initial);
    assert.equal(await resolveSchemaBaseline(directory, initial), initial);
    const script = fileURLToPath(new URL("./resolve-schema-baseline.ts", import.meta.url));
    const cli = (baseline: string) =>
      execute(process.execPath, [script], {
        cwd: directory,
        env: { ...process.env, ASTER_SCHEMA_BASE: baseline },
        timeout: 5000,
        maxBuffer: 4096,
        windowsHide: true,
      });
    assert.equal((await cli("")).stdout.trim(), initial);
    await assert.rejects(cli(feature), (error: unknown) => {
      assert.ok(error instanceof Error && "stdout" in error && "code" in error);
      assert.equal(error.code, 1);
      assert.equal(error.stdout, "");
      return true;
    });
    assert.match(
      await git("show", (await resolveSchemaBaseline(directory)) + ":api.graphql"),
      /previous/u,
    );
    for (const invalid of [feature, "main", "--all", " ", "0".repeat(40), "f".repeat(40)]) {
      await assert.rejects(resolveSchemaBaseline(directory, invalid));
    }
    await git("switch", "main");
    const laterMain = await commit("type Query { previous: String additive: String }");
    await git("update-ref", "refs/remotes/origin/main", laterMain);
    assert.equal(await resolveSchemaBaseline(directory), initial);
    await git("switch", "--detach", feature);
    assert.equal(await resolveSchemaBaseline(directory), initial);
    assert.equal(await resolveSchemaBaseline(directory, laterMain), laterMain);
    await git("update-ref", "-d", "refs/remotes/origin/main");
    await assert.rejects(resolveSchemaBaseline(directory));
    assert.equal(await resolveSchemaBaseline(directory, initial), initial);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
