import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { workflowFixture } from "./workflow-fixture.js";
import { catalogTestTime } from "./rights-fixture.js";
import {
  UI_SEED_ACTOR_ID,
  UI_SEED_TITLE_ID,
  validateUiSeedReport,
} from "../src/infrastructure/fixtures/generated-ui-fixture.js";
import { seedGeneratedCatalog } from "../src/infrastructure/fixtures/seed-catalog.js";
import { generatedSeed } from "../src/infrastructure/fixtures/generated-seed.js";
import {
  readUiSeedReport,
  seedLocalCatalog,
} from "../src/infrastructure/fixtures/local-ui-seed.js";

function report() {
  return {
    event: "generated_hls_verified",
    recipe: "aster-generated-hls-v1",
    repeatable: true,
    independentSegments: true,
    durationSeconds: 6,
    width: 320,
    height: 180,
    fps: 24,
    captionLanguage: "en",
    sourceChecksum: "a".repeat(64),
    image: "sha256:" + "b".repeat(64),
    totalBytes: 800,
    files: [
      "source.mkv",
      "master.m3u8",
      "video.m3u8",
      "captions.m3u8",
      "captions.vtt",
      "segment-000.ts",
      "segment-001.ts",
      "segment-002.ts",
    ].map((name) => ({ name, bytes: 100, sha256: "a".repeat(64) })),
  };
}
function fixture() {
  const fixture = workflowFixture(UI_SEED_ACTOR_ID);
  const input: Parameters<typeof seedGeneratedCatalog>[0] = {
    ...fixture,
    report: report(),
    now: () => catalogTestTime,
    attest: (publication) => {
      fixture.state().publications.set(publication.id, publication);
      return Promise.resolve();
    },
  };
  return { ...fixture, input };
}

test("playable seed is a separate fixed title; replay rechecks media without new editorial writes", async () => {
  const reportValue = {
    ...report(),
    publicationAuthority: false,
    generatorChecksum: "c".repeat(64),
  };
  const seed = generatedSeed(reportValue, "playable");
  assert.notEqual(seed.titleId, UI_SEED_TITLE_ID);
  assert.match(
    seed.manifest,
    /^http:\/\/127\.0\.0\.1:9001\/aster-media-published\/publications\/[a-f0-9]{64}\/master\.m3u8$/u,
  );
  const f = workflowFixture(seed.actorId, true);
  let verified = 0;
  const input: Parameters<typeof seedGeneratedCatalog>[0] = {
    ...f,
    mode: "playable",
    report: reportValue,
    now: () => catalogTestTime,
    attest: (publication) => {
      verified++;
      f.state().publications.set(publication.id, publication);
      return Promise.resolve();
    },
  };
  assert.equal((await seedGeneratedCatalog(input)).changed, true);
  const first = structuredClone(f.state());
  assert.equal((await seedGeneratedCatalog(input)).changed, false);
  assert.equal(verified, 2);
  assert.deepEqual(f.state(), first);
  assert.equal(
    (
      await f.commands.execute(
        "retire",
        {
          titleId: seed.titleId,
          expectedVersion: 5,
          mutationId: "00000000-0000-4000-8000-000007000099",
          reason: "Local demo takedown",
        },
        f.request,
      )
    ).status,
    "completed",
  );
  const retired = structuredClone(f.state());
  await assert.rejects(seedGeneratedCatalog(input));
  assert.equal(verified, 2);
  assert.deepEqual(f.state(), retired);
});

test("playable reports cannot authorize arbitrary recipes, names, bytes or publication authority", () => {
  const value = { ...report(), publicationAuthority: false, generatorChecksum: "c".repeat(64) };
  for (const patch of [
    { publicationAuthority: true },
    { generatorChecksum: undefined },
    { recipe: "film" },
    { files: value.files.map((file) => ({ ...file, name: "../source" })) },
    { totalBytes: 0 },
  ]) {
    assert.throws(() => generatedSeed({ ...value, ...patch }, "playable"));
  }
  const changed = {
    ...value,
    files: value.files.map((file) =>
      file.name === "captions.vtt" ? { ...file, sha256: "d".repeat(64) } : file,
    ),
  };
  assert.notEqual(
    generatedSeed(changed, "playable").manifest,
    generatedSeed(value, "playable").manifest,
  );
});

test("local seed report input is bounded, UTF-8 validated and cancelled", async () => {
  const signal = new AbortController().signal;
  assert.deepEqual(
    await readUiSeedReport(Readable.from([Buffer.from(JSON.stringify(report()))]), signal),
    report(),
  );
  for (const bytes of [
    Buffer.alloc(16385),
    Buffer.from([0xff]),
    Buffer.from("{}"),
    Buffer.from("not-json"),
  ]) {
    const source = Readable.from([bytes]);
    await assert.rejects(readUiSeedReport(source, signal));
    assert.equal(source.destroyed, true);
  }
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    readUiSeedReport(Readable.from([Buffer.from(JSON.stringify(report()))]), controller.signal),
  );
});

