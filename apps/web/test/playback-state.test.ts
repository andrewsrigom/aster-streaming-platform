import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Kind, parse, print } from "graphql";
import { createPlaybackClient } from "../features/playback/client.ts";
import {
  START_PLAYBACK,
  playerManifestUrl,
  readPlaybackResult,
} from "../features/playback/operations.ts";
import {
  classifyPlayerFailure,
  createPlaybackExperience,
  playbackTelemetryPolicy,
} from "../features/playback/experience.ts";
import {
  defaultPlayerPreferences,
  normalizePlayerPreferences,
  playerActions,
  playerReducer,
  readPlayerPreferences,
  writePlayerPreferences,
} from "../store/player/preferences.ts";

const titleId = "00000000-0000-4000-8000-000000080001";
const sessionId = "10000000-0000-4000-8000-000000080001";
const now = 1000;
const manifestUrl =
  "http://127.0.0.1:9001/aster-media-published/publications/" + "a".repeat(64) + "/master.m3u8";
const payload = () => ({
  code: "COMPLETED",
  correlationId: sessionId,
  session: { id: sessionId, titleId, manifestUrl, expiresAt: now + 900 },
});

test("player operation matches the first-party inventory without private authority", async () => {
  const inventory = parse(
    await readFile(
      new URL("../../../infra/router/known-operations.graphql", import.meta.url),
      "utf8",
    ),
  );
  const operation = inventory.definitions.find(
    (node) => node.kind === Kind.OPERATION_DEFINITION && node.name?.value === "StartPlayback",
  );
  assert.ok(operation);
  const selected = START_PLAYBACK.definitions[0];
  assert.ok(selected);
  assert.equal(print(selected), print(operation));
});

test("playback response validates fresh title-bound sessions and strips unknown authority", () => {
  assert.deepEqual(
    readPlaybackResult({ ...payload(), private: "canary" }, titleId, now),
    payload(),
  );
  const session = payload().session;
  for (const change of [
    { expiresAt: now },
    { expiresAt: now + 906 },
    { expiresAt: NaN },
    { id: "spoof" },
    { titleId: sessionId },
    { manifestUrl: "http://evil.invalid/master.m3u8" },
    { manifestUrl: "https://user:pass@media.example/master.m3u8" },
    { manifestUrl: "https://media.example/master.m3u8?token=canary" },
  ]) {
    assert.throws(() =>
      readPlaybackResult({ ...payload(), session: { ...session, ...change } }, titleId, now),
    );
  }
  assert.ok(playerManifestUrl("https://media.example/master.m3u8"));
  assert.ok(!playerManifestUrl(manifestUrl + "#fragment"));
  assert.deepEqual(
    readPlaybackResult(
      { code: "NOT_PLAYABLE", correlationId: sessionId, session: null },
      titleId,
      now,
    ),
    { code: "NOT_PLAYABLE", correlationId: sessionId, session: null },
  );
  assert.throws(() => readPlaybackResult({ ...payload(), code: "NOT_PLAYABLE" }, titleId, now));
});

test("player client uses one fixed anonymous operation, bounded cancellation and no persistent cache", async () => {
  let request: RequestInit | undefined;
  const runtime = createPlaybackClient(
    (url, init) => {
      assert.equal(url, "http://127.0.0.1:4000/graphql");
      request = init;
      return Promise.resolve(
        Response.json({
          data: { createPlaybackSession: { ...payload(), private: "canary" } },
          extensions: { private: "canary" },
        }),
      );
    },
    () => now,
  );
  try {
    const result = await runtime.client.mutate({
      mutation: START_PLAYBACK,
      variables: { titleId },
    });
    assert.deepEqual(result.data?.createPlaybackSession, payload());
    assert.ok(request);
    assert.equal(request.credentials, "omit");
    assert.equal(request.cache, "no-store");
    assert.equal(request.redirect, "error");
    assert.ok(request.signal);
    assert.ok(typeof request.body === "string");
    assert.deepEqual(JSON.parse(request.body), {
      operationName: "StartPlayback",
      query: print(START_PLAYBACK),
      variables: { titleId },
    });
    assert.ok(!JSON.stringify(runtime.client.cache.extract()).includes(manifestUrl));
  } finally {
    runtime.dispose();
  }
});

