import assert from "node:assert/strict";
import test from "node:test";
import { workflowFixture } from "./workflow-fixture.js";
import { catalogTestTime } from "./rights-fixture.js";
import {
  UI_SEED_ACTOR_ID,
  UI_SEED_TITLE_ID,
  validateUiSeedReport,
} from "../src/infrastructure/fixtures/generated-ui-fixture.js";
import { seedGeneratedCatalog } from "../src/infrastructure/fixtures/seed-catalog.js";

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
