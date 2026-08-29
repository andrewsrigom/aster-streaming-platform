import assert from "node:assert/strict";
import test from "node:test";
import { ASTER_METRIC_CATALOG, createAsterTelemetry } from "@aster/telemetry";
import { createHomeRails } from "../src/application/home-rails.js";
import type { HomeRailUnitOfWork } from "../src/application/rail-ports.js";
import { createTitleSearch } from "../src/application/search-titles.js";
import type { SearchUnitOfWork } from "../src/application/search-ports.js";

const now = 1_700_000_000;
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const generation = id(90);

test("Discovery use cases collect finite rail and sampled search metrics", async () => {
  const telemetry = createAsterTelemetry({
    serviceName: "discovery-metric-integration",
    serviceVersion: "0.0.0",
    environment: "test",
    export: { mode: "none" },
  });
  const recordRail = telemetry.recordDiscoveryRail?.bind(telemetry);
  const recordSearchSample = telemetry.recordDiscoverySearchSample?.bind(telemetry);
  assert.ok(recordRail);
  assert.ok(recordSearchSample);

  const homeTransactions: HomeRailUnitOfWork = {
    async run(work, signal) {
      return signal.aborted
        ? { status: "cancelled" }
        : {
            status: "completed",
            value: await work({
              state: () => Promise.resolve({ generation, status: "fresh" }),
              fixed: (_generation, source) =>
                Promise.resolve(
                  source === "featured"
                    ? []
                    : [
                        {
                          titleId: id(source === "recently_added" ? 1 : 2),
                          sourceVersion: 1,
                          indexedAt: now - 5,
                          visibleUntil: now + 295,
                          publishedAt: now - 10,
                        },
                      ],
                ),
              genres: () => Promise.resolve([]),
            }),
          };
    },
  };
  const home = createHomeRails({
    transactions: homeTransactions,
    monotonicNow: () => 10,
    observe: (observation) => {
      recordRail(observation);
    },
  });
  const homeResult = await home.execute({ first: 2 }, now, AbortSignal.timeout(1000));
  assert.equal(homeResult.status, "completed");

  const searchTransactions: SearchUnitOfWork = {
    async run(work, signal) {
      return signal.aborted
        ? { status: "cancelled" }
        : {
            status: "completed",
            value: await work({
              activeGeneration: () => Promise.resolve(generation),
              projectionStale: () => Promise.resolve(false),
              find: () =>
                Promise.resolve([
                  {
                    titleId: id(1),
                    rank: 800_000,
                    sourceVersion: 1,
                    indexedAt: now - 5,
                    visibleUntil: now + 295,
                  },
                ]),
            }),
          };
    },
  };
  const search = createTitleSearch({
    transactions: searchTransactions,
    observeSample: (sample) => {
      recordSearchSample(sample);
    },
  });
  const searchResult = await search.execute(
    { query: "Signal", locale: "en", first: 5, after: null },
    now,
    AbortSignal.timeout(1000),
    true,
  );
  assert.equal(searchResult.status, "completed");

  const collection = await telemetry.collect();
  assert.equal(collection.status, "collected");
  const names = new Set(collection.metrics.map((metric) => metric.name));
  for (const name of [
    ASTER_METRIC_CATALOG.discoveryRailDuration.name,
    ASTER_METRIC_CATALOG.discoveryRailOutcomes.name,
    ASTER_METRIC_CATALOG.discoveryRailFreshness.name,
    ASTER_METRIC_CATALOG.discoverySearchQualitySamples.name,
  ]) {
    assert.ok(names.has(name), name);
  }
  const productMetrics = collection.metrics.filter((metric) =>
    metric.name.startsWith("aster.discovery."),
  );
  assert.ok(productMetrics.length >= 4);
  for (const metric of productMetrics) {
    for (const point of metric.points) {
      assert.ok(
        Object.keys(point.attributes).every((key) =>
          [
            "aster.discovery.rail",
            "aster.outcome",
            "aster.discovery.result_bucket",
            "aster.discovery.top_rank_bucket",
          ].includes(key),
        ),
      );
    }
  }
  assert.deepEqual(telemetry.exportHealth().droppedObservations, 0);
  await telemetry.shutdown();
});
