import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";
import { serviceBlock } from "./verify-optional-platform.mjs";
import {
  eventShutdownComplete,
  validateEngagementRuntime,
  validateEventDeliveryOverlay,
} from "./verify-engagement-runtime.mjs";

const compose = await readFile(new URL("../infra/compose/compose.yml", import.meta.url), "utf8");

test("full Engagement SQL fixtures track the current migrator instead of historical schema versions", async () => {
  const migrator = await readFile(
    new URL("../services/engagement/src/infrastructure/local-migrations.ts", import.meta.url),
    "utf8",
  );
  const versions = [...migrator.matchAll(/"(\d{4})-[a-z-]+"/gu)].map((match) => Number(match[1]));
  assert.deepEqual(versions, [1, 2, 3, 4]);
  for (const name of ["engagement-fields", "watchlist", "events"]) {
    const proof = await readFile(
      new URL(`../services/engagement/test/integration/${name}-postgres.ts`, import.meta.url),
      "utf8",
    );
    const firstApplied = proof.match(/\.applied,\s*(\[[\d,\s]*\])/u)?.[1];
    assert.ok(firstApplied, name);
    assert.deepEqual(JSON.parse(firstApplied), versions, name);
    if (name === "engagement-fields") {
      const reported = proof.match(/schemaVersions:\s*(\[[\d,\s]*\])/u)?.[1];
      assert.ok(reported);
      assert.deepEqual(JSON.parse(reported), versions);
    }
  }
});

test("event shutdown requires all completed lifecycles, not a signal exit code alone", () => {
  const owners = ["identity", "catalog", "engagement"];
  const statuses = owners.map((owner) => ({
    owner,
    running: false,
    oomKilled: false,
    exitCode: 143,
  }));
  const records = owners.map((service) => ({
    service,
    event: "aster.lifecycle.shutdown_completed",
    outcome: "ok",
    attributes: { outcome: "completed", trigger: "sigterm" },
  }));
  assert.equal(eventShutdownComplete(statuses, records), true);
  for (const change of [
    { exitCode: 0 },
    { exitCode: 137 },
    { running: true },
    { oomKilled: true },
  ]) {
    assert.equal(
      eventShutdownComplete([{ ...statuses[0], ...change }, ...statuses.slice(1)], records),
      false,
    );
  }
  assert.equal(eventShutdownComplete(statuses.slice(1), records), false);
  assert.equal(eventShutdownComplete([statuses[0], statuses[0], statuses[2]], records), false);
  assert.equal(eventShutdownComplete(statuses, records.slice(1)), false);
  assert.equal(
    eventShutdownComplete(
      statuses,
      records.map((r) => ({ ...r, attributes: { outcome: "failed", trigger: "sigterm" } })),
    ),
    false,
  );
});

test("event overlay keeps destructive-event trust private, retained and resource-bounded", async () => {
  const overlay = await readFile(new URL("../infra/compose/events.yml", import.meta.url), "utf8");
  assert.deepEqual(validateEventDeliveryOverlay(overlay), []);
  for (const [before, after] of [
    ['ASTER_EVENTS_ENABLED: "true"', 'ASTER_EVENTS_ENABLED: "false"'],
    [
      "identity-event-trust:/run/aster-identity-events:ro",
      "identity-event-trust:/run/aster-identity-events",
    ],
    ["com.aster.authority: durable-local", "com.aster.authority: disposable-local"],
    ["--partitions 1", "--partitions 3"],
    ["retention.ms=3600000", "retention.ms=-1"],
    ["mem_limit: 160m", "x-mem_limit: 160m"],
    ["/etc/kafka/secrets:size=1m", "/unexpected/secrets:size=1m"],
    ["/mnt/shared/config:size=1m", "/unexpected/config:size=1m"],
    ["/var/lib/kafka/data:size=1m", "/unexpected/data:size=1m"],
    ['user: "1000:1000"', 'user: "0:0"'],
    ["  catalog:\n", "  web:\n"],
    ["  catalog:\n", "  catalog:\n    volumes: [identity-event-trust:/run/leaked]\n"],
    ["  identity:\n", "  identity:\n    depends_on: [broker]\n"],
    ["  broker:\n", "  broker:\n    ports: [19092:19092]\n"],
  ]) {
    assert.ok(validateEventDeliveryOverlay(overlay.replaceAll(before, after)).length, before);
  }
});

test("Engagement SQL proof refuses extra selectors or targets before accessing Docker", () => {
  const script = fileURLToPath(new URL("./run-engagement-integration.mjs", import.meta.url));
  for (const args of [
    ["--target", "aster"],
    ["--watchlist", "aster"],
    ["--fields", "aster"],
    ["--events", "aster"],
    ["--events", "--fields"],
    ["--fields", "--watchlist"],
    ["--unknown"],
    ["5432"],
  ]) {
    const result = spawnSync(process.execPath, [script, ...args], {
      env: { PATH: "" },
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /an optional --watchlist, --fields or --events selector, never a target/u,
    );
  }
});

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
