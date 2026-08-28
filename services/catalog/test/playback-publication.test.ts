import assert from "node:assert/strict";
import test from "node:test";
import { projectPlaybackPublication } from "../src/domain/playback-publication.js";
import { projectPublicTitle } from "../src/domain/public-title.js";
import { createCatalogPlaybackQueries } from "../src/application/playback-queries.js";
import { publicCandidate, publicFixture } from "./public-fixture.js";
import { catalogTestId as id, catalogTestTime as now } from "./rights-fixture.js";
import { metadataFixture } from "./workflow-fixture.js";

const policy = { commercial: true };

test("owner publication reads are batched, ordered, bounded and never cached across requests", async () => {
  const fixture = publicFixture();
  const queries = createCatalogPlaybackQueries({
    transactions: fixture.transactions,
    policy,
    now: () => fixture.state.time,
  });
  const signal = AbortSignal.timeout(1000);
  const first = await queries.byIds([id(3), id(99), id(1), id(3)], signal);
  assert.equal(first.status, "completed");
  assert.deepEqual(
    first.value.map((item) => item?.titleId ?? null),
    [id(3), null, id(1), id(3)],
  );
  assert.equal(fixture.state.calls, 1);
  fixture.state.candidates = fixture.state.candidates.map((candidate) => ({
    ...candidate,
    rights: { ...(candidate.rights as object), status: "DISPUTED" },
  }));
  assert.deepEqual(await queries.byIds([id(3)], signal), { status: "completed", value: [null] });
  assert.equal(fixture.state.calls, 2);
  const sparse = new Array<unknown>(2);
  const accessor = [id(1)];
  Object.defineProperty(accessor, "0", {
    get: () => {
      throw new Error("untrusted getter");
    },
  });
  for (const invalid of [["invalid"], sparse, accessor, Array.from({ length: 21 }, () => id(1))]) {
    assert.deepEqual(await queries.byIds(invalid, signal), { status: "invalid_input" });
  }
  assert.deepEqual(await queries.byIds([], signal), { status: "completed", value: [] });
  assert.deepEqual(await queries.byIds([id(1)], AbortSignal.abort()), { status: "cancelled" });
  assert.equal(fixture.state.calls, 2);
});

test("owner dependency errors, corrupt rows and late cancellation expose no publication", async () => {
  for (const candidates of [
    [publicCandidate(1), publicCandidate(1)],
    [publicCandidate(99)],
    [{ ...publicCandidate(), publication: null }],
  ]) {
    const queries = createCatalogPlaybackQueries({
      policy,
      now: () => now,
      transactions: {
        run: (work) =>
          work({ browse: () => Promise.resolve([]), findMany: () => Promise.resolve(candidates) }),
      },
    });
    assert.deepEqual(await queries.byIds([id(1)], AbortSignal.timeout(1000)), {
      status: "unavailable",
    });
  }
  for (const failure of ["unavailable", "cancelled"] as const) {
    const controller = new AbortController();
    const queries = createCatalogPlaybackQueries({
      policy,
      now: () => now,
      transactions: {
        run: () => {
          if (failure === "cancelled") {
            controller.abort();
          }
          return Promise.reject(new Error("private database information"));
        },
      },
    });
    assert.deepEqual(await queries.byIds([id(1)], controller.signal), { status: failure });
  }
});
test("current playback projection binds the active immutable publication without changing public metadata", () => {
  const candidate = publicCandidate();
  const publicTitle = projectPublicTitle(candidate, now, policy);
  const current = projectPlaybackPublication(candidate, now, policy);
  assert.deepEqual(current, {
    titleId: id(1),
    publicationId: id(200),
    titleVersion: 5,
    manifestUrl: "https://example.invalid/media/master.m3u8",
    checkedAt: now,
    validUntil: null,
  });
  assert.equal(Object.isFrozen(current), true);
  assert.doesNotMatch(
    JSON.stringify(current),
    /reviewedBy|evidenceLocations|sourceChecksum|assetSourceUrl/u,
  );
  assert.doesNotMatch(JSON.stringify(publicTitle), /manifestUrl|publicationId|checkedAt/u);
  assert.deepEqual(projectPublicTitle(candidate, now, policy), publicTitle);
});

