# GraphQL Supergraph

## Purpose

The supergraph gives first-party clients one typed API while preserving domain ownership. Apollo Router composes execution plans across five subgraphs.

## Subgraphs

| Subgraph | Primary fields |
|---|---|
| Identity | `me`, `account`, `profiles`, profile mutations |
| Catalog | public title browse, title detail, rights and operator mutations |
| Playback | playback-session mutation, playback capability |
| Engagement | watchlist, progress, history, continue-watching |
| Discovery | home, search, trending, optional recommendations |

## Entity ownership

Illustrative schema:

```graphql
type Title @key(fields: "id") {
  id: ID!
  name: String!
  synopsis: String!
  publication: MediaPublication
  attribution: Attribution!
}
```

Engagement contributes profile-scoped fields:

```graphql
extend type Title @key(fields: "id") {
  id: ID! @external
  progress(profileId: ID!): PlaybackProgress
  inWatchlist(profileId: ID!): Boolean!
}
```

Playback contributes a capability, but playback creation remains an explicit mutation:

```graphql
extend type Title @key(fields: "id") {
  id: ID! @external
  canPlay: Boolean!
}
```

Discovery returns title references and ranking metadata rather than duplicating Catalog fields.

## Query shape

```graphql
type Query {
  me: Viewer
  title(id: ID!): Title
  titles(first: Int!, after: String, filter: TitleFilter): TitleConnection!
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

Unbounded collections use keyset pagination.

Rules:

- client requests a positive `first`;
- server applies a maximum;
- cursor is opaque and versioned;
- sort is stable and includes a unique tiebreaker;
- invalid or obsolete cursors produce a typed validation error;
- total counts are omitted unless the use case justifies their cost.

## Authorization

The router authenticates and forwards a signed internal identity context. Subgraphs verify its trust source and enforce owner-side policy.

A `profileId` argument never proves access. Engagement and Playback verify that the active account owns the profile.

Operator mutations require an explicit operator role and audit event.

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
