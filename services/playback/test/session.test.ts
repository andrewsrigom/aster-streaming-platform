import assert from "node:assert/strict";
import test from "node:test";
import { createAnonymousPlaybackSession } from "../src/domain/session.js";

const id = (value: number) => "00000000-0000-4000-8000-" + String(value).padStart(12, "0");
const now = 1_787_900_000;
const publication = {
  titleId: id(1),
  publicationId: id(2),
  titleVersion: 5,
  manifestUrl: "https://example.invalid/media/master.m3u8",
  checkedAt: now,
  validUntil: null,
};
const input = {
  id: id(3),
  titleId: id(1),
  correlationId: id(4),
  publication,
  now,
  allowLocalMedia: false,
};

test("anonymous sessions bind owner publication and audit identity with a fifteen-minute expiry", () => {
  const session = createAnonymousPlaybackSession(input);
  assert.deepEqual(session, {
    id: id(3),
    titleId: id(1),
    publicationId: id(2),
    catalogVersion: 5,
    catalogCheckedAt: now,
    manifestUrl: publication.manifestUrl,
    profileId: null,
    createdAt: now,
    expiresAt: now + 900,
    correlationId: id(4),
  });
  assert.equal(Object.isFrozen(session), true);
  assert.equal(
    createAnonymousPlaybackSession({
      ...input,
      publication: { ...publication, validUntil: now + 60 },
    })?.expiresAt,
    now + 60,
  );
});

test("stale, future, expired, mismatched or malformed owner snapshots cannot create sessions", () => {
  for (const patch of [
    { titleId: id(9) },
    { publicationId: "invalid" },
    { titleVersion: 0 },
    { titleVersion: 1.5 },
    { checkedAt: now - 3 },
    { checkedAt: now + 1 },
    { checkedAt: Number.NaN },
    { validUntil: now },
    { validUntil: -1 },
    { validUntil: "later" },
    { extra: true },
  ]) {
    assert.equal(
      createAnonymousPlaybackSession({ ...input, publication: { ...publication, ...patch } }),
      undefined,
    );
  }
  assert.ok(
    createAnonymousPlaybackSession({
      ...input,
      publication: { ...publication, checkedAt: now - 2 },
    }),
  );
  for (const patch of [
    { id: "invalid" },
    { correlationId: "invalid" },
    { titleId: "invalid" },
    { now: Number.NaN },
  ]) {
    assert.equal(createAnonymousPlaybackSession({ ...input, ...patch }), undefined);
  }
  const accessor = { ...publication };
  Object.defineProperty(accessor, "manifestUrl", {
    get: () => {
      throw new Error("untrusted getter");
    },
  });
  for (const value of [null, [], accessor, Object.create(publication) as unknown]) {
    assert.equal(createAnonymousPlaybackSession({ ...input, publication: value }), undefined);
  }
});

test("media delivery rejects credentials and arbitrary HTTP without adding a token to open media", () => {
  const local =
    "http://127.0.0.1:9001/aster-media-published/publications/" + "a".repeat(64) + "/master.m3u8";
  for (const manifestUrl of [
    local,
    "http://example.invalid/master.m3u8",
    "file:///media.m3u8",
    "https://user:secret@example.invalid/master.m3u8",
    publication.manifestUrl + "?token=hidden",
    publication.manifestUrl + "#fragment",
  ]) {
    assert.equal(
      createAnonymousPlaybackSession({ ...input, publication: { ...publication, manifestUrl } }),
      undefined,
    );
  }
  assert.equal(
    createAnonymousPlaybackSession({
      ...input,
      allowLocalMedia: true,
      publication: { ...publication, manifestUrl: local },
    })?.manifestUrl,
    local,
  );
  assert.equal(
    createAnonymousPlaybackSession({
      ...input,
      allowLocalMedia: true,
      publication: { ...publication, manifestUrl: local.replace("127.0.0.1", "localhost") },
    }),
    undefined,
  );
});