test("disposal cancels a pending creation and excludes a late response; no implicit retry", async () => {
  let entered = () => {};
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let complete: (response: Response) => void = () => {};
  let signal: AbortSignal | null | undefined;
  let calls = 0;
  const runtime = createPlaybackClient(
    (_url, init) => {
      calls++;
      signal = init?.signal;
      entered();
      return new Promise<Response>((resolve) => {
        complete = resolve;
      });
    },
    () => now,
  );
  const pending = runtime.client.mutate({ mutation: START_PLAYBACK, variables: { titleId } });
  const rejected = assert.rejects(pending);
  await started;
  await assert.rejects(runtime.client.mutate({ mutation: START_PLAYBACK, variables: { titleId } }));
  runtime.dispose();
  assert.equal(signal?.aborted, true);
  complete(Response.json({ data: { createPlaybackSession: payload() } }));
  await rejected;
  assert.equal(calls, 1);
  assert.deepEqual(runtime.client.cache.extract(), {});
});

test("untrusted GraphQL error text is not exposed to player consumers", async () => {
  const runtime = createPlaybackClient(
    () => Promise.resolve(Response.json({ errors: [{ message: "private SQL canary" }] })),
    () => now,
  );
  try {
    await assert.rejects(
      runtime.client.mutate({ mutation: START_PLAYBACK, variables: { titleId } }),
      (error: Error) => {
        assert.ok(!error.message.includes("canary"));
        return true;
      },
    );
  } finally {
    runtime.dispose();
  }
});

test("player preferences use deterministic defaults and a bounded privacy allowlist", () => {
  const initial = playerReducer(undefined, { type: "init" });
  assert.equal(initial.hydrated, false);
  assert.deepEqual(initial.preferences, defaultPlayerPreferences);
  const restored = playerReducer(
    initial,
    playerActions.restore({ volume: 0.31, muted: true, rate: 1.5, captions: "on", quality: 358 }),
  );
  assert.equal(restored.hydrated, true);
  assert.equal(restored.preferences.rate, 1.5);
  assert.deepEqual(initial.preferences, defaultPlayerPreferences);
  assert.deepEqual(
    normalizePlayerPreferences({
      volume: Infinity,
      rate: 10,
      quality: 9999,
      sessionId,
      manifestUrl,
    }),
    defaultPlayerPreferences,
  );
  const changed = { ...restored.preferences, sessionId, manifestUrl };
  let stored = "";
  writePlayerPreferences(
    {
      setItem: (_key, value) => {
        stored = value;
      },
    },
    changed,
  );
  assert.ok(stored.length < 512);
  assert.ok(
    !stored.includes("session") && !stored.includes("manifest") && !stored.includes("http"),
  );
  assert.deepEqual(readPlayerPreferences({ getItem: () => stored }), restored.preferences);
  for (const raw of [null, "{", "x".repeat(513), "null", '{"version":2,"muted":true}']) {
    assert.deepEqual(readPlayerPreferences({ getItem: () => raw }), defaultPlayerPreferences);
  }
  assert.deepEqual(
    readPlayerPreferences({
      getItem: () => {
        throw new Error("storage denied");
      },
    }),
    defaultPlayerPreferences,
  );
  assert.doesNotThrow(() => {
    writePlayerPreferences(
      {
        setItem: () => {
          throw new Error("storage denied");
        },
      },
      restored.preferences,
    );
  });
});

