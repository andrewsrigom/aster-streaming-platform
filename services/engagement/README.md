# Engagement progress

P08-R01–R06 and the atomic write portion of P08-R09 are implemented. The [write proof](../../evidence/phase-08/review-federated-runtime.txt) and [read proof](../../evidence/phase-08/history-federated-runtime.jsonl) exercise real owners, PostgreSQL and Router. Protected release remains pending. Player reports/resume, watchlist, general Title/Profile engagement extensions and event relay/consumers are planned next in Phase 08.

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

`progressHistory` returns the latest accepted report per title, including NOT_STARTED and COMPLETED. `continueWatching` returns IN_PROGRESS only. Both freshly authorize the requested profile through Identity and read authoritative PostgreSQL; no Redis or cross-request authorization cache is involved.

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

For the resumable list use operation `ContinueWatching` and field `continueWatching`, with the same arguments and selection. Page size is 1–20, default 20. One bounded SELECT fetches at most first+1 rows, ordered by updatedAt then progress ID descending. Cursors are versioned and bound to the profile and list kind; treat them as opaque, never as credentials. They expire neither authorization nor history. A live update may move a title ahead of an existing cursor; refresh to restart traversal. This is not a snapshot or append-only viewing-session log.

Catalog resolves title metadata through its existing request-scoped entity batch. Missing/retired metadata is nullable; history retains the owned progress row without copying editorial data. COMPLETED returns a connection, including an empty successful page. Authorization/SQL failures return a non-success code and null connection, never a fabricated empty success. Missing/deleted/foreign profiles and revoked sessions disclose no history. SQL reads create no receipt, event or projection write. Retention follows the existing 256-title-per-profile bound until profile deletion; cleanup delivery remains P08-R12.

## Runtime and recovery

The normal full runtime profile builds Engagement and runs its finite initializer. To add personalization owners to an already running API checkpoint:

```sh
docker compose --project-name aster --file infra/compose/compose.yml --profile runtime up --build --wait --wait-timeout 120 identity engagement
```

Engagement listens privately on 3400, uses restricted aster_engagement_local PostgreSQL credentials, and mounts only its own Router key plus two distinct private owner-read keys. Each owner accepts one exact private operation; @inaccessible removes those fields from the public API but is not the authorization mechanism. Cookies travel to Identity only; Playback returns no media URL in its private read. [ADR-0030](../../docs/adr/0030-local-engagement-progress.md) specifies trust, retention and capacity.

Budgets: four active GraphQL operations, one root operation, 16 KiB body, 4 KiB source, 40 fields, depth six, four aliases and cost 384. Read cost multiplies edge selections by the requested page bound; mutation cost still includes both private owner checks and cannot fan out. A 32-credit burst refills at four/second. Each owner client has four slots, 4 KiB responses, a two-second ceiling and no retries/redirects. Application budget is 2.5 seconds, GraphQL/Router subgraph 2.7 seconds and public Router three seconds. SQL has four connections and a one-second operation ceiling. Every path propagates cancellation.

Readiness checks only Engagement's restricted store/schema/commit constraint. Owner failures reject the individual save. Router/Playback startup never depends on Identity or Engagement. Inspect `docker compose --project-name aster --file infra/compose/compose.yml ps --all` and scoped logs for engagement, engagement-init, identity, playback and router. Logs contain finite outcomes and trace/correlation, not cookies, private keys, account data or media URLs. No dashboard or SLO claim is made.

Rollback stops Engagement and restores compatible prior Router artifacts; retain all database/media state. If restoring older Identity/Playback images, also disable their new Engagement-read flags. Rotate only inspected disposable trust volumes after stopping affected consumers. The [down migration](migrations/0001-progress.down.sql) refuses any retained progress, receipt, outbox or profile fence. It is not a normal recovery command.

## Verification

```sh
pnpm engagement:integration
pnpm engagement:runtime
```

The first command tests real SQL atomicity, concurrent ordering, keyset pages/query plans, bounds, privileges and empty-only rollback. The second builds a UUID-named disposable Docker project, tests current owner authorization, durable writes and federated reads/metadata/completion/retirement, reruns the initializer, stops optional owners and verifies anonymous Playback. It validates exact ownership before cleaning its own containers, trust volumes, networks and tmpfs database. No retained project, media download or CPU benchmark is involved. [Evidence and limitations](../../evidence/phase-08/README.md).
