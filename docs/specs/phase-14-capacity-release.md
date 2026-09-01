# Phase 14 — Reference Quality, Capacity Validation, and Hosted Release

## Objective

First make the implemented system easy to navigate, study and verify locally.
Keep representative capacity validation and hosted release as a separate,
explicitly activated track that proves recovery and operability before any
production claim.

## Product traceability

- Primary: `OPS-R06`, `QLT-R01`, `QLT-R02`, `QLT-R03`, `QLT-R04`.
- Supports: `MED-R06`, `OPS-R04`, `OPS-R05`.

## Prerequisites

- Phases 00–13 are verified.
- At least one title is fully rights-approved and published.

The reference implementation track requires no hosted provider. The hosted
track additionally requires recorded provider decisions and explicit owner
authorization for credentials and resource creation.

## Activation state

- **Active:** P14-R13–R18, the local reference implementation track.
- **Planned and deferred:** P14-R01–R12, the hosted capacity and release track.

Completing the reference track does not satisfy or waive a hosted requirement.

## Reference implementation deliverables

- truthful public status and reading entry point
- capability-to-code/test/evidence/operations index
- readability rules and a bounded findings inventory
- behavior-preserving owner-scoped refactoring
- rationale-focused comments and executable examples
- fresh-checkout and Docker reference acceptance

## Hosted capacity and release deliverables

- hosted single-region environment
- CI/CD and controlled schema delivery
- capacity model with measured results
- load, soak, spike, and failure tests
- Node event-loop, stream, worker, and memory evidence
- backups and verified restore
- release and rollback evidence
- operational readiness review

## Requirements

### Reference implementation track — active

### P14-R13

Record the reference-first delivery decision, Phase13 exact release evidence,
the distinction between reference and hosted release, and an ordered work queue
that can progress without credentials or paid resources.

### P14-R14

Publish a capability index covering the five bounded contexts and cross-cutting
Web, Router, media, resilience, observability and repository workflows. Every
entry links the owning requirement, representative implementation path, focused
adverse test, evidence and operational guidance when applicable.

### P14-R15

Define executable or reviewable readability guardrails and record a bounded,
prioritized inventory of concrete naming, flow, organization, comment and
example problems. The inventory identifies affected ownership and behavior;
it does not use arbitrary style scores or require bulk rewriting.

### P14-R16

Refactor at least one representative vertical slice in each bounded context and
the cross-cutting Router/Web/tooling surface. Each slice improves domain naming
or control-flow readability, preserves contracts and failure behavior, and
passes characterization plus affected-scope gates.

### P14-R17

Provide reading paths and executable examples for core journeys: public browse,
rights-safe publication, playback, profile progress, Discovery degradation,
GraphQL admission, dependency recovery and telemetry-led diagnosis. Comments
explain rationale, invariants, unusual failure behavior or external constraints
rather than restating code.

### P14-R18

From a fresh checkout, prove that a reader can install the pinned toolchain,
locate a capability, run its focused test, start the documented Docker reference
checkpoint and follow its evidence and cleanup path. Publish reference-release
notes with verified capabilities, limitations and deferred hosted work.

### Hosted capacity and release track — planned and deferred

### P14-R01

Record hosted compute, PostgreSQL, Redis, broker, object-storage, CDN, telemetry, identity, secret-management, and GraphQL schema-registry/control-plane decisions.
### P14-R02

Deploy through reviewed CI/CD with environment protection, immutable artifacts, migrations, smoke tests, and rollback.

Before distributing binary images, verify the exact artifact SBOM and third-party notices, corresponding-source access for LGPL/GPL components (including native bundle patches/build inputs), and replacement/relinking or installation instructions where required. Retain the source paths beside the published artifact and verify their availability; do not treat a historical URL or invented source offer as compliance evidence. [ADR-0020](../adr/0020-web-transitive-licenses.md) records the Web boundary.
### P14-R03

Run representative operation-mix load tests with functional assertions, warmup, duration, and saturation telemetry.
### P14-R04

Run playback-start, progress-write, home, search, and catalog tests at documented target and burst load.
### P14-R05

Run soak tests long enough to identify memory, connection, queue, cache, and lag instability.
### P14-R06

Demonstrate CPU-bound event-loop impact and the selected offload or avoidance strategy with evidence.
### P14-R07

Demonstrate streaming/backpressure behavior for a large export or media transfer without full buffering.
### P14-R08

Capture heap or allocation evidence for an intentional memory-retention experiment and its correction.
### P14-R09

