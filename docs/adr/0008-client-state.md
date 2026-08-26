# ADR-0008: Separate Apollo Remote State from Redux Interaction State

- Status: Accepted
- Date: 2026-08-25
- Related requirements: DSC-R01, ENG-R04, PBK-R02

## Context

The web application needs normalized GraphQL data and complex player interaction state. Copying server data into Redux produces duplicate caches, ambiguous ownership, and synchronization defects.

## Decision

Apollo Client owns remote GraphQL state. Redux Toolkit owns complex local interaction state, especially the player. Simple local UI uses component state.

Server-rendered GraphQL data hydrates Apollo through a filtered deterministic snapshot. Redux initial state contains only local interaction preferences safe for the client.

## Consequences

### Positive

- One owner for server data.
- Apollo policies handle normalization and pagination.
- Redux remains focused on player and shell behavior.
- SSR hydration boundaries are explicit.

### Negative

- Developers must understand three state scopes.
- Some workflows coordinate Apollo mutations with Redux transitions.
- Cache policies require deliberate design.

## Alternatives considered

### Redux for all data

Rejected because it duplicates GraphQL cache responsibilities.

### Apollo reactive variables for all local state

Rejected because the player benefits from explicit event-driven local state and tooling.

### No global local state

Rejected because coordinated player controls and preferences cross component boundaries.

## Revisit triggers

A state item moves only when its source of truth changes, not for convenience.
