import assert from "node:assert/strict";
import test from "node:test";
import { titleOffersPlayback } from "../features/catalog/metadata.ts";

test("non-delivery Catalog label suppresses playback without hiding real or playable-fixture titles", () => {
  for (const editorialLabels of [
    ["synthetic-fixture", "ui-seed-v1"],
    ["ui-seed-v1", "playable-seed-v1"],
  ]) {
    assert.equal(titleOffersPlayback({ editorialLabels }), false);
  }
  for (const editorialLabels of [[], ["featured"], ["synthetic-fixture", "playable-seed-v1"]]) {
    assert.equal(titleOffersPlayback({ editorialLabels }), true);
  }
});
