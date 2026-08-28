import assert from "node:assert/strict";
import { test } from "node:test";
import { tmpdir } from "node:os";
import { mkdtemp, readFile, rmdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { runProcess } from "../src/infrastructure/process.js";

test("process runner bounds output, time and cancellation and never interpolates arguments", async () => {
  const run = (script: string, signal = AbortSignal.timeout(5000), timeout = 3000) =>
    runProcess(process.execPath, ["-e", script], tmpdir(), signal, timeout);
  assert.equal(await run('process.stdout.write("$(uname);&")'), "$(uname);&");
  await assert.rejects(run("setInterval(()=>{},1000)", AbortSignal.timeout(30)), {
    code: "CANCELLED",
  });
  await assert.rejects(run("setInterval(()=>{},1000)", AbortSignal.timeout(5000), 30), {
    code: "PROCESS_TIMEOUT",
  });
  await assert.rejects(run("process.stdout.write('x'.repeat(100000))"), { code: "OUTPUT_LIMIT" });
  await assert.rejects(run("process.stderr.write('x'.repeat(100000))"), { code: "OUTPUT_LIMIT" });
  await assert.rejects(run("process.exit(1)"), { code: "PROCESS_FAILED" });
  await assert.rejects(run("", AbortSignal.abort()), { code: "CANCELLED" });
  await assert.rejects(
    runProcess("/does-not-exist", [], tmpdir(), AbortSignal.timeout(1000), 500),
    { code: "PROCESS_FAILED" },
  );
});

test("deadline kills the owned process group including a spawned child", async () => {
  const root = await mkdtemp(join(tmpdir(), "aster-process-tree-"));
  const file = join(root, "child.pid");
  try {
    const script =
      'const {spawn}=require("node:child_process");' +
      'const child=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});' +
      'require("node:fs").writeFileSync(process.argv[1],String(child.pid));setInterval(()=>{},1000)';
    await assert.rejects(
      runProcess(process.execPath, ["-e", script, file], root, AbortSignal.timeout(5000), 2000),
      { code: "PROCESS_TIMEOUT" },
    );
    const pid = Number(await readFile(file, "utf8"));
    assert.ok(Number.isInteger(pid) && pid > 1);
    try {
      const status = await readFile("/proc/" + String(pid) + "/stat", "utf8");
      assert.match(status, /\) Z /u);
    } catch (error) {
      assert.ok(error instanceof Error && "code" in error && error.code === "ENOENT");
    }
  } finally {
    await unlink(file);
    await rmdir(root);
  }
});
