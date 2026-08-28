import assert from "node:assert/strict";
import test from "node:test";
import type { AsterPostgresAdapter, AsterPostgresQuery, AsterPostgresRows } from "@aster/postgres";
import { createPostgresPlaybackSessions } from "../src/infrastructure/postgres-sessions.js";
import { createAnonymousPlaybackSession } from "../src/domain/session.js";

const id = "00000000-0000-4000-8000-000000000001";
const session = createAnonymousPlaybackSession({
  id,
  titleId: id,
  correlationId: id,
  now: 100,
  allowLocalMedia: false,
  publication: {
    titleId: id,
    publicationId: id,
    titleVersion: 1,
    manifestUrl: "https://example.invalid/master.m3u8",
    checkedAt: 100,
    validUntil: null,
  },
});
assert.ok(session);

function fixture(
  answers: AsterPostgresRows[] = [
    { rowCount: 1, rows: [{ singleton: true }] },
    { rowCount: 0, rows: [] },
    { rowCount: 1, rows: [{ slot: 4 }] },
    { rowCount: 1, rows: [{ id }] },
  ],
  outcome?: "indeterminate" | "timed_out" | "aborted",
) {
  const queries: AsterPostgresQuery[] = [];
  const actions: string[] = [];
  let transactions = 0;
  const database: Pick<AsterPostgresAdapter, "transaction"> = {
    async transaction(work) {
      transactions++;
      try {
        const result = await work({
          query: (query) => {
            queries.push(query);
            const answer = answers.shift();
            assert.ok(answer);
            return Promise.resolve(answer);
          },
        });
        actions.push(result.action);
        return outcome
          ? { status: outcome }
          : {
              status: result.action === "commit" ? "committed" : "rolled_back",
              value: result.value,
            };
      } catch {
        return { status: "failed" };
      }
    },
  };
  return {
    store: createPostgresPlaybackSessions(database),
    queries,
    actions,
    transactions: () => transactions,
  };
}

test("Playback persistence owns four bounded sequential statements and only acknowledges commit", async () => {
  const f = fixture();
  assert.deepEqual(await f.store.create(session, new AbortController().signal), {
    status: "completed",
  });
  assert.equal(f.transactions(), 1);
  assert.deepEqual(f.actions, ["commit"]);
  assert.equal(f.queries.length, 4);
  assert.match(f.queries[0]?.text ?? "", /FOR UPDATE/u);
  assert.match(f.queries[1]?.text ?? "", /86400[\s\S]*LIMIT 64/u);
  assert.match(f.queries[2]?.text ?? "", /generate_series\(1, 4096\)/u);
  assert.match(f.queries[3]?.text ?? "", /clock_timestamp/u);
  assert.deepEqual(f.queries[3]?.values, [
    id,
    4,
    id,
    id,
    1,
    100,
    session.manifestUrl,
    100,
    1000,
    id,
  ]);
  assert.ok(
    f.queries.every((query) => !/catalog\.|identity\.|engagement\.|discovery\./u.test(query.text)),
  );
});

test("capacity and expired-at-insert outcomes roll back rather than acknowledge a session", async () => {
  const capacity = fixture([
    { rowCount: 1, rows: [{}] },
    { rowCount: 0, rows: [] },
    { rowCount: 0, rows: [] },
  ]);
  assert.deepEqual(await capacity.store.create(session, new AbortController().signal), {
    status: "limit_exceeded",
  });
  assert.deepEqual(capacity.actions, ["rollback"]);
  assert.equal(capacity.queries.length, 3);
  const expired = fixture([
    { rowCount: 1, rows: [{}] },
    { rowCount: 0, rows: [] },
    { rowCount: 1, rows: [{ slot: 1 }] },
    { rowCount: 0, rows: [] },
  ]);
  assert.deepEqual(await expired.store.create(session, new AbortController().signal), {
    status: "unavailable",
  });
  assert.deepEqual(expired.actions, ["rollback"]);
});

test("cancelled and uncertain stores are never retried, and malformed rows fail closed", async () => {
  const cancelled = fixture();
  assert.deepEqual(await cancelled.store.create(session, AbortSignal.abort()), {
    status: "cancelled",
  });
  assert.equal(cancelled.transactions(), 0);
  for (const status of ["indeterminate", "timed_out", "aborted"] as const) {
    const f = fixture(undefined, status);
    assert.deepEqual(await f.store.create(session, new AbortController().signal), {
      status: status === "indeterminate" ? "indeterminate" : "unavailable",
    });
    assert.equal(f.transactions(), 1);
  }
  for (const slot of [0, 4097, "1", 1.5, null]) {
    const f = fixture([
      { rowCount: 1, rows: [{}] },
      { rowCount: 0, rows: [] },
      { rowCount: 1, rows: [{ slot }] },
    ]);
    assert.deepEqual(await f.store.create(session, new AbortController().signal), {
      status: "unavailable",
    });
    assert.equal(f.actions.length, 0);
  }
});
