import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  CATALOG_PUBLIC_CACHE_POLICY,
  createCachedCatalogPublicEntities,
} from "../src/application/public-cache.js";
import type {
  CatalogCacheObservation,
  CatalogPublicCacheStore,
  CatalogPublicEntitySource,
  CatalogPublicFence,
} from "../src/application/public-ports.js";
import type { PublicCatalogCandidate } from "../src/domain/public-title.js";
import { publicCandidate } from "./public-fixture.js";
import { catalogTestId as id, catalogTestTime as now } from "./rights-fixture.js";

const signal = () => new AbortController().signal;
const scope = { now, policy: { commercial: true } };

function fence(candidate: PublicCatalogCandidate): CatalogPublicFence {
  const title = candidate.title as {
    id: string;
    version: number;
    rightsRevision: number;
    publicationId: string;
  };
  return Object.freeze({
    id: title.id,
    titleVersion: title.version,
    rightsRevision: title.rightsRevision,
    publicationId: title.publicationId,
  });
}

function memoryCache() {
  const values = new Map<string, string>();
  const writes: Array<{ key: string; ttlMs: number; mode: string }> = [];
  const store: CatalogPublicCacheStore = {
    read: (key) => Promise.resolve({ status: "completed", value: values.get(key) ?? null }),
    write: (key, value, ttlMs, mode) => {
      writes.push({ key, ttlMs, mode });
      if (mode === "if_absent" && values.has(key)) {
        return Promise.resolve({ status: "completed", value: false });
      }
      values.set(key, value);
      return Promise.resolve({ status: "completed", value: true });
    },
    delete: (key) => Promise.resolve({ status: "completed", value: values.delete(key) }),
    compareAndDelete: (key, expectedValue) => {
      if (values.get(key) !== expectedValue) {
        return Promise.resolve({ status: "completed", value: false });
      }
      values.delete(key);
      return Promise.resolve({ status: "completed", value: true });
    },
  };
  return { store, values, writes };
}

function sourceFixture(initial: readonly PublicCatalogCandidate[] = [publicCandidate()]) {
  const state = {
    candidates: [...initial],
    fenceReads: 0,
    sourceReads: 0,
    sourceBatches: [] as string[][],
    beforeFences: undefined as (() => Promise<void>) | undefined,
    beforeSource: undefined as (() => Promise<void>) | undefined,
    fenceEligibleAt: undefined as
      ((candidate: PublicCatalogCandidate, at: number) => boolean) | undefined,
  };
  const source: CatalogPublicEntitySource = {
    async findFences(ids, readScope) {
      state.fenceReads += 1;
      await state.beforeFences?.();
      return {
        status: "completed",
        value: Object.freeze(
          state.candidates
            .filter(
              (candidate) =>
                ids.includes(fence(candidate).id) &&
                (state.fenceEligibleAt?.(candidate, readScope.now) ?? true),
            )
            .map(fence),
        ),
      };
    },
    async findManyAtFences(fences) {
      state.sourceReads += 1;
      state.sourceBatches.push(fences.map((value) => value.id));
      await state.beforeSource?.();
      return {
        status: "completed",
        value: Object.freeze(
          state.candidates.filter((candidate) =>
            fences.some((expected) => {
              const current = fence(candidate);
              return JSON.stringify(current) === JSON.stringify(expected);
            }),
          ),
        ),
      };
    },
  };
  return { source, state };
}

function readerFixture(initial?: readonly PublicCatalogCandidate[]) {
  const cache = memoryCache();
  const source = sourceFixture(initial);
  const observations: CatalogCacheObservation[] = [];
  let token = 700;
  const reader = createCachedCatalogPublicEntities({
    environment: "test",
    source: source.source,
    cache: cache.store,
    digest: (value) => createHash("sha256").update(value).digest("hex"),
    token: () => id(token++),
    record: (observation) => observations.push(observation),
  });
  return { reader, cache, source, observations };
}

test("a positive hit still checks the current PostgreSQL fence and skips the full candidate read", async () => {
  const f = readerFixture();
  const first = await f.reader.findMany([id(1)], scope, signal());
  assert.equal(first.status, "completed");
  assert.deepEqual(
    first.value.map((title) => title.id),
    [id(1)],
  );
  assert.equal(f.source.state.fenceReads, 1);
  assert.equal(f.source.state.sourceReads, 1);

  const second = await f.reader.findMany([id(1)], scope, signal());
  assert.equal(second.status, "completed");
  assert.deepEqual(
    second.value.map((title) => title.id),
    [id(1)],
  );
  assert.equal(f.source.state.fenceReads, 2);
  assert.equal(f.source.state.sourceReads, 1);
  assert.equal(
    f.observations.some((value) => value.outcome === "hit"),
    true,
  );

  const positive = f.cache.writes.find((value) => value.key.includes(":public-title:v1:"));
  assert.ok(positive);
  assert.equal(positive.ttlMs >= CATALOG_PUBLIC_CACHE_POLICY.positiveTtlMs, true);
  assert.equal(
    positive.ttlMs <=
      CATALOG_PUBLIC_CACHE_POLICY.positiveTtlMs + CATALOG_PUBLIC_CACHE_POLICY.positiveJitterMs,
    true,
  );
});

