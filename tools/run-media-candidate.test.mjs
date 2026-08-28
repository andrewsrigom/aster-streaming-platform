import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";

const execute = promisify(execFile);
const tool = fileURLToPath(new URL("./run-media-candidate.mjs", import.meta.url));
test("media candidate runner refuses wrong targets and remote overrides before Docker", async () => {
  const valid = ["aster-test", "00000000-0000-4000-8000-000000000001"];
  for (const [args, extra] of [
    [["production", valid[1]], {}],
    [[valid[0], "../../escape"], {}],
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
