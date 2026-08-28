# Engagement progress and watchlist

P08-R01–R07 and the atomic write portion of P08-R09 are implemented. The [write proof](../../evidence/phase-08/review-federated-runtime.txt) and [corrected read proof](../../evidence/phase-08/history-visibility.md) exercise real owners, PostgreSQL and Router. Watchlist focused tests and real SQL pass; its federated acceptance and protected release are tracked in the [watchlist checkpoint](../../evidence/phase-08/watchlist.md). Player reports/resume, general Title/Profile engagement extensions and event relay/consumers remain planned in Phase 08.

## Public contract

Use POST JSON through Router at `http://127.0.0.1:4000/graphql`, its Origin/CSRF policy and an existing local session cookie. Identity still authorizes the requested profile; a profile ID or anonymous Playback session is not account authority.

```graphql
mutation RecordProgress($input: RecordProgressInput!) {
  recordProgress(input: $input) {
    code
    correlationId
    progress { id profileId titleId sequence version positionMs durationMs status occurredAt updatedAt }
  }
}
```

Input requires exactly profileId, titleId, playbackSessionId, idempotencyKey (UUID v4), sequence (positive Int), positionMs (integer, clamped to duration), durationMs (positive integer, at most twelve hours) and occurredAt (integer UTC epoch seconds, represented by GraphQL Float). Sequence belongs to the profile/title across playback sessions. New reports allow thirty seconds future skew and 120 seconds delivery age.

Only COMPLETED acknowledges durable progress, a receipt and an outbox event in one transaction. Keys are unique per profile, across titles. Exact same-key replay returns the original result for one hour, even after newer progress or the original Playback session expires; current Identity authorization remains required. Changed payload, including title, gives CONFLICT; older/equal sequence under a new key gives STALE. A newer intentional backward seek is permitted. Opening is strictly greater than min(30 seconds, 5% duration); completion is at least max(95% duration, duration minus thirty seconds). Positions are reports, not proof of viewing.

INVALID_INPUT, UNAUTHENTICATED, NOT_FOUND, NOT_PLAYABLE, BACKPRESSURE, UNAVAILABLE, CANCELLED and INDETERMINATE are non-success outcomes; transport errors also occur. An uncertain mutation response may only be retried with the same idempotency key and unchanged payload. Never show a successful save before acknowledgement or stop media because optional saving failed. No browser retry queue is implemented yet.

## History and continue-watching

`progressHistory` returns the latest accepted report per title, including NOT_STARTED and COMPLETED. `continueWatching` returns IN_PROGRESS only and excludes titles that current Catalog cannot expose. Both freshly authorize the requested profile through Identity and read authoritative PostgreSQL; no Redis or cross-request authorization cache is involved.

```graphql
query ProgressHistory($profileId: ID!, $first: Int! = 20, $after: String) {
  progressHistory(profileId: $profileId, first: $first, after: $after) {
    code
    correlationId
    connection {
      edges { cursor node { id titleId sequence version positionMs durationMs status updatedAt title { id localized { title } } } }
      pageInfo { endCursor hasNextPage }
    }
  }
}
```

For the resumable list use operation `ContinueWatching` and field `continueWatching`, with the same arguments and selection. Page size is 1–20, default 20. One bounded SELECT fetches history's first+1 rows or up to 256 continue-watching candidates, ordered by updatedAt then progress ID descending. Continue-watching checks current Catalog visibility in serial batches of twenty (at most thirteen), stopping after first+1 visible rows. Hidden rows never affect page size, hasNextPage or cursors. Cursors are versioned and bound to the profile and list kind; treat them as opaque, never as credentials. They expire neither authorization nor history. A live update may move a title ahead of an existing cursor; refresh to restart traversal. This is not a snapshot or append-only viewing-session log.

Catalog resolves title metadata through its existing request-scoped entity batch. Missing/retired metadata is nullable; history retains the owned progress row without copying editorial data. Continue-watching's private visibility snapshot expires within two seconds, including conservative rights-expiry filtering, and is rechecked before disclosure; concurrent owner changes are bounded, not distributed-transactional. COMPLETED returns a connection, including an empty successful page. Authorization/SQL/Catalog failures return a non-success code and null connection, never a fabricated empty success. History does not require that private Catalog call. Missing/deleted/foreign profiles and revoked sessions disclose no history. SQL reads create no receipt, event or projection write. Retention follows the existing 256-title-per-profile bound until profile deletion; cleanup delivery remains P08-R12.

## Watchlist

`setWatchlist(input: SetWatchlistInput!)` accepts exactly profileId, titleId and idempotencyKey UUIDs and present Boolean. Only COMPLETED acknowledges committed membership, the profile's monotonically versioned watchlist head, receipt and event. Same key/payload returns its original result for one hour, even after a later removal; changed title/action is CONFLICT. Fresh Identity ownership is required for commands, replay and pages. Additions require current Catalog visibility; NOT_VISIBLE does not add. Removal and replay do not require Catalog. An uncertain response is retried only with the same key and payload.

