# Apollo Client and Redux

## Purpose

Aster uses two global state tools because they solve different problems.

- Apollo Client owns remote GraphQL state.
- Redux Toolkit owns complex local application interaction state.

This boundary prevents duplicate sources of truth.

## 1. Remote state characteristics

GraphQL data has:

- server authority;
- network lifecycle;
- normalization;
- pagination;
- invalidation;
- authorization scope;
- optimistic mutation;
- partial errors;
- SSR hydration.

Apollo is built for this lifecycle.

Examples:

- titles;
- profiles;
- home rails;
- watchlist;
- progress;
- history;
- search results.

## 2. Local interaction state

Player behavior has:

- rapid local transitions;
- media-element events;
- keyboard commands;
- fullscreen;
- controls visibility;
- volume and captions;
- selected quality;
- transient retry state.

Redux provides explicit events and selectors without pretending this state came from the GraphQL server.

## 3. Avoid duplication

Bad flow:

```text
GraphQL response
→ Apollo cache
→ copy to Redux
→ components read Redux
```

Now mutation, subscription, refetch, and optimistic updates can disagree with the copied state.

Correct flow:

```text
remote product state → Apollo
local interaction state → Redux or component
```

A Redux action can trigger a GraphQL mutation through an orchestration layer, but it does not become the durable owner of the result.

## 4. Player slice example

```ts
type PlayerState = {
  status: "idle" | "loading" | "playing" | "paused" | "ended" | "error"
  controlsVisible: boolean
  muted: boolean
  volume: number
  playbackRate: number
  selectedCaption: string | null
  selectedQuality: "auto" | string
  fullscreen: boolean
  errorCode: string | null
}
```

Do not dispatch high-frequency current-time updates globally unless measured UI requirements justify it. Read time from the media element or use a throttled local selector path.

Durable progress belongs to Engagement through GraphQL.

## 5. Apollo type policies

A type policy answers:

- how an entity is identified;
- which arguments distinguish a field;
- how pages merge;
- how local and server values reconcile.

For profile-scoped progress:

```text
Title.progress(profileId: X)
```

the cache must distinguish `profileId`.

For watchlist connections, mutation updates must preserve order and cursor semantics. Sometimes refetch is safer than complex manual edits.

## 6. Optimistic UI

Use optimistic updates when:

- expected success is high;
- rollback is clear;
- temporary identity is stable;
- authorization is already known;
- conflicting concurrent operations are handled.

Adding to watchlist is a good candidate. Publishing a title is not, because rights and media validation are critical.

## 7. Error policy

Do not convert every GraphQL error into a generic toast.

Map stable outcomes:

- unauthenticated → session transition;
- forbidden → safe access message;
- validation → field feedback;
- stale progress → update local accepted state;
- dependency unavailable → retry or degraded state;
- unknown → correlation ID and recovery option.

## 8. SSR and store creation

Create Apollo and Redux stores per server request. Do not share mutable server stores across users.

Serialize only safe initial Redux state. Player preferences can initialize to deterministic defaults and apply browser storage after hydration.

## 9. Selectors and rerenders

Use focused selectors. A player control should not rerender because an unrelated rail updated.

Measure with React tooling before adding memoization everywhere.

Keep normalized server data in Apollo so a title update can update all references without duplicating objects.

## 10. Mutation consistency

Example watchlist mutation:

1. Apollo sends idempotent mutation.
2. Optional optimistic layer marks title in watchlist.
3. Server verifies profile ownership and title state.
4. Response returns canonical state.
5. Apollo removes optimistic layer and writes canonical result.
6. Related connection updates through policy or targeted refetch.

Redux may show a transient control state, but it does not store the watchlist truth.

## 11. State decision table

| State | Owner |
|---|---|
| Catalog title | Apollo |
| Viewer profiles | Apollo |
| Watchlist membership | Apollo |
| Durable progress | Apollo |
| Current media element time | Player/local |
| Controls visible | Redux |
| Volume preference | Redux plus browser persistence |
| Active modal | Local or Redux based on coordination |
| Search input before submit | Local |
| Search results | Apollo |
| Server authentication secret | Server only |
