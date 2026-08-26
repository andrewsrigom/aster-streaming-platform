# Frontend Architecture

## Application shape

The web application uses Next.js App Router with React Server Components by default and client components where browser behavior is required.

```text
apps/web/
  app/
  features/
    identity/
    catalog/
    playback/
    engagement/
    discovery/
  components/
    ui/
    media/
  lib/
    apollo/
    auth/
    telemetry/
    accessibility/
  store/
    player/
    shell/
```

Feature directories may depend on shared UI and platform adapters. They may not import server-only secrets into client boundaries.

## Route strategy

Public server-rendered routes:

- `/`
- `/browse`
- `/title/[id-or-slug]`
- `/search`
- `/attribution`
- `/accessibility`

Authenticated routes or sections:

- profile selection;
- watchlist;
- history;
- account settings.

Playback route:

- `/watch/[titleId]`

The watch route uses a minimal shell and client player, but server code still validates title and session prerequisites before rendering safe initial state.

## Data flow

### Server render

1. server receives request and stable identity snapshot;
2. server runs approved GraphQL operations;
3. Apollo normalizes response;
4. page renders;
5. a filtered cache snapshot is serialized;
6. browser restores cache;
7. client components hydrate.

Sensitive fields and server-only tokens never enter the serialized cache.

### Client mutation

1. interaction dispatches GraphQL mutation;
2. Apollo optimistic response is used only when rollback is safe;
3. cache policy updates normalized entities and connections;
4. local interaction state remains in component state or Redux;
5. telemetry records outcome without duplicating GraphQL payloads.

## State ownership

### Apollo Client

- catalog;
- profiles;
- home rails;
- search;
- watchlist;
- progress;
- history;
- playback-session metadata appropriate for the client.

### Redux Toolkit

- player UI state;
- volume and subtitle preference;
- active quality selection;
- transient drawers and dialogs when globally coordinated;
- multi-step local flow state;
- recoverable client event queue when explicitly designed.

### Local state

- focused control;
- input value before submission;
- isolated toggle;
- component animation state.

## Hydration invariants

The first browser render must match server output.

Use:

- server-provided locale;
- stable identity snapshot;
- serialized dates as strings with deliberate formatting;
- deterministic IDs;
- client-only gates for storage and media APIs;
- explicit loading transitions after hydration.

Do not render `Date.now()`, random values, viewport branches, or storage-derived preferences in shared server/client markup.

## Apollo cache policy

Each entity defines a stable cache key. Connections define key arguments and merge rules. Profile-specific fields include profile identity in field keys.

Pagination merge functions:

- prevent duplicate edges;
- preserve server ordering;
- handle invalidation;
- separate different filters;
- stop on cursor exhaustion.

## Player boundary

The player is a client-only feature backed by:

- HLS adapter;
- HTML media element;
- Redux player state;
- playback telemetry;
- progress reporter;
- caption and quality controls;
- session refresh policy.

The player does not own durable progress rules. It sends ordered reports; Engagement decides acceptance.

## Accessibility

Core requirements:

- skip links and semantic landmarks;
- one logical page heading;
- keyboard-operable rails without trapping focus;
- accessible names for artwork links and controls;
- visible focus;
- announced loading and errors where useful;
- dialog focus management;
- reduced motion;
- captions;
- player shortcuts documented and conflict-safe.

## Web performance

Initial budgets are defined in Phase 05 and verified in Phase 14. Measurement includes server response, LCP, INP, CLS, hydration, bundle size, image bytes, and GraphQL operation count.

Prefetching is bounded and intent-aware. Playback assets are not downloaded merely because a card entered the viewport.
