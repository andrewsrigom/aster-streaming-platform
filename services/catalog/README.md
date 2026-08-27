# Catalog Domain

Status: implemented pure domain rules with focused tests; no Catalog server, database or public API yet.

## Rights

The owner normalizes complete structured records and distinguishes unresolved fields from an explicit review. Approval requires source/asset/license URLs, creator/holder, attribution, modification notice, third-party/trademark notes, reviewer/time and 1–8 evidence references. Permissions must explicitly allow redistribution and modification, with no incompatible technical restriction. Commercial permission is checked against the declared use.

The first policy rejects share-alike records until a derivative-licensing policy is implemented; this is not a claim that those licenses are inherently incompatible. Canonical HTTPS references cannot contain credentials, query strings or fragments. Input strings, arrays, identifiers, versions and times are bounded.

A source checksum may be null before acquisition: permission must precede the download. The later media-ready gate requires a checksum and a title/review-bound validation report reference. Pure functions validate reference structure and consistency, not media bytes or actual permissions. The future owning application must establish operator trust, review provenance and technical attestation before calling these rules. A public input boolean is not proof.

## Lifecycle

DRAFT → RIGHTS_REVIEWED → MEDIA_READY → PUBLISHED → RETIRED.

Any non-retired title can be retired, including after dispute or expiry. Reopening returns to DRAFT and clears the publication pointer; the last rights revision remains a floor, so a newer approved review is required. Publication rechecks rights, expiry, title/review linkage, validation timing, checksum when already known, and the same publication selected at MEDIA_READY. Public eligibility fails immediately when rights expire or become disputed.

Transitions return new frozen domain values with bounded increasing versions. Persistence must serialize concurrent publish/dispute and commit lifecycle/audit/outbox together; none of that is claimed by domain tests.

## Verification

Run from the repository root:

~~~sh
pnpm --filter @aster/catalog build
pnpm --filter @aster/catalog test
~~~

Synthetic fixtures cover all 25 state pairs, required fields, incompatible permissions, expiry, stale/wrong-title media, immutable outputs, accessors, hidden evidence fields and reopening. No actual film is downloaded or published. See [evidence](../../evidence/phase-03/README.md).
