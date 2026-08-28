import assert from "node:assert/strict";
import test from "node:test";
import type { AsterPostgresAdapter, AsterPostgresQuery, AsterPostgresRows } from "@aster/postgres";
import { createPostgresEngagementFields } from "../src/infrastructure/postgres-engagement-fields.js";
import { id, pair, progressState } from "./engagement-fields-fixture.js";

const keys = [
  { ...pair(), accountId: id(1) },
  { ...pair(4), accountId: id(1) },
];
const rows = [
  {
    ordinal: 1,
    account: id(1),
    profile: id(2),
    title: id(3),
    deleted: false,
    present: true,
    progress: progressState(),
  },
  {
    ordinal: 2,
    account: id(1),
    profile: id(2),
    title: id(4),
    deleted: false,
    present: false,
    progress: null,
  },
];
function fixture(answer: AsterPostgresRows = { rowCount: 2, rows }) {
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
  return { store: createPostgresEngagementFields(database), queries, actions };
}

test("one ordered parameterized SQL batch preserves missing pairs and joins only owner data/deletion guards", async () => {
  const f = fixture();
  assert.deepEqual(await f.store.read(keys, new AbortController().signal), {
    status: "completed",
    value: [
      { ...keys[0], deleted: false, progress: progressState(), inWatchlist: true },
      { ...keys[1], deleted: false, progress: null, inWatchlist: false },
    ],
  });
  assert.equal(f.queries.length, 1);
  const query = f.queries[0];
  assert.ok(query);
  assert.deepEqual(query.values, [JSON.stringify(keys)]);
  assert.match(query.text, /WITH ORDINALITY/u);
  assert.match(query.text, /NOT g.deleted/u);
  assert.match(query.text, /ORDER BY requested.ordinality LIMIT 20/u);
  assert.doesNotMatch(
    query.text,
    /INSERT|UPDATE|DELETE|FOR UPDATE|identity\.|catalog\.|playback\./u,
  );
  assert.deepEqual(f.actions, ["rollback"]);
});

test("malformed, reordered, missing, deleted-with-data and foreign SQL rows fail closed", async () => {
  for (const answer of [
    { rowCount: 1, rows },
    { rowCount: 2, rows: [] },
    { rowCount: 2, rows: [...rows].reverse() },
    { rowCount: 2, rows: [{ ...rows[0], deleted: true }, rows[1]] },
    { rowCount: 2, rows: [{ ...rows[0], account: id(9) }, rows[1]] },
    {
      rowCount: 2,
      rows: [{ ...rows[0], progress: { ...progressState(), accountId: id(9) } }, rows[1]],
    },
    { rowCount: 2, rows: [{ ...rows[0], present: "true" }, rows[1]] },
    { rowCount: 2, rows: [null, rows[1]] },
  ]) {
    assert.equal(
      (await fixture(answer).store.read(keys, new AbortController().signal)).status,
      "unavailable",
    );
  }
});

test("an owned tombstone remains distinguishable from an empty aggregate", async () => {
  const result = await fixture({
    rowCount: 2,
    rows: [{ ...rows[0], deleted: true, present: false, progress: null }, rows[1]],
  }).store.read(keys, new AbortController().signal);
  assert.equal(result.status, "completed");
  assert.equal(result.value[0]?.deleted, true);
});

test("invalid or excessive pairs, cross-account batches and cancellation do not dispatch SQL", async () => {
  const f = fixture();
  for (const input of [
    [],
    [keys[0], keys[0]],
    [{ ...keys[0], accountId: "invalid" }],
    [{ ...keys[0], titleId: "invalid" }],
    [keys[0], { ...keys[1], accountId: id(9) }],
    Array.from({ length: 21 }, (_, n) => ({ ...pair(n + 100), accountId: id(1) })),
  ]) {
    assert.equal(
      (await f.store.read(input as typeof keys, new AbortController().signal)).status,
      "invalid_input",
    );
  }
  assert.equal((await f.store.read(keys, AbortSignal.abort())).status, "cancelled");
  assert.equal(f.queries.length, 0);
});
