import assert from "node:assert/strict";
import test from "node:test";
import {
  createCachedDiscoveryHome,
  DISCOVERY_HOME_CACHE_POLICY,
  type DiscoveryHomeCacheObservation,
} from "../src/application/home-cache.js";
import type {
  DiscoveryHomeCacheResult,
  DiscoveryHomeCacheStore,
  DiscoveryHomeSource,
} from "../src/application/home-cache-ports.js";
import type { HomeRail, HomeRailsPage, HomeRailsResult } from "../src/application/home-rails.js";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

function rail(
  kind: "featured" | "recently_added" | "trending",
  generatedAt: number,
  visibleUntil: number,
  populated: boolean,
): HomeRail {
  const edges = populated
    ? Object.freeze([
        Object.freeze({
          titleId: id(1),
          sourceVersion: 1,
          indexedAt: generatedAt,
          visibleUntil,
        }),
      ])
    : Object.freeze([]);
  return Object.freeze({
    key: kind.replaceAll("_", "-"),
    kind,
    genre: null,
    source: kind,
    oldestIndexedAt: populated ? generatedAt : null,
    freshUntil: populated ? visibleUntil : null,
    edges,
  });
}

function page(generatedAt: number, visibleFor = 300): HomeRailsPage {
  const visibleUntil = generatedAt + visibleFor;
  return Object.freeze({
    status: "completed",
    generation: id(90),
    generatedAt,
    featured: Object.freeze({
      code: "completed",
      rail: rail("featured", generatedAt, visibleUntil, true),
    }),
    recentlyAdded: Object.freeze({
      code: "empty",
      rail: rail("recently_added", generatedAt, visibleUntil, false),
    }),
    trending: Object.freeze({
      code: "empty",
      rail: rail("trending", generatedAt, visibleUntil, false),
    }),
    genres: Object.freeze({ code: "empty", rails: Object.freeze([]) }),
  });
}

class FakeCache implements DiscoveryHomeCacheStore {
  readonly values = new Map<string, string>();
  available = true;

  read(key: string): Promise<DiscoveryHomeCacheResult<string | null>> {
    if (!this.available) {
      return Promise.resolve({ status: "bypass" });
    }
    const value = this.values.get(key) ?? null;
    return Promise.resolve(
      value !== null && Buffer.byteLength(value, "utf8") > 16_384
        ? { status: "malformed" }
        : { status: "completed", value },
    );
  }

  write(
    key: string,
    value: string,
    _ttlMs: number,
    mode: "replace" | "if_absent",
  ): Promise<DiscoveryHomeCacheResult<boolean>> {
    if (!this.available) {
      return Promise.resolve({ status: "bypass" });
    }
    if (mode === "if_absent" && this.values.has(key)) {
      return Promise.resolve({ status: "completed", value: false });
    }
    this.values.set(key, value);
    return Promise.resolve({ status: "completed", value: true });
  }

  delete(key: string): Promise<DiscoveryHomeCacheResult<boolean>> {
    if (!this.available) {
      return Promise.resolve({ status: "bypass" });
    }
    return Promise.resolve({ status: "completed", value: this.values.delete(key) });
  }

  compareAndDelete(key: string, expected: string): Promise<DiscoveryHomeCacheResult<boolean>> {
    if (!this.available) {
      return Promise.resolve({ status: "bypass" });
    }
    if (this.values.get(key) !== expected) {
      return Promise.resolve({ status: "completed", value: false });
    }
    this.values.delete(key);
    return Promise.resolve({ status: "completed", value: true });
  }
}

function fixture(visibleFor = 300) {
  const cache = new FakeCache();
  const observations: DiscoveryHomeCacheObservation[] = [];
  let wallNow = 1_700_000_000;
  let sourceCalls = 0;
  let beforeSource: ((signal: AbortSignal) => Promise<void>) | undefined;
  let sourceResult: HomeRailsResult | undefined;
  const source: DiscoveryHomeSource = {
    async execute(_input, at, signal): Promise<HomeRailsResult> {
      sourceCalls += 1;
      await beforeSource?.(signal);
      if (sourceResult) {
        return sourceResult;
      }
      return signal.aborted
        ? { status: "cancelled" }
        : { status: "completed", value: { status: "completed", value: page(at, visibleFor) } };
    },
  };
  let token = 0;
  const home = createCachedDiscoveryHome({
    environment: "test",
    source,
    cache,
    digest: () => "0".repeat(64),
    token: () => (++token).toString(16).padStart(32, "0"),
    now: () => wallNow,
    record: (observation) => observations.push(observation),
  });
  return {
    cache,
    home,
    observations,
    sourceCalls: () => sourceCalls,
    setNow(value: number) {
      wallNow = value;
    },
    setBeforeSource(value: ((signal: AbortSignal) => Promise<void>) | undefined) {
      beforeSource = value;
    },
    setSourceResult(value: HomeRailsResult | undefined) {
      sourceResult = value;
    },
  };
}

