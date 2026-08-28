import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";
import { serviceBlock } from "./verify-optional-platform.mjs";
import { validatePlaybackRuntime } from "./verify-playback-runtime.mjs";

const compose = await readFile(new URL("../infra/compose/compose.yml", import.meta.url), "utf8");

test("Playback Compose isolates runtime credentials, dependencies and finite migration", () => {
  assert.deepEqual(validatePlaybackRuntime(compose), []);
  for (const service of ["playback", "playback-init"]) {
    const block = serviceBlock(compose, service);
    for (const [before, after] of [
      ['user: "1000:1000"', 'user: "0:0"'],
      ["read_only: true", "read_only: false"],
      ["cap_drop: [ALL]", "cap_add: [SYS_ADMIN]"],
      ["stop_grace_period: 15s", "stop_grace_period: 1s"],
      ["pids:", "x-pids:"],
      ["    networks: [platform]\n", "    networks: [platform, edge]\n    ports: [3300:3300]\n"],
      [
        "    depends_on:\n",
        "    depends_on:\n      identity:\n        condition: service_healthy\n",
      ],
    ]) {
      assert.ok(
        validatePlaybackRuntime(compose.replace(block, block.replace(before, after))).length,
        service + ": " + before,
      );
    }
  }
  for (const [before, after] of [
    ["playback-router-trust:/run/aster-router:ro", "catalog-router-trust:/run/aster-router:ro"],
    [
      "playback-catalog-trust:/run/aster-playback-catalog:ro",
      "playback-router-trust:/run/aster-playback-catalog:ro",
    ],
    ["postgresql://aster_playback_local@postgres", "postgresql://aster@postgres"],
    ['ASTER_PLAYBACK_LOCAL_ENABLED: "true"', 'ASTER_PLAYBACK_LOCAL_ENABLED: "false"'],
    [
      '      ASTER_PLAYBACK_HTTP_PORT: "3300"',
      "      ASTER_PLAYBACK_ADMIN_DATABASE_PASSWORD: aster-test-only",
    ],
  ]) {
    assert.ok(validatePlaybackRuntime(compose.replaceAll(before, after)).length, before);
  }
});
