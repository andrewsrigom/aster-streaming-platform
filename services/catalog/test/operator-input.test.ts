import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PassThrough, Readable } from "node:stream";
import { readOperatorInput } from "../src/transport/operator-input.js";
import { localCatalogDatabase } from "../src/infrastructure/identity/local-configuration.js";
import { catalogTestId as id, catalogTestTime as now } from "./rights-fixture.js";
import { metadataFixture, rightsFacts, workflowFixture } from "./workflow-fixture.js";

test("documented draft example is executable but cannot approve unresolved rights", async () => {
  const source: unknown = JSON.parse(
    await readFile(new URL("../../examples/create-draft.json", import.meta.url), "utf8"),
  );
  const bytes = Buffer.from(JSON.stringify(source));
  const f = workflowFixture();
  const parsed = await readOperatorInput(Readable.from([bytes]), f.request.signal);
  assert.equal(parsed.command, "create");
  assert.equal((await f.commands.execute("create", parsed.input, f.request)).status, "completed");
  assert.equal(
    (
      await f.commands.execute(
        "review",
        {
          titleId: id(1),
          mutationId: id(11),
          expectedVersion: 2,
          decision: "approve",
          reason: "Unresolved example",
        },
        f.request,
      )
    ).status,
    "rights_not_approved",
  );
});

test("clarification, rejection and expiry have explicit transitions without silent approval", async () => {
  const f = workflowFixture();
  const create = {
    titleId: id(1),
    expectedVersion: 0,
    mutationId: id(10),
    metadata: metadataFixture(),
    rights: rightsFacts(),
  };
  assert.equal((await f.commands.execute("create", create, f.request)).status, "completed");
  assert.equal(
    (
      await f.commands.execute(
        "review",
        {
          titleId: id(1),
          expectedVersion: 2,
          mutationId: id(11),
          decision: "clarify",
          reason: "Need evidence",
        },
        f.request,
      )
    ).status,
    "completed",
  );
  assert.equal(f.state().rights.at(-1)?.record.status, "NEEDS_CLARIFICATION");
  assert.equal(
    (
      await f.commands.execute(
        "review",
        {
          titleId: id(1),
          expectedVersion: 3,
          mutationId: id(12),
          decision: "reject",
          reason: "Evidence rejected",
        },
        f.request,
      )
    ).status,
    "completed",
  );
  assert.equal(f.state().rights.at(-1)?.record.status, "REJECTED");
  assert.equal(
    (
      await f.commands.execute(
        "review",
        {
          titleId: id(1),
          expectedVersion: 4,
          mutationId: id(13),
          decision: "approve",
          reason: "Cannot reuse rejected facts",
        },
        f.request,
      )
    ).status,
    "invalid_transition",
  );
  assert.equal(
    (
      await f.commands.execute(
        "expire",
        { titleId: id(1), expectedVersion: 4, mutationId: id(14), reason: "No expiry" },
        f.request,
      )
    ).status,
    "invalid_transition",
  );
});

