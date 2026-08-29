# Engagement progress and watchlist

P08-R01–R08 and the atomic write portion of P08-R09 are implemented. The [write proof](../../evidence/phase-08/review-federated-runtime.txt) and [corrected read proof](../../evidence/phase-08/history-visibility.md) exercise real owners, PostgreSQL and Router. Watchlist and [request-scoped fields](../../evidence/phase-08/engagement-fields.md) have protected release. The [event candidate](EVENT_DELIVERY.md) adds bounded relays, authenticated deletion and quarantine/replay with real SQL/Kafka recovery observations and a passing [70-task candidate gate](../../evidence/phase-08/events-candidate.txt); protected supervisor execution and release remain pending. Player reports/resume follow.

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

INVALID_INPUT, UNAUTHENTICATED, NOT_FOUND, NOT_PLAYABLE, BACKPRESSURE,
LIMIT_EXCEEDED, UNAVAILABLE, CANCELLED and INDETERMINATE are non-success
outcomes; transport errors also occur. A limited mutation supplies a bounded
`Retry-After` header. An uncertain mutation response may only be retried with the
same idempotency key and unchanged payload. Never show a successful save before
acknowledgement or stop media because optional saving failed. No browser retry
queue is implemented yet.

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

`homeContinueWatching(profileId, first, after)` is a nullable home-composition
alias over the same application query, authorization, cursor and visibility
rules. It creates no home table or Discovery dependency. Its nullable root lets a
federated home response preserve public Discovery rails when Engagement is absent;
an internal owner failure still returns the existing explicit payload code.

## Watchlist

`setWatchlist(input: SetWatchlistInput!)` accepts exactly profileId, titleId and idempotencyKey UUIDs and present Boolean. Only COMPLETED acknowledges committed membership, the profile's monotonically versioned watchlist head, receipt and event. Same key/payload returns its original result for one hour, even after a later removal; changed title/action is CONFLICT. Fresh Identity ownership is required for commands, replay and pages. Additions require current Catalog visibility; NOT_VISIBLE does not add. Removal and replay do not require Catalog. An uncertain response is retried only with the same key and payload.

`watchlist(profileId, first: 1–20, after)` uses the same payload/connection convention as history, with node fields id, profileId, titleId, addedAt and nullable Catalog title metadata. It filters unavailable titles before page size and hasNextPage, using ADR-0031's visibility window. The w1 cursor is profile-bound and opaque. Order is addedAt and entry ID descending; repeated add preserves order, removal/re-add creates a new entry. This is a live traversal, not a snapshot. Retirement hides membership without deleting it, so re-publication can reveal it again.

Membership has 256 reclaimable slots/profile, receipts 1024/profile for one hour, pruning at most 64 expired receipts/command. Progress and watchlist share the deletion fence and 1024 pending-outbox budget; capacity returns BACKPRESSURE, never an unbounded queue. Reads fetch at most 256 entries as one bounded JSON aggregate, then check at most thirteen serial Catalog batches of twenty within the existing request deadline. Failed authorization/storage/visibility is a non-success payload with null connection, not an empty successful page. [ADR-0032](../../docs/adr/0032-owned-watchlist-visibility.md).

Migration 0002 adds watchlist storage and deferred authority/membership/receipt/event invariants. The current event candidate additionally requires migrations 0003/0004 before readiness; they add the owner relay and deletion/quarantine functions under separate restricted logins. [Migration and recovery](EVENT_DELIVERY.md) requires draining older binaries, preserves retained data and uses compatible images. [0002 down](migrations/0002-watchlist.down.sql) refuses nonempty watchlist state. Do not drop data to satisfy readiness. Browser controls follow this event slice.

## Federated engagement fields

Title.progress(profileId) / inWatchlist(profileId) and Profile.progress(titleId) / inWatchlist(titleId) share one owned pair reader. Both fields are nullable. Missing progress is null; absent or currently hidden watchlist membership is false. Authorization/dependency failure returns null with a sanitized error instead of inventing empty state. The parent Profile or Title reference never authorizes a read.

Each GraphQL request creates its own DataLoader: at most twenty canonical profile/title pairs, twenty representations per entity request and five distinct profiles, with at most two Identity checks in flight. One ordered SQL batch reads progress/membership under the owning account and deletion fence. Duplicate aliases and symmetric Title/Profile paths reuse the same pair. No process-global or cross-request cache exists; every cached disclosure rechecks freshness/cancellation.

