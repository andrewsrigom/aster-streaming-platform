# ADR-0031: Current Catalog visibility before Engagement pagination

- Status: Accepted
- Date: 2026-08-28
- Owners: Catalog and Engagement
- Requirements: P08-R06, ENG-R04; reusable by P08-R07

## Decision

Continue-watching must omit retired/disputed titles before pagination, not merely return null metadata. Keep history and durable progress unchanged. Catalog owns visibility; Engagement owns ordering and profile authorization. Add a separately credentialed private Catalog GraphQL visibility batch under the [ADR-0030](0030-local-engagement-progress.md) owner-read model. Never reuse Playback's publication credential, return media URLs, read foreign tables, create playback sessions or recursively call Router.

Hide the operation/types with @inaccessible, but enforce the exact operation, twenty UUID IDs, fixed host/origin, correlation and a distinct random 256-bit local file credential. No browser credential reaches Catalog. Catalog reuses its existing public candidate policy at now and now plus two seconds, conservatively rejecting a title whose rights expire inside that window. Preserve input order and explicit invisible results. Snapshots expire after two seconds and are checked again before disclosure; concurrent retirement is bounded by this window, not a cross-owner transaction. Hosted service identity/TLS/clock policy remains Phase 14.

Engagement reads at most its existing 256 per-profile progress rows using the partial resumable index, then checks serial batches of twenty until first-plus-one visible rows are available or candidates end. Maximum thirteen batches; one 2.5-second application deadline, two-second outbound ceilings, cancellation and no retries/cache. Hidden rows do not affect page size/hasNextPage or appear in cursors. Identity is freshly checked as before. Catalog failure is unavailable, never an empty success. Metadata stays nullable because it can change after the visibility snapshot.

Catalog's new optional read lane permits one active request with its own burst-32/refill-four bucket and no queue; it cannot consume public admission/rate credit. Existing database bounds remain. This optional path must not stop public catalog/playback.

## Evidence and recovery

Require sparse/fully hidden pages, retirement/dispute, denied purpose substitution/public access, response bounds/expiry/cancellation, query cost, SQL and actual federated-owner tests. No migration, media or retained data change. Rollback restores compatible prior Catalog/Engagement/Router images and artifacts; disable optional reads if necessary. Watchlist, events and player integration remain later work.

Checked 2026-08-28: [Apollo directive semantics](https://www.apollographql.com/docs/graphos/schema-design/federated-schemas/reference/directives#inaccessible) and PostgreSQL [ordered indexes](https://www.postgresql.org/docs/18/indexes-ordering.html). Snapshot and capacity bounds are Aster decisions. No dependency/platform added.
