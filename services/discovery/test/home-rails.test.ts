import assert from "node:assert/strict";
import test from "node:test";
import { createHomeRails, type HomeRailMetricObservation } from "../src/application/home-rails.js";
import type { HomeRailRepository, HomeRailUnitOfWork } from "../src/application/rail-ports.js";
import type { HomeRailSource } from "../src/domain/home-rail.js";

const now = 1_700_000_000;
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const generation = id(90);
const row = (value: number, publishedAt = now - value) => ({
  titleId: id(value),
  sourceVersion: value,
  indexedAt: now,
  visibleUntil: now + 300,
  publishedAt,
});

function fixture(
  options: Readonly<{
    state?: "fresh" | "empty" | "stale";
    failed?: ReadonlySet<HomeRailSource>;
    empty?: ReadonlySet<HomeRailSource>;
    monotonicNow?: () => number;
    observe?: (observation: HomeRailMetricObservation) => void;
  }> = {},
) {
  const calls: string[] = [];
  const repository: HomeRailRepository = {
    state() {
      calls.push("state");
      return Promise.resolve({ generation, status: options.state ?? "fresh" });
    },
    fixed(_generation, source) {
      calls.push(source);
      if (options.failed?.has(source)) {
        throw new Error("selection unavailable");
      }
      if (options.empty?.has(source)) {
        return Promise.resolve([]);
      }
      return Promise.resolve(
        source === "recently_added" ? [row(2), row(3)] : [row(source === "featured" ? 1 : 4)],
      );
    },
    genres() {
      calls.push("genre");
      if (options.failed?.has("genre")) {
        throw new Error("genre selection unavailable");
      }
      return Promise.resolve(
        options.empty?.has("genre")
          ? []
          : [{ genre: "drama", available: 2, rows: [row(2), row(3)] }],
      );
    },
  };
  const transactions: HomeRailUnitOfWork = {
    async run(work, signal) {
      if (signal.aborted) {
        return { status: "cancelled" };
      }
      try {
        return { status: "completed", value: await work(repository) };
      } catch {
        return { status: "unavailable" };
      }
    },
  };
  return {
    calls,
    home: createHomeRails({
      transactions,
      ...(options.monotonicNow ? { monotonicNow: options.monotonicNow } : {}),
      ...(options.observe ? { observe: options.observe } : {}),
    }),
  };
}

test("builds finite independent fixed and genre rails with explicit freshness", async () => {
  const f = fixture();
  const result = await f.home.execute({ first: 2 }, now, AbortSignal.timeout(1000));
  assert.equal(result.status, "completed");
  assert.equal(result.value.status, "completed");
  const page = result.value.value;
  assert.equal(page.status, "completed");
  assert.equal(page.generation, generation);
  assert.equal(page.featured.rail?.edges[0]?.titleId, id(1));
  assert.equal(page.recentlyAdded.rail?.edges.length, 2);
  assert.equal(page.trending.rail?.source, "trending");
  assert.equal(page.genres.rails[0]?.key, "genre:drama");
  assert.equal(page.genres.rails[0].freshUntil, now + 300);
  assert.deepEqual(
    new Set(f.calls),
    new Set(["state", "featured", "recently_added", "trending", "genre"]),
  );
});

test("failed or empty computed rails reuse only an independently completed recent rail", async () => {
  const f = fixture({
    failed: new Set<HomeRailSource>(["featured", "genre"]),
    empty: new Set<HomeRailSource>(["trending"]),
  });
  const result = await f.home.execute({ first: 2 }, now, AbortSignal.timeout(1000));
  assert.equal(result.status, "completed");
  assert.equal(result.value.status, "completed");
  const page = result.value.value;
  assert.equal(page.status, "partial");
  assert.equal(page.featured.code, "fallback");
  assert.equal(page.featured.rail?.kind, "featured");
  assert.equal(page.featured.rail.source, "recently_added");
  assert.ok(page.recentlyAdded.rail);
  assert.deepEqual(page.featured.rail.edges, page.recentlyAdded.rail.edges);
  assert.equal(page.trending.code, "fallback");
  assert.equal(page.genres.code, "unavailable");

  const noRecent = fixture({
    failed: new Set<HomeRailSource>(["featured", "recently_added"]),
    empty: new Set<HomeRailSource>(["trending", "genre"]),
  });
  const withoutFallback = await noRecent.home.execute({ first: 2 }, now, AbortSignal.timeout(1000));
  assert.equal(withoutFallback.status, "completed");
  assert.equal(withoutFallback.value.status, "completed");
  assert.equal(withoutFallback.value.value.featured.code, "unavailable");
  assert.equal(withoutFallback.value.value.trending.code, "empty");
});

