# ADR-0001: Use a TypeScript Monorepo with Explicit Boundaries

- Status: Accepted
- Date: 2026-08-25
- Related requirements: OPS-R01, QLT-R01

## Context

Aster contains a web application, router configuration, five subgraphs, media workers, shared infrastructure adapters, contracts, and local platform configuration. These units must evolve coherently while retaining independent runtime boundaries.

Separate repositories would add versioning and coordination cost before independent ownership exists. An unstructured single repository would make cross-context imports easy and obscure deployable boundaries.

## Decision

Use a pnpm workspace and Turborepo monorepo.

Top-level runtime units live under `apps/`, `services/`, and `workers/`. Reusable technical packages live under `packages/`. Infrastructure lives under `infra/`.

Enforce dependency direction with package exports, TypeScript project boundaries, lint rules, and architecture tests.

## Consequences

### Positive

- Atomic cross-unit changes during early development.
- Shared quality tooling and reproducible local setup.
- Efficient caching of build and test tasks.
- Easier supergraph and contract validation.

### Negative

- Boundary violations are possible without enforcement.
- CI must avoid rebuilding every unit unnecessarily.
- Shared package growth can create coupling.

### Operational

Each runtime unit still produces its own image, configuration schema, health behavior, and release artifact.

## Alternatives considered

### Separate repositories

Deferred until ownership, release cadence, or access control makes separation valuable.

### One application package

Rejected because Federation, worker isolation, and failure-boundary requirements are first-class.

## Revisit triggers

- independent teams require access or release isolation;
- repository size makes tooling unreliable despite optimization;
- compliance requires physical separation.
