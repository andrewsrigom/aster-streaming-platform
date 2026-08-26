# Phase 04 — Federated Supergraph

## Objective

Compose existing context schemas behind Apollo Router and establish the contracts, controls, and delivery workflow for all future subgraphs.

## Product traceability

- Primary: `GQL-R01`, `GQL-R02`.
- Supports: `GQL-R03`, `GQL-R04`, `OPS-R02`, `OPS-R03`, `QLT-R01`, `QLT-R04`.
- Phase 13 performs final hosted-operation, cost, N+1, and authorization acceptance.

## Prerequisites

- Phases 02 and 03 provide independently testable subgraph schemas.

## Deliverables

- Apollo Router local deployment
- Federation v2 schema conventions
- Identity and Catalog subgraph composition
- trusted identity propagation
- query-plan and subgraph telemetry
- schema compatibility checks
- GraphQL error and pagination conventions

## Requirements

### P04-R01

Annotate subgraphs for Federation v2 and compose them into one versioned supergraph artifact.
### P04-R02

Expose only Apollo Router as the public GraphQL entry point in the local topology.
### P04-R03

Propagate trusted identity context from the approved edge path and reject untrusted identity headers.
### P04-R04

Define stable scalar, error, pagination, nullability, and deprecation conventions.
### P04-R05

Create schema CI that detects composition failures and incompatible known operations.
### P04-R06

Instrument router and subgraph fetches with operation name, duration, outcome, and bounded attributes.
### P04-R07

Set initial body, timeout, and concurrency safety limits even before advanced Phase 13 controls.
### P04-R08

Document field and entity ownership for every schema contribution.
### P04-R09

Verify partial-error behavior and nullability for one subgraph failure scenario.
### P04-R10

Provide local schema-inspection and supergraph-update commands without manual hidden steps.

## Invariants

- Clients do not call subgraphs directly.
- Router identity context cannot be forged through a public header.
- Schema ownership is unambiguous.
- Subgraph internal errors are sanitized at the public boundary.
- Composition artifacts are reproducible.

## Implementation sequence

1. Define GraphQL conventions.
2. Adopt Federation v2 in Identity and Catalog.
3. Compose locally.
4. Configure Router and identity propagation.
5. Add schema and operation checks.
6. Add telemetry.
7. Exercise partial failure and record query plans.

## Required tests

- Successful composition from a clean checkout.
- Intentional ownership conflict fails.
- Public direct subgraph access is unavailable in target topology.
- Forged identity header is ignored or rejected.
- Subgraph timeout produces designed GraphQL behavior.
- Known operation compatibility check.

## Required evidence

Store the phase evidence index under `evidence/phase-04/` when implementation begins.

- supergraph schema artifact
- representative query plan
- router trace
- composition-failure fixture
- identity-propagation test
- partial-failure result

Every measured result must identify commit, environment, exact command, workload, raw artifact, interpretation, and limitations.

## Non-goals

- All five subgraphs
- Advanced operation cost control
- Web application
- Redis caching
- Recommendations

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

- Federation v2 composition
- Entity and field ownership
- Router execution plans
- GraphQL partial failure

## Agent constraints

- Load `skills/agent.md` and every skill related to this phase.
- Do not implement later-phase capabilities to hide an incomplete requirement.
- Do not add placeholder services, dashboards, events, or metrics.
- Use requirement IDs in the active change plan.
- Stop and write an ADR when a fixed architecture decision must change.
