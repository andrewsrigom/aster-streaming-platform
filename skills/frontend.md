# Skill: Frontend, SSR, and Client State

## Purpose

Build a fast, accessible streaming interface with clear server/client ownership.

## Rendering ownership

Use server rendering for:

- public catalog and title metadata;
- SEO metadata;
- stable page structure;
- unauthenticated discovery content;
- initial GraphQL data that is safe for the response.

Use client rendering for:

- player controls;
- playback telemetry;
- profile-specific interaction;
- watchlist mutations;
- live progress;
- dialogs, drawers, and transient UI.

Do not turn the whole application into a client component to avoid a boundary decision.

## Hydration safety

Server and first client render must agree.

Avoid rendering unstable values during hydration:

- current time;
- random identifiers;
- browser-only storage;
- viewport-dependent structure;
- locale values derived differently on server and browser;
- mutable authentication state without a stable snapshot.

Pass a serialized, versioned initial state. Test slow hydration and stale browser cache cases.

## State ownership

Apollo Client owns remote GraphQL state:

- titles;
- profiles;
- watchlists;
- progress;
- home rails;
- search results.

Redux owns complex local interaction state:

- player controls and preferences;
- active modal or drawer;
- temporary multi-step flows;
- optimistic UI coordination that is not already represented by Apollo.

Local component state owns simple, local interaction.

Do not copy Apollo results into Redux.

## Apollo caching

Define type policies, stable IDs, field merge behavior, and pagination rules. Do not rely on defaults for mutable lists.

Choose fetch policies from freshness requirements. A cached response is not automatically correct for a different profile or authorization scope.

## Accessibility

The player and catalog must support:

- keyboard-only operation;
- visible focus;
- semantic controls;
- captions;
- screen-reader labels and state announcements;
- reduced motion;
- sufficient contrast;
- predictable focus after dialogs;
- error recovery without pointer-only actions.

Automated checks do not replace keyboard and screen-reader review.

## Performance

Set budgets for:

- JavaScript;
- images;
- LCP;
- INP;
- CLS;
- hydration time;
- GraphQL operation count;
- unnecessary rerenders.

Use responsive artwork, lazy loading below the fold, virtualization only when measured, and prefetching that respects network and user intent.