Verify database backup restore, projection rebuild, outbox drain, and media publication rollback.
### P14-R10

Run release game days for Redis loss, Discovery outage, broker outage, database pressure, and bad deployment.
### P14-R11

Confirm SLOs, alerts, runbooks, on-call ownership, retention, and security controls.

Before hosted media ingestion, replace Phase 06's intentional local immutable-object retention with an explicit storage budget and tested lifecycle policy. Any garbage collector must fence concurrent writers, protect current/recoverable publication and candidate references, honor a grace period and record deletion audit. Age or absence of an active Catalog pointer alone must never authorize deletion; see [ADR-0026](../adr/0026-local-media-publication.md#local-retention-boundary-phase-06-closeout).
### P14-R12

Publish release notes that state verified capabilities, known limits, capacity assumptions, and deferred work accurately.

## Invariants

- Load tests validate correctness as well as throughput.
- Media bandwidth is served by CDN, not application compute.
- Release rollback remains data-compatible.
- Backups are not considered valid until restored.
- Capacity results are labeled by environment and assumptions.

## Implementation sequence

### Active reference sequence

1. Record the reference-first decision and Phase13 release.
2. Build the capability index and reading paths.
3. Establish readability guardrails and the findings inventory.
4. Refactor small owner-scoped slices with characterization tests.
5. Align rationale comments, examples and handbook guidance.
6. Run fresh-checkout and Docker reference acceptance.
7. Publish reference-release evidence and limitations.

### Deferred hosted sequence

1. Resolve hosted ADRs.
2. Provision staging and production safely.
3. Establish baseline and dataset.
4. Run functional smoke and load tests.
5. Investigate bottlenecks before tuning.
6. Run soak and Node runtime experiments.
7. Verify restore and rollback.
8. Run game days.
9. Complete readiness review and release.
10. Update current and scale-out architecture from evidence.

## Required tests

Reference-track acceptance includes:

- documentation link and status-claim validation;
- capability-index completeness checks;
- characterization and affected-scope gates for every refactoring slice;
- executable example checks;
- fresh-checkout source gates;
- Docker reference startup, journey and project-scoped cleanup.

Hosted-track acceptance additionally includes:

- Load, spike, and soak operation mixes.
- CDN path and origin protection.
- Event-loop blocking and recovery.
- Streaming memory profile.
- Memory-retention diagnosis.
- Backup restore.
- Projection rebuild and event replay.
- Deployment rollback.
- Dependency game days.
- Post-release smoke and SLO verification.

## Required evidence

Store the phase evidence index under `evidence/phase-14/` when implementation begins.

Reference evidence includes:

- roadmap and decision acceptance;
- capability-index coverage;
- readability inventory and slice reports;
- characterization and affected-gate results;
- fresh-checkout and Docker reference acceptance.

Hosted evidence additionally includes:

- provider ADRs
- deployment records
- load-test raw output
- latency/error/saturation report
- event-loop report
- stream backpressure report
- heap evidence
- restore report
- game-day reports
- release readiness checklist

Every measured result must identify commit, environment, exact command, workload, raw artifact, interpretation, and limitations.

## Non-goals

- Multi-region active-active writes
- Global extreme-scale claims
- Paid subscriptions
- Live broadcasting
- Native applications

## Exit gates

The reference track is `VERIFIED` only when P14-R13–R18 and their linked local
evidence pass. This may be reported as **reference track released** while the
hosted track remains planned.

The hosted track, and therefore the complete hosted product release, is
`VERIFIED` only when:

- every requirement has a linked implementation or documented non-applicability;
- all required tests pass from a clean environment;
- evidence is stored and reviewed;
- security, accessibility, failure, and operational effects are documented;
- no planned behavior is described as implemented;
- `.ai/CURRENT_STATE.md`, `.ai/WORK_QUEUE.md`, `.ai/SESSION_LOG.md`, and `.ai/HANDOFF.md` are current;
- the next phase prerequisites are explicitly checked.

## Learning outcomes

- Codebase navigation and explanation
- Behavior-preserving refactoring
- Documentation as a maintained engineering contract
- Capacity planning
- Load and soak testing
- Node runtime diagnostics
- Release engineering
- Backup and recovery
- Evidence-based architecture evolution

## Agent constraints

- Load `skills/agent.md` and every skill related to this phase.
- Do not implement later-phase capabilities to hide an incomplete requirement.
- Do not add placeholder services, dashboards, events, or metrics.
- Use requirement IDs in the active change plan.
- Stop and write an ADR when a fixed architecture decision must change.
