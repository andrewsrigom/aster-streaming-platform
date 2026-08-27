import assert from "node:assert/strict";
import test from "node:test";

import {
  approveRights,
  currentApprovedRights,
  deriveAttribution,
  normalizeRightsRecord,
  type RightsRecord,
} from "../src/domain/rights.js";
import {
  TITLE_STATES,
  isPublicTitle,
  normalizeTitleLifecycle,
  transitionTitle,
  type CatalogTitleLifecycle,
  type TitleState,
} from "../src/domain/title.js";

const now = 1_787_800_000;
const id = (n: number): string => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const policy = Object.freeze({ commercial: true });
const draftRights = (): RightsRecord => ({
  id: id(2),
  titleId: id(1),
  revision: 1,
  status: "DRAFT",
  workTitle: "Synthetic technical fixture",
  creator: "Synthetic creator",
  copyrightHolder: "Synthetic owner",
  canonicalSourceUrl: "https://example.invalid/fixture/",
  assetSourceUrl: "https://example.invalid/fixture/source.mp4",
  licenseName: "Synthetic test permission",
  licenseVersion: "1",
  licenseUrl: "https://example.invalid/fixture/license/",
  attributionText: "Synthetic technical fixture by Synthetic creator.",
  modificationNotice: "No real media processed.",
  thirdPartyMaterialNotes: "No third-party test material.",
  trademarkNotes: "No marks included.",
  redistributionAllowed: true,
  commercialUseAllowed: true,
  modificationAllowed: true,
  shareAlikeRequired: false,
  technicalRestrictions: "NONE",
  sourceChecksum: null,
  reviewedAt: now - 10,
  reviewedBy: id(3),
  validUntil: null,
  evidenceLocations: ["evidence/phase-03/synthetic-review.txt"],
});
const approved = (): RightsRecord => ({ ...draftRights(), status: "APPROVED" });
const media = () => ({
  id: id(4),
  titleId: id(1),
  rightsRevision: 1,
  sourceChecksum: "a".repeat(64),
  manifestUrl: "https://example.invalid/fixture/v1/master.m3u8",
  validationReportId: id(5),
  validatedAt: now - 5,
});
const title = (state: TitleState): CatalogTitleLifecycle => ({
  id: id(1),
  version: 1,
  state,
  rightsRevision: state === "DRAFT" ? null : 1,
  publicationId: ["MEDIA_READY", "PUBLISHED", "RETIRED"].includes(state) ? id(4) : null,
});
const facts = () => ({ rights: approved(), publication: media(), now, policy });

test("complete reviewed rights approve without acquiring media and derive exact attribution", () => {
  const input = draftRights();
  const result = approveRights(input, now, policy);
  assert.equal(result.status, "approved");
  assert.equal(input.status, "DRAFT");
  assert.equal(result.record.sourceChecksum, null);
  assert.equal(Object.isFrozen(result.record), true);
  assert.equal(Object.isFrozen(result.record.evidenceLocations), true);
  assert.notEqual(result.record.evidenceLocations, input.evidenceLocations);
  const attribution = deriveAttribution(result.record, now, policy);
  assert.ok(attribution);
  assert.equal(attribution.creator, input.creator);
  assert.equal(attribution.licenseVersion, input.licenseVersion);
  assert.equal(attribution.attributionText, input.attributionText);
  assert.equal(attribution.modificationNotice, input.modificationNotice);
  assert.equal(Object.isFrozen(attribution), true);
  assert.equal(deriveAttribution(input, now, policy), undefined);
});

test("every required reviewed field and explicit permission must be resolved", async (t) => {
  const nullable = [
    "workTitle",
    "creator",
    "copyrightHolder",
    "canonicalSourceUrl",
    "assetSourceUrl",
    "licenseName",
    "licenseVersion",
    "licenseUrl",
    "attributionText",
    "modificationNotice",
    "thirdPartyMaterialNotes",
    "trademarkNotes",
    "redistributionAllowed",
    "commercialUseAllowed",
    "modificationAllowed",
    "shareAlikeRequired",
    "technicalRestrictions",
    "reviewedAt",
    "reviewedBy",
  ];
  for (const field of nullable) {
    await t.test(field, () => {
      assert.deepEqual(approveRights({ ...draftRights(), [field]: null }, now, policy), {
        status: "rejected",
        code: "RIGHTS_NOT_APPROVED",
      });
    });
  }
  assert.equal(
    approveRights({ ...draftRights(), evidenceLocations: [] }, now, policy).status,
    "rejected",
  );
});

