# ADR-0032: Owned watchlist with current Catalog visibility

- Status: Accepted
- Date: 2026-08-28
- Owners: Engagement and Catalog
- Requirements: P08-R07; supports ENG-R05, P08-R09, P08-R12

## Decision

Engagement owns PostgreSQL watchlist membership. Identity freshly authorizes every mutation/replay/page as in [ADR-0030](0030-local-engagement-progress.md). Additions and ordinary pages additionally require current Catalog visibility. Removal and accepted same-key replay remain available without Catalog. Retirement hides membership rather than deleting it; re-publication may reveal it again.

Reuse [ADR-0031](0031-current-catalog-visibility.md)'s implemented private Catalog visibility contract, credential and admission; no second protocol or owner client. Never reuse Playback publication credentials, return media references, create Playback sessions for eligibility, read foreign SQL or recurse through Router. The ordered batch shares one checkedAt/expiresAt envelope and a conservative two-second window. This is bounded owner validation, not atomic cross-owner retirement; hosted service identity/TLS/clock policy remains Phase 14.

Bound batches to twenty IDs, one private request in flight, independent rate bucket and no queue. Each cancellation-aware private request has a two-second ceiling inside Engagement's 2.5-second application budget. Optional watchlist work cannot consume public Catalog admission. Browser credentials never reach Catalog; no cross-request visibility/authorization cache.

## Persistence and traversal

Lock the same immutable profile guard as progress/deletion. Keep one watchlist aggregate/version per profile and 256 active memberships; removal frees a slot. Each newly accepted set-membership command advances the profile watchlist version, including when membership already matches. An existing addition preserves insertion order. Same-key replay returns its original result after later opposite commands without another revision/event. Keys are profile-scoped within watchlist; changed title/action conflicts. Receipts: one hour, 1024/profile, prune at most 64 expired entries. Share the existing 1024/profile pending outbox budget.

Commit aggregate, membership, receipt and watchlist-changed v1 event together with deferred current-authority checks. Unknown COMMIT is indeterminate and only identical key/payload retry is safe. Retain aggregate identity/version across removals, avoiding unbounded title tombstones and event sequence resets. P08-R12 cleanup will use the existing deletion fence.

Order pages by insertion time/stable entry ID descending with canonical profile-bound cursor, first 1–20. Read at most 256 owned candidates once, then serial batches of twenty current Catalog checks before choosing first-plus-one visible entries. Hidden rows do not count toward page size/hasNextPage. Reject incomplete validation, stale snapshots or expired ownership. Live traversal is not a snapshot: remove/re-add can move a title ahead of the cursor. Metadata stays a nullable Catalog-owned Title reference because visibility can change later.

## Verification and rollback

Require same-key/opposite-command replay, cross-title/action conflicts, real concurrency, reclaimed slots/capacity, atomic state/receipt/event, role isolation, deletion fences, expiry/cancellation and unknown commit. Verify filtered pagination/retirement against actual owners, purpose isolation and public availability. Migration 0002 is additive; stop new runtime and retain data for rollback. Down migration is empty-state-only. No retained deployment is implied.

Checked 2026-08-28: [Apollo directive semantics](https://www.apollographql.com/docs/graphos/schema-design/federated-schemas/reference/directives#inaccessible), PostgreSQL [row locks](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS) and [deferred triggers](https://www.postgresql.org/docs/18/sql-createtrigger.html). Bounds, revisions and conservative visibility window are Aster decisions. No dependency or platform added.
