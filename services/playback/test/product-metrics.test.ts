import assert from "node:assert/strict";
import test from "node:test";
import type { AsterProductMetricInput } from "@aster/telemetry";
import type { PlaybackSessions } from "../src/application/create-session.js";
import { observePlaybackSessions } from "../src/infrastructure/product-metrics.js";

const context = { correlationId: "ignored", signal: new AbortController().signal };

test("records bounded playback-session outcomes without changing application behavior", async () => {
  const metrics: AsterProductMetricInput[] = [];
  const telemetry = {
    recordProductOperation(input: AsterProductMetricInput) {
      metrics.push(input);
      return { status: "recorded" as const };
    },
  };
  const readings = [10, 35];
  const unavailable: PlaybackSessions = {
    create: () => Promise.resolve({ status: "unavailable" }),
  };
  const observed = observePlaybackSessions(unavailable, telemetry, () => readings.shift() ?? 35);
  assert.deepEqual(await observed.create("ignored", context), { status: "unavailable" });
  assert.deepEqual(metrics, [
    { operation: "playback_session", outcome: "unavailable", durationMs: 25 },
  ]);

  const failed = observePlaybackSessions(
    { create: () => Promise.reject(new Error("dependency")) },
    {
      recordProductOperation() {
        throw new Error("telemetry");
      },
    },
    () => 1,
  );
  await assert.rejects(failed.create("ignored", context), /dependency/u);
});
