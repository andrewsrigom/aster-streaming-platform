import assert from "node:assert/strict";
import test from "node:test";
import { createPlaybackSessions } from "../src/application/create-session.js";
import type {
  PlaybackSessionPorts,
  PublicationLookup,
  SessionWrite,
} from "../src/application/session-ports.js";
import type { PlaybackSession } from "../src/domain/session.js";

const id = (value: number) => "00000000-0000-4000-8000-" + String(value).padStart(12, "0");
const now = 1_787_900_000;
const publication = {
  titleId: id(1),
  publicationId: id(2),
  titleVersion: 5,
  manifestUrl: "https://example.invalid/master.m3u8",
  checkedAt: now,
  validUntil: null,
};
function fixture() {
  const controller = new AbortController();
  const state = {
    reads: 0,
    writes: [] as PlaybackSession[],
    time: now,
    signals: [] as AbortSignal[],
  };
  const ports: PlaybackSessionPorts = {
    now: () => state.time,
    nextId: () => id(3),
    allowLocalMedia: false,
    catalog: {
      currentPublication: (titleId, signal) => {
        assert.equal(titleId, id(1));
        state.reads++;
        state.signals.push(signal);
        return Promise.resolve({ status: "completed", value: publication });
      },
    },
    sessions: {
      create: (session, signal) => {
        state.writes.push(session);
        state.signals.push(signal);
        return Promise.resolve({ status: "completed" });
      },
    },
  };
  const context = { signal: controller.signal, correlationId: id(4) };
  return { state, ports, controller, context, sessions: createPlaybackSessions(ports) };
}

test("session creation reads current Catalog once before one acknowledged owner write", async () => {
  const f = fixture();
  const result = await f.sessions.create(id(1), f.context);
  assert.equal(result.status, "completed");
  assert.equal(result.value.id, id(3));
  assert.equal(result.value.profileId, null);
  assert.equal(f.state.reads, 1);
  assert.deepEqual(f.state.writes, [result.value]);
  assert.equal(f.state.signals[0], f.state.signals[1]);
  assert.equal(
    Object.keys(f.ports).some((key) => /identity|engagement|discovery|redis/iu.test(key)),
    false,
  );
});

test("invalid input, missing/stale/invalid Catalog and dependency failure never write sessions", async () => {
  const f = fixture();
  for (const invalid of [
    null,
    "invalid",
    { titleId: id(1), manifestUrl: publication.manifestUrl },
  ]) {
    assert.deepEqual(await f.sessions.create(invalid, f.context), { status: "invalid_input" });
  }
  assert.equal(f.state.reads, 0);
  for (const lookup of [
    { status: "completed", value: null },
    { status: "unavailable" },
    { status: "completed", value: { ...publication, checkedAt: now - 3 } },
    { status: "completed", value: { ...publication, titleId: id(9) } },
  ] as const) {
    f.ports.catalog.currentPublication = () => Promise.resolve(lookup);
    assert.notEqual((await f.sessions.create(id(1), f.context)).status, "completed");
  }
  f.ports.catalog.currentPublication = () =>
    Promise.reject(new Error("private dependency details"));
  assert.deepEqual(await f.sessions.create(id(1), f.context), { status: "unavailable" });
  assert.equal(f.state.writes.length, 0);
});

test("cancelled reads settle even for an uncooperative adapter; late success cannot start a write", async () => {
  const f = fixture();
  const deferred = Promise.withResolvers<PublicationLookup>();
  const entered = Promise.withResolvers<undefined>();
  f.ports.catalog.currentPublication = () => {
    entered.resolve(undefined);
    return deferred.promise;
  };
  const pending = f.sessions.create(id(1), f.context);
  await entered.promise;
  f.controller.abort();
  assert.deepEqual(await pending, { status: "cancelled" });
  deferred.resolve({ status: "completed", value: publication });
  await Promise.resolve();
  assert.equal(f.state.writes.length, 0);
});

test(
  "the two-second application deadline settles an owner that never responds",
  { timeout: 5000 },
  async () => {
    const f = fixture();
    const never = Promise.withResolvers<PublicationLookup>();
    f.ports.catalog.currentPublication = (_titleId, signal) => {
      f.state.signals.push(signal);
      return never.promise;
    };
    // AbortSignal timers are unref'ed; keep this isolated test alive until its finite deadline.
    const keepAlive = setTimeout(() => undefined, 4000);
    try {
      assert.deepEqual(await f.sessions.create(id(1), f.context), { status: "unavailable" });
      assert.equal(f.state.signals[0]?.aborted, true);
      assert.equal(f.state.writes.length, 0);
    } finally {
      clearTimeout(keepAlive);
    }
  },
);

test("capacity and uncertain write outcomes are not retried or reported as success", async () => {
  for (const status of ["limit_exceeded", "indeterminate", "unavailable"] as const) {
    const f = fixture();
    let writes = 0;
    f.ports.sessions.create = () => {
      writes++;
      return Promise.resolve({ status });
    };
    assert.deepEqual(await f.sessions.create(id(1), f.context), { status });
    assert.equal(writes, 1);
  }
  const f = fixture();
  const deferred = Promise.withResolvers<SessionWrite>();
  const entered = Promise.withResolvers<undefined>();
  f.ports.sessions.create = () => {
    entered.resolve(undefined);
    return deferred.promise;
  };
  const pending = f.sessions.create(id(1), f.context);
  await entered.promise;
  f.controller.abort();
  assert.deepEqual(await pending, { status: "indeterminate" });
  deferred.resolve({ status: "completed" });
});

test("expiry during an acknowledged store operation is not returned as a usable session", async () => {
  const f = fixture();
  f.ports.catalog.currentPublication = () =>
    Promise.resolve({ status: "completed", value: { ...publication, validUntil: now + 1 } });
  f.ports.sessions.create = () => {
    f.state.time++;
    return Promise.resolve({ status: "completed" });
  };
  assert.deepEqual(await f.sessions.create(id(1), f.context), { status: "not_playable" });
});