async function until(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("Condition did not settle.");
}

test("cold source populates one bounded value and a fresh hit avoids PostgreSQL", async () => {
  const f = fixture();
  const first = await f.home.execute({ first: 10 }, 1_700_000_000, AbortSignal.timeout(1_000));
  const second = await f.home.execute({ first: 10 }, 1_700_000_001, AbortSignal.timeout(1_000));

  assert.equal(first.status, "completed");
  assert.equal(second.status, "completed");
  assert.equal(second.value.status, "completed");
  assert.equal(second.value.value.status, "completed");
  assert.equal(f.sourceCalls(), 1);
  const stored = [...f.cache.values.entries()].find(([key]) => key.includes(":home:v1:10"));
  assert.ok(stored);
  assert.ok(Buffer.byteLength(stored[1], "utf8") <= DISCOVERY_HOME_CACHE_POLICY.maximumValueBytes);
  assert.ok(f.observations.some(({ outcome }) => outcome === "hit"));
});

test("eligible stale data returns immediately while one background refresh replaces it", async () => {
  const f = fixture();
  await f.home.execute({ first: 10 }, 1_700_000_000, AbortSignal.timeout(1_000));
  f.setNow(1_700_000_015);
  let release: (() => void) | undefined;
  let started: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const barrier = new Promise<void>((resolve) => {
    started = resolve;
  });
  f.setBeforeSource(async () => {
    started?.();
    await blocked;
  });

  const stale = await f.home.execute({ first: 10 }, 1_700_000_015, AbortSignal.timeout(1_000));
  await barrier;
  assert.equal(stale.status, "completed");
  assert.equal(stale.value.status, "completed");
  assert.equal(stale.value.value.status, "stale");
  assert.equal(stale.value.value.generatedAt, 1_700_000_000);
  assert.equal(f.sourceCalls(), 2);
  release?.();
  f.setBeforeSource(undefined);
  await until(() =>
    [...f.cache.values.values()].some((value) => value.includes('"cachedAt":1700000015')),
  );
  const refreshed = await f.home.execute({ first: 10 }, 1_700_000_015, AbortSignal.timeout(1_000));
  assert.equal(refreshed.status, "completed");
  assert.equal(refreshed.value.status, "completed");
  assert.equal(refreshed.value.value.status, "completed");
  assert.ok(f.observations.some(({ outcome }) => outcome === "stale_hit"));
});

test("concurrent stale callers return one snapshot and start one refresh", async () => {
  const f = fixture();
  await f.home.execute({ first: 10 }, 1_700_000_000, AbortSignal.timeout(1_000));
  f.setNow(1_700_000_015);
  let release: (() => void) | undefined;
  let started: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const barrier = new Promise<void>((resolve) => {
    started = resolve;
  });
  f.setBeforeSource(async () => {
    started?.();
    await blocked;
  });

  const results = await Promise.all(
    Array.from({ length: 24 }, () =>
      f.home.execute({ first: 10 }, 1_700_000_015, AbortSignal.timeout(1_000)),
    ),
  );
  await barrier;
  assert.ok(
    results.every(
      (result) =>
        result.status === "completed" &&
        result.value.status === "completed" &&
        result.value.value.status === "stale",
    ),
  );
  assert.equal(f.sourceCalls(), 2);
  release?.();
  await until(() =>
    [...f.cache.values.values()].some((value) => value.includes('"cachedAt":1700000015')),
  );
});

test("failed background refresh retains only the still-bounded stale snapshot", async () => {
  const f = fixture();
  await f.home.execute({ first: 10 }, 1_700_000_000, AbortSignal.timeout(1_000));
  f.setNow(1_700_000_015);
  f.setSourceResult({ status: "unavailable" });

  const stale = await f.home.execute({ first: 10 }, 1_700_000_015, AbortSignal.timeout(1_000));

  assert.equal(stale.status, "completed");
  assert.equal(stale.value.status, "completed");
  assert.equal(stale.value.value.status, "stale");
  await until(() => f.observations.some(({ outcome }) => outcome === "refresh_failed"));
  assert.equal(f.sourceCalls(), 2);
  assert.ok([...f.cache.values.values()].some((value) => value.includes('"cachedAt":1700000000')));
  assert.ok(
    [...f.cache.values.values()].every((value) => !value.includes('"cachedAt":1700000015')),
  );
});

