# GraphQL Supergraph

## Purpose

The supergraph gives first-party clients one typed API while preserving domain
ownership. Apollo Router composes Identity, Catalog, Playback, Engagement and the
current Discovery search/home candidate. [Composition and known-operation checks](../../apps/router/README.md)
validate all five schemas. [Engagement evidence](../../evidence/phase-08/README.md)
records its released owner-authorized paths; [Discovery evidence](../../evidence/phase-09/README.md)
records released search and the current locally verified rails candidate.

## Subgraphs

| Subgraph | Primary fields |
|---|---|
| Identity | `me`, `profiles`, owned Profile entities and profile mutations |
| Catalog | public title browse/detail, localized metadata and attribution; editorial operations use the local CLI |
| Playback | playback-session mutation, playback capability |
| Engagement | watchlist, progress, history, continue-watching |
| Discovery | released bounded title search; current fixed public rails candidate; optional recommendations remain planned |

## Entity ownership

Current Catalog contract (excerpt; [complete schema](../../evidence/phase-03/catalog-schema.graphql)):

```graphql
type Title @key(fields: "id") {
  id: ID!
  localized(locale: String! = "en"): LocalizedTitle!
  attribution: CatalogAttribution!
}
```

Released Engagement contribution:

```graphql
type Title @key(fields: "id") {
  id: ID!
  progress(profileId: ID!): Progress
  inWatchlist(profileId: ID!): Boolean
}
type Profile @key(fields: "id") {
  id: ID!
  progress(titleId: ID!): Progress
  inWatchlist(titleId: ID!): Boolean
}
```

Both contributions use one Engagement-owned pair read. Keys are references, never authority; Identity validates the requested profile. Request-local DataLoader batches and memoizes at most twenty pairs and five profiles, preserving order and missing values. Membership lazily checks current Catalog visibility, while progress remains readable without Catalog. Optional failure is null with a sanitized error, not false; hidden/absent membership is false. Cached disclosure still checks authorization/visibility expiry and cancellation. [ADR-0033](../adr/0033-request-scoped-engagement-fields.md) and [evidence](../../evidence/phase-08/engagement-fields.md).

Planned Playback contribution; playback creation remains an explicit mutation:

```graphql
extend type Title @key(fields: "id") {
  id: ID! @external
  canPlay: Boolean!
}
```

Discovery search and home rails return nullable Catalog `Title` references plus
projection freshness rather than duplicating Catalog fields. Nullable references
preserve the remainder of a page if Catalog retires a title between the Discovery
read and entity resolution. Engagement alone owns the nullable
`homeContinueWatching` root.

The maximum three-genre branch can flatten36 `Title` representations. Catalog's
federation guard admits that exact finite maximum; its request-scoped DataLoader
keeps owner reads at the existing20-title batch limit. Ordinary product list limits
do not change.

## Query shape

Implemented query surface excerpt; [generated API](../../infra/router/generated/api.graphql)
is authoritative. Catalog has no browse filter or search field; Discovery owns
search and derived public rail selection.

```graphql
type Query {
  me: Viewer
  title(id: ID!): Title
  titles(first: Int!, after: String): CatalogTitleConnection!
  progressHistory(profileId: ID!, first: Int! = 20, after: String): ProgressPagePayload!
  continueWatching(profileId: ID!, first: Int! = 20, after: String): ProgressPagePayload!
  watchlist(profileId: ID!, first: Int! = 20, after: String): WatchlistPagePayload!
  searchTitles(query: String!, locale: String!, first: Int! = 20, after: String): DiscoverySearchPayload!
  homeRails(first: Int! = 10): DiscoveryHomePayload!
  homeContinueWatching(profileId: ID!, first: Int! = 10, after: String): ProgressPagePayload
}
```

Implemented mutations are owner-specific:

```graphql
type Mutation {
  createProfile(input: CreateProfileInput!): ProfileMutationPayload!
  recordProgress(input: RecordProgressInput!): ProgressPayload!
  setWatchlist(input: SetWatchlistInput!): WatchlistPayload!
  createPlaybackSession(titleId: ID!): PlaybackSessionPayload!
}
```

## Error model

Expected domain outcomes use typed payload fields where clients can act on them. Unexpected failures use sanitized GraphQL errors with stable extension codes and a correlation identifier.

Do not expose stack traces, SQL details, internal URLs, tokens, or object-storage keys.

Suggested categories:

- `UNAUTHENTICATED`
- `FORBIDDEN`
- `VALIDATION_FAILED`
- `NOT_FOUND`
- `CONFLICT`
- `STALE_UPDATE`
- `RATE_LIMITED`
- `DEPENDENCY_UNAVAILABLE`
- `PLAYBACK_UNAVAILABLE`
- `INTERNAL`

## Pagination

