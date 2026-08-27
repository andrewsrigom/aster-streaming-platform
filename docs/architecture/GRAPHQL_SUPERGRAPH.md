# GraphQL Supergraph

## Purpose

The supergraph gives first-party clients one typed API while preserving domain ownership. Apollo Router will compose execution plans across five subgraphs. Identity and Catalog schemas now have [offline composition and known-operation checks](../../apps/router/README.md). Router runtime and the remaining subgraphs are planned; a composed artifact does not prove network trust or query execution.

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

Planned Engagement contribution:

```graphql
extend type Title @key(fields: "id") {
  id: ID! @external
  progress(profileId: ID!): PlaybackProgress
  inWatchlist(profileId: ID!): Boolean!
}
```

Planned Playback contribution; playback creation remains an explicit mutation:

```graphql
extend type Title @key(fields: "id") {
  id: ID! @external
  canPlay: Boolean!
}
```

Discovery will return title references and ranking metadata rather than duplicating Catalog fields.

## Query shape

Target query surface below combines implemented Catalog/Identity with planned Discovery/Engagement. Catalog currently has no browse filter or search field.

```graphql
type Query {
  me: Viewer
  title(id: ID!): Title
  titles(first: Int!, after: String): CatalogTitleConnection!
  home(profileId: ID): Home!
  search(query: String!, first: Int!, after: String): TitleConnection!
  continueWatching(profileId: ID!, first: Int!): ContinueWatchingConnection!
}
```

Mutations are owner-specific:

```graphql
type Mutation {
  createProfile(input: CreateProfileInput!): CreateProfilePayload!
  addToWatchlist(input: WatchlistInput!): WatchlistPayload!
  recordPlaybackProgress(input: ProgressInput!): ProgressPayload!
  createPlaybackSession(input: PlaybackSessionInput!): PlaybackSessionPayload!
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

Unbounded collections use keyset pagination.

Rules:

- client requests a positive `first`;
- server applies a maximum;
- cursor is opaque and versioned;
- sort is stable and includes a unique tiebreaker;
- invalid or obsolete cursors produce a typed validation error;
- total counts are omitted unless the use case justifies their cost.

## Authorization

Phase 04 will define and verify Router-to-subgraph identity trust. Owning applications enforce access policy; an unverified public header is never an identity source.

A `profileId` argument never proves access. Engagement and Playback verify that the active account owns the profile.

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
