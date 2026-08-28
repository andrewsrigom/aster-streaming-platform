import assert from "node:assert/strict";
import test from "node:test";
import {
  followsSearchCursor,
  normalizeSearchInput,
  normalizeSearchText,
  searchCursor,
} from "../src/domain/search-input.js";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const generation = id(1);
const input = (overrides: Record<string, unknown> = {}) => ({
  query: "Café",
  locale: "pt-br",
  first: 20,
  after: null,
  ...overrides,
});
function normalized() {
  const result = normalizeSearchInput(input(), generation);
  assert.equal(result.status, "completed");
  return result.value;
}

test("normalizes title/query Unicode and punctuation consistently without interpreting a query language", () => {
  assert.equal(normalizeSearchText("  CAFÉ — São-Paulo  "), "cafe sao paulo");
  assert.equal(normalizeSearchText("Cafe\u0301"), normalizeSearchText("Café"));
  assert.equal(normalizeSearchText('"film" OR -title:*'), "film or title");
  assert.equal(normalizeSearchText("東京 2026"), "東京 2026");
  assert.deepEqual(normalized(), {
    query: "cafe",
    locale: "pt-BR",
    first: 20,
    after: null,
    generation,
  });
});

test("query-bound rank/title cursor round-trips and cannot be reused for another search", () => {
  const scope = normalized();
  const position = { rank: 250000, titleId: id(2) };
  const after = searchCursor(scope, position);
  const result = normalizeSearchInput(input({ after }), generation);
  assert.equal(result.status, "completed");
  assert.deepEqual(result.value.after, position);
  for (const change of [{ query: "other" }, { locale: "en" }]) {
    assert.equal(
      normalizeSearchInput(input({ after, ...change }), generation).status,
      "invalid_input",
    );
  }
  assert.equal(normalizeSearchInput(input({ after }), id(3)).status, "cursor_expired");
});

test("canonical cursor rejects ambiguous scores, extra components and forged encoding", () => {
  const cursor = searchCursor(normalized(), { rank: 250000, titleId: id(2) });
  for (const after of [
    cursor + ".extra",
    cursor.replace("250000", "0250000"),
    cursor.replace("250000", "2.5e5"),
    cursor.replace("250000", "NaN"),
    cursor.replace("250000", "1000001"),
    cursor.replace(".pt-BR.", ".pt-br."),
    cursor.replace(".cafe", ".%63afe"),
    "x".repeat(1281),
  ]) {
    assert.equal(normalizeSearchInput(input({ after }), generation).status, "invalid_input");
  }
});

test("query, term, page and authority bounds fail without silent truncation", () => {
  for (const change of [
    { query: "" },
    { query: "---" },
    { query: "x".repeat(81) },
    { query: "one two three four five six seven eight nine" },
    { query: "hello\u202e" },
    { query: "hello\u0000" },
    { query: "\ud800" },
    { query: {} },
    { first: 0 },
    { first: 21 },
    { first: 1.5 },
    { first: NaN },
    { locale: "not_a_locale" },
    { accountId: id(5) },
    { after: {} },
  ]) {
    assert.equal(normalizeSearchInput(input(change), generation).status, "invalid_input");
  }
  assert.equal(
    normalizeSearchInput(input({ query: "x".repeat(80), first: 1 }), generation).status,
    "completed",
  );
  assert.equal(
    normalizeSearchInput(input({ query: "one two three four five six seven eight" }), generation)
      .status,
    "completed",
  );
  assert.equal(normalizeSearchInput(input(), "bad").status, "invalid_state");
});

test("maximum Unicode query fits its bounded cursor without losing scope", () => {
  const query = "\u{10400}".repeat(80);
  const result = normalizeSearchInput(input({ query }), generation);
  assert.equal(result.status, "completed");
  const after = searchCursor(result.value, { rank: 0, titleId: id(2) });
  assert.ok(after.length <= 1280);
  assert.equal(normalizeSearchInput(input({ query, after }), generation).status, "completed");
});

test("rank-descending/id-ascending traversal excludes previous positions despite new inserts", () => {
  const after = { rank: 500000, titleId: id(10) };
  const values = [
    { rank: 600000, titleId: id(3) },
    { rank: 500000, titleId: id(9) },
    after,
    { rank: 500000, titleId: id(11) },
    { rank: 400000, titleId: id(5) },
  ];
  assert.deepEqual(
    values.filter((value) => followsSearchCursor(value, after)),
    values.slice(3),
  );
});

test("cursor producer refuses malformed internal positions", () => {
  for (const position of [
    { rank: -1, titleId: id(2) },
    { rank: 1.5, titleId: id(2) },
    { rank: Infinity, titleId: id(2) },
    { rank: 1000001, titleId: id(2) },
    { rank: 1, titleId: "bad" },
  ]) {
    assert.throws(() => searchCursor(normalized(), position), /Invalid search cursor/u);
  }
});

test("untrusted query accessors and hostile reflection never escape validation", () => {
  let accesses = 0;
  const value = {
    ...input(),
    get query() {
      accesses++;
      return "film";
    },
  };
  assert.equal(normalizeSearchInput(value, generation).status, "invalid_input");
  assert.equal(
    normalizeSearchInput(
      new Proxy(
        {},
        {
          ownKeys() {
            throw new Error("hostile");
          },
        },
      ),
      generation,
    ).status,
    "invalid_input",
  );
  assert.equal(accesses, 0);
});