test("CLI reads exactly one bounded UTF-8 command and rejects malformed/extra/oversized input", async () => {
  const value = { command: "inspect", input: { titleId: id(1) } };
  const signal = new AbortController().signal;
  assert.deepEqual(
    await readOperatorInput(Readable.from([Buffer.from(JSON.stringify(value))]), signal),
    value,
  );
  for (const bytes of [
    Buffer.from("not-json"),
    Buffer.from(JSON.stringify({ ...value, role: "operator" })),
    Buffer.from(JSON.stringify({ ...value, command: "register-media" })),
    Buffer.alloc(65537, 32),
    Buffer.from([0xff]),
  ]) {
    await assert.rejects(readOperatorInput(Readable.from([bytes]), signal));
  }
  const controller = new AbortController();
  const source = new PassThrough();
  const reading = readOperatorInput(source, controller.signal);
  source.write(Buffer.from("{"));
  controller.abort();
  await assert.rejects(reading);
  assert.equal(source.destroyed, true);
});
test("CLI database guard separates administrator/runtime and excludes hosted or cross-context endpoints", () => {
  const environment = {
    ASTER_ENVIRONMENT: "local",
    ASTER_CATALOG_OPERATOR_ENABLED: "true",
    ASTER_CATALOG_DATABASE_URL: "postgresql://aster_catalog_local@127.0.0.1:5432/aster",
    ASTER_CATALOG_ADMIN_DATABASE_URL: "postgresql://aster@postgres:5432/aster",
    ASTER_CATALOG_DATABASE_PASSWORD: "aster-test-only",
    ASTER_CATALOG_ADMIN_DATABASE_PASSWORD: "aster-test-only",
  };
  assert.match(localCatalogDatabase(environment, "operator"), /aster_catalog_local/u);
  assert.match(localCatalogDatabase(environment, "migration"), /aster@|aster:aster-test-only@/u);
  for (const patch of [
    { ASTER_ENVIRONMENT: "production" },
    { ASTER_CATALOG_OPERATOR_ENABLED: "false" },
    { ASTER_CATALOG_DATABASE_PASSWORD: "" },
    { ASTER_CATALOG_DATABASE_PASSWORD: "x".repeat(1025) },
    { ASTER_CATALOG_DATABASE_PASSWORD: "bad\nvalue" },
    { ASTER_CATALOG_DATABASE_URL: environment.ASTER_CATALOG_ADMIN_DATABASE_URL },
    {
      ASTER_CATALOG_DATABASE_URL: environment.ASTER_CATALOG_DATABASE_URL.replace(
        "127.0.0.1",
        "external.invalid",
      ),
    },
    { ASTER_CATALOG_DATABASE_URL: environment.ASTER_CATALOG_DATABASE_URL + "?sslmode=disable" },
    {
      ASTER_CATALOG_DATABASE_URL: environment.ASTER_CATALOG_DATABASE_URL.replace(
        "/aster",
        "/identity",
      ),
    },
  ]) {
    assert.throws(() => localCatalogDatabase({ ...environment, ...patch }, "operator"));
  }
  const competing = new URL(environment.ASTER_CATALOG_DATABASE_URL);
  competing.password = "aster-test-only";
  assert.throws(() =>
    localCatalogDatabase(
      { ...environment, ASTER_CATALOG_DATABASE_URL: competing.toString() },
      "operator",
    ),
  );
});
test("operator inspection is authorized and read-only; publication rechecks expiry before commit", async () => {
  const f = workflowFixture();
  assert.equal(
    (await f.commands.inspect({ titleId: id(1) }, { ...f.request, credential: {} })).status,
    "unauthorized",
  );
  assert.equal((await f.commands.inspect({ titleId: id(1) }, f.request)).status, "not_found");
  const create = {
    titleId: id(1),
    expectedVersion: 0,
    mutationId: id(10),
    metadata: metadataFixture(),
    rights: rightsFacts({ validUntil: now + 1 }),
  };
  assert.equal((await f.commands.execute("create", create, f.request)).status, "completed");
  const inspected = await f.commands.inspect({ titleId: id(1) }, f.request);
  assert.equal(inspected.status, "completed");
  assert.equal(inspected.value.version, 2);
  assert.equal(f.state().audits.length, 1);
  assert.equal(
    (
      await f.commands.execute(
        "review",
        {
          titleId: id(1),
          expectedVersion: 2,
          mutationId: id(11),
          decision: "approve",
          reason: "Synthetic review",
        },
        f.request,
      )
    ).status,
    "completed",
  );
  f.state().publications.set(id(200), {
    id: id(200),
    titleId: id(1),
    rightsRevision: 2,
    sourceChecksum: "a".repeat(64),
    manifestUrl: "https://example.invalid/master.m3u8",
    validationReportId: id(201),
    validatedAt: now,
  });
  assert.equal(
    (
      await f.commands.execute(
        "media-ready",
        { titleId: id(1), expectedVersion: 3, mutationId: id(12), publicationId: id(200) },
        f.request,
      )
    ).status,
    "completed",
  );
  f.beforeFinish(() => {
    f.setTime(now + 1);
  });
  assert.equal(
    (
      await f.commands.execute(
        "publish",
        { titleId: id(1), expectedVersion: 4, mutationId: id(13) },
        f.request,
      )
    ).status,
    "rights_not_approved",
  );
  assert.equal(f.state().titles.get(id(1))?.state, "MEDIA_READY");
  assert.equal(f.state().events.length, 0);
});
