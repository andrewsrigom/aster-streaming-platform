import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";

const execute = promisify(execFile);
const tool = fileURLToPath(new URL("./run-media-candidate.mjs", import.meta.url));
const media = fileURLToPath(new URL("../infra/compose/media.yml", import.meta.url));
test("bounded image preparation precedes the processing deadline and owner startup", async () => {
  const source = await readFile(tool, "utf8");
  const ownerBuild = source.indexOf('await docker([...compose, "build", "media-prepare"], 360000)');
  const decoderBuild = source.indexOf(
    'await docker([...compose, "build", "media-decoder"], 360000)',
  );
  const deadline = source.indexOf("deadline = setTimeout(stop, 1800000)");
  const allocate = source.indexOf("allocated = true");
  const ownerStart = source.indexOf('    "media-prepare",\n    attemptId');
  assert.ok(ownerBuild > 0 && ownerBuild < decoderBuild && decoderBuild < deadline);
  assert.ok(deadline < allocate && allocate < ownerStart);
  assert.equal(source.match(/"build", "media-decoder"/gu)?.length, 1);
  assert.match(source.slice(ownerBuild, deadline), /if \(!reuse\)/u);
  assert.ok(
    source.includes('assert.ok(!reuse, "Explicit candidate reuse must not start a decoder.")'),
  );
  assert.ok(source.includes("clearTimeout(deadline)"));
});

test("actual media coordinator receives the reviewed bounded OTLP endpoint", async () => {
  const [runnerSource, mediaSource] = await Promise.all([
    readFile(tool, "utf8"),
    readFile(media, "utf8"),
  ]);
  assert.match(runnerSource, /"infra\/compose\/compose\.yml"[\s\S]*"infra\/compose\/media\.yml"/u);
  const prepare = mediaSource.split("  media-prepare:")[1]?.split("  media-decoder:")[0];
  assert.ok(prepare);
  assert.match(prepare, /ASTER_OTLP_METRICS_ENDPOINT: http:\/\/collector:4318\/v1\/metrics/u);
  assert.doesNotMatch(prepare, /depends_on:[\s\S]*collector:/u);
});
test("media candidate runner refuses wrong targets and remote overrides before Docker", async () => {
  const valid = ["aster-test", "00000000-0000-4000-8000-000000000001"];
  for (const [args, extra] of [
    [["production", valid[1]], {}],
    [["aster-" + "a".repeat(65), valid[1]], {}],
    [[valid[0], "../../escape"], {}],
    [[...valid, "--artwork", "unexpected"], {}],
    [[...valid, "--artwork", "--reuse", "invalid", "invalid"], {}],
    [[...valid, "--artwork"], { DOCKER_HOST: "ssh://remote.invalid" }],
    [valid, { DOCKER_HOST: "ssh://remote.invalid" }],
    [valid, { DOCKER_CONTEXT: "remote" }],
    [valid, { CI: "true" }],
  ]) {
    await assert.rejects(
      execute(process.execPath, [tool, ...args], {
        timeout: 3000,
        env: { ...process.env, PATH: "/no-docker-here", ...extra },
      }),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /AssertionError/u);
        assert.doesNotMatch(error.stderr, /spawn docker ENOENT/u);
        return true;
      },
    );
  }
});