test("an oversized valid projection records a bypass without an invalid payload sample", async () => {
  const base = publicCandidate();
  const longText = "x".repeat(1_024);
  const longUrl = `https://example.invalid/${"x".repeat(1_900)}`;
  const oversized: PublicCatalogCandidate = {
    ...base,
    rights: {
      ...(base.rights as Record<string, unknown>),
      workTitle: longText,
      creator: longText,
      copyrightHolder: longText,
      canonicalSourceUrl: longUrl,
      licenseName: longText,
      licenseUrl: longUrl,
      attributionText: longText,
      modificationNotice: longText,
    },
    metadata: {
      ...(base.metadata as Record<string, unknown>),
      localizations: ["en", "de", "es", "fr"].map((locale) => ({
        locale,
        title: "x".repeat(160),
        synopsis: longText,
      })),
      credits: Array.from({ length: 16 }, () => ({
        name: "x".repeat(128),
        role: "x".repeat(64),
      })),
    },
  };
  const f = readerFixture([oversized]);

  const result = await f.reader.findMany([id(1)], scope, signal());

  assert.equal(result.status, "completed");
  assert.equal(result.value.length, 1);
  assert.equal(
    f.cache.writes.some((value) => value.key.includes(":public-title:v1:")),
    false,
  );
  assert.deepEqual(
    f.observations.find((value) => value.outcome === "bypass"),
    { outcome: "bypass", durationMs: 0 },
  );
});

test("a retired title cannot be returned from a surviving positive cache entry", async () => {
  const f = readerFixture();
  assert.equal((await f.reader.findMany([id(1)], scope, signal())).status, "completed");
  f.source.state.candidates = [];

  const retired = await f.reader.findMany([id(1)], scope, signal());
  assert.deepEqual(retired, { status: "completed", value: [] });
  assert.equal(f.source.state.sourceReads, 1);
});

test("a short negative entry applies only after a valid identifier misses owner visibility", async () => {
  const f = readerFixture([]);
  assert.deepEqual(await f.reader.findMany([id(99)], scope, signal()), {
    status: "completed",
    value: [],
  });
  assert.equal(f.source.state.fenceReads, 1);
  assert.equal(f.observations.filter((value) => value.outcome === "miss").length, 1);
  const negative = f.cache.writes.find((value) => value.key.includes(":public-title-absent:v1:"));
  assert.ok(negative);
  const negativeValue = f.cache.values.get(negative.key);
  assert.ok(negativeValue);
  assert.deepEqual(JSON.parse(negativeValue), { schema: 1, kind: "absent", cachedAt: now });
  assert.equal(negative.ttlMs >= CATALOG_PUBLIC_CACHE_POLICY.negativeTtlMs, true);
  assert.equal(
    negative.ttlMs <=
      CATALOG_PUBLIC_CACHE_POLICY.negativeTtlMs + CATALOG_PUBLIC_CACHE_POLICY.negativeJitterMs,
    true,
  );

  assert.deepEqual(await f.reader.findMany([id(99)], scope, signal()), {
    status: "completed",
    value: [],
  });
  assert.equal(f.source.state.fenceReads, 1);
  assert.equal(
    f.observations.some((value) => value.outcome === "negative_hit"),
    true,
  );
});

test("negative entries without a current bounded age are deleted before owner visibility is reused", async () => {
  const maximumAgeSeconds = Math.ceil(
    (CATALOG_PUBLIC_CACHE_POLICY.negativeTtlMs + CATALOG_PUBLIC_CACHE_POLICY.negativeJitterMs) /
      1_000,
  );
  const laterScope = { ...scope, now: now + maximumAgeSeconds + 1 };
  const corruptedValues = [
    '{"schema":1,"kind":"absent"}',
    JSON.stringify({ schema: 1, kind: "absent", cachedAt: now }),
    JSON.stringify({ schema: 1, kind: "absent", cachedAt: laterScope.now + 1 }),
  ];

  for (const corrupted of corruptedValues) {
    const f = readerFixture([]);
    assert.equal((await f.reader.findMany([id(99)], scope, signal())).status, "completed");
    const key = [...f.cache.values.keys()].find((value) =>
      value.includes(":public-title-absent:v1:"),
    );
    assert.ok(key);
    f.cache.values.set(key, corrupted);
    f.source.state.candidates = [publicCandidate(99)];

    const visible = await f.reader.findMany([id(99)], laterScope, signal());

    assert.equal(visible.status, "completed");
    assert.deepEqual(
      visible.value.map((title) => title.id),
      [id(99)],
    );
    assert.equal(f.source.state.fenceReads, 2);
    assert.ok(f.observations.some((value) => value.outcome === "malformed"));
    assert.notEqual(f.cache.values.get(key), corrupted);
  }
});

