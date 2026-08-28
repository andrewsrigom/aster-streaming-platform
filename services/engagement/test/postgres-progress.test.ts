import assert from "node:assert/strict";
import test from "node:test";
import type { AsterPostgresAdapter, AsterPostgresQuery, AsterPostgresRows } from "@aster/postgres";
import { createPostgresProgress } from "../src/infrastructure/postgres-progress.js";
import type { ProgressState } from "../src/domain/progress.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const key = { accountId: id(1), profileId: id(2), titleId: id(3) };
const signal = () => new AbortController().signal;
function fixture(answers: AsterPostgresRows[] = []) {
  const queries: AsterPostgresQuery[] = [];
  const actions: string[] = [];
  const database: Pick<AsterPostgresAdapter, "transaction"> = {
    async transaction(work) {
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
        return {
          status: result.action === "commit" ? "committed" : "rolled_back",
          value: result.value,
        };
      } catch {
        return { status: "failed" };
      }
    },
  };
  return { store: createPostgresProgress(database), queries, actions };
}

test("existing profile locks stay local and cannot switch owners or aggregates", async () => {
  const f = fixture([
    { rowCount: 1, rows: [{ account: key.accountId, deleted: false }] },
    { rowCount: 0, rows: [] },
  ]);
  assert.deepEqual(
    await f.store.transactions.run(async (tx) => {
      assert.deepEqual(await tx.lock(key), { deleted: false, current: null });
      await assert.rejects(async () => tx.retainedCounts({ ...key, titleId: id(4) }));
      await assert.rejects(tx.lock(key));
      return { status: "stale" };
    }, signal()),
    { status: "stale" },
  );
  assert.deepEqual(f.actions, ["rollback"]);
  assert.equal(f.queries.length, 2);
  assert.match(f.queries[0]?.text ?? "", /FOR UPDATE/u);
  assert.ok(
    f.queries.every((q) => !/profile_admission|identity\.|playback\.|catalog\./u.test(q.text)),
  );
});

test("missing profile admission rolls back at its finite guard ceiling", async () => {
  const f = fixture([
    { rowCount: 0, rows: [] },
    { rowCount: 1, rows: [{ singleton: true }] },
    { rowCount: 0, rows: [] },
    { rowCount: 0, rows: [] },
  ]);
  assert.deepEqual(
    await f.store.transactions.run(async (tx) => {
      await tx.lock(key);
      return { status: "stale" };
    }, signal()),
    { status: "backpressure" },
  );
  assert.deepEqual(f.actions, ["rollback"]);
  assert.match(f.queries[3]?.text ?? "", /generate_series\(1, 1024\)/u);
});

test("guard mismatch and deletion hide progress without reading it", async () => {
  for (const row of [
    { account: id(9), deleted: false },
    { account: key.accountId, deleted: true },
  ]) {
    const f = fixture([{ rowCount: 1, rows: [row] }]);
    assert.deepEqual(
      await f.store.transactions.run(async (tx) => {
        assert.deepEqual(await tx.lock(key), { deleted: true, current: null });
        return { status: "not_found" };
      }, signal()),
      { status: "not_found" },
    );
    assert.equal(f.queries.length, 1);
  }
});

test("full progress slots roll back without inserting a new title", async () => {
  const f = fixture([
    { rowCount: 1, rows: [{ account: key.accountId, deleted: false }] },
    { rowCount: 0, rows: [] },
    { rowCount: 0, rows: [] },
  ]);
  const state: ProgressState = {
    ...key,
    id: id(4),
    playbackSessionId: id(5),
    sequence: 1,
    version: 1,
    positionMs: 1000,
    durationMs: 6000,
    status: "IN_PROGRESS",
    occurredAt: 100,
    updatedAt: 100,
  };
  assert.deepEqual(
    await f.store.transactions.run(async (tx) => {
      await tx.lock(key);
      await tx.save(state, { checkedAt: 100, expiresAt: 300 });
      return { status: "completed", value: state };
    }, signal()),
    { status: "backpressure" },
  );
  assert.deepEqual(f.actions, ["rollback"]);
  assert.match(f.queries[2]?.text ?? "", /generate_series\(1, 256\)/u);
  assert.ok(f.queries.every((query) => !/INSERT INTO engagement.progress/u.test(query.text)));
});

test("malformed receipts are not coerced and pre-cancellation avoids dispatch", async () => {
  const f = fixture([
    { rowCount: 1, rows: [{ result: {}, digest: "a".repeat(64), expiry: "123" }] },
  ]);
  assert.deepEqual(await f.store.receipts.read(key, id(4), signal()), { status: "unavailable" });
  const cancelled = fixture();
  assert.deepEqual(await cancelled.store.receipts.read(key, id(4), AbortSignal.abort()), {
    status: "cancelled",
  });
  assert.deepEqual(
    await cancelled.store.transactions.run(
      () => Promise.resolve({ status: "stale" }),
      AbortSignal.abort(),
    ),
    { status: "cancelled" },
  );
  assert.equal(cancelled.queries.length, 0);
});

test("unknown commit and throwing adapters never retry or acknowledge writes", async () => {
  let dispatches = 0;
  for (const status of ["indeterminate", "timed_out", "failed"] as const) {
    const database: Pick<AsterPostgresAdapter, "transaction"> = {
      transaction: () => {
        dispatches++;
        return Promise.resolve({ status });
      },
    };
    const store = createPostgresProgress(database);
    assert.deepEqual(
      await store.transactions.run(() => Promise.resolve({ status: "stale" }), signal()),
      {
        status: status === "indeterminate" ? "indeterminate" : "unavailable",
      },
    );
  }
  const throwing: Pick<AsterPostgresAdapter, "transaction"> = {
    transaction: () => {
      dispatches++;
      throw new Error("uncertain dispatch");
    },
  };
  assert.deepEqual(
    await createPostgresProgress(throwing).transactions.run(
      () => Promise.resolve({ status: "stale" }),
      signal(),
    ),
    { status: "indeterminate" },
  );
  assert.equal(dispatches, 4);
});
