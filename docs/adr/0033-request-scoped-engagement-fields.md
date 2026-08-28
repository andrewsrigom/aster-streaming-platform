# ADR-0033: Request-scoped federated engagement fields

- Status: Accepted
- Date: 2026-08-28
- Owners: Engagement, Identity and Catalog
- Requirements: P08-R08; supports GQL-R03, ENG-R04, ENG-R05

## Decision

Add nullable Title.progress(profileId: ID!) / inWatchlist(profileId: ID!) and Profile.progress(titleId: ID!) / inWatchlist(titleId: ID!). Both pairs read the same Engagement-owned state. Progress uses the implemented Progress type, including nullable Catalog metadata. An absent owned record is null; absent or currently hidden membership is false. Unavailable or unauthorized optional fields are null with sanitized errors, never false. This refines previously planned schema names/nullability, not a released breaking change.

Representations are exact Title/Profile typename plus canonical UUID id and carry no authority. Resolvable references only construct validated key stubs. Every actual field obtains credential-bound Identity ownership in Engagement; a Profile entity is not proof of authorization.

Use DataLoader 2.2.3 already pinned in Identity/Catalog. Each request creates its own loader/cache, at most twenty canonical profile/title pairs and five distinct profiles (Identity's existing product ceiling). Batch at most twenty pairs into one parameterized owned SQL read, preserving order and missing rows. Identity memoization is request-only, at most two concurrent checks, with freshness rechecked after SQL and every cached disclosure. There is no cross-request authorization cache or new migration.

Membership alone lazily uses a second request-scoped twenty-title Catalog loader, reusing [ADR-0031](0031-current-catalog-visibility.md). Check only present memberships; unavailable Catalog does not affect progress-only reads. Current invisible titles return false without deleting membership, consistent with [ADR-0032](0032-owned-watchlist-visibility.md). Recheck both authority and visibility at disclosure. Retained historical progress remains readable, not a playback grant.

The whole field request has a 2.5-second cancellation-aware budget; existing SQL one-second and owner two-second ceilings remain. Strict twenty-representation input, cache bounds, fragment type checks and multiplied cost stay under existing subgraph limits. No global caches, unbounded fan-out, retry loop, new trust operation or recursive Router call.

## Evidence and recovery

Prove request/account isolation, duplicate/order/null handling, bounded keys/profiles, foreign/deleted authority, expiry/cancellation and Catalog partial failure. Measure a labelled synthetic sequential SQL baseline versus the actual batched implementation, including query counts and small-fixture limitations; verify the composed query plan and real Router flow. Restore prior compatible Engagement/Router images and artifacts for rollback; retain all data.

Checked 2026-08-28: [DataLoader 2.2.3](https://github.com/graphql/dataloader/tree/v2.2.3) documents per-request memoization, ordered batch results and configurable bounds; [Apollo entity contributions](https://www.apollographql.com/docs/graphos/schema-design/federated-schemas/entities/contribute-fields) documents entity field ownership and reference resolvers. Exact bounds and failure semantics above are Aster decisions. Existing MIT dependency, no new platform.
