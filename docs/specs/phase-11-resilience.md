# Phase 11 — Resilience and Failure Laboratory

## Objective

Make synchronous and asynchronous dependency failure bounded, observable, and recoverable through explicit policies and controlled injection.

## Product traceability

- Primary: `OPS-R02`.
- Supports: `PBK-R04`, `DSC-R03`, `DSC-R05`, `OPS-R05`, `QLT-R01`, `QLT-R02`, `QLT-R04`.

## Prerequisites

- Redis behavior is verified.
- Representative critical and optional dependency paths exist.

## Deliverables

- dependency policy registry
- deadline propagation
- bounded retry policies
- circuit breakers
- bulkheads and load shedding
- safe fallbacks
- controlled failure-injection adapters
- game-day reports

## Requirements

### P11-R01

Document criticality, deadline, timeout, retry safety, attempts, backoff, breaker, bulkhead, fallback, and telemetry for each dependency operation class.
### P11-R02

Propagate an overall request deadline and prevent nested retries from exceeding it.
### P11-R03

Retry only classified transient failures and only for safe or idempotency-protected operations.
### P11-R04

Use exponential backoff with jitter and bounded attempts.
### P11-R05

Scope circuit breakers by dependency and operation class with observable state transitions.
### P11-R06

Apply finite concurrency and queue limits to expensive dependencies and background workers.
### P11-R07

Implement Catalog or editorial fallback for Discovery failure without masking critical authorization or rights failures.
### P11-R08

Add controlled latency, timeout, reset, error, malformed-response, duplicate-event, and saturation injection.
### P11-R09

Keep failure injection inaccessible from production public traffic and visibly tagged.
### P11-R10

Run documented game days for Discovery outage, Redis outage, broker delay, database saturation, and media-worker failure.
### P11-R11

Verify retry behavior does not amplify load across router, service, and client layers.
### P11-R12

Update runbooks with detection, mitigation, recovery, and verification.

## Invariants

- Overall deadlines bound all nested work.
- Retries do not repeat unsafe effects.
- Optional fallbacks never weaken authorization or rights checks.
- Queues are finite.
- Failure injection cannot be enabled accidentally in public production paths.

## Implementation sequence

1. Inventory dependencies.
2. Define policy registry.
3. Implement deadline propagation.
4. Implement timeout and retry.
5. Implement breakers and bulkheads.
6. Implement fallbacks.
7. Implement failure injection.
8. Run game days and tune from evidence.
9. Update runbooks.

## Required tests

- Deadline exhaustion before retry.
- Retry on transient and no retry on permanent failure.
- Idempotent mutation retry.
- Breaker closed/open/half-open transitions.
- Bulkhead overflow behavior.
- Fallback correctness.
- Client plus router plus service retry amplification check.
- Worker cancellation and cleanup.

## Required evidence

Store the phase evidence index under `evidence/phase-11/` when implementation begins.

- dependency policy table
- retry timing trace
- breaker state metrics
- bulkhead saturation report
- game-day timelines
- fallback response examples
- updated runbooks

Every measured result must identify commit, environment, exact command, workload, raw artifact, interpretation, and limitations.

## Non-goals

- Active-active regional failover
- Automatic repair of every incident
- Fallback for authorization
- Infinite queues or retries

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

- Deadlines and cancellation
- Retry safety
- Circuit breakers
- Bulkheads
- Load shedding
- Failure injection

## Agent constraints

- Load `skills/agent.md` and every skill related to this phase.
- Do not implement later-phase capabilities to hide an incomplete requirement.
- Do not add placeholder services, dashboards, events, or metrics.
- Use requirement IDs in the active change plan.
- Stop and write an ADR when a fixed architecture decision must change.
