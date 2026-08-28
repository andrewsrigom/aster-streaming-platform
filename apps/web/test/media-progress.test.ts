import assert from "node:assert/strict";
import test from "node:test";
import { attachMediaProgress } from "../features/engagement/media-progress.ts";
import type { SavedProgress } from "../features/engagement/operations.ts";
import type { ProgressSample } from "../features/engagement/progress-reporter.ts";

class Media extends EventTarget {
  currentTime = 0;
  duration = 60;
  readyState = 1;
  paused = true;
  seeking = false;
}
const saved = (status: SavedProgress["status"] = "IN_PROGRESS"): SavedProgress => ({
  id: "00000000-0000-4000-8000-000000000001",
  profileId: "00000000-0000-4000-8000-000000000002",
  titleId: "00000000-0000-4000-8000-000000000003",
  sequence: 7,
  version: 7,
  positionMs: 15000,
  durationMs: 60000,
  status,
  occurredAt: 1000,
  updatedAt: 1000,
});
function fixture(progress: SavedProgress | null = null, media = new Media()) {
  const samples: ProgressSample[] = [];
  const offers: (number | null)[] = [];
  const finals: boolean[] = [];
  let flushes = 0;
  const binding = attachMediaProgress({
    media,
    saved: progress,
    reporter: {
      observe(value) {
        samples.push(value);
      },
      flush() {
        flushes++;
      },
      dispose(value = false) {
        finals.push(value);
      },
    },
    onResumeAvailable(value) {
      offers.push(value);
    },
  });
  return { media, binding, samples, offers, finals, flushes: () => flushes };
}

test("resume waits for metadata and uses server status without recalculating thresholds", () => {
  const media = new Media();
  media.readyState = 0;
  media.duration = NaN;
  const f = fixture(saved(), media);
  assert.equal(media.currentTime, 0);
  media.readyState = 1;
  media.duration = 60;
  media.dispatchEvent(new Event("loadedmetadata"));
  assert.equal(media.currentTime, 15);
  assert.deepEqual(f.offers, [null]);
  assert.equal(f.samples.length, 0);
  media.currentTime = 25;
  media.dispatchEvent(new Event("loadedmetadata"));
  assert.equal(media.currentTime, 25);
  f.binding.dispose();
  for (const value of [null, saved("COMPLETED"), saved("NOT_STARTED")]) {
    const inactive = fixture(value);
    assert.equal(inactive.media.currentTime, 0);
    assert.deepEqual(inactive.offers, []);
    inactive.binding.dispose();
  }
});

test("resume clamps to actual metadata duration rather than the historical observation", () => {
  const media = new Media();
  media.duration = 10;
  const f = fixture(saved(), media);
  assert.equal(media.currentTime, 10);
  f.binding.dispose();
});

test("late progress offers explicit resume without overriding playback already underway", () => {
  const media = new Media();
  media.currentTime = 4;
  media.paused = false;
  const f = fixture(saved(), media);
  assert.equal(media.currentTime, 4);
  assert.deepEqual(f.offers, [15]);
  assert.equal(f.binding.resume(), true);
  assert.equal(media.currentTime, 15);
  assert.deepEqual(f.offers, [15, null]);
  assert.equal(f.binding.resume(), false);
  f.binding.dispose();
});

test("periodic sampling follows playing time; pause, seek and end flush the final observation", () => {
  const f = fixture();
  f.media.currentTime = 2.3456;
  f.media.dispatchEvent(new Event("timeupdate"));
  assert.equal(f.samples.length, 0);
  f.media.paused = false;
  f.media.dispatchEvent(new Event("timeupdate"));
  assert.deepEqual(f.samples, [{ positionMs: 2346, durationMs: 60000 }]);
  assert.equal(f.flushes(), 0);
  for (const event of ["pause", "seeked", "ended"]) {
    f.media.dispatchEvent(new Event(event));
  }
  assert.equal(f.flushes(), 3);
  f.binding.dispose();
});

test("invalid metadata and intermediate seek positions cannot become reports", () => {
  const f = fixture();
  f.media.paused = false;
  for (const duration of [NaN, Infinity, 0, 43201]) {
    f.media.duration = duration;
    f.media.dispatchEvent(new Event("timeupdate"));
  }
  f.media.duration = 60;
  f.media.seeking = true;
  f.media.dispatchEvent(new Event("timeupdate"));
  f.media.seeking = false;
  f.media.currentTime = NaN;
  f.media.dispatchEvent(new Event("timeupdate"));
  assert.equal(f.samples.length, 0);
  f.binding.dispose();
});

test("navigation captures the last valid sample once before media teardown; profile invalidation does not flush", () => {
  const f = fixture();
  f.media.currentTime = 25;
  f.binding.dispose(true);
  f.media.currentTime = 0;
  f.media.dispatchEvent(new Event("pause"));
  f.binding.flush();
  f.binding.dispose(true);
  assert.deepEqual(f.samples, [{ positionMs: 25000, durationMs: 60000 }]);
  assert.deepEqual(f.finals, [true]);
  assert.equal(f.flushes(), 0);
  const changed = fixture();
  changed.media.currentTime = 25;
  changed.binding.dispose();
  assert.deepEqual(changed.samples, []);
  assert.deepEqual(changed.finals, [false]);
});
