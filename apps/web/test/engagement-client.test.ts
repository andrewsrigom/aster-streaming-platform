import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { type TestContext } from "node:test";
import { Kind, parse, print } from "graphql";
import { createEngagementClient } from "../features/engagement/client.ts";
import {
  PLAYER_PROGRESS,
  RECORD_PROGRESS,
  readPlayerProgress,
  readProgressCommand,
  readProgressOutcome,
} from "../features/engagement/operations.ts";
import { HOME_PERSONALIZED } from "../features/discovery/operations.ts";

const id = (n: number) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const pair = { profileId: id(1), titleId: id(2) };
const input = {
  ...pair,
  playbackSessionId: id(3),
  idempotencyKey: id(4),
  sequence: 8,
  positionMs: 15000,
  durationMs: 60000,
  occurredAt: 1000,
};
const saved = () => ({
  ...pair,
  id: id(5),
  sequence: 8,
  version: 6,
  positionMs: 15000,
  durationMs: 60000,
  status: "IN_PROGRESS" as const,
  occurredAt: 1000,
  updatedAt: 1001,
});
const outcome = () => ({ code: "COMPLETED", correlationId: id(6), progress: saved() });
const scope = { profileId: pair.profileId, expiresAt: 1060000 };
function runtime(t: TestContext, fetcher: typeof fetch, now = () => 1000000) {
  const result = createEngagementClient(scope, fetcher, now);
  t.after(() => {
    result.dispose();
  });
  return result;
}
function deferred() {
  let resolve: (response: Response) => void = () => {};
  const promise = new Promise<Response>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
const progressResponse = () =>
  Response.json({ data: { profile: { id: pair.profileId, progress: saved() } } });

test("player engagement documents match the first-party inventory", async () => {
  const inventory = parse(
    await readFile(
      new URL("../../../infra/router/known-operations.graphql", import.meta.url),
      "utf8",
    ),
  );
  for (const document of [PLAYER_PROGRESS, RECORD_PROGRESS, HOME_PERSONALIZED]) {
    const operation = document.definitions[0];
    assert.ok(operation?.kind === Kind.OPERATION_DEFINITION);
    const known = inventory.definitions.find(
      (node) =>
        node.kind === Kind.OPERATION_DEFINITION && node.name?.value === operation.name?.value,
    );
    assert.ok(known);
    assert.equal(print(operation), print(known));
  }
});

test("progress input is bounded and cannot change the selected profile", () => {
  assert.deepEqual(readProgressCommand(input, pair.profileId), input);
  for (const change of [
    { profileId: id(99) },
    { titleId: "invalid" },
    { sequence: 0 },
    { sequence: 2147483648 },
    { positionMs: -1 },
    { positionMs: 60001 },
    { durationMs: 43200001 },
    { occurredAt: NaN },
    { extra: "private-canary" },
  ]) {
    assert.throws(() => readProgressCommand({ ...input, ...change }, pair.profileId));
  }
});

test("fresh progress projection rejects substitution and distinguishes absence from failure", () => {
  assert.deepEqual(readPlayerProgress({ id: pair.profileId, progress: null }, pair), {
    id: pair.profileId,
    progress: null,
  });
  assert.throws(() => readPlayerProgress(null, pair));
  assert.throws(() => readPlayerProgress({ id: pair.profileId }, pair));
  assert.throws(() => readPlayerProgress({ id: id(99), progress: saved() }, pair));
  for (const change of [
    { profileId: id(99) },
    { titleId: id(99) },
    { status: "SAVED" },
    { sequence: 0 },
    { version: 0 },
    { positionMs: 60001 },
    { updatedAt: Infinity },
  ]) {
    assert.throws(() =>
      readPlayerProgress({ id: pair.profileId, progress: { ...saved(), ...change } }, pair),
    );
  }
  assert.deepEqual(
    readPlayerProgress({ id: pair.profileId, progress: { ...saved(), private: "canary" } }, pair),
    { id: pair.profileId, progress: saved() },
  );
});

test("only a matching durable acknowledgement can report a successful save", () => {
  assert.deepEqual(readProgressOutcome(outcome(), input), outcome());
  for (const change of [
    { sequence: 7 },
    { positionMs: 14000 },
    { durationMs: 61000 },
    { occurredAt: 999 },
    { profileId: id(99) },
  ]) {
    assert.throws(() =>
      readProgressOutcome({ ...outcome(), progress: { ...saved(), ...change } }, input),
    );
  }
  for (const code of ["STALE", "UNAVAILABLE", "INDETERMINATE"] as const) {
    const failure = { code, correlationId: id(6), progress: null };
    assert.deepEqual(readProgressOutcome(failure, input), failure);
    assert.throws(() => readProgressOutcome({ ...outcome(), code }, input));
  }
});

test("private transport sends only the fixed credentialed operation and strips unselected data", async (t) => {
  const requests: RequestInit[] = [];
  const r = runtime(t, (url, init) => {
    assert.equal(url, "http://127.0.0.1:4000/graphql");
    assert.ok(init);
    requests.push(init);
    return Promise.resolve(
      Response.json({
        data: { recordProgress: { ...outcome(), progress: { ...saved(), private: "canary" } } },
        extensions: { private: "canary" },
      }),
    );
  });
  const result = await r.client.mutate({ mutation: RECORD_PROGRESS, variables: { input } });
  assert.deepEqual(result.data?.recordProgress, outcome());
  const request = requests[0];
  assert.ok(request);
  assert.equal(request.credentials, "include");
  assert.equal(request.redirect, "error");
  assert.equal(request.cache, "no-store");
  assert.equal(request.keepalive, false);
  assert.deepEqual(request.headers, { "content-type": "application/json", "x-aster-csrf": "1" });
  assert.ok(typeof request.body === "string");
  assert.deepEqual(JSON.parse(request.body), {
    operationName: "RecordProgress",
    query: print(RECORD_PROGRESS),
    variables: { input },
  });
  assert.ok(!JSON.stringify(r.client.cache.extract()).includes("canary"));
});

test("personalized home binds the selected profile and preserves public data on private failure", async (t) => {
  const requests: {
    operationName: string;
    query: string;
    variables: { profileId: string; first: number; locale: string };
  }[] = [];
  const r = runtime(t, (_url, init) => {
    assert.ok(typeof init?.body === "string");
    requests.push(JSON.parse(init.body) as (typeof requests)[number]);
    return Promise.resolve(
      Response.json({
        data: {
          homeRails: {
            code: "PARTIAL",
            featured: null,
            recentlyAdded: null,
            private: "canary",
          },
          homeContinueWatching: null,
        },
        errors: [{ message: "private owner canary" }],
      }),
    );
  });
  const result = await r.client.query({
    query: HOME_PERSONALIZED,
    variables: { profileId: pair.profileId, first: 10, locale: "en" },
  });
  assert.equal(
    result.data?.homeRails && (result.data.homeRails as { code: string }).code,
    "PARTIAL",
  );
  assert.equal(result.data?.homeContinueWatching, null);
  assert.deepEqual(requests, [
    {
      operationName: "HomePersonalized",
      query: print(HOME_PERSONALIZED),
      variables: { profileId: pair.profileId, first: 10, locale: "en" },
    },
  ]);
  assert.equal(JSON.stringify(result.data).includes("canary"), false);
  assert.equal(JSON.stringify(r.client.cache.extract()).includes("canary"), false);
  await assert.rejects(
    r.client.query({
      query: HOME_PERSONALIZED,
      variables: { profileId: id(99), first: 10, locale: "en" },
    }),
  );
  assert.equal(requests.length, 1);
});

test("private cache replaces the current title and never reports another title's absence", async (t) => {
  const r = runtime(t, () =>
    Promise.resolve(
      Response.json({
        data: {
          profile: { id: pair.profileId, progress: null },
        },
      }),
    ),
  );
  for (let n = 10; n < 35; n++) {
    await r.client.query({ query: PLAYER_PROGRESS, variables: { ...pair, titleId: id(n) } });
  }
  assert.equal(
    r.client.readQuery({ query: PLAYER_PROGRESS, variables: { ...pair, titleId: id(10) } }),
    null,
  );
  assert.deepEqual(
    r.client.readQuery({ query: PLAYER_PROGRESS, variables: { ...pair, titleId: id(34) } }),
    {
      profile: { id: pair.profileId, progress: null },
    },
  );
  assert.ok(JSON.stringify(r.client.cache.extract()).length < 1024);
});

test("partial GraphQL failure is not empty progress and upstream details stay private", async (t) => {
  const r = runtime(t, () =>
    Promise.resolve(
      Response.json({
        data: { profile: { id: pair.profileId, progress: null } },
        errors: [{ message: "private SQL canary" }],
      }),
    ),
  );
  await assert.rejects(
    r.client.query({ query: PLAYER_PROGRESS, variables: pair }),
    (error: Error) => {
      assert.ok(!error.message.includes("canary"));
      return true;
    },
  );
  assert.equal(r.client.readQuery({ query: PLAYER_PROGRESS, variables: pair }), null);
});

test("profile disposal cancels old work and prevents a late response from repopulating private cache", async (t) => {
  const response = deferred();
  let entered = () => {};
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let signal: AbortSignal | null | undefined;
  const r = runtime(t, (_url, init) => {
    signal = init?.signal;
    entered();
    return response.promise;
  });
  const pending = r.client.query({ query: PLAYER_PROGRESS, variables: pair });
  const rejected = assert.rejects(pending);
  await started;
  r.dispose();
  assert.equal(signal?.aborted, true);
  response.resolve(progressResponse());
  await rejected;
  assert.deepEqual(r.client.cache.extract(), {});
});

test("expiry during a read rejects the response and discards the private generation", async (t) => {
  let clock = 1000000;
  const r = runtime(
    t,
    () => {
      clock = scope.expiresAt;
      return Promise.resolve(progressResponse());
    },
    () => clock,
  );
  await assert.rejects(r.client.query({ query: PLAYER_PROGRESS, variables: pair }));
  assert.equal(r.isDisposed(), true);
  assert.deepEqual(r.client.cache.extract(), {});
});

test("terminal progress is one bounded keepalive attempt, not an Apollo save", async (t) => {
  const response = deferred();
  const requests: RequestInit[] = [];
  const r = runtime(t, (_url, init) => {
    assert.ok(init);
    requests.push(init);
    return response.promise;
  });
  r.finish(input);
  r.finish(input);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.keepalive, true);
  const signal = requests[0].signal;
  assert.ok(signal);
  r.dispose(true);
  assert.equal(signal.aborted, false);
  response.resolve(Response.json({ data: { recordProgress: outcome() } }));
  await response.promise;
  assert.deepEqual(r.client.cache.extract(), {});
  r.dispose();
  assert.equal(signal.aborted, true);
});

test("admission bounds saves and refuses terminal or foreign-profile work during active requests", async (t) => {
  const response = deferred();
  let calls = 0;
  let entered = () => {};
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const r = runtime(t, () => {
    calls++;
    if (calls === 2) {
      entered();
    }
    return response.promise;
  });
  const first = r.client.mutate({ mutation: RECORD_PROGRESS, variables: { input } });
  const second = r.client.mutate({ mutation: RECORD_PROGRESS, variables: { input } });
  const rejected = Promise.all([assert.rejects(first), assert.rejects(second)]);
  await started;
  await assert.rejects(r.client.mutate({ mutation: RECORD_PROGRESS, variables: { input } }));
  r.finish(input);
  assert.equal(calls, 2);
  r.dispose();
  response.resolve(Response.json({ data: { recordProgress: outcome() } }));
  await rejected;
  const fresh = runtime(t, () => {
    calls++;
    return Promise.resolve(progressResponse());
  });
  await assert.rejects(
    fresh.client.query({ query: PLAYER_PROGRESS, variables: { ...pair, profileId: id(99) } }),
  );
  assert.equal(calls, 2);
});
