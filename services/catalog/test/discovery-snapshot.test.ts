import assert from "node:assert/strict";
import test from "node:test";
import {
  projectDiscoverySnapshot,
  type DiscoveryCandidate,
} from "../src/domain/discovery-snapshot.js";
import { publicCandidate } from "./public-fixture.js";
import { catalogTestId as id, catalogTestTime as now } from "./rights-fixture.js";
import { metadataFixture } from "./workflow-fixture.js";

const source = (): DiscoveryCandidate => ({
  titleId: id(1),
  sourceVersion: 5,
  candidate: publicCandidate(),
  publishedAt: now,
});
const policy = { commercial: true };
test("Discovery snapshot exposes only bounded public search facts and genuine publication time", () => {
  const snapshot = projectDiscoverySnapshot(source(), now, policy);
  assert.deepEqual(snapshot, {
    titleId: id(1),
    sourceVersion: 5,
    observedAt: now,
    visibleUntil: now + 300,
    document: {
      defaultLocale: "en",
      localizations: metadataFixture().localizations,
      genres: ["animation"],
      editorialLabels: [],
      releaseYear: null,
      publishedAt: now,
    },
  });
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.document.localizations));
  assert.doesNotMatch(
    JSON.stringify(snapshot),
    /manifest|publicationId|rights|reviewedBy|creator|profile|sourceChecksum/u,
  );
});
test("hidden source keeps its actual version without exposing metadata or inventing publication time", () => {
  const hidden = projectDiscoverySnapshot(
    { ...source(), sourceVersion: 6, candidate: null, publishedAt: null },
    now,
    policy,
  );
  assert.deepEqual(hidden, {
    titleId: id(1),
    sourceVersion: 6,
    observedAt: now,
    visibleUntil: null,
    document: null,
  });
  const candidate = publicCandidate();
  for (const change of [
    { title: { ...(candidate.title as object), state: "RETIRED" } },
    { rights: { ...(candidate.rights as object), status: "DISPUTED" } },
    { rights: { ...(candidate.rights as object), validUntil: now } },
  ]) {
    assert.equal(
      projectDiscoverySnapshot({ ...source(), candidate: { ...candidate, ...change } }, now, policy)
        .document,
      null,
    );
  }
});
test("known title and artwork rights expiry shorten the visibility lease", () => {
  const candidate = publicCandidate();
  const shorter = {
    ...candidate,
    rights: { ...(candidate.rights as object), validUntil: now + 40 },
  };
  assert.equal(
    projectDiscoverySnapshot({ ...source(), candidate: shorter }, now, policy).visibleUntil,
    now + 40,
  );
  const artwork = {
    url: "https://example.invalid/poster.jpg",
    altText: "Fictional poster",
    rights: {
      ...(candidate.rights as object),
      assetSourceUrl: "https://example.invalid/poster.jpg",
      validUntil: now + 10,
    },
  };
  assert.equal(
    projectDiscoverySnapshot(
      { ...source(), candidate: { ...shorter, metadata: { ...metadataFixture(), artwork } } },
      now,
      policy,
    ).visibleUntil,
    now + 10,
  );
});
test("malformed source, mismatched authority and absent publication time are unavailable, never hidden success", () => {
  for (const change of [
    { titleId: id(2) },
    { sourceVersion: 4 },
    { sourceVersion: 0 },
    { publishedAt: null },
    { publishedAt: now + 1 },
    { candidate: { ...publicCandidate(), metadata: {} } },
  ]) {
    assert.throws(() => projectDiscoverySnapshot({ ...source(), ...change }, now, policy));
  }
  for (const time of [NaN, -1, 253402300799]) {
    assert.throws(() => projectDiscoverySnapshot(source(), time, policy));
  }
  const hostile = Object.defineProperty(source(), "sourceVersion", {
    get() {
      throw new Error("Do not execute source getters");
    },
  });
  assert.throws(() => projectDiscoverySnapshot(hostile, now, policy), /Invalid Discovery source/u);
});
