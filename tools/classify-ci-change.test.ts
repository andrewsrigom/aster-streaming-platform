import assert from "node:assert/strict";
import test from "node:test";

import { classifyChangedPaths, GIT_DIFF_FILTER, parseChangedPaths } from "./classify-ci-change.ts";

test("classifies Markdown, evidence, skills, and repository memory as documentation only", () => {
  assert.deepEqual(
    classifyChangedPaths([
      "README.md",
      "docs/operations/LOCAL_DEVELOPMENT.md",
      "evidence/phase-00/check.txt",
      "skills/testing.md",
      ".ai/CURRENT_STATE.md",
    ]),
    { changedFiles: 5, full: false, platform: false, reason: "docs-only" },
  );
});

test("requires full quality for unrelated source and environment templates", () => {
  for (const path of ["tools/check.ts", ".env.example"]) {
    assert.deepEqual(classifyChangedPaths([path]), {
      changedFiles: 1,
      full: true,
      platform: false,
      reason: "executable-change",
    });
  }
});

test("selects real integration for adapters, runtime, bootstrap and shared dependency changes", () => {
  for (const path of [
    "services/identity/src/create-service.ts",
    "services/catalog/src/create-service.ts",
    "services/playback/src/create-service.ts",
    "services/engagement/src/create-service.ts",
    "services/engagement/migrations/0001-progress.up.sql",
    "tools/run-engagement-integration.mjs",
    "tools/run-engagement-runtime.mjs",
    "tools/verify-engagement-runtime.mjs",
    "tools/verify-engagement-runtime.test.mjs",
    "services/playback/migrations/0001_playback_sessions.up.sql",
    "tools/run-playback-integration.mjs",
    "tools/run-playback-runtime.mjs",
    "tools/verify-playback-runtime.mjs",
    "tools/verify-playback-runtime.test.mjs",
    "tools/media/generate-hls.mjs",
    "tools/run-media-fixture.mjs",
    "tools/run-catalog-integration.mjs",
    "tools/verify-local-catalog.mjs",
    "tools/verify-catalog-runtime.mjs",
    "infra/docker/identity.Dockerfile",
    "infra/router/router.yaml",
    "infra/router/main.rhai",
    "infra/router/init-trust.mjs",
    "tools/verify-router-runtime.mjs",
    "tools/verify-local-router.mjs",
    "tools/verify-router-lifecycle.mjs",
    "tools/verify-router-observability.mjs",
    ".dockerignore",
    "tools/verify-runtime-image.mjs",
    "tools/verify-docker-context.mjs",
    "tools/verify-optional-platform.mjs",
    "packages/runtime/src/index.ts",
    "packages/config/package.json",
    "packages/telemetry/src/index.ts",
    "packages/postgres/src/index.ts",
    "packages/redis/src/index.ts",
    "packages/broker-kafka/src/index.ts",
    "packages/object-storage-s3/src/index.ts",
    "packages/http-express/package.json",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "turbo.json",
    "tsconfig.base.json",
    ".node-version",
    ".nvmrc",
    "tools/classify-ci-change.ts",
  ]) {
    assert.equal(classifyChangedPaths([path]).platform, true, path);
  }
  for (const path of [
    "apps/web/features/playback/adapter.ts",
    "apps/web/features/playback/player.tsx",
    "apps/web/features/playback/player.module.css",
    "apps/web/app/watch/[id]/page.tsx",
    "apps/web/lib/apollo/operations.ts",
    "apps/web/test/browser/demo.spec.ts",
  ]) {
    assert.equal(classifyChangedPaths([path]).platform, true, path);
  }
  assert.equal(classifyChangedPaths(["apps/web/PLAYBACK.md"]).platform, false);
});

test("fails safe to full quality for an empty diff", () => {
  assert.deepEqual(classifyChangedPaths([]), {
    changedFiles: 0,
    full: true,
    platform: true,
    reason: "empty-diff",
  });
});

test("selects the isolated local-platform smoke path", () => {
  assert.deepEqual(classifyChangedPaths(["infra/compose/compose.yml"]), {
    changedFiles: 1,
    full: true,
    platform: true,
    reason: "executable-change",
  });
  assert.equal(classifyChangedPaths(["tools/verify-local-platform.mjs"]).platform, true);
  assert.equal(classifyChangedPaths(["tools/reset-local-platform.sh"]).platform, true);
  assert.equal(classifyChangedPaths(["tools/reset-local-platform.test.mjs"]).platform, true);
  assert.equal(classifyChangedPaths([".github/workflows/ci.yml"]).platform, true);
  assert.equal(classifyChangedPaths(["tools/unrelated.ts"]).platform, false);
});

test("deduplicates changed paths before classification", () => {
  assert.equal(classifyChangedPaths(["README.md", "README.md"]).changedFiles, 1);
});

test("rejects unsafe or unbounded changed paths", () => {
  assert.throws(() => classifyChangedPaths(["../outside.md"]));
  assert.throws(() => classifyChangedPaths(["C:\\outside.md"]));
  assert.throws(() => classifyChangedPaths(Array.from({ length: 5_001 }, () => "README.md")));
});

test("parses bounded NUL-delimited Git diff output", () => {
  assert.deepEqual(parseChangedPaths("README.md\0tools/check.ts\0"), [
    "README.md",
    "tools/check.ts",
  ]);
  assert.deepEqual(parseChangedPaths(""), []);
  assert.throws(() => parseChangedPaths("README.md"));
});

test("includes deleted paths in the Git change set", () => {
  assert.equal(GIT_DIFF_FILTER, "ACMRD");
});
