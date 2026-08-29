import assert from "node:assert/strict";
import test from "node:test";
import {
  isTitleProjectionVisible,
  normalizeTitleProjection,
  reconcileTitleProjection,
  type TitleProjection,
} from "../src/domain/title-projection.js";

const now = 1_700_000_000;
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const document = () => ({
  defaultLocale: "en",
  localizations: [{ locale: "en", title: "Signal", synopsis: "A generated journey." }],
  genres: ["animation"],
  editorialLabels: ["featured"],
  releaseYear: 2026,
  publishedAt: now - 100,
});
const source = (overrides: Record<string, unknown> = {}) => ({
  titleId: id(1),
  sourceVersion: 7,
  observedAt: now,
  visibleUntil: now + 300,
  document: document(),
  ...overrides,
});
const context = (time = now) => ({ now: time, event: { id: id(2), titleId: id(1), version: 7 } });
function accepted(
  previous: unknown = null,
  snapshot: unknown = source(),
  time = now,
): TitleProjection {
  const result = reconcileTitleProjection(previous, snapshot, context(time));
  assert.ok("value" in result, result.status);
  return result.value;
}

test("current snapshot creates a deeply immutable bounded projection without copying authority", () => {
  const incoming = source();
  const row = accepted(null, incoming);
  assert.equal(row.sourceVersion, 7);
  assert.equal(row.projectionVersion, 1);
  assert.equal(row.triggerEventId, id(2));
  assert.equal(row.indexedAt, now);
  assert.ok(isTitleProjectionVisible(row, now));
  assert.ok(Object.isFrozen(row));
  assert.ok(Object.isFrozen(row.document?.localizations));
  const originalLocalization = incoming.document.localizations[0];
  assert.ok(originalLocalization);
  originalLocalization.title = "Mutated after validation";
  assert.equal(row.document?.localizations[0]?.title, "Signal");
  assert.deepEqual(normalizeTitleProjection(row), row);
});

test("exact duplicate has no new indexed time or provenance effect", () => {
  const first = accepted();
  const result = reconcileTitleProjection(first, source(), context(now + 1));
  assert.equal(result.status, "unchanged");
  assert.ok("value" in result);
  assert.deepEqual(result.value, first);
});

test("old hints read the current owner version and never claim their event version is current", () => {
  const latest = source({ sourceVersion: 9 });
  assert.equal(accepted(null, latest).sourceVersion, 9);
  assert.equal(
    reconcileTitleProjection(null, source(), { now, event: { ...context().event, version: 8 } })
      .status,
    "conflict",
  );
  assert.equal(
    reconcileTitleProjection(null, source(), { now, event: { ...context().event, titleId: id(3) } })
      .status,
    "invalid_input",
  );
  assert.equal(
    reconcileTitleProjection(null, source(), { now, event: { ...context().event, version: 0 } })
      .status,
    "invalid_input",
  );
});

test("out-of-order versions cannot regress metadata or a retirement fence", () => {
  const published = accepted(null, source({ sourceVersion: 9 }));
  const stale = reconcileTitleProjection(published, source({ sourceVersion: 8 }), context());
  assert.equal(stale.status, "stale");
  assert.ok("value" in stale);
  assert.deepEqual(stale.value, published);
  const hidden = accepted(
    published,
    source({ sourceVersion: 10, document: null, visibleUntil: null }),
  );
  assert.equal(isTitleProjectionVisible(hidden, now), false);
  assert.equal(
    reconcileTitleProjection(hidden, source({ sourceVersion: 9 }), context()).status,
    "stale",
  );
  assert.equal(
    reconcileTitleProjection(hidden, source({ sourceVersion: 10 }), context()).status,
    "conflict",
  );
  assert.ok(isTitleProjectionVisible(accepted(hidden, source({ sourceVersion: 11 })), now));
});

test("expiry can hide the same version but cannot be undone by another same-version publication", () => {
  const published = accepted();
  const hidden = accepted(published, source({ document: null, visibleUntil: null }));
  assert.equal(hidden.sourceVersion, published.sourceVersion);
  assert.equal(hidden.document, null);
  assert.equal(reconcileTitleProjection(hidden, source(), context()).status, "conflict");
});

test("changed same-version metadata and contradictory leases fail closed", () => {
  const first = accepted();
  assert.equal(
    reconcileTitleProjection(
      first,
      source({ document: { ...document(), genres: ["drama"] } }),
      context(),
    ).status,
    "conflict",
  );
  assert.equal(
    reconcileTitleProjection(first, source({ visibleUntil: now + 100 }), context()).status,
    "conflict",
  );
  const later = { ...document(), genres: ["drama"] };
  assert.deepEqual(
    accepted(first, source({ sourceVersion: 8, document: later })).document?.genres,
    ["drama"],
  );
});

test("fresh authoritative refresh renews a lease; an old observation cannot extend it", () => {
  const first = accepted();
  const next = source({ observedAt: now + 10, visibleUntil: now + 310 });
  const refreshed = reconcileTitleProjection(first, next, context(now + 10));
  assert.equal(refreshed.status, "refreshed");
  assert.ok("value" in refreshed);
  assert.equal(refreshed.value.visibleUntil, now + 310);
  assert.equal(
    reconcileTitleProjection(
      refreshed.value,
      source({ observedAt: now + 9, visibleUntil: now + 309 }),
      context(now + 10),
    ).status,
    "stale",
  );
});

