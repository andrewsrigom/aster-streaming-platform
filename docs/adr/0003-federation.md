# ADR-0003: Use Apollo Federation v2 and Apollo Router

- Status: Accepted
- Date: 2026-08-25
- Related requirements: GQL-R01–R06

## Context

Clients need one typed application API, while product data is owned by separate contexts. A hand-built aggregation layer would duplicate schema composition and query planning concerns. Direct client access to every service would couple clients to deployment topology.

## Decision

Each bounded context exposes a Federation v2 subgraph. Apollo Router exposes the composed supergraph.

Use stable entity keys, explicit field ownership, request-scoped DataLoader, schema composition in CI, and trusted operations in hosted environments.

## Consequences

### Positive

- One client schema with context ownership.
- Declarative entity composition.
- Central traffic shaping and operation controls.
- Independent subgraph evolution within compatibility rules.

### Negative

- Query plans can hide expensive fan-out.
- Entity resolution introduces network and N+1 risks.
- Router and schema delivery become critical infrastructure.
- Teams must understand nullability and partial failure.

## Alternatives considered

### REST plus a custom backend-for-frontend

Viable, but rejected because federated GraphQL behavior is a core platform requirement.

### One GraphQL service

Simpler initially but weakens explicit context contracts and independent failure experiments.

## Revisit triggers

Reconsider if measured operational cost substantially exceeds value or if client access patterns cannot be expressed safely under the supergraph.