`watchlist(profileId, first: 1–20, after)` uses the same payload/connection convention as history, with node fields id, profileId, titleId, addedAt and nullable Catalog title metadata. It filters unavailable titles before page size and hasNextPage, using ADR-0031's visibility window. The w1 cursor is profile-bound and opaque. Order is addedAt and entry ID descending; repeated add preserves order, removal/re-add creates a new entry. This is a live traversal, not a snapshot. Retirement hides membership without deleting it, so re-publication can reveal it again.

Membership has 256 reclaimable slots/profile, receipts 1024/profile for one hour, pruning at most 64 expired receipts/command. Progress and watchlist share the deletion fence and 1024 pending-outbox budget; capacity returns BACKPRESSURE, never an unbounded queue. Reads fetch at most 256 entries as one bounded JSON aggregate, then check at most thirteen serial Catalog batches of twenty within the existing request deadline. Failed authorization/storage/visibility is a non-success payload with null connection, not an empty successful page. [ADR-0032](../../docs/adr/0032-owned-watchlist-visibility.md).

Migration 0002 adds watchlist storage and deferred authority/membership/receipt/event invariants. Readiness requires both 0001 and 0002 with restricted grants. Rollback preserves retained data and restores compatible images; [0002 down](migrations/0002-watchlist.down.sql) refuses nonempty watchlist state. Do not drop data to satisfy readiness. Browser controls and deletion/event delivery remain separate Phase 08 items.

## Runtime and recovery

The normal full runtime profile builds Engagement and runs its finite initializer. To add personalization owners to an already running API checkpoint:

```sh
docker compose --project-name aster --file infra/compose/compose.yml --profile runtime up --build --wait --wait-timeout 120 identity engagement
```

Engagement listens privately on 3400, uses restricted aster_engagement_local PostgreSQL credentials, and mounts only its own Router key plus three distinct private owner-read keys. Each owner accepts one exact private operation; @inaccessible removes those fields from the public API but is not the authorization mechanism. Cookies travel to Identity only; Playback and Catalog return no media URL in their private reads. [ADR-0030](../../docs/adr/0030-local-engagement-progress.md) specifies progress trust, retention and capacity; [ADR-0031](../../docs/adr/0031-current-catalog-visibility.md) specifies current Catalog visibility.

Budgets: four active GraphQL operations, one root operation, 16 KiB body, 4 KiB source, 40 fields, depth six, four aliases and cost 384. Read cost multiplies edge selections by the requested page bound, plus base cost 32 for history or 128 for continue-watching's bounded visibility scan; mutation cost includes both private owner checks and cannot fan out. A 32-credit burst refills at four/second. Identity/Playback clients have four slots; Catalog has one. All have 4 KiB responses, a two-second ceiling and no retries/redirects. Application budget is 2.5 seconds, GraphQL/Router subgraph 2.7 seconds and public Router three seconds. SQL has four connections and a one-second operation ceiling. Every path propagates cancellation.

Readiness checks only Engagement's restricted store/schema/commit constraint. Owner failures reject the individual save. Router/Playback startup never depends on Identity or Engagement. Inspect `docker compose --project-name aster --file infra/compose/compose.yml ps --all` and scoped logs for engagement, engagement-init, identity, playback and router. Logs contain finite outcomes and trace/correlation, not cookies, private keys, account data or media URLs. No dashboard or SLO claim is made.

Rollback stops Engagement and restores compatible prior owner/Router images and artifacts; retain all database/media state. If restoring older Identity/Playback/Catalog images, also disable their new Engagement-read flags. Rotate only inspected disposable trust volumes after stopping affected consumers. The [down migration](migrations/0001-progress.down.sql) refuses any retained progress, receipt, outbox or profile fence. It is not a normal recovery command.

## Verification

```sh
pnpm engagement:integration
pnpm engagement:runtime
```

The first command runs progress and watchlist real-SQL verifiers in separate disposable fixtures: atomicity, replay/conflict/concurrency, keyset pages/query plans, 256-entry capacity/reclaimed slots, privileges, deletion fences and empty-only rollback. The internal --watchlist selector accepts no target or connection override. The second builds a UUID-named disposable Docker project, tests current owner authorization, durable writes and federated reads/metadata/completion/retirement, reruns the initializer, stops optional owners and verifies anonymous Playback. It validates exact ownership before cleaning its own containers, trust volumes, networks and tmpfs database. No retained project, media download or CPU benchmark is involved. [Evidence and limitations](../../evidence/phase-08/README.md).
