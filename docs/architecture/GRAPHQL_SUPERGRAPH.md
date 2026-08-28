# GraphQL Supergraph

## Purpose

The supergraph gives first-party clients one typed API while preserving domain ownership. Apollo Router currently composes Identity, Catalog, Playback and Engagement; Discovery remains planned. [Composition and known-operation checks](../../apps/router/README.md) validate schemas, while [Engagement Docker evidence](../../evidence/phase-08/history-federated-runtime.jsonl) proves the implemented owner-authorized write/read paths. Phase 08 protected release remains separate from local acceptance.

## Subgraphs

| Subgraph | Primary fields |
|---|---|
| Identity | `me`, `profiles`, owned Profile entities and profile mutations |
| Catalog | public title browse/detail, localized metadata and attribution; editorial operations use the local CLI |
| Playback | playback-session mutation, playback capability |
| Engagement | watchlist, progress, history, continue-watching |
| Discovery | home, search, trending, optional recommendations |

## Entity ownership

Current Catalog contract (excerpt; [complete schema](../../evidence/phase-03/catalog-schema.graphql)):

```graphql
type Title @key(fields: "id") {
  id: ID!
  localized(locale: String! = "en"): LocalizedTitle!
  attribution: CatalogAttribution!
}
```

Implemented Engagement contribution (P08-R08 local candidate; protected acceptance remains separate):

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

Discovery will return title references and ranking metadata rather than duplicating Catalog fields.

## Query shape

Implemented query surface excerpt; [generated API](../../infra/router/generated/api.graphql) is authoritative. Catalog currently has no browse filter or search field. Discovery home/search remain planned.

```graphql
type Query {
  me: Viewer
  title(id: ID!): Title
  titles(first: Int!, after: String): CatalogTitleConnection!
  progressHistory(profileId: ID!, first: Int! = 20, after: String): ProgressPagePayload!
  continueWatching(profileId: ID!, first: Int! = 20, after: String): ProgressPagePayload!
  watchlist(profileId: ID!, first: Int! = 20, after: String): WatchlistPagePayload!
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

Hosted environments enforce:

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

1. add the new shape;
2. deploy owners and consumers compatibly;
3. migrate client operations;
4. observe usage;
5. deprecate the old field;
6. remove only after the compatibility window.

Field ownership changes use a dedicated migration plan and an ADR when the boundary changes.

## Composition in delivery

CI builds each subgraph schema and composes the supergraph. A change fails when:

- composition fails;
- a protected operation breaks;
- ownership becomes ambiguous;
- an entity key becomes unresolved;
- an inaccessible field leaks;
- a required authorization test is missing.

Current schema-only commands are `pnpm schema:check` and `pnpm schema:update`. They print executable owner schemas, compose deterministic files and compare the current API with a committed baseline. [The manifest](../../infra/router/generated/manifest.json) enumerates current field/entity ownership; [conventions](../../apps/router/README.md#schema-conventions) preserve existing scalars, pagination, errors and nullability. Runtime authorization and later-subgraph evolution remain separate gates.
