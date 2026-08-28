import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { catalogTestId as id } from "../rights-fixture.js";
import { metadataFixture, rightsFacts } from "../workflow-fixture.js";

export async function verifyOperatorCli(admin: Pool, port: number): Promise<void> {
  for (const migration of ["0002-editorial-workflow", "0001-rights-history"]) {
    await admin.query(
      await readFile(new URL(`../../../migrations/${migration}.down.sql`, import.meta.url), "utf8"),
    );
  }
  const base = {
    ...process.env,
    ASTER_ENVIRONMENT: "local",
    ASTER_CATALOG_OPERATOR_ENABLED: "true",
    ASTER_CATALOG_DATABASE_URL: `postgresql://aster_catalog_local@127.0.0.1:${port}/aster`,
    ASTER_CATALOG_ADMIN_DATABASE_URL: `postgresql://aster@127.0.0.1:${port}/aster`,
    ASTER_CATALOG_DATABASE_PASSWORD: "aster-test-only",
    ASTER_CATALOG_ADMIN_DATABASE_PASSWORD: "aster-test-only",
  };
  const run = (
    file: "operate-local" | "migrate-local",
    input: unknown,
    environment = base,
    holdInput = false,
  ) =>
    new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [fileURLToPath(new URL(`../../src/${file}.js`, import.meta.url))],
        { env: environment, stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
      );
      let stdout = "";
      let stderr = "";
      const deadline = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("Catalog CLI exceeded process deadline"));
      }, 15000);
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
        if (stdout.length > 16384) {
          child.kill("SIGKILL");
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
        if (stderr.length > 16384) {
          child.kill("SIGKILL");
        }
      });
      child.stdin.on("error", () => undefined);
      child.once("error", (error) => {
        clearTimeout(deadline);
        reject(error);
      });
      child.once("close", (code) => {
        clearTimeout(deadline);
        resolve({ code, stdout, stderr });
      });
      if (!holdInput) {
        child.stdin.end(input === undefined ? "" : JSON.stringify(input));
      }
    });
  const initialized = await run("migrate-local", undefined);
  assert.equal(initialized.code, 0, initialized.stderr);
  assert.deepEqual(JSON.parse(initialized.stdout), {
    event: "aster.catalog.migration_completed",
    applied: [1, 2, 3, 4],
  });
  await admin.query(
    await readFile(
      new URL("../../../migrations/0004-media-requests.down.sql", import.meta.url),
      "utf8",
    ),
  );
  const upgraded = await run("migrate-local", undefined);
  assert.equal(upgraded.code, 0, upgraded.stderr);
  assert.deepEqual(JSON.parse(upgraded.stdout), {
    event: "aster.catalog.migration_completed",
    applied: [4],
  });
  const repeated = await run("migrate-local", undefined);
  assert.equal(repeated.code, 0);
  assert.deepEqual(JSON.parse(repeated.stdout), {
    event: "aster.catalog.migration_completed",
    applied: [],
  });
  const create = {
    command: "create",
    input: {
      titleId: id(1),
      mutationId: id(10),
      expectedVersion: 0,
      metadata: metadataFixture(),
      rights: rightsFacts(),
    },
  };
  const created = await run("operate-local", create);
  assert.equal(created.code, 0, created.stderr);
  const result = JSON.parse(created.stdout) as { status: string; value: { version: number } };
  assert.equal(result.status, "completed");
  assert.equal(result.value.version, 2);
  const log = JSON.parse(created.stderr) as Record<string, unknown>;
  assert.equal(log["event"], "aster.catalog.command_completed");
  assert.match(String(log["traceId"]), /^[a-f0-9]{32}$/u);
  assert.doesNotMatch(
    created.stderr,
    /aster-test-only|postgresql:|example\.invalid|Synthetic creator/u,
  );
  assert.equal((await run("operate-local", create)).stdout, created.stdout);
  assert.equal(
    (await run("operate-local", { command: "inspect", input: { titleId: id(1) } })).code,
    0,
  );
  const reviewed = await run("operate-local", {
    command: "review",
    input: {
      titleId: id(1),
      mutationId: id(11),
      expectedVersion: 2,
      decision: "approve",
      reason: "Synthetic CLI review",
    },
  });
  assert.equal(reviewed.code, 0, reviewed.stderr);
  const media = {
    command: "request-media",
    input: {
      requestId: id(800),
      titleId: id(1),
      expectedVersion: 3,
      rightsRevision: 2,
      recipeVersion: "hls-avc-aac-v1",
      source: {
        url: "https://example.invalid/source.mp4",
        bytes: 1000,
        etag: '"fixture-v1"',
        sha256: "a".repeat(64),
        container: "mp4",
      },
    },
  };
  const requested = await run("operate-local", media);
  assert.equal(requested.code, 0, requested.stderr);
  assert.equal((JSON.parse(requested.stdout) as { status: string }).status, "completed");
  assert.equal((await run("operate-local", media)).stdout, requested.stdout);
  assert.doesNotMatch(requested.stderr, /aster-test-only|postgresql:|example\.invalid/u);
  await admin.query("GRANT UPDATE ON catalog.media_requests TO aster_catalog_local");
  try {
    const unsafe = await run("operate-local", media);
    assert.equal(unsafe.code, 1);
    assert.deepEqual(JSON.parse(unsafe.stdout), { status: "unavailable" });
  } finally {
    await admin.query("REVOKE UPDATE ON catalog.media_requests FROM aster_catalog_local");
  }
  const missing = await run("operate-local", {
    command: "media-ready",
    input: { titleId: id(1), mutationId: id(12), expectedVersion: 3, publicationId: id(99) },
  });
  assert.equal(missing.code, 1);
  assert.deepEqual(JSON.parse(missing.stdout), { status: "media_not_ready" });
  const retired = await run("operate-local", {
    command: "retire",
    input: {
      titleId: id(1),
      mutationId: id(13),
      expectedVersion: 3,
      reason: "Synthetic CLI takedown",
    },
  });
  assert.equal(retired.code, 0, retired.stderr);
  const staleMedia = await run("operate-local", media);
  assert.equal(staleMedia.code, 1);
  assert.deepEqual(JSON.parse(staleMedia.stdout), { status: "rights_not_approved" });
  await admin.query("ALTER ROLE aster_catalog_local NOLOGIN");
  try {
    const unavailable = await run("operate-local", {
      command: "inspect",
      input: { titleId: id(1) },
    });
    assert.equal(unavailable.code, 1);
    assert.deepEqual(JSON.parse(unavailable.stdout), { status: "unavailable" });
    assert.doesNotMatch(unavailable.stderr, /aster-test-only|postgresql:/u);
  } finally {
    await admin.query("ALTER ROLE aster_catalog_local LOGIN");
  }
  const hosted = await run("operate-local", create, { ...base, ASTER_ENVIRONMENT: "production" });
  assert.equal(hosted.code, 1);
  assert.deepEqual(JSON.parse(hosted.stdout), { status: "invalid_input" });
  const timeout = await run("operate-local", undefined, base, true);
  assert.equal(timeout.code, 1);
  assert.deepEqual(JSON.parse(timeout.stdout), { status: "cancelled" });
  const stored = await admin.query<{ state: string }>(
    "SELECT state FROM catalog.titles WHERE id = $1",
    [id(1)],
  );
  assert.equal(stored.rows[0]?.state, "RETIRED");
  process.stdout.write(
    JSON.stringify({
      event: "catalog_cli_verified",
      freshMigrations: [1, 2, 3, 4],
      mediaMigrationDownUp: true,
      durableMediaRequestReplay: true,
      mutableMediaAuditRoleRejected: true,
      retiredMediaRequestRejected: true,
      idempotentInit: true,
      createReviewRetire: true,
      inspect: true,
      safeReplay: true,
      unattestedMediaRejected: true,
      hostedRejected: true,
      unavailableDatabase: true,
      inputDeadlineMs: 10000,
      sanitizedCorrelatedLogs: true,
    }) + "\n",
  );
}
