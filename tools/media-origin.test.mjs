import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath, URL } from "node:url";
import { serviceBlock, STORAGE_IMAGE } from "./verify-optional-platform.mjs";

test("local publication origin is read-only, loopback-only and cannot gain writer mounts", async () => {
  const source = (
    await readFile(new URL("../infra/compose/media.yml", import.meta.url), "utf8")
  ).replaceAll("\r\n", "\n");
  const origin = serviceBlock(source, "media-origin");
  for (const required of [
    "    profiles: [media]\n",
    "    image: " + STORAGE_IMAGE + "\n",
    '"--readonly"',
    '    ports: ["127.0.0.1:9001:9001"]\n',
    '    volumes: ["storage-data:/data:ro"]\n',
    "    networks: [platform]\n",
    "    read_only: true\n",
    "    cap_drop: [ALL]\n",
    "    security_opt: [no-new-privileges:true]\n",
    "    cpus: 0.5\n",
    "    mem_limit: 128m\n",
    "    pids_limit: 64\n",
    '"--max-connections"',
    '"--max-requests"',
  ]) {
    assert.ok(origin.includes(required), required);
  }
  assert.doesNotMatch(origin, /--admin-port|--webui|privileged:|cap_add:|docker\.sock/u);
  const initializer = serviceBlock(source, "media-origin-init");
  assert.ok(initializer.includes('"./dist/src/prepare-publication-local.js"'));
  assert.ok(initializer.includes('      ASTER_MEDIA_PUBLICATION_ENABLED: "true"'));
  assert.doesNotMatch(initializer, /DATABASE|ports:|volumes:/u);
});

test("origin fixture refuses arguments and endpoint overrides before starting Docker", async () => {
  const execute = promisify(execFile);
  const tool = fileURLToPath(new URL("./run-media-origin-integration.mjs", import.meta.url));
  for (const [args, environment] of [
    [["unexpected"], {}],
    [[], { DOCKER_HOST: "ssh://remote.invalid" }],
    [[], { DOCKER_CONTEXT: "remote" }],
    [[], { DOCKER_TLS_VERIFY: "1" }],
  ]) {
    await assert.rejects(
      execute(process.execPath, [tool, ...args], {
        timeout: 3000,
        env: { ...process.env, PATH: "/no-docker-here", ...environment },
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
