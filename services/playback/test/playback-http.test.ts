import assert from "node:assert/strict";
import test from "node:test";
import { createLocalEngagementReadTrust } from "@aster/http-express";
import { createPlaybackSessionInspector } from "../src/application/inspect-session.js";
import { PLAYBACK_ENGAGEMENT_OPERATION } from "../src/transport/engagement-operation.js";
import type { PublicationLookup } from "../src/application/session-ports.js";
import { playbackHttpFixture, playbackBody, testTitleId } from "./playback-http-fixture.js";

test("Engagement session HTTP read is title-bound, exact, read-only and absent for Router callers", async () => {
  const key = "c".repeat(64);
  const correlationId = "00000000-0000-4000-8000-000000000002";
  let reads = 0;
  const f = await playbackHttpFixture(undefined, {
    trust: createLocalEngagementReadTrust("playback", key),
    inspector: createPlaybackSessionInspector(
      {
        read: (sessionId, titleId) => {
          reads++;
          return Promise.resolve({
            status: "completed",
            value:
              sessionId === correlationId && titleId === testTitleId
                ? { sessionId, titleId, createdAt: 100, expiresAt: 1000 }
                : null,
          });
        },
      },
      () => 101,
    ),
  });
  const body = {
    query: PLAYBACK_ENGAGEMENT_OPERATION,
    operationName: "EngagementSession",
    variables: { sessionId: correlationId, titleId: testTitleId },
  };
  const headers = {
    host: "playback:3300",
    origin: "http://engagement:3400",
    "x-aster-csrf": "1",
    "x-aster-engagement-credential": key,
    "x-aster-correlation-id": correlationId,
  };
  try {
    const result = await f.send(body, headers);
    assert.equal(result.status, 200);
    assert.deepEqual(result.json.data?._engagementSession, {
      code: "COMPLETED",
      sessionId: correlationId,
      titleId: testTitleId,
      createdAt: 100,
      expiresAt: 1000,
      checkedAt: 101,
    });
    assert.equal(result.headers["x-request-id"], correlationId);
    assert.doesNotMatch(result.text, /manifestUrl|publication|credential/u);
    assert.equal((await f.send(body)).status, 400);
    assert.equal((await f.send(playbackBody, headers)).status, 400);
    assert.equal((await f.send({ ...body, query: body.query + " " }, headers)).status, 400);
    assert.equal(
      (await f.send(body, { ...headers, cookie: "aster_local_session=a.b.c" })).status,
      403,
    );
    assert.equal(
      (await f.send(body, { ...headers, "x-aster-engagement-credential": f.key })).status,
      403,
    );
    const other = await f.send(
      { ...body, variables: { ...body.variables, titleId: correlationId } },
      headers,
    );
    assert.equal(other.json.data?._engagementSession?.["code"], "NOT_PLAYABLE");
    assert.equal(reads, 2);
    assert.equal(f.state.writes.length, 0);
  } finally {
    await f.close();
  }
});

test("private transport returns an auditable anonymous session, propagates trusted trace and redacts internal state", async () => {
  const f = await playbackHttpFixture();
  try {
    const traceparent = `00-${"a".repeat(32)}-${"b".repeat(16)}-01`;
    const result = await f.send(playbackBody, { ...f.headers, traceparent });
    assert.equal(result.status, 200);
    assert.equal(result.json.errors, undefined);
    const payload = result.json.data?.createPlaybackSession;
    assert.ok(payload?.session);
    assert.equal(payload.code, "COMPLETED");
    assert.equal(payload.session.titleId, testTitleId);
    assert.equal(payload.session.expiresAt, f.state.time + 900);
    assert.equal(payload.session.manifestUrl, f.publication.manifestUrl);
    assert.equal(payload.correlationId, result.headers["x-request-id"]);
    assert.equal(result.headers["cache-control"], "no-store");
    assert.equal(result.headers["set-cookie"], undefined);
    assert.equal(f.state.reads, 1);
    assert.equal(f.state.writes.length, 1);
    assert.deepEqual(f.state.traceparents, [traceparent]);
    assert.equal(f.traces[0]?.traceId, "a".repeat(32));
    assert.doesNotMatch(
      result.text,
      /profileId|publicationId|catalogVersion|catalogCheckedAt|credential/u,
    );
    const traces = JSON.stringify(f.traces);
    assert.ok(!traces.includes(f.key));
    assert.doesNotMatch(traces, /master\.m3u8|manifestUrl|StartPlayback/u);
  } finally {
    await f.close();
  }
});