test("local seed rejects non-local or missing opt-in before opening a database", async () => {
  const environment = {
    ASTER_ENVIRONMENT: "local",
    ASTER_CATALOG_OPERATOR_ENABLED: "true",
    ASTER_CATALOG_UI_SEED_ENABLED: "true",
    ASTER_CATALOG_DATABASE_URL: "postgresql://aster_catalog_local@postgres:5432/aster",
    ASTER_CATALOG_DATABASE_PASSWORD: "aster-test-only",
    ASTER_CATALOG_ADMIN_DATABASE_URL: "postgresql://aster@postgres:5432/aster",
    ASTER_CATALOG_ADMIN_DATABASE_PASSWORD: "aster-test-only",
  };
  for (const field of [
    "ASTER_ENVIRONMENT",
    "ASTER_CATALOG_OPERATOR_ENABLED",
    "ASTER_CATALOG_UI_SEED_ENABLED",
  ]) {
    await assert.rejects(
      seedLocalCatalog(
        { ...environment, [field]: "disabled" },
        report(),
        new AbortController().signal,
      ),
    );
  }
  await assert.rejects(seedLocalCatalog(environment, {}, new AbortController().signal));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(seedLocalCatalog(environment, report(), controller.signal));
});

test("UI seed uses rights/media/publication commands and repeated execution is a no-op", async () => {
  const f = fixture();
  assert.deepEqual(await seedGeneratedCatalog(f.input), {
    titleId: UI_SEED_TITLE_ID,
    state: "PUBLISHED",
    changed: true,
  });
  const first = structuredClone(f.state());
  assert.deepEqual(await seedGeneratedCatalog(f.input), {
    titleId: UI_SEED_TITLE_ID,
    state: "PUBLISHED",
    changed: false,
  });
  assert.deepEqual(f.state(), first);
  assert.deepEqual(
    f.state().audits.map((audit) => audit.kind),
    ["create", "review", "media-ready", "publish"],
  );
  assert.equal(f.state().events.length, 1);
});

test("UI seed resumes after a failed attestation without repeating rights review", async () => {
  const f = fixture();
  await assert.rejects(
    seedGeneratedCatalog({ ...f.input, attest: () => Promise.reject(new Error("unavailable")) }),
  );
  assert.equal(f.state().titles.get(UI_SEED_TITLE_ID)?.state, "RIGHTS_REVIEWED");
  await seedGeneratedCatalog(f.input);
  assert.deepEqual(
    f.state().audits.map((audit) => audit.kind),
    ["create", "review", "media-ready", "publish"],
  );
});

test("UI seed refuses retired, modified or foreign data without overwriting it", async () => {
  for (const change of ["retire", "metadata", "actor", "checksum"] as const) {
    const f = fixture();
    await seedGeneratedCatalog(f.input);
    if (change === "retire") {
      assert.equal(
        (
          await f.commands.execute(
            "retire",
            {
              titleId: UI_SEED_TITLE_ID,
              expectedVersion: 5,
              mutationId: "00000000-0000-4000-8000-000005000099",
              reason: "Explicit local takedown",
            },
            f.request,
          )
        ).status,
        "completed",
      );
    } else if (change === "metadata") {
      const metadata = f.state().metadata.get(UI_SEED_TITLE_ID);
      assert.ok(metadata);
      f.state().metadata.set(UI_SEED_TITLE_ID, { ...metadata, genres: ["changed"] });
    } else if (change === "actor") {
      const last = f.state().rights.at(-1);
      assert.ok(last);
      f.state().rights[f.state().rights.length - 1] = {
        ...last,
        actorId: "00000000-0000-4000-8000-000000000003",
      };
    } else {
      f.input.report = { ...report(), sourceChecksum: "c".repeat(64) };
    }
    const before = structuredClone(f.state());
    await assert.rejects(seedGeneratedCatalog(f.input));
    assert.deepEqual(f.state(), before);
  }
});

test("invalid reports, missing authority and cancellation cannot create seed data", async () => {
  for (const patch of [
    { recipe: "other" },
    { repeatable: false },
    { totalBytes: 0 },
    { files: [] },
    { width: 1920 },
  ]) {
    const f = fixture();
    await assert.rejects(seedGeneratedCatalog({ ...f.input, report: { ...report(), ...patch } }));
    assert.equal(f.state().titles.size, 0);
  }
  for (const mode of ["authority", "cancel"]) {
    const f = fixture();
    if (mode === "authority") {
      f.operator.revoke();
    } else {
      f.controller.abort();
    }
    await assert.rejects(seedGeneratedCatalog(f.input));
    assert.equal(f.state().titles.size, 0);
  }
  assert.throws(() =>
    validateUiSeedReport({
      ...report(),
      files: report().files.map((file) => ({ ...file, name: "../escape" })),
    }),
  );
});
