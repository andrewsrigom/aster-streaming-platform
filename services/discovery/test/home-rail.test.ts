import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeHomeGenreRows,
  normalizeHomeRailInput,
  normalizeHomeRailRows,
} from "../src/domain/home-rail.js";

const now = 1_700_000_000;
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const row = (value: number, publishedAt = now - value) => ({
  titleId: id(value),
  sourceVersion: value,
  indexedAt: now,
  visibleUntil: now + 300,
  publishedAt,
});

test("home input and ordered visible rows are strictly bounded", () => {
  assert.deepEqual(normalizeHomeRailInput({ first: 12 }), { first: 12 });
  for (const input of [
    null,
    {},
    { first: 0 },
    { first: 13 },
    { first: 1, extra: true },
    Object.assign(Object.create({ first: 1 }), { first: 1 }),
  ]) {
    assert.equal(normalizeHomeRailInput(input), undefined);
  }
  assert.deepEqual(normalizeHomeRailRows([row(1), row(2)], now, 2), [row(1), row(2)]);
  assert.equal(normalizeHomeRailRows([row(2), row(1)], now, 2), undefined);
  assert.equal(normalizeHomeRailRows([row(1), row(1)], now, 2), undefined);
  assert.equal(normalizeHomeRailRows([{ ...row(1), visibleUntil: now }], now, 2), undefined);
  assert.equal(normalizeHomeRailRows([row(1), row(2), row(3)], now, 2), undefined);
});

test("genre groups are finite, distinct and ordered by availability then slug", () => {
  const value = [
    { genre: "animation", available: 8, rows: [row(1)] },
    { genre: "drama", available: 4, rows: [row(2)] },
  ];
  assert.deepEqual(normalizeHomeGenreRows(value, now, 2), value);
  assert.equal(normalizeHomeGenreRows([...value].reverse(), now, 2), undefined);
  assert.equal(
    normalizeHomeGenreRows(
      [
        { genre: "drama", available: 4, rows: [row(1)] },
        { genre: "drama", available: 3, rows: [row(2)] },
      ],
      now,
      2,
    ),
    undefined,
  );
  assert.equal(
    normalizeHomeGenreRows([{ genre: "Needs Review", available: 1, rows: [row(1)] }], now, 2),
    undefined,
  );
  assert.equal(
    normalizeHomeGenreRows([{ genre: "drama", available: 0, rows: [] }], now, 2),
    undefined,
  );
});
