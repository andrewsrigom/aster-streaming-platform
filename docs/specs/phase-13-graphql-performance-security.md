# Phase 13 — GraphQL Performance and Security

## Objective

Bound GraphQL resource consumption, remove N+1 paths, protect first-party operations, and verify owner-side authorization.

## Product traceability

- Primary: `GQL-R03`, `GQL-R04`, `GQL-R05`, `GQL-R06`.
- Supports: `IDP-R03`, `IDP-R04`, `GQL-R02`, `OPS-R02`, `OPS-R03`, `QLT-R01`, `QLT-R02`, `QLT-R04`.

## Prerequisites

- All core subgraphs exist.
- Representative first-party operations and load shapes are known.
- Observability can attribute GraphQL work.

## Deliverables

- trusted-operation manifest
- operation cost model
- depth, alias, parser, body, list, timeout, concurrency, and rate controls
- request-scoped DataLoader coverage
- N+1 benchmarks
- schema and authorization security tests
- operation performance budgets

## Requirements

### P13-R01

Generate and deploy a versioned trusted-operation manifest for first-party clients.
### P13-R02

Reject unknown hosted operations according to rollout policy while preserving an explicit development workflow.
### P13-R03

Enforce request-body and parser-token limits before expensive execution.
### P13-R04

Enforce depth, alias, list, and pagination maximums.
### P13-R05

Define field weights and enforce an operation cost budget that reflects actual backend work.
### P13-R06

Enforce execution deadlines, request concurrency, and identity-aware rate limits at appropriate layers.
### P13-R07

Review every list and entity path for N+1 behavior; use request-scoped bounded DataLoader.
### P13-R08

Record database query count and latency for representative home, title, continue-watching, and search operations.
### P13-R09

Test authorization at owning services for identifier substitution, role escalation, and cross-profile access.
### P13-R10

Disable or control batching, introspection, and error detail by environment.
### P13-R11

Protect cache keys and response caching from authorization-scope confusion.
### P13-R12

Document a safe schema-change and trusted-operation rollout sequence.

## Invariants

- Unknown operation protection cannot be bypassed through alternate public paths.
- DataLoader caches do not cross requests or authorization scopes.
- Cost limits supplement rather than replace dependency bounds.
- Owner-side authorization remains authoritative.
- Public errors reveal no internal stack or topology.

## Implementation sequence

1. Inventory first-party operations.
2. Create trusted-operation build and rollout.
3. Add parser and shape limits.
4. Define and calibrate cost model.
5. Add router and subgraph execution bounds.
6. Review DataLoader and SQL behavior.
7. Run abuse and authorization tests.
8. Document schema rollout.

## Required tests

- Unknown and altered operation hashes.
- Oversized body and token-heavy document.
- Depth and alias amplification.
- Large page and nested list cost.
- Concurrent expensive operations.
- N+1 query-count fixtures.
- Cross-profile and operator escalation.
- Introspection and error policy by environment.
- Cache authorization isolation.

## Required evidence

Store the phase evidence index under `evidence/phase-13/` when implementation begins.

- trusted-operation manifest
- rejected-operation metrics
- cost calibration table
- before/after N+1 report
- database query plans
- authorization matrix
- abuse load-test output

Every measured result must identify commit, environment, exact command, workload, raw artifact, interpretation, and limitations.

## Non-goals

- Arbitrary third-party GraphQL clients in the initial hosted release
- Unlimited introspection in production
- Cost scoring without runtime bounds
- Security through obscurity

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

- GraphQL demand control
- Trusted operations
- N+1 analysis
- DataLoader
- Schema security
- Authorization testing

## Agent constraints

- Load `skills/agent.md` and every skill related to this phase.
- Do not implement later-phase capabilities to hide an incomplete requirement.
- Do not add placeholder services, dashboards, events, or metrics.
- Use requirement IDs in the active change plan.
- Stop and write an ADR when a fixed architecture decision must change.
