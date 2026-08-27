# Catalog

Status: implemented domain rules and PostgreSQL rights-history storage with focused and real integration tests. No Catalog server, operator authentication or public API yet.

## Rights

The owner normalizes complete structured records and distinguishes unresolved fields from an explicit review. Approval requires source/asset/license URLs, creator/holder, attribution, modification notice, third-party/trademark notes, reviewer/time and 1–8 evidence references. Permissions must explicitly allow redistribution and modification, with no incompatible technical restriction. Commercial permission is checked against the declared use.

The first policy rejects share-alike records until a derivative-licensing policy is implemented; this is not a claim that those licenses are inherently incompatible. Canonical HTTPS references cannot contain credentials, query strings or fragments. Input strings, arrays, identifiers, versions and times are bounded.

A source checksum may be null before acquisition: permission must precede the download. The later media-ready gate requires a checksum and a title/review-bound validation report reference. Pure functions validate reference structure and consistency, not media bytes or actual permissions. The future owning application must establish operator trust, review provenance and technical attestation before calling these rules. A public input boolean is not proof.

## Lifecycle

DRAFT → RIGHTS_REVIEWED → MEDIA_READY → PUBLISHED → RETIRED.

Any non-retired title can be retired, including after dispute or expiry. Reopening returns to DRAFT and clears the publication pointer; the last rights revision remains a floor, so a newer approved review is required. Publication rechecks rights, expiry, title/review linkage, validation timing, checksum when already known, and the same publication selected at MEDIA_READY. Public eligibility fails immediately when rights expire or become disputed.

Transitions return new frozen domain values with bounded increasing versions. Persistence must serialize concurrent publish/dispute and commit lifecycle/audit/outbox together; none of that is claimed by domain tests.

## Durable rights history

The Catalog-owned transaction adapter creates draft titles and appends immutable rights snapshots with actor/time/correlation provenance. Compare-and-set advances the title version and next review revision atomically. Runtime credentials cannot overwrite/delete rights or audit facts, alter lifecycle columns or read Identity tables. Deferred foreign keys require matching title ownership and provenance at commit.

Rights history uses descending revision keysets, at most 50 entries. Source JSON is capped at 30000 UTF-8 bytes, persisted JSONB at 32768 bytes. Rights/provenance are retained as product evidence, not silently pruned. No broker or public lifecycle event is emitted by this storage slice.

Storage validates structure, not operator authority or approval. Future application commands must authorize the actor, invoke approval rules and enforce publication/retirement/outbox together. See [migration behavior and recovery](migrations/README.md).

## Verification

Run from the repository root:

~~~sh
pnpm exec turbo run build --filter=@aster/catalog
pnpm --filter @aster/catalog test
pnpm catalog:integration
~~~

Synthetic fixtures cover all 25 state pairs, required fields, incompatible permissions, expiry, stale/wrong-title media, immutable outputs, accessors, hidden evidence fields and reopening. Real PostgreSQL additionally proves concurrent revision conflicts, stable pages, Unicode preservation, atomic audit/rollback, cancellation, lock deadlines, privileges and migration round-trip. The integration runner requires the repository-pinned PostgreSQL image already available and removes only its uniquely labelled disposable fixture. No actual film is downloaded or published. See [evidence](../../evidence/phase-03/README.md).