Catalog implements ascending UUID keysets, first 1–20, first+1 lookahead and no total count. Public eligibility is checked before LIMIT and again by domain projection; retired/disputed/expired titles are absent. Each SQL statement uses a consistent snapshot; pages do not promise one shared snapshot. See [Catalog controls](../../services/catalog/README.md#public-graphql).

Engagement history/continue-watching uses descending (updatedAt, progress ID), first 1–20 and first+1 lookahead. Profile/list-bound cursors do not grant authority. Each page freshly authorizes Identity and reads only that account/profile with its deletion guard. Completed rows stay in history; only IN_PROGRESS appears in continue-watching. Catalog metadata is nullable for missing/retired titles; progress is not deleted or copied into Catalog. Live updates can move a title ahead of a cursor; refresh restarts traversal. See [read semantics](../../services/engagement/README.md#history-and-continue-watching).

Unbounded collections use keyset pagination.

Watchlist uses descending (addedAt, entry ID), profile-bound w1 cursors and the same 1–20 page bound. Watchlist and continue-watching both validate current Catalog visibility before lookahead; hidden titles never affect page size or hasNextPage. Watchlist replay/removal do not require Catalog, but always require current Identity ownership. See [watchlist semantics](../../services/engagement/README.md#watchlist). General Title/Profile engagement extensions remain P08-R08, separate from these root operations.

Discovery search uses weighted full-text rank descending and title ID ascending, with first 1–20 and first+1 lookahead. Its s1 cursor is bound to the normalized query, locale and active projection generation. Changed queries, replaced generations and malformed positions are rejected rather than traversing mixed state. Freshness and zero results are explicit. See [Discovery search](../../services/discovery/README.md#public-contract).

Home rails are bounded to twelve references per rail and three genre rails. Fixed
selections fail independently; featured/curated-trending may explicitly reuse a
successful recent selection. The personalized sibling remains nullable so an
Engagement subgraph failure does not null public home data. See [home rails](../../services/discovery/README.md#home-rails).

Rules:

- client requests a positive `first`;
- server applies a maximum;
- cursor is opaque and versioned;
- sort is stable and includes a unique tiebreaker;
- invalid or obsolete cursors produce a typed validation error;
- total counts are omitted unless the use case justifies their cost.

## Authorization

Phase 04 defines and verifies Router-to-subgraph trust. Owning applications enforce access policy; an unverified public header is never an identity source.

A `profileId` argument never proves access. Engagement verifies current ownership through Identity; anonymous Playback sessions are title-bound contexts, not account authority. Private owner reads use purpose-separated credentials and are inaccessible in the public API, as specified in [ADR-0030](../adr/0030-local-engagement-progress.md).

Catalog editorial operations currently use the explicit local process authority and audited CLI in ADR-0015, not public GraphQL mutations. Hosted operator identity remains Phase 14.

## DataLoader

Each request creates loaders scoped by:

- service;
- request;
- authorization context;
- data access policy.

Loaders batch entity and list joins, cap batch sizes, preserve order, and return missing values explicitly.

## Operation controls

The generated Apollo manifest and finite Rhai matcher now bind every first-party
operation name to its exact SHA-256 document hash. Router starts only with an
explicit environment and trusted-operation mode. Local/integration `audit`
preserves diagnostics; staging/production require `enforce`, which rejects
missing, unknown or altered documents before query planning. Telemetry retains
only `matched`, `unknown` or `missing`. [ADR-0045](../adr/0045-source-owned-trusted-operations.md)
defines packaging, rollout and rollback.

Hosted environments additionally enforce the complete Phase 13 control set:

- known first-party operations;
- operation-name requirement;
- request-body maximum;
- parser token maximum;
- depth and alias maximums;
- list-size and pagination bounds;
- cost budget;
- execution deadline;
- request concurrency;
- identity-aware rate limits;
- disabled or controlled batching;
- controlled introspection.

## Schema evolution

Engagement's history/continue-watching connections resolve nullable Title metadata through Catalog. Continue-watching additionally uses a private, purpose-separated current visibility batch before pagination; @inaccessible hides that owner contract but does not authorize it. [ADR-0031](../adr/0031-current-catalog-visibility.md) bounds the scan, validity window and failure behavior. No recursive Router request or cross-owner SQL is used.

1. add the new shape in backward-compatible owners;
2. add the new client document while retaining the old document in the trusted manifest;
3. deploy the owner, complete manifest and Router policy before the client;
4. deploy the client and observe finite operation outcomes;
5. deprecate the old field and remove its operation only after the compatibility window;
6. remove the old shape in a later reviewed release.

Field ownership changes use a dedicated migration plan and an ADR when the boundary changes.

## Composition in delivery

CI builds each subgraph schema and composes the supergraph. A change fails when:

- composition fails;
- a protected operation breaks;
- ownership becomes ambiguous;
- an entity key becomes unresolved;
- an inaccessible field leaks;
- a required authorization test is missing.

Current schema commands are `pnpm schema:check` and `pnpm schema:update`. They print executable owner schemas, compose deterministic files, generate the Apollo trusted-operation manifest and Router matcher, and compare the current API with a committed baseline. [The delivery manifest](../../infra/router/generated/manifest.json) enumerates current field/entity ownership and hashes the complete generated set; [conventions](../../apps/router/README.md#schema-conventions) preserve existing scalars, pagination, errors and nullability. Owner authorization and later-subgraph evolution remain separate gates.