test("unpublished, retired, disputed, expired or mismatched publications never yield a playback reference", () => {
  const candidate = publicCandidate();
  for (const patch of [
    { title: null },
    { publication: null },
    { metadata: null },
    { latestRightsRevision: 3 },
    { title: { ...(candidate.title as object), state: "MEDIA_READY" } },
    { title: { ...(candidate.title as object), state: "RETIRED" } },
    { title: { ...(candidate.title as object), publicationId: id(201) } },
    { rights: { ...(candidate.rights as object), status: "DISPUTED" } },
    { rights: { ...(candidate.rights as object), validUntil: now } },
    { publication: { ...(candidate.publication as object), titleId: id(99) } },
    { publication: { ...(candidate.publication as object), rightsRevision: 1 } },
    { publication: { ...(candidate.publication as object), sourceChecksum: "b".repeat(64) } },
    { publication: { ...(candidate.publication as object), validatedAt: now + 1 } },
    {
      publication: {
        ...(candidate.publication as object),
        manifestUrl: "https://user:secret@example.invalid/master.m3u8",
      },
    },
  ]) {
    assert.equal(projectPlaybackPublication({ ...candidate, ...patch }, now, policy), undefined);
  }
  assert.equal(projectPlaybackPublication(candidate, Number.NaN, policy), undefined);
  assert.equal(projectPlaybackPublication(candidate, now - 1, policy), undefined);
});

test("the snapshot expires at the earliest approved film or artwork expiry", () => {
  const candidate = publicCandidate();
  const url = "https://example.invalid/poster.jpg";
  for (const [filmExpiry, artExpiry, expected] of [
    [now + 600, now + 60, now + 60],
    [now + 30, now + 60, now + 30],
    [null, now + 60, now + 60],
    [now + 30, null, now + 30],
    [null, null, null],
  ]) {
    const value = {
      ...candidate,
      rights: { ...(candidate.rights as object), validUntil: filmExpiry },
      metadata: {
        ...metadataFixture(),
        artwork: {
          url,
          altText: "Synthetic poster",
          rights: { ...(candidate.rights as object), assetSourceUrl: url, validUntil: artExpiry },
        },
      },
    };
    const current = projectPlaybackPublication(value, now, policy);
    assert.ok(current);
    assert.equal(current.validUntil, expected);
    if (expected !== null && expected !== undefined) {
      assert.equal(projectPlaybackPublication(value, expected, policy), undefined);
    }
  }
});

test("HTTP delivery remains an explicit exact local policy, not an input privilege", () => {
  const candidate = publicCandidate();
  const prefix = "http://127.0.0.1:9001/aster-media-published/publications/" + "a".repeat(64) + "/";
  const local = {
    ...candidate,
    publication: { ...(candidate.publication as object), manifestUrl: prefix + "master.m3u8" },
  };
  assert.equal(projectPlaybackPublication(local, now, policy), undefined);
  assert.equal(
    projectPlaybackPublication(local, now, { ...policy, allowLocalMedia: true })?.manifestUrl,
    prefix + "master.m3u8",
  );
  for (const manifestUrl of [
    "http://127.0.0.1:9001/private/master.m3u8",
    prefix.replace("127.0.0.1", "localhost") + "master.m3u8",
    prefix + "master.m3u8?credential=hidden",
  ]) {
    assert.equal(
      projectPlaybackPublication(
        { ...candidate, publication: { ...(candidate.publication as object), manifestUrl } },
        now,
        { ...policy, allowLocalMedia: true },
      ),
      undefined,
    );
  }
});
