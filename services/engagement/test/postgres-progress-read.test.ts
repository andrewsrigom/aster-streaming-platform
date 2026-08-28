import assert from "node:assert/strict";
import test from "node:test";
import type { AsterPostgresAdapter, AsterPostgresQuery, AsterPostgresRows } from "@aster/postgres";
import { createPostgresProgressRead } from "../src/infrastructure/postgres-progress-read.js";
import type { ProgressState } from "../src/domain/progress.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row: ProgressState = {
  id: id(10),
  accountId: id(1),
  profileId: id(2),
  titleId: id(3),
  playbackSessionId: id(4),
  sequence: 1,
  version: 1,
  positionMs: 1000,
  durationMs: 6000,
  status: "IN_PROGRESS",
  occurredAt: 100,
  updatedAt: 100,
};
const key = {
  accountId: id(1),
  kind: "history" as const,
  input: { profileId: id(2), first: 20, after: null },
};
function fixture(answer: AsterPostgresRows = { rowCount: 1, rows: [{ states: [row] }] }) {
  const queries: AsterPostgresQuery[] = [];
  const actions: string[] = [];
  const database: Pick<AsterPostgresAdapter, "transaction"> = {
    async transaction(work) {
      const result = await work({
        query: (query) => {
          queries.push(query);
          return Promise.resolve(answer);
        },
      });
      actions.push(result.action);
      return { status: "rolled_back", value: result.value };
    },
  };
  return { store: createPostgresProgressRead(database), queries, actions };
}

test("one bounded owner-filtered SQL read uses existing keyset order and rolls back its SELECT-only transaction", async () => {
  const f = fixture();
  const signal = new AbortController().signal;
  assert.deepEqual(await f.store.page(key, signal), { status: "completed", value: [row] });
  assert.equal(f.queries.length, 1);
  assert.deepEqual(f.queries[0]?.values, [id(1), id(2), 21]);
  assert.match(f.queries[0].text, /NOT g.deleted/u);
  assert.match(f.queries[0].text, /ORDER BY p.updated_at DESC, p.id DESC LIMIT \$3/u);
  assert.doesNotMatch(f.queries[0].text, /OFFSET|FOR UPDATE|identity\.|catalog\.|playback\./u);
  assert.deepEqual(f.actions, ["rollback"]);
});

test("continue query uses partial-index predicate and tuple cursor, without offset or write", async () => {
  const f = fixture();
  assert.equal(
    (
      await f.store.page(
        {
          ...key,
          kind: "continue",
          input: { ...key.input, after: { updatedAt: 101, id: id(11) } },
        },
        new AbortController().signal,
      )
    ).status,
    "completed",
  );
  assert.match(f.queries[0]?.text ?? "", /p.status = 'IN_PROGRESS'/u);
  assert.match(f.queries[0]?.text ?? "", /\(p.updated_at, p.id\) < \(\$4::bigint, \$5::uuid\)/u);
  assert.deepEqual(f.queries[0]?.values, [id(1), id(2), 256, 101, id(11)]);
});

test("empty, foreign and inconsistent SQL results are distinguished", async () => {
  assert.deepEqual(
    await fixture({ rowCount: 1, rows: [{ states: [] }] }).store.page(
      key,
      new AbortController().signal,
    ),
    { status: "completed", value: [] },
  );
  for (const answer of [
    { rowCount: 0, rows: [] },
    { rowCount: 2, rows: [{ states: [row] }] },
    { rowCount: 1, rows: [{ states: null }] },
    { rowCount: 1, rows: [{ states: [{ ...row, accountId: id(9) }] }] },
    { rowCount: 1, rows: [{ states: [{ ...row, updatedAt: "100" }] }] },
    { rowCount: 1, rows: [{ states: Array.from({ length: 22 }, () => row) }] },
  ]) {
    assert.equal(
      (await fixture(answer).store.page(key, new AbortController().signal)).status,
      "unavailable",
    );
  }
});

test("continue scan carries up to 256 validated entries in one adapter row without widening shared limits", async () => {
  const states = Array.from({ length: 256 }, (_, n) => ({
    ...row,
    id: id(1000 - n),
    titleId: id(2000 - n),
  }));
  const f = fixture({ rowCount: 1, rows: [{ states }] });
  assert.deepEqual(await f.store.page({ ...key, kind: "continue" }, new AbortController().signal), {
    status: "completed",
    value: states,
  });
  assert.match(
    f.queries[0]?.text ?? "",
    /jsonb_agg\(candidate.state ORDER BY candidate.updated_at DESC, candidate.id DESC\)/u,
  );
  const overflow = fixture({ rowCount: 1, rows: [{ states: [...states, row] }] });
  assert.equal(
    (await overflow.store.page({ ...key, kind: "continue" }, new AbortController().signal)).status,
    "unavailable",
  );
});

test("invalid owner, bound and pre-cancellation avoid any SQL dispatch", async () => {
  const f = fixture();
  assert.equal((await f.store.page(key, AbortSignal.abort())).status, "cancelled");
  assert.equal(
    (await f.store.page({ ...key, accountId: "invalid" }, new AbortController().signal)).status,
    "invalid_input",
  );
  assert.equal(
    (
      await f.store.page(
        { ...key, input: { ...key.input, first: 21 } },
        new AbortController().signal,
      )
    ).status,
    "invalid_input",
  );
  assert.equal(f.queries.length, 0);
});
