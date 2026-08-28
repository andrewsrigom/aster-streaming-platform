import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";
import { serviceBlock } from "./verify-optional-platform.mjs";
import { validateEngagementRuntime } from "./verify-engagement-runtime.mjs";

const compose = await readFile(new URL("../infra/compose/compose.yml", import.meta.url), "utf8");

test("Engagement Compose isolates runtime credentials, dependencies and finite migration", () => {
  assert.deepEqual(validateEngagementRuntime(compose), []);
  for (const service of ["engagement", "engagement-init"]) {
    const block = serviceBlock(compose, service);
    for (const [before, after] of [
      ['user: "1000:1000"', 'user: "0:0"'],
      ["read_only: true", "read_only: false"],
      ["cap_drop: [ALL]", "cap_add: [SYS_ADMIN]"],
      ["stop_grace_period: 15s", "stop_grace_period: 1s"],
      ["pids:", "x-pids:"],
      ["    networks: [platform]\n", "    networks: [platform, edge]\n    ports: [3400:3400]\n"],
      [
        "    depends_on:\n",
        "    depends_on:\n      identity:\n        condition: service_healthy\n",
      ],
    ]) {
      assert.ok(
        validateEngagementRuntime(compose.replace(block, block.replace(before, after))).length,
        service + ": " + before,
      );
    }
  }
  for (const [before, after] of [
    ["engagement-router-trust:/run/aster-router:ro", "catalog-router-trust:/run/aster-router:ro"],
    [
      "engagement-identity-trust:/run/aster-engagement-identity:ro",
      "engagement-router-trust:/run/aster-engagement-identity:ro",
    ],
    ["postgresql://aster_engagement_local@postgres", "postgresql://aster@postgres"],
    ['ASTER_ENGAGEMENT_LOCAL_ENABLED: "true"', 'ASTER_ENGAGEMENT_LOCAL_ENABLED: "false"'],
    [
      '      ASTER_ENGAGEMENT_HTTP_PORT: "3400"',
      "      ASTER_ENGAGEMENT_ADMIN_DATABASE_PASSWORD: aster-test-only",
    ],
  ]) {
    assert.ok(validateEngagementRuntime(compose.replaceAll(before, after)).length, before);
  }
});