Only present membership triggers a separate request-scoped twenty-title Catalog visibility batch. Progress-only reads make no Catalog call; Catalog failure affects membership alone. A hidden title retains owned progress, which is history rather than playback permission. The existing 2.5-second application, one-second SQL and two-second owner deadlines remain. No new database schema, owner credential or retry policy. [ADR-0033](../../docs/adr/0033-request-scoped-engagement-fields.md).

## Runtime and recovery

The normal full runtime profile builds Engagement and runs its finite initializer. To add personalization owners to an already running API checkpoint:

```sh
docker compose --project-name aster --file infra/compose/compose.yml --profile runtime up --build --wait --wait-timeout 120 identity engagement
```

Engagement listens privately on 3400, uses restricted aster_engagement_local PostgreSQL credentials, and mounts only its own Router key plus three distinct private owner-read keys. Each owner accepts one exact private operation; @inaccessible removes those fields from the public API but is not the authorization mechanism. Cookies travel to Identity only; Playback and Catalog return no media URL in their private reads. [ADR-0030](../../docs/adr/0030-local-engagement-progress.md) specifies progress trust, retention and capacity; [ADR-0031](../../docs/adr/0031-current-catalog-visibility.md) specifies current Catalog visibility.

Budgets: four active GraphQL operations, one root operation, 16 KiB body, 4 KiB source, 40 fields, depth six, four aliases and cost 384. Read cost multiplies edge selections by the requested page bound, plus base cost 32 for history or 128 for continue-watching's bounded visibility scan; mutation cost includes both private owner checks and cannot fan out. A 32-credit transport burst refills at four/second. After current owner authorization and exact receipt replay, new progress uses a twelve-token/four-per-second account bucket and watchlist uses four/one-per-second. The 1,024-partition local shield rejects hot bursts before Redis; distributed Redis failure degrades to that local decision and never changes PostgreSQL authority. Identity/Playback clients have four slots; Catalog has one. All have 4 KiB responses, a two-second ceiling and no retries/redirects. Application budget is 2.5 seconds, GraphQL/Router subgraph 2.7 seconds and public Router three seconds. SQL has four connections and a one-second operation ceiling. Every path propagates cancellation. [ADR-0039](../../docs/adr/0039-operation-admission-and-redis-degradation.md).

Readiness checks only Engagement's restricted store/schema/commit constraint. Owner failures reject the individual save. Router/Playback startup never depends on Identity or Engagement. Inspect `docker compose --project-name aster --file infra/compose/compose.yml ps --all` and scoped logs for engagement, engagement-init, identity, playback and router. Logs contain finite outcomes and trace/correlation, not cookies, private keys, account data or media URLs. No dashboard or SLO claim is made.

`ASTER_ENGAGEMENT_RATE_LIMIT_ENABLED=true` enables distributed coordination and
requires server-only `REDIS_URL`; omission or `false` retains the same bounded
local shield. Redis readiness is observed but non-critical. Policies, key shape,
TTL and local capacity are reviewed code policy, not environment overrides.

Rollback stops Engagement and restores compatible prior owner/Router images and artifacts; retain all database/media state. If restoring older Identity/Playback/Catalog images, also disable their new Engagement-read flags. Rotate only inspected disposable trust volumes after stopping affected consumers. The [down migration](migrations/0001-progress.down.sql) refuses any retained progress, receipt, outbox or profile fence. It is not a normal recovery command.

## Verification

```sh
pnpm engagement:integration
pnpm engagement:rate-limit-integration
pnpm engagement:runtime
```

The first command runs progress, watchlist, entity-field and event real-SQL verifiers in separate disposable fixtures: atomicity, replay/conflict/concurrency, keyset pages/query plans, capacity, privileges, deletion races and reconstruction. The rate-limit command uses one disposable Redis container to prove cross-adapter atomicity, malformed-state recovery, TTL, hot-key command reduction and outage fallback. Internal selectors accept no target or connection override. The runtime command builds one UUID-named Docker project, verifies owner-authorized saves/reads and query plans, then exercises the [event runtime](EVENT_DELIVERY.md). Query-plan exposure remains disabled in the normal runtime. Cleanup verifies exact ownership before deleting only its disposable containers, trust/broker volumes, networks and tmpfs database. No retained project, media download or CPU benchmark is involved. [Evidence and limitations](../../evidence/phase-08/README.md).