test("visibility has exact expiry and current-source freshness boundaries", () => {
  const row = accepted(null, source({ visibleUntil: now + 10 }));
  assert.equal(isTitleProjectionVisible(row, now + 9), true);
  assert.equal(isTitleProjectionVisible(row, now + 10), false);
  assert.equal(isTitleProjectionVisible(row, now - 1), false);
  assert.equal(isTitleProjectionVisible(row, NaN), false);
  assert.ok("value" in reconcileTitleProjection(null, source(), context(now + 2)));
  assert.equal(reconcileTitleProjection(null, source(), context(now + 3)).status, "invalid_input");
  assert.equal(reconcileTitleProjection(null, source(), context(now - 1)).status, "invalid_input");
  assert.equal(
    reconcileTitleProjection(null, source({ visibleUntil: now + 301 }), context()).status,
    "invalid_input",
  );
  assert.equal(
    reconcileTitleProjection(null, source({ visibleUntil: now + 1 }), context(now + 1)).status,
    "invalid_input",
  );
});

test("rebuild snapshots do not invent broker provenance or discard version fences", () => {
  const result = reconcileTitleProjection(null, source(), { now, event: null });
  assert.ok("value" in result);
  assert.equal(result.value.triggerEventId, null);
  const hidden = accepted(null, source({ sourceVersion: 10, document: null, visibleUntil: null }));
  assert.equal(reconcileTitleProjection(hidden, source(), { now, event: null }).status, "stale");
});

test("canonical locale, Unicode and sorted lists yield stable duplicate detection", () => {
  const metadata = {
    ...document(),
    defaultLocale: "pt-br",
    localizations: [
      { locale: "pt-br", title: "Cafe\u0301", synopsis: "Uma jornada." },
      { locale: "en", title: "Coffee", synopsis: "A journey." },
    ],
    genres: ["drama", "animation"],
  };
  const first = accepted(null, source({ document: metadata }));
  assert.equal(first.document?.defaultLocale, "pt-BR");
  assert.equal(first.document.localizations[1]?.title, "Café");
  const equivalent = {
    ...metadata,
    defaultLocale: "pt-BR",
    genres: ["animation", "drama"],
    localizations: [...metadata.localizations].reverse(),
  };
  assert.equal(
    reconcileTitleProjection(first, source({ document: equivalent }), context()).status,
    "unchanged",
  );
});

test("snapshot and metadata limits reject extra authority, malformed values and overflow", () => {
  for (const incoming of [
    source({ sourceVersion: 0 }),
    source({ sourceVersion: 2147483648 }),
    source({ titleId: "bad" }),
    source({ observedAt: Infinity }),
    source({ visibleUntil: null }),
    source({ document: null }),
    source({ mediaUrl: "https://example.invalid/private" }),
    source({ document: { ...document(), localizations: [] } }),
    source({
      document: {
        ...document(),
        localizations: Array.from({ length: 5 }, () => document().localizations[0]),
      },
    }),
    source({ document: { ...document(), defaultLocale: "pt-BR" } }),
    source({
      document: { ...document(), genres: Array.from({ length: 9 }, (_, n) => `genre-${n}`) },
    }),
    source({ document: { ...document(), genres: ["drama", "drama"] } }),
    source({ document: { ...document(), publishedAt: now + 1 } }),
    source({ document: { ...document(), releaseYear: 1887 } }),
    source({
      document: {
        ...document(),
        localizations: [{ locale: "en", title: "x".repeat(161), synopsis: "A" }],
      },
    }),
    source({
      document: {
        ...document(),
        localizations: [{ locale: "en", title: "A", synopsis: "x".repeat(1025) }],
      },
    }),
    source({
      document: {
        ...document(),
        localizations: [{ locale: "en", title: "A\u202e", synopsis: "A" }],
      },
    }),
  ]) {
    assert.equal(reconcileTitleProjection(null, incoming, context()).status, "invalid_input");
  }
});

test("invalid persisted identities, schema versions and future clocks cannot be advanced", () => {
  const first = accepted();
  for (const current of [
    {},
    { ...first, titleId: id(8) },
    { ...first, projectionVersion: 2 },
    { ...first, indexedAt: now + 1 },
    { ...first, triggerEventId: "bad" },
  ]) {
    assert.equal(reconcileTitleProjection(current, source(), context()).status, "invalid_state");
  }
  assert.equal(normalizeTitleProjection({ ...first, extra: true }), undefined);
  assert.equal(isTitleProjectionVisible({}, now), false);
});

test("untrusted snapshot properties and array accessors are never invoked", () => {
  let accesses = 0;
  const hostile = {
    ...source(),
    get sourceVersion() {
      accesses++;
      return 7;
    },
  };
  const entries = [document().localizations[0]];
  Object.defineProperty(entries, "0", {
    get() {
      accesses++;
      return document().localizations[0];
    },
  });
  for (const value of [
    hostile,
    source({ document: { ...document(), localizations: entries } }),
    new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("hostile");
        },
      },
    ),
  ]) {
    assert.equal(reconcileTitleProjection(null, value, context()).status, "invalid_input");
  }
  assert.equal(accesses, 0);
});