test("contradictory use, unreviewed state, expiry and invalid clocks fail closed", () => {
  for (const patch of [
    { redistributionAllowed: false },
    { modificationAllowed: false },
    { commercialUseAllowed: false },
    { shareAlikeRequired: true },
    { technicalRestrictions: "INCOMPATIBLE" },
    { reviewedAt: now + 1 },
    { validUntil: now },
    { validUntil: now - 1 },
    { status: "DISPUTED" },
    { status: "EXPIRED" },
    { status: "REJECTED" },
  ]) {
    assert.equal(approveRights({ ...draftRights(), ...patch }, now, policy).status, "rejected");
  }
  assert.equal(
    approveRights({ ...draftRights(), commercialUseAllowed: false }, now, { commercial: false })
      .status,
    "approved",
  );
  assert.equal(
    approveRights({ ...draftRights(), status: "NEEDS_CLARIFICATION" }, now, policy).status,
    "approved",
  );
  for (const clock of [NaN, Infinity, -1, now + 0.5]) {
    assert.equal(approveRights(draftRights(), clock, policy).status, "rejected");
  }
  assert.ok(currentApprovedRights({ ...approved(), validUntil: now + 1 }, now, policy));
  assert.equal(currentApprovedRights({ ...approved(), validUntil: now }, now, policy), undefined);
});

test("unknown fields, hostile accessors, invalid identifiers, URLs and oversized evidence are rejected", () => {
  for (const patch of [
    { extra: true },
    { titleId: "not-a-uuid" },
    { revision: 0 },
    { creator: "x".repeat(1025) },
    { workTitle: "control\u0000" },
    { assetSourceUrl: "https://user:secret@example.invalid/a" },
    { assetSourceUrl: "https://example.invalid/a?signature=secret" },
    { licenseUrl: "http://example.invalid/" },
    {
      evidenceLocations: Array.from(
        { length: 9 },
        (_, n) => "https://example.invalid/" + String(n),
      ),
    },
    { evidenceLocations: ["evidence/../secret.txt"] },
    { evidenceLocations: ["https://example.invalid/", "https://example.invalid/"] },
    { sourceChecksum: "x".repeat(64) },
    { reviewedBy: "raw-name" },
    { validUntil: now + 0.5 },
  ]) {
    assert.equal(normalizeRightsRecord({ ...draftRights(), ...patch }), undefined);
  }
  let invoked = false;
  const input = { ...draftRights() };
  Object.defineProperty(input, "creator", {
    get() {
      invoked = true;
      return "unsafe";
    },
  });
  assert.equal(normalizeRightsRecord(input), undefined);
  const locations = ["evidence/phase-03/synthetic-review.txt"];
  Object.defineProperty(locations, "0", {
    get() {
      invoked = true;
      return "unsafe";
    },
  });
  assert.equal(
    normalizeRightsRecord({ ...draftRights(), evidenceLocations: locations }),
    undefined,
  );
  assert.equal(invoked, false);
  const symbolicEvidence = ["evidence/phase-03/synthetic-review.txt"];
  Object.defineProperty(symbolicEvidence, Symbol("unexpected"), { value: "hidden" });
  assert.equal(
    normalizeRightsRecord({ ...draftRights(), evidenceLocations: symbolicEvidence }),
    undefined,
  );
});

test("the full 25-pair lifecycle table rejects every skipped or repeated transition", async (t) => {
  const transitions = new Set([
    "DRAFT:RIGHTS_REVIEWED",
    "RIGHTS_REVIEWED:MEDIA_READY",
    "MEDIA_READY:PUBLISHED",
    "DRAFT:RETIRED",
    "RIGHTS_REVIEWED:RETIRED",
    "MEDIA_READY:RETIRED",
    "PUBLISHED:RETIRED",
    "RETIRED:DRAFT",
  ]);
  for (const from of TITLE_STATES) {
    for (const to of TITLE_STATES) {
      await t.test(from + " -> " + to, () => {
        const input = title(from);
        const result = transitionTitle(input, to, facts());
        if (transitions.has(from + ":" + to)) {
          assert.equal(result.status, "completed");
          assert.equal(result.title.state, to);
          assert.equal(result.title.version, 2);
          assert.equal(Object.isFrozen(result.title), true);
        } else {
          assert.deepEqual(result, { status: "rejected", code: "INVALID_TRANSITION" });
        }
        assert.equal(input.state, from);
        assert.equal(input.version, 1);
      });
    }
  }
});

