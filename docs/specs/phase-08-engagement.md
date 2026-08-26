# Phase 08 — Progress, History, Watchlist, and Continue-Watching

## Objective

Implement durable profile engagement with idempotent, monotonic progress and federated profile/title extensions.

## Product traceability

- Primary: `ENG-R01`, `ENG-R02`, `ENG-R03`, `ENG-R04`, `ENG-R05`, `ENG-R06`.
- Supports: `IDP-R03`, `IDP-R05`, `GQL-R01`, `GQL-R03`, `GQL-R05`, `OPS-R03`, `QLT-R01`, `QLT-R04`.

## Prerequisites

- Phase 07 playback sessions exist.
- Profile ownership and Catalog title entities are stable.
- Phase 01 broker connectivity is available, and Identity and Catalog produce durable outbox rows without requiring earlier relay activation.

## Deliverables

- Engagement subgraph
- progress aggregate with sequence and idempotency
- watchlist
- viewing history
- continue-watching projection
- Federation extensions for `Title` and `Profile`
- outbox and broker delivery
- client integration with player

## Requirements

### P08-R01

Record progress only for a profile owned by the authenticated account and a valid playback context.
### P08-R02

Require idempotency key, playback session, sequence, position, and observed duration.
### P08-R03

Return the previously accepted result for a duplicate idempotency key.
### P08-R04

Reject stale sequence without moving progress backward.
### P08-R05

Apply opening and completion thresholds through tested domain policy.
### P08-R06

Create bounded keyset-paginated history and continue-watching reads.
### P08-R07

Add and remove watchlist entries idempotently and hide retired titles from normal reads.
### P08-R08

Extend federated `Title` and `Profile` with request-scoped batched engagement fields.
### P08-R09

Write progress state and versioned outbox event in one transaction; publish at least once.
### P08-R10

Make consumers idempotent and prove duplicate-event behavior.
### P08-R11

Integrate player reports with bounded frequency, unload-safe behavior, and honest save status.
### P08-R12

Define profile-deletion cleanup and projection rebuild.

## Invariants

- Progress never moves backward due to stale delivery.
- Acknowledged progress is durable.
- One profile cannot read or mutate another account's engagement.
- Duplicate requests and events do not duplicate effects.
- Continue-watching can be rebuilt from authoritative engagement state.

## Implementation sequence

1. Model progress and watchlist invariants.
2. Create schema, migrations, and repositories.
3. Implement application use cases.
4. Add subgraph and Federation entity extensions.
5. Activate the broker relay, publish contract-compatible outbox records, and establish idempotent consumer behavior.
6. Integrate player reporting.
7. Build continue-watching.
8. Exercise duplicates, reordering, and profile deletion.

## Required tests

- Concurrent and reordered progress updates.
- Duplicate idempotency key with same and conflicting payload.
- Completion threshold edges.
- Cross-account authorization.
- Watchlist duplicate mutations.
- DataLoader query-count test.
- Duplicate and out-of-order event delivery.
- Projection rebuild.
- Browser resume journey.

## Required evidence

Store the phase evidence index under `evidence/phase-08/` when implementation begins.

- concurrency test output
- database constraint and query plan
- event envelope and duplicate-consumer test
- Federation query plan
- before/after N+1 query count
- end-to-end resume recording

Every measured result must identify commit, environment, exact command, workload, raw artifact, interpretation, and limitations.

## Non-goals

- Personalized recommendation model
- Cross-device real-time synchronization
- Offline progress queue beyond documented browser retry
- Social activity

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

- Idempotency
- Monotonic ordering
- Transactional outbox
- Federation entity resolution
- Request-scoped DataLoader

## Agent constraints

- Load `skills/agent.md` and every skill related to this phase.
- Do not implement later-phase capabilities to hide an incomplete requirement.
- Do not add placeholder services, dashboards, events, or metrics.
- Use requirement IDs in the active change plan.
- Stop and write an ADR when a fixed architecture decision must change.
