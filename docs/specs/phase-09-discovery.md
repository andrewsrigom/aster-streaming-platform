# Phase 09 — Home Rails and Search

## Objective

Build useful discovery that can degrade independently without compromising Catalog or Playback.

## Product traceability

- Primary: `DSC-R01`, `DSC-R02`, `DSC-R03`, `DSC-R04`, `DSC-R05`.
- Supports: `CAT-R05`, `CAT-R07`, `ENG-R04`, `GQL-R05`, `OPS-R02`, `OPS-R03`, `QLT-R01`, `QLT-R02`.

## Prerequisites

- Catalog, web, and Engagement are verified.
- Title events and projection conventions are available.

## Deliverables

- Discovery subgraph
- title search projection
- home-rail model
- editorial, recent, genre, trending, and continue-watching composition
- stable fallback behavior
- SSR and client integration
- search and rail relevance evidence

## Requirements

### P09-R01

Build a versioned search projection from Catalog events with rebuild capability.
### P09-R02

Provide normalized, bounded, keyset-paginated search over published titles.
### P09-R03

Define home rails independently so one rail failure does not erase unrelated rails.
### P09-R04

Compose profile-specific continue-watching without making it a Discovery-owned truth.
### P09-R05

Provide stable editorial and recently-added fallbacks when computed discovery fails.
### P09-R06

Track source version, indexed time, and freshness for projected content.
### P09-R07

Prevent retired or disputed titles from search and normal rails within the defined propagation target.
### P09-R08

Handle zero results, partial rails, stale projections, and dependency timeout explicitly.
### P09-R09

Instrument rail latency, empty rate, fallback rate, freshness, and search result quality samples.
### P09-R10

Integrate server-rendered public rails and profile-enhanced client behavior without hydration mismatch.

## Invariants

- Discovery does not become the source of title or progress truth.
- One rail failure does not fail the complete home response.
- Search results are bounded and stable under pagination.
- Fallbacks are safe and observable.
- Retirement propagation has a defined maximum delay and emergency invalidation path.

## Implementation sequence

1. Define event-driven projections.
2. Implement search indexing and rebuild.
3. Implement rail definitions.
4. Add Discovery subgraph.
5. Compose Engagement and Catalog references.
6. Add fallback and freshness behavior.
7. Integrate web.
8. Evaluate relevance and failure.

## Required tests

- Projection replay and duplicate events.
- Retired-title removal.
- Stable pagination under inserts.
- Search normalization and bounds.
- One and multiple rail dependency failures.
- SSR/profile hydration behavior.
- Fallback telemetry.

## Required evidence

Store the phase evidence index under `evidence/phase-09/` when implementation begins.

- projection rebuild report
- search query plans
- representative relevance set
- home query plan
- partial-failure response
- freshness and fallback metrics

Every measured result must identify commit, environment, exact command, workload, raw artifact, interpretation, and limitations.

## Non-goals

- Machine-learned recommendations
- External search engine
- Real-time social trends
- Unbounded free-form filtering

## Exit gate

The phase is `VERIFIED` only when:

- every requirement has a linked implementation or documented non-applicability;
- all required tests pass from a clean environment;
- evidence is stored and reviewed;
- security, accessibility, failure, and operational effects are documented;
- no planned behavior is described as implemented;
- `.ai/CURRENT_STATE.md`, `.ai/WORK_QUEUE.md`, `.ai/SESSION_LOG.md`, and `.ai/HANDOFF.md` are current;
- the next phase prerequisites are explicitly checked.

## Learning outcomes

- Read models
- Eventual consistency
- Search design
- Partial GraphQL results
- Graceful discovery degradation

## Agent constraints

- Load `skills/agent.md` and every skill related to this phase.
- Do not implement later-phase capabilities to hide an incomplete requirement.
- Do not add placeholder services, dashboards, events, or metrics.
- Use requirement IDs in the active change plan.
- Stop and write an ADR when a fixed architecture decision must change.