test("QoE keeps measured finite samples, deduplicates milestones, caps memory and excludes identifiers", () => {
  let time = 100;
  const experience = createPlaybackExperience(() => time);
  experience.waiting();
  experience.playing();
  assert.deepEqual(experience.snapshot(), []);
  time = 125;
  experience.record("session_success", { durationMs: 25 });
  experience.mediaAttempt();
  experience.record("first_frame");
  experience.record("first_frame");
  experience.waiting();
  time = 180;
  experience.playing();
  assert.deepEqual(experience.snapshot(), [
    { event: "session_success", atMs: 25, durationMs: 25 },
    { event: "first_frame", atMs: 25 },
    { event: "rebuffer", atMs: 80, durationMs: 55 },
  ]);
  assert.deepEqual(experience.summary(), {
    firstFrame: "succeeded",
    rebufferCount: 1,
    rebufferDurationMs: 55,
    eventCount: 3,
    truncated: false,
  });
  const details = { height: 240, manifestUrl, sessionId };
  for (let i = 0; i < 100; i++) {
    experience.record("rendition_switch", details);
  }
  assert.equal(experience.snapshot().length, 64);
  assert.equal(experience.summary().truncated, true);
  assert.equal(experience.summary().eventCount, playbackTelemetryPolicy.maximumEvents);
  assert.doesNotMatch(JSON.stringify(experience.snapshot()), /http|sessionId|manifestUrl/u);
  experience.snapshot().pop();
  assert.equal(experience.snapshot().length, 64);
  assert.equal(classifyPlayerFailure("networkError", "manifestLoadError"), "manifest");
  assert.equal(classifyPlayerFailure("networkError", "fragLoadError"), "network");
  assert.equal(classifyPlayerFailure("mediaError", "bufferAppendError"), "decode");
  assert.equal(classifyPlayerFailure("networkError", "subtitleTrackLoadError"), "caption");
});

test("QoE policy keeps all attempts local, classifies pre-frame failure and erases on disposal", () => {
  assert.deepEqual(playbackTelemetryPolicy, {
    schemaVersion: 1,
    localAttemptSampleRate: 1,
    remoteAttemptSampleRate: 0,
    maximumEvents: 64,
    retention: "player_attempt",
  });
  let time = 10;
  const experience = createPlaybackExperience(() => time);
  experience.record("session_success", { durationMs: Number.POSITIVE_INFINITY });
  experience.mediaAttempt();
  experience.record("fatal_error", {
    error: "network",
    durationMs: -10,
    height: 99999,
  });
  assert.deepEqual(experience.summary(), {
    firstFrame: "failed",
    failure: "network",
    rebufferCount: 0,
    rebufferDurationMs: 0,
    eventCount: 2,
    truncated: false,
  });
  experience.record("first_frame", { durationMs: 12 });
  assert.equal(
    experience.snapshot().some(({ event }) => event === "first_frame"),
    false,
  );
  experience.dispose();
  time = 20;
  experience.record("session_failure", { error: "session" });
  experience.waiting();
  experience.playing();
  assert.deepEqual(experience.snapshot(), []);
  assert.deepEqual(experience.summary(), {
    firstFrame: "not_attempted",
    rebufferCount: 0,
    rebufferDurationMs: 0,
    eventCount: 0,
    truncated: false,
  });
});

test("session failure is excluded from the first-frame attempt population", () => {
  const experience = createPlaybackExperience(() => 10);
  experience.record("session_failure", { error: "not-playable", durationMs: 2 });
  experience.record("first_frame", { durationMs: 3 });
  assert.deepEqual(experience.summary(), {
    firstFrame: "not_attempted",
    failure: "not-playable",
    rebufferCount: 0,
    rebufferDurationMs: 0,
    eventCount: 1,
    truncated: false,
  });
});

test("QoE clock failure cannot escape into playback", () => {
  const experience = createPlaybackExperience(() => {
    throw new Error("clock unavailable");
  });
  assert.doesNotThrow(() => {
    experience.record("session_success", { durationMs: 1 });
    experience.mediaAttempt();
    experience.record("first_frame", { durationMs: 2 });
    experience.waiting();
    experience.playing();
  });
  assert.equal(experience.summary().firstFrame, "succeeded");
  assert.equal(experience.summary().rebufferCount, 0);

  let time = 100;
  const backwards = createPlaybackExperience(() => time);
  backwards.record("session_success");
  backwards.mediaAttempt();
  backwards.record("first_frame", { durationMs: 1 });
  backwards.waiting();
  time = 90;
  backwards.playing();
  assert.equal(backwards.summary().rebufferCount, 0);
});
