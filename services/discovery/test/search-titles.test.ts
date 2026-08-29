import assert from "node:assert/strict";
import test from "node:test";
import { createTitleSearch } from "../src/application/search-titles.js";
import type { SearchRow, SearchUnitOfWork } from "../src/application/search-ports.js";
import { searchCursor } from "../src/domain/search-input.js";

const now = 1_700_000_000;
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const generation = id(90);
const input = (overrides: Record<string, unknown> = {}) => ({
  query: "Café",
  locale: "pt-br",
  first: 2,
  after: null,
  ...overrides,
});
const rows: readonly SearchRow[] = [
  { titleId: id(1), rank: 900000, sourceVersion: 7, indexedAt: now, visibleUntil: now + 300 },
  { titleId: id(2), rank: 800000, sourceVersion: 2, indexedAt: now, visibleUntil: now + 100 },
  { titleId: id(3), rank: 700000, sourceVersion: 1, indexedAt: now, visibleUntil: now + 50 },
];

function fixture(found: readonly SearchRow[] = rows) {
  const state = { transactions: 0, searches: 0, input: undefined as unknown };
  const transactions: SearchUnitOfWork = {
    async run(work, signal) {
      state.transactions++;
      return signal.aborted
        ? { status: "cancelled" }
        : {
            status: "completed",
            value: await work({
              activeGeneration: () => Promise.resolve(generation),
              find(value) {
                state.searches++;
                state.input = value;
                return Promise.resolve(found);
              },
            }),
          };
    },
  };
  return { state, search: createTitleSearch({ transactions }) };
}

test("returns a bounded page with query-bound cursors and source freshness", async () => {
  const f = fixture();
  const result = await f.search.execute(input(), now, AbortSignal.timeout(1000));
  assert.equal(result.status, "completed");
  assert.equal(result.value.status, "completed");
  assert.equal(result.value.value.generation, generation);
  assert.equal(result.value.value.edges.length, 2);
  assert.equal(result.value.value.hasNextPage, true);
  const first = result.value.value.edges[0];
  const second = result.value.value.edges[1];
  assert.ok(first && second);
  assert.equal(first.titleId, id(1));
  assert.equal(first.sourceVersion, 7);
  assert.equal(result.value.value.endCursor, second.cursor);
  assert.equal(typeof result.value.value.endCursor, "string");
  assert.match(result.value.value.endCursor, /^s1\./u);
  assert.deepEqual(f.state.input, {
    query: "cafe",
    locale: "pt-BR",
    generation,
    first: 2,
    after: null,
  });
});

test("cursor from a replaced generation expires without querying mixed rows", async () => {
  const prior = id(89);
  const after = searchCursor(
    { query: "cafe", locale: "pt-BR", generation: prior },
    { rank: 800000, titleId: id(2) },
  );
  const f = fixture();
  const result = await f.search.execute(input({ after }), now, AbortSignal.timeout(1000));
  assert.equal(result.status, "completed");
  assert.equal(result.value.status, "cursor_expired");
  assert.equal(f.state.searches, 0);
});

test("empty results are successful and over-returning persistence fails closed", async () => {
  const empty = await fixture([]).search.execute(input(), now, AbortSignal.timeout(1000));
  assert.equal(empty.status, "completed");
  assert.equal(empty.value.status, "completed");
  assert.deepEqual(empty.value.value.edges, []);
  assert.equal(empty.value.value.endCursor, null);
  assert.equal(empty.value.value.hasNextPage, false);

  const overflow = await fixture(rows.concat(rows.slice(0, 1))).search.execute(
    input(),
    now,
    AbortSignal.timeout(1000),
  );
  assert.equal(overflow.status, "completed");
  assert.equal(overflow.value.status, "invalid_state");
});

test("invalid time and cancellation do not enter persistence", async () => {
  const invalid = fixture();
  const badTime = await invalid.search.execute(input(), -1, AbortSignal.timeout(1000));
  assert.deepEqual(badTime, { status: "completed", value: { status: "invalid_input" } });
  assert.equal(invalid.state.transactions, 0);

  const cancelled = fixture();
  const controller = new AbortController();
  controller.abort();
  assert.deepEqual(await cancelled.search.execute(input(), now, controller.signal), {
    status: "cancelled",
  });
  assert.equal(cancelled.state.transactions, 0);
});