test("concurrent cold negative misses share one owner fence read", async () => {
  const f = readerFixture([]);
  let started: (() => void) | undefined;
  let release: (() => void) | undefined;
  const barrier = new Promise<void>((resolve) => {
    started = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.source.state.beforeFences = async () => {
    started?.();
    await blocked;
  };

  const burst = Promise.all(
    Array.from({ length: 24 }, () => f.reader.findMany([id(99)], scope, signal())),
  );
  await barrier;
  assert.equal(f.source.state.fenceReads, 1);
  release?.();
  const results = await burst;

  assert.ok(results.every((result) => result.status === "completed" && result.value.length === 0));
  assert.equal(f.source.state.fenceReads, 1);
  assert.ok(f.observations.some((value) => value.outcome === "coalesced"));
});

test("fence coalescing never shares visibility decisions across request time", async () => {
  const f = readerFixture();
  const expiresAt = now + 1;
  f.source.state.fenceEligibleAt = (_candidate, at) => at < expiresAt;
  let release: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.source.state.beforeFences = () => blocked;

  const eligible = f.reader.findMany([id(1)], scope, signal());
  while (f.source.state.fenceReads < 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  const expired = f.reader.findMany([id(1)], { ...scope, now: expiresAt }, signal());
  while (f.source.state.fenceReads < 2) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  release?.();

  const [eligibleResult, expiredResult] = await Promise.all([eligible, expired]);
  assert.equal(eligibleResult.status, "completed");
  assert.deepEqual(
    eligibleResult.value.map((title) => title.id),
    [id(1)],
  );
  assert.deepEqual(expiredResult, { status: "completed", value: [] });
  assert.equal(f.source.state.fenceReads, 2);
});

test("TTL jitter is deterministic per key and distributed inside both policy windows", async () => {
  const candidates = Array.from({ length: 20 }, (_, index) => publicCandidate(index + 1));
  const ids = candidates.map((candidate) => fence(candidate).id);
  const first = readerFixture(candidates);
  const second = readerFixture(candidates);
  assert.equal((await first.reader.findMany(ids, scope, signal())).status, "completed");
  assert.equal((await second.reader.findMany(ids, scope, signal())).status, "completed");
  const positiveTtls = (fixture: ReturnType<typeof readerFixture>) =>
    fixture.cache.writes
      .filter((value) => value.key.includes(":public-title:v1:"))
      .map((value) => ({ key: value.key, ttlMs: value.ttlMs }))
      .sort((left, right) => left.key.localeCompare(right.key));
  const distributedPositiveTtls = positiveTtls(first);
  assert.equal(distributedPositiveTtls.length, 20);
  assert.deepEqual(distributedPositiveTtls, positiveTtls(second));
  assert.equal(new Set(distributedPositiveTtls.map((value) => value.ttlMs)).size > 1, true);
  assert.equal(
    distributedPositiveTtls.every(
      (value) =>
        value.ttlMs >= CATALOG_PUBLIC_CACHE_POLICY.positiveTtlMs &&
        value.ttlMs <=
          CATALOG_PUBLIC_CACHE_POLICY.positiveTtlMs + CATALOG_PUBLIC_CACHE_POLICY.positiveJitterMs,
    ),
    true,
  );

  const absent = readerFixture([]);
  const absentIds = Array.from({ length: 20 }, (_, index) => id(100 + index));
  assert.equal((await absent.reader.findMany(absentIds, scope, signal())).status, "completed");
  const negativeTtls = absent.cache.writes
    .filter((value) => value.key.includes(":public-title-absent:v1:"))
    .map((value) => value.ttlMs);
  assert.equal(negativeTtls.length, 20);
  assert.equal(new Set(negativeTtls).size > 1, true);
  assert.equal(
    negativeTtls.every(
      (value) =>
        value >= CATALOG_PUBLIC_CACHE_POLICY.negativeTtlMs &&
        value <=
          CATALOG_PUBLIC_CACHE_POLICY.negativeTtlMs + CATALOG_PUBLIC_CACHE_POLICY.negativeJitterMs,
    ),
    true,
  );
});

test("malformed positive bytes are deleted and rebuilt from the exact owner fence", async () => {
  const f = readerFixture();
  assert.equal((await f.reader.findMany([id(1)], scope, signal())).status, "completed");
  const key = [...f.cache.values.keys()].find((value) => value.includes(":public-title:v1:"));
  assert.ok(key);
  f.cache.values.set(key, "not-json");

  const rebuilt = await f.reader.findMany([id(1)], scope, signal());
  assert.equal(rebuilt.status, "completed");
  assert.deepEqual(
    rebuilt.value.map((title) => title.id),
    [id(1)],
  );
  assert.equal(f.source.state.sourceReads, 2);
  assert.equal(
    f.observations.some((value) => value.outcome === "malformed"),
    true,
  );
  assert.notEqual(f.cache.values.get(key), "not-json");
});

test("oversized Redis corruption retains malformed telemetry without an invalid size sample", async () => {
  const f = readerFixture();
  assert.equal((await f.reader.findMany([id(1)], scope, signal())).status, "completed");
  const key = [...f.cache.values.keys()].find((value) => value.includes(":public-title:v1:"));
  assert.ok(key);
  f.cache.values.set(key, "x".repeat(CATALOG_PUBLIC_CACHE_POLICY.maximumValueBytes + 1));

  const rebuilt = await f.reader.findMany([id(1)], scope, signal());

  assert.equal(rebuilt.status, "completed");
  assert.equal(f.source.state.sourceReads, 2);
  const malformed = f.observations.findLast((value) => value.outcome === "malformed");
  assert.ok(malformed);
  assert.equal(malformed.payloadBytes, undefined);
  assert.notEqual(
    f.cache.values.get(key),
    "x".repeat(CATALOG_PUBLIC_CACHE_POLICY.maximumValueBytes + 1),
  );
});

test("concurrent cold callers share one source refresh while cancellation remains caller-local", async () => {
  const f = readerFixture();
  let release: (() => void) | undefined;
  f.source.state.beforeSource = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  const cancelledController = new AbortController();
  const cancelled = f.reader.findMany([id(1)], scope, cancelledController.signal);
  const survivor = f.reader.findMany([id(1)], scope, signal());
  await new Promise((resolve) => setImmediate(resolve));
  cancelledController.abort();
  release?.();

  assert.equal((await cancelled).status, "cancelled");
  const completed = await survivor;
  assert.equal(completed.status, "completed");
  assert.deepEqual(
    completed.value.map((title) => title.id),
    [id(1)],
  );
  assert.equal(f.source.state.sourceReads, 1);
  assert.equal(
    f.observations.some((value) => value.outcome === "coalesced"),
    true,
  );
});

test("mixed batches coalesce each shared hot title while retaining new-title batching", async () => {
  const f = readerFixture([publicCandidate(1), publicCandidate(2), publicCandidate(3)]);
  let starts = 0;
  let release: (() => void) | undefined;
  let firstStarted: (() => void) | undefined;
  let bothStarted: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const firstBarrier = new Promise<void>((resolve) => {
    firstStarted = resolve;
  });
  const bothBarrier = new Promise<void>((resolve) => {
    bothStarted = resolve;
  });
  f.source.state.beforeSource = async () => {
    starts += 1;
    if (starts === 1) {
      firstStarted?.();
    }
    if (starts === 2) {
      bothStarted?.();
    }
    await blocked;
  };

  const first = f.reader.findMany([id(1), id(2)], scope, signal());
  await firstBarrier;
  const second = f.reader.findMany([id(1), id(3)], scope, signal());
  await bothBarrier;
  release?.();

  assert.equal((await first).status, "completed");
  assert.equal((await second).status, "completed");
  assert.equal(f.source.state.sourceReads, 2);
  assert.equal(f.source.state.sourceBatches.filter((batch) => batch.includes(id(1))).length, 1);
  assert.deepEqual(
    f.source.state.sourceBatches.map((batch) => [...batch].sort()).sort(),
    [[id(1), id(2)].sort(), [id(3)]].sort(),
  );
});

test("Redis loss bypasses to PostgreSQL and cannot change the public result", async () => {
  const source = sourceFixture();
  const bypass: CatalogPublicCacheStore = {
    read: () => Promise.resolve({ status: "bypass" }),
    write: () => Promise.resolve({ status: "bypass" }),
    delete: () => Promise.resolve({ status: "bypass" }),
    compareAndDelete: () => Promise.resolve({ status: "bypass" }),
  };
  const reader = createCachedCatalogPublicEntities({
    environment: "test",
    source: source.source,
    cache: bypass,
    digest: (value) => createHash("sha256").update(value).digest("hex"),
    token: () => id(900),
  });

  const result = await reader.findMany([id(1)], scope, signal());
  assert.equal(result.status, "completed");
  assert.deepEqual(
    result.value.map((title) => title.id),
    [id(1)],
  );
  assert.equal(source.state.sourceReads, 1);
});