test("transport rejects foreign authority, amplified mutations and oversized bodies before owner work", async () => {
  const f = await playbackHttpFixture();
  try {
    for (const headers of [
      {},
      { ...f.headers, cookie: "aster_local_session=forged" },
      { ...f.headers, "x-aster-profile-id": testTitleId },
      { ...f.headers, host: "catalog:3200" },
      { ...f.headers, "x-aster-playback-credential": f.key },
      { ...f.headers, "x-aster-router-credential": "bad" },
    ]) {
      assert.equal((await f.send(playbackBody, headers)).status, 403);
    }
    assert.equal((await f.send({ ...playbackBody, variables: { titleId: "bad" } })).status, 400);
    assert.equal(
      (
        await f.send({
          ...playbackBody,
          query: `mutation M { a: createPlaybackSession(titleId: "${testTitleId}") { code } b: createPlaybackSession(titleId: "${testTitleId}") { code } }`,
          operationName: "M",
        })
      ).status,
      400,
    );
    assert.equal(
      (await f.send({ ...playbackBody, query: playbackBody.query + " ".repeat(16384) })).status,
      413,
    );
    assert.equal(f.state.reads, 0);
    assert.equal(f.state.writes.length, 0);
  } finally {
    await f.close();
  }
});

test("current-owner rejection and uncertain persistence remain typed non-success, with no raw engine errors", async () => {
  const f = await playbackHttpFixture();
  try {
    f.state.lookup = () => Promise.resolve({ status: "completed", value: null });
    const missing = await f.send();
    assert.equal(missing.json.data?.createPlaybackSession?.code, "NOT_PLAYABLE");
    assert.equal(missing.json.data.createPlaybackSession.session, null);
    f.state.lookup = () => Promise.reject(new Error("private database and credential details"));
    const unavailable = await f.send();
    assert.equal(unavailable.json.data?.createPlaybackSession?.code, "UNAVAILABLE");
    assert.doesNotMatch(unavailable.text, /private database|credential details/u);
    assert.equal(f.state.writes.length, 0);
  } finally {
    await f.close();
  }
  const uncertain = await playbackHttpFixture({
    create: () => Promise.resolve({ status: "indeterminate" }),
  });
  const failure = await playbackHttpFixture({
    create: () => Promise.reject(new Error("secret infrastructure failure")),
  });
  try {
    assert.equal((await uncertain.send()).json.data?.createPlaybackSession?.code, "INDETERMINATE");
    const rejected = await failure.send();
    assert.equal(rejected.json.errors?.[0]?.extensions.code, "UNAVAILABLE");
    assert.doesNotMatch(rejected.text, /secret infrastructure|stack|node_modules/u);
  } finally {
    await uncertain.close();
    await failure.close();
  }
});

test("four admitted creations bound concurrency; the fifth fails and later requests recover", async () => {
  const f = await playbackHttpFixture();
  const deferred = Promise.withResolvers<PublicationLookup>();
  const entered = Promise.withResolvers<undefined>();
  let reads = 0;
  f.state.lookup = () => {
    if (++reads === 4) {
      entered.resolve(undefined);
    }
    return deferred.promise;
  };
  const pending = Array.from({ length: 4 }, () => f.send());
  try {
    await entered.promise;
    assert.equal((await f.send()).status, 503);
    assert.equal(reads, 4);
    deferred.resolve({ status: "completed", value: f.publication });
    assert.ok(
      (await Promise.all(pending)).every(
        (value) => value.json.data?.createPlaybackSession?.code === "COMPLETED",
      ),
    );
    assert.equal((await f.send()).status, 200);
  } finally {
    deferred.resolve({ status: "cancelled" });
    await Promise.allSettled(pending);
    await f.close();
  }
});

test(
  "application deadline cancels slow owner work; shutdown cancels admitted requests",
  { timeout: 7000 },
  async () => {
    const f = await playbackHttpFixture();
    let cancelled = 0;
    let entered = Promise.withResolvers<undefined>();
    f.state.lookup = (signal) =>
      new Promise((resolve) => {
        entered.resolve(undefined);
        const abort = () => {
          cancelled++;
          resolve({ status: "cancelled" });
        };
        if (signal.aborted) {
          abort();
        } else {
          signal.addEventListener("abort", abort, { once: true });
        }
      });
    try {
      assert.equal((await f.send()).json.data?.createPlaybackSession?.code, "UNAVAILABLE");
      assert.equal(cancelled, 1);
      entered = Promise.withResolvers<undefined>();
      const pending = f.send();
      await entered.promise;
      await f.graph.stop();
      assert.equal((await pending).json.errors?.[0]?.extensions.code, "CANCELLED");
      assert.equal(cancelled, 2);
      assert.equal((await f.send()).status, 503);
      assert.equal(f.state.writes.length, 0);
    } finally {
      await f.close();
    }
  },
);

test("finite per-process rate credits reject excess requests and replenish without unbounded queueing", async () => {
  const f = await playbackHttpFixture();
  try {
    for (let index = 0; index < 32; index++) {
      assert.equal((await f.send()).status, 200);
    }
    const limited = await f.send();
    assert.equal(limited.status, 429);
    assert.equal(limited.headers["retry-after"], "1");
    assert.equal(f.state.reads, 32);
    f.state.monotonic = 1000;
    assert.equal((await f.send()).status, 200);
  } finally {
    await f.close();
  }
});
