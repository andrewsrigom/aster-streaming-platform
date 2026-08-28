import assert from "node:assert/strict";
import test from "node:test";
import { catalogMediaUrl, catalogUrl } from "../src/domain/values.js";
import {
  approveRights,
  currentApprovedRights,
  normalizeRightsRecord,
} from "../src/domain/rights.js";
import { isPublicTitle, normalizePublication, transitionTitle } from "../src/domain/title.js";
import { projectPublicTitle } from "../src/domain/public-title.js";
import { publicCandidate } from "./public-fixture.js";
import { metadataFixture } from "./workflow-fixture.js";
import { catalogTestTime as now } from "./rights-fixture.js";

const prefix = "http://127.0.0.1:9001/aster-media-published/publications/" + "a".repeat(64) + "/";
const manifestUrl = prefix + "master.m3u8";
const poster = prefix + "poster-640.jpg";
const local = { commercial: true, allowLocalMedia: true };
const hosted = { commercial: true };

test("local media syntax is confined to exact immutable URLs and content kinds", () => {
  assert.equal(catalogMediaUrl(manifestUrl, "manifest"), true);
  assert.equal(catalogMediaUrl(poster, "artwork"), true);
  assert.equal(catalogMediaUrl(prefix + "thumbnail-03.jpg", "artwork"), true);
  assert.equal(catalogMediaUrl("https://media.example.invalid/v1/master.m3u8", "manifest"), true);
  assert.equal(catalogUrl(manifestUrl), false);
  for (const value of [
    manifestUrl.replace("127.0.0.1", "localhost"),
    manifestUrl.replace("127.0.0.1", "2130706433"),
    manifestUrl.replace(":9001", ":9002"),
    manifestUrl.replace("127.0.0.1", "127.0.0.1.evil.invalid"),
    manifestUrl.replace("127.0.0.1", "user:pass@127.0.0.1"),
    manifestUrl + "?x=1",
    manifestUrl + "#x",
    manifestUrl.replace("aster-media-published", "aster-media-originals"),
    prefix + "../master.m3u8",
    prefix + "%6daster.m3u8",
    prefix + "master.m3u8/",
    prefix + "v240/index.m3u8",
    poster,
    manifestUrl.replace("publications/", "publications//"),
    manifestUrl.replace("a".repeat(64), "a".repeat(63)),
  ]) {
    assert.equal(catalogMediaUrl(value, "manifest"), false, value);
  }
  assert.equal(catalogMediaUrl(manifestUrl, "artwork"), false);
  assert.equal(catalogMediaUrl(prefix + "thumbnail-04.jpg", "artwork"), false);
});

test("default policies cannot approve or publish local HTTP even when a record normalizes", () => {
  const candidate = publicCandidate();
  const rights = normalizeRightsRecord(candidate.rights);
  const publication = normalizePublication(candidate.publication, now);
  assert.ok(rights && publication);
  const artworkRights = { ...rights, assetSourceUrl: poster };
  assert.ok(normalizeRightsRecord(artworkRights));
  assert.equal(currentApprovedRights(artworkRights, now, hosted), undefined);
  assert.ok(currentApprovedRights(artworkRights, now, local));
  assert.equal(
    approveRights({ ...artworkRights, status: "DRAFT" }, now, hosted).status,
    "rejected",
  );
  assert.equal(approveRights({ ...artworkRights, status: "DRAFT" }, now, local).status, "approved");
  for (const field of ["canonicalSourceUrl", "licenseUrl"] as const) {
    assert.equal(normalizeRightsRecord({ ...artworkRights, [field]: poster }), undefined);
  }
  const media = { ...publication, manifestUrl };
  assert.ok(normalizePublication(media, now));
  assert.equal(isPublicTitle(candidate.title, rights, media, now, hosted), false);
  assert.equal(isPublicTitle(candidate.title, rights, media, now, local), true);
  const metadata = {
    ...metadataFixture(),
    artwork: { url: poster, altText: "Synthetic test frame", rights: artworkRights },
  };
  assert.equal(
    projectPublicTitle({ ...candidate, metadata, publication: media }, now, hosted),
    undefined,
  );
  assert.ok(projectPublicTitle({ ...candidate, metadata, publication: media }, now, local));
  const title = {
    id: rights.titleId,
    version: 3,
    rightsRevision: rights.revision,
    publicationId: null,
    state: "RIGHTS_REVIEWED",
  };
  assert.equal(
    transitionTitle(title, "MEDIA_READY", { rights, publication: media, now, policy: hosted })
      .status,
    "rejected",
  );
  assert.equal(
    transitionTitle(title, "MEDIA_READY", { rights, publication: media, now, policy: local })
      .status,
    "completed",
  );
});
