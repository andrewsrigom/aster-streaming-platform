import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogDiscoveryQueries } from "../src/application/discovery-queries.js";
import type {
  CatalogDiscoveryRepository,
  CatalogDiscoveryUnitOfWork,
} from "../src/application/discovery-ports.js";
import type { DiscoveryCandidate } from "../src/domain/discovery-snapshot.js";
import { publicCandidate } from "./public-fixture.js";
import { catalogTestId as id, catalogTestTime as now } from "./rights-fixture.js";

const source = (n: number): DiscoveryCandidate => ({
  titleId: id(n),
  sourceVersion: 5,
  candidate: publicCandidate(n),
  publishedAt: now,
});
function fixture() {
  const state = {
    rows: [source(1), source(2), source(3)],
    calls: 0,
    time: now,
    receivedSignal: undefined as AbortSignal | undefined,
  };
  const repository: CatalogDiscoveryRepository = {
    findMany: (ids) => Promise.resolve(state.rows.filter((row) => ids.includes(row.titleId))),
    scan: (after, limit) =>
      Promise.resolve(
        state.rows.filter((row) => after === null || row.titleId > after).slice(0, limit),
      ),
  };
  const transactions: CatalogDiscoveryUnitOfWork = {
    run(work, signal) {
      state.calls++;
      state.receivedSignal = signal;
      return work(repository);
    },
  };
  return {
    state,
    repository,
    queries: createCatalogDiscoveryQueries({
      transactions,
      policy: { commercial: true },
      now: () => state.time,
    }),
  };
}
const signal = () => new AbortController().signal;
test("snapshot batch preserves requested order, duplicates and genuine absence with one owner read", async () => {
  const f = fixture();
  const current = signal();
  const result = await f.queries.byIds([id(2), id(1)], current);
  assert.ok(result.status === "completed");
  assert.deepEqual(
    result.value.map((value) => value?.titleId),
    [id(2), id(1)],
  );
  assert.equal(f.state.calls, 1);
  assert.equal(f.state.receivedSignal, current);
  const repeated = await f.queries.byIds([id(1), id(1)], signal());
  assert.ok(repeated.status === "completed");
  assert.deepEqual(repeated.value[0], repeated.value[1]);
  const missing = await f.queries.byIds([id(99)], signal());
  assert.deepEqual(missing, { status: "completed", value: [null] });
});
test("bounded export retains hidden versions and advances a strict two-title keyset", async () => {
  const f = fixture();
  f.state.rows[1] = { ...source(2), candidate: null, sourceVersion: 6, publishedAt: null };
  const first = await f.queries.exportPage(null, signal());
  assert.ok(first.status === "completed");
  assert.equal(first.value.snapshots.length, 2);
  assert.equal(first.value.snapshots[1]?.document, null);
  assert.equal(first.value.snapshots[1].sourceVersion, 6);
  assert.equal(first.value.hasNextPage, true);
  assert.equal(first.value.endCursor, id(2));
  const last = await f.queries.exportPage(first.value.endCursor, signal());
  assert.ok(last.status === "completed");
  assert.deepEqual(
    last.value.snapshots.map((row) => row.titleId),
    [id(3)],
  );
  assert.equal(last.value.hasNextPage, false);
  assert.deepEqual(await f.queries.exportPage(id(3), signal()), {
    status: "completed",
    value: { snapshots: [], endCursor: null, hasNextPage: false },
  });
});
test("malformed, oversized, sparse or accessor input rejects before persistence", async () => {
  const f = fixture();
  const getter = Object.defineProperty([id(1)], "0", {
    get() {
      throw new Error("getter must not run");
    },
  });
  for (const input of [null, [], [id(1), id(2), id(3)], ["bad"], new Array(1), getter]) {
    assert.deepEqual(await f.queries.byIds(input, signal()), { status: "invalid_input" });
  }
  assert.deepEqual(await f.queries.exportPage("bad", signal()), { status: "invalid_input" });
  assert.equal(f.state.calls, 0);
});
test("expired/backwards observations, failure and cancellation cannot masquerade as an empty snapshot", async () => {
  for (const time of [now + 2, now - 1, NaN]) {
    const f = fixture();
    f.repository.findMany = () => {
      f.state.time = time;
      return Promise.resolve([]);
    };
    assert.deepEqual(await f.queries.byIds([id(1)], signal()), { status: "unavailable" });
  }
  const f = fixture();
  f.repository.findMany = () => Promise.reject(new Error("owner database unavailable"));
  assert.deepEqual(await f.queries.byIds([id(1)], signal()), { status: "unavailable" });
  const aborted = new AbortController();
  aborted.abort();
  assert.deepEqual(await f.queries.byIds([id(1)], aborted.signal), { status: "cancelled" });
  assert.equal(f.state.calls, 1);
});
test("one outstanding owner read has no queue and cancellation releases admission only after completion", async () => {
  const f = fixture();
  const pending = Promise.withResolvers<readonly DiscoveryCandidate[]>();
  f.repository.findMany = () => pending.promise;
  const current = new AbortController();
  const first = f.queries.byIds([id(1)], current.signal);
  assert.deepEqual(await f.queries.exportPage(null, signal()), { status: "unavailable" });
  current.abort();
  assert.deepEqual(await f.queries.byIds([id(1)], signal()), { status: "unavailable" });
  assert.equal(f.state.calls, 1);
  pending.resolve([source(1)]);
  assert.deepEqual(await first, { status: "cancelled" });
  assert.equal((await f.queries.byIds([id(1)], signal())).status, "completed");
});
test("duplicate, unrelated, excessive and unordered repository rows fail closed", async () => {
  const f = fixture();
  for (const rows of [[source(1), source(1)], [source(3)], [source(1), source(2), source(3)]]) {
    f.repository.findMany = () => Promise.resolve(rows);
    assert.deepEqual(await f.queries.byIds([id(1), id(2)], signal()), { status: "unavailable" });
  }
  for (const rows of [
    [source(2), source(1)],
    [source(1), source(1)],
    [source(1), source(2), source(3), source(4)],
  ]) {
    f.repository.scan = () => Promise.resolve(rows);
    assert.deepEqual(await f.queries.exportPage(null, signal()), { status: "unavailable" });
  }
});