test("maximum stale age and title visibility expiry force an owner reload", async () => {
  const age = fixture();
  await age.home.execute({ first: 10 }, 1_700_000_000, AbortSignal.timeout(1_000));
  age.setNow(1_700_000_060);
  const expired = await age.home.execute({ first: 10 }, 1_700_000_060, AbortSignal.timeout(1_000));
  assert.equal(expired.status, "completed");
  assert.equal(expired.value.status, "completed");
  assert.equal(expired.value.value.generatedAt, 1_700_000_060);
  assert.equal(age.sourceCalls(), 2);
  assert.ok(age.observations.some(({ outcome }) => outcome === "miss"));
  assert.ok(!age.observations.some(({ outcome }) => outcome === "malformed"));

  const visibility = fixture(10);
  await visibility.home.execute({ first: 10 }, 1_700_000_000, AbortSignal.timeout(1_000));
  visibility.setNow(1_700_000_010);
  const hidden = await visibility.home.execute(
    { first: 10 },
    1_700_000_010,
    AbortSignal.timeout(1_000),
  );
  assert.equal(hidden.status, "completed");
  assert.equal(hidden.value.status, "completed");
  assert.equal(hidden.value.value.generatedAt, 1_700_000_010);
  assert.equal(visibility.sourceCalls(), 2);
});

test("mixed caller cancellation preserves one shared cold refresh", async () => {
  const f = fixture();
  let release: (() => void) | undefined;
  let started: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const barrier = new Promise<void>((resolve) => {
    started = resolve;
  });
  f.setBeforeSource(async () => {
    started?.();
    await blocked;
  });
  const cancelled = new AbortController();
  const first = f.home.execute({ first: 10 }, 1_700_000_000, cancelled.signal);
  const second = f.home.execute({ first: 10 }, 1_700_000_000, AbortSignal.timeout(1_000));
  await barrier;
  cancelled.abort();
  assert.deepEqual(await first, { status: "cancelled" });
  release?.();
  assert.equal((await second).status, "completed");
  assert.equal(f.sourceCalls(), 1);
  assert.ok(f.observations.some(({ outcome }) => outcome === "coalesced"));
});

test("oversized corruption and Redis loss never replace the source result", async () => {
  const malformed = fixture();
  malformed.cache.values.set(
    "aster:test:discovery:home:v1:10",
    "x".repeat(DISCOVERY_HOME_CACHE_POLICY.maximumValueBytes + 1),
  );
  const rebuilt = await malformed.home.execute(
    { first: 10 },
    1_700_000_000,
    AbortSignal.timeout(1_000),
  );
  assert.equal(rebuilt.status, "completed");
  assert.equal(malformed.sourceCalls(), 1);
  const observation = malformed.observations.find(({ outcome }) => outcome === "malformed");
  assert.ok(observation);
  assert.equal(observation.payloadBytes, undefined);

  const outage = fixture();
  outage.cache.available = false;
  const fallback = await outage.home.execute(
    { first: 10 },
    1_700_000_000,
    AbortSignal.timeout(1_000),
  );
  assert.equal(fallback.status, "completed");
  assert.equal(outage.sourceCalls(), 1);
  assert.ok(outage.observations.some(({ outcome }) => outcome === "bypass"));
});

test("bounded malformed JSON is deleted and recorded without its contents", async () => {
  const f = fixture();
  f.cache.values.set("aster:test:discovery:home:v1:10", '{"not":"an-envelope"}');

  const result = await f.home.execute({ first: 10 }, 1_700_000_000, AbortSignal.timeout(1_000));

  assert.equal(result.status, "completed");
  assert.equal(f.sourceCalls(), 1);
  const malformed = f.observations.find(({ outcome }) => outcome === "malformed");
  assert.ok(malformed);
  assert.equal(malformed.payloadBytes, Buffer.byteLength('{"not":"an-envelope"}', "utf8"));
  assert.ok([...f.cache.values.values()].every((value) => value !== '{"not":"an-envelope"}'));
});

test("shutdown cancels and drains a detached background refresh", async () => {
  const f = fixture();
  await f.home.execute({ first: 10 }, 1_700_000_000, AbortSignal.timeout(1_000));
  f.setNow(1_700_000_015);
  let refreshStarted: (() => void) | undefined;
  let refreshAborted = false;
  const barrier = new Promise<void>((resolve) => {
    refreshStarted = resolve;
  });
  f.setBeforeSource(
    (signal) =>
      new Promise<void>((resolve) => {
        refreshStarted?.();
        signal.addEventListener(
          "abort",
          () => {
            refreshAborted = true;
            resolve();
          },
          { once: true },
        );
      }),
  );

  const stale = await f.home.execute({ first: 10 }, 1_700_000_015, AbortSignal.timeout(1_000));
  await barrier;
  assert.equal(stale.status, "completed");
  await f.home.stop(AbortSignal.timeout(1_000));
  assert.equal(refreshAborted, true);
  assert.deepEqual(await f.home.execute({ first: 10 }, 1_700_000_015, AbortSignal.timeout(1_000)), {
    status: "cancelled",
  });
});