test("rights and media gates reject wrong owners, stale revisions, missing evidence and changed publication", () => {
  for (const rights of [
    null,
    draftRights(),
    { ...approved(), titleId: id(9) },
    { ...approved(), validUntil: now },
    { ...approved(), status: "DISPUTED" },
    { ...approved(), revision: 2 },
  ]) {
    assert.equal(
      transitionTitle(title("MEDIA_READY"), "PUBLISHED", { ...facts(), rights }).status,
      "rejected",
    );
    assert.equal(isPublicTitle(title("PUBLISHED"), rights, media(), now, policy), false);
  }
  for (const publication of [
    null,
    { ...media(), titleId: id(9) },
    { ...media(), rightsRevision: 2 },
    { ...media(), validationReportId: "" },
    { ...media(), validatedAt: now + 1 },
    { ...media(), validatedAt: now - 11 },
    { ...media(), sourceChecksum: "" },
  ]) {
    assert.deepEqual(
      transitionTitle(title("RIGHTS_REVIEWED"), "MEDIA_READY", { ...facts(), publication }),
      { status: "rejected", code: "MEDIA_NOT_READY" },
    );
  }
  assert.equal(
    transitionTitle(title("MEDIA_READY"), "PUBLISHED", {
      ...facts(),
      publication: { ...media(), id: id(9) },
    }).status,
    "rejected",
  );
  assert.equal(
    transitionTitle(title("RIGHTS_REVIEWED"), "MEDIA_READY", {
      ...facts(),
      rights: { ...approved(), sourceChecksum: "b".repeat(64) },
    }).status,
    "rejected",
  );
});

test("retirement survives disputed rights; reopening requires a newer review and new media linkage", () => {
  const retired = transitionTitle(title("PUBLISHED"), "RETIRED", {
    ...facts(),
    rights: null,
    publication: null,
  });
  assert.equal(retired.status, "completed");
  assert.equal(isPublicTitle(retired.title, approved(), media(), now, policy), false);
  const reopened = transitionTitle(retired.title, "DRAFT", facts());
  assert.equal(reopened.status, "completed");
  assert.equal(reopened.title.publicationId, null);
  assert.equal(transitionTitle(reopened.title, "RIGHTS_REVIEWED", facts()).status, "rejected");
  assert.equal(
    transitionTitle(reopened.title, "RIGHTS_REVIEWED", {
      ...facts(),
      rights: { ...approved(), revision: 2 },
    }).status,
    "completed",
  );
});

test("public visibility rechecks current rights; malformed lifecycle and overflowing versions cannot advance", () => {
  assert.equal(isPublicTitle(title("PUBLISHED"), approved(), media(), now, policy), true);
  assert.equal(normalizeTitleLifecycle({ ...title("RETIRED"), rightsRevision: null }), undefined);
  for (const state of TITLE_STATES.filter((state) => state !== "PUBLISHED")) {
    assert.equal(isPublicTitle(title(state), approved(), media(), now, policy), false);
  }
  assert.equal(
    isPublicTitle(title("PUBLISHED"), { ...approved(), validUntil: now }, media(), now, policy),
    false,
  );
  for (const patch of [
    { version: 0 },
    { id: "invalid" },
    { state: "UNKNOWN" },
    { publicationId: null },
    { rightsRevision: null },
  ]) {
    assert.equal(normalizeTitleLifecycle({ ...title("PUBLISHED"), ...patch }), undefined);
  }
  assert.deepEqual(
    transitionTitle({ ...title("PUBLISHED"), version: 2_147_483_647 }, "RETIRED", facts()),
    { status: "rejected", code: "INVALID_INPUT" },
  );
  assert.deepEqual(transitionTitle(title("PUBLISHED"), "RETIRED", { ...facts(), now: NaN }), {
    status: "rejected",
    code: "INVALID_INPUT",
  });
});