test("empty, stale, invalid and cancelled requests do not invent rails", async () => {
  const empty = fixture({ state: "empty" });
  const emptyResult = await empty.home.execute({ first: 2 }, now, AbortSignal.timeout(1000));
  assert.equal(emptyResult.status, "completed");
  assert.equal(emptyResult.value.status, "completed");
  assert.equal(emptyResult.value.value.featured.code, "empty");
  assert.deepEqual(empty.calls, ["state"]);

  const stale = fixture({ state: "stale" });
  assert.deepEqual(await stale.home.execute({ first: 2 }, now, AbortSignal.timeout(1000)), {
    status: "completed",
    value: { status: "stale" },
  });
  assert.deepEqual(stale.calls, ["state"]);

  const invalid = fixture();
  assert.deepEqual(await invalid.home.execute({ first: 13 }, now, AbortSignal.timeout(1000)), {
    status: "completed",
    value: { status: "invalid_input" },
  });
  assert.deepEqual(invalid.calls, []);

  const cancelled = fixture();
  const controller = new AbortController();
  controller.abort();
  assert.deepEqual(await cancelled.home.execute({ first: 2 }, now, controller.signal), {
    status: "cancelled",
  });
  assert.deepEqual(cancelled.calls, []);
});

test("invalid adapter ordering is isolated and all-selection failure is unavailable", async () => {
  const transactions: HomeRailUnitOfWork = {
    async run(work, signal) {
      if (signal.aborted) {
        return { status: "cancelled" };
      }
      const repository: HomeRailRepository = {
        state: () => Promise.resolve({ generation, status: "fresh" }),
        fixed: (_generation, source) =>
          source === "recently_added"
            ? Promise.resolve([row(3), row(2)])
            : Promise.reject(new Error("unavailable")),
        genres: () => Promise.reject(new Error("unavailable")),
      };
      try {
        return { status: "completed", value: await work(repository) };
      } catch {
        return { status: "unavailable" };
      }
    },
  };
  assert.deepEqual(
    await createHomeRails({ transactions }).execute({ first: 2 }, now, AbortSignal.timeout(1000)),
    { status: "unavailable" },
  );
});

test("overlapping home requests reserve at most one transaction each", async () => {
  let active = 0;
  let maximum = 0;
  const repository: HomeRailRepository = {
    state: () => Promise.resolve({ generation, status: "fresh" }),
    fixed: (_generation, source) =>
      Promise.resolve(source === "recently_added" ? [row(2), row(3)] : [row(1)]),
    genres: () => Promise.resolve([{ genre: "drama", available: 1, rows: [row(2)] }]),
  };
  const transactions: HomeRailUnitOfWork = {
    async run(work, signal) {
      if (signal.aborted) {
        return { status: "cancelled" };
      }
      active += 1;
      maximum = Math.max(maximum, active);
      try {
        await new Promise<void>((resolve) => setTimeout(resolve, 5));
        return { status: "completed", value: await work(repository) };
      } finally {
        active -= 1;
      }
    },
  };
  const home = createHomeRails({ transactions });
  const results = await Promise.all([
    home.execute({ first: 2 }, now, AbortSignal.timeout(1000)),
    home.execute({ first: 2 }, now, AbortSignal.timeout(1000)),
  ]);
  assert.ok(results.every((result) => result.status === "completed"));
  assert.equal(maximum, 2);
  assert.equal(active, 0);
});

test("records final bounded rail outcomes and telemetry cannot change the response", async () => {
  const observations: HomeRailMetricObservation[] = [];
  let timestamp = 0;
  const measured = fixture({
    failed: new Set<HomeRailSource>(["featured", "genre"]),
    monotonicNow: () => ++timestamp,
    observe: (observation) => observations.push(observation),
  });
  const result = await measured.home.execute({ first: 2 }, now, AbortSignal.timeout(1000));
  assert.equal(result.status, "completed");
  assert.equal(result.value.status, "completed");
  assert.deepEqual(
    observations.map(({ kind, outcome, freshnessSeconds }) => ({
      kind,
      outcome,
      freshnessSeconds,
    })),
    [
      { kind: "featured", outcome: "fallback", freshnessSeconds: 0 },
      { kind: "recently_added", outcome: "completed", freshnessSeconds: 0 },
      { kind: "trending", outcome: "completed", freshnessSeconds: 0 },
      { kind: "genre", outcome: "unavailable", freshnessSeconds: undefined },
    ],
  );
  assert.ok(
    observations.every(
      (observation) =>
        Number.isFinite(observation.durationMs) &&
        observation.durationMs >= 0 &&
        !Object.hasOwn(observation, "titleId") &&
        !Object.hasOwn(observation, "genre") &&
        !Object.hasOwn(observation, "profileId"),
    ),
  );

  const isolated = fixture({
    observe: () => {
      throw new Error("collector failed");
    },
  });
  const isolatedResult = await isolated.home.execute({ first: 2 }, now, AbortSignal.timeout(1000));
  assert.equal(isolatedResult.status, "completed");
  assert.equal(isolatedResult.value.status, "completed");
});
