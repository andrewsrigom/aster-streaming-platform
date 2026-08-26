# Phase 01 — Local Platform and Runtime Skeleton

## Objective

Provide a reproducible local environment and one production-ready Node.js service skeleton that later services can adopt without copying hidden behavior.

## Product traceability

- Primary: `OPS-R01`.
- Supports: `OPS-R02`, `OPS-R03`, `QLT-R01`, `QLT-R04`.

## Prerequisites

- Phase 00 is verified.
- Supported container runtime and FFmpeg prerequisites are documented.

## Deliverables

- containerized PostgreSQL, Redis, Kafka-compatible broker, S3-compatible storage, and observability stack
- validated configuration package
- runtime package for logging, telemetry, health, shutdown, deadlines, and error handling
- HTTP adapter ADR and reference Express integration when compatibility evidence confirms the preferred candidate
- identity service skeleton as the first reusable runtime
- database, Redis, broker, and storage connectivity smoke tests
- local reset, seed, health, and diagnostics commands
- Docker-only runtime demonstration entrypoint and resource-aware dependency profiles

## Requirements

### P01-R01

Provide one Docker-only command to start the verified Phase 01 slice from empty local state with versioned dependencies, health checks, one-shot initialization, persistent volumes, no hosted credentials, and a diagnosable application URL or status output.
### P01-R02

Provide one destructive reset command that is explicit, scoped to local resources, and safe from accidental hosted execution.
### P01-R03

Validate environment configuration at process start and distinguish secret from non-secret values.
### P01-R04

Implement structured logging with redaction and trace correlation.
### P01-R05

Implement liveness, readiness, startup, and graceful-shutdown behavior with bounded drain time.
### P01-R06

Expose event-loop delay, memory, process CPU, request, and dependency metrics from the reference runtime.
### P01-R07

Create reusable adapters for PostgreSQL, Redis, broker, object storage, clock, IDs, and telemetry without domain logic.
### P01-R08

Use connection, operation, and startup deadlines; a missing dependency must fail readiness with a diagnosable reason.
### P01-R09

Create integration smoke tests against real local dependencies.
### P01-R10

Document troubleshooting for ports, volumes, architecture differences, FFmpeg, and container resources. Provide named profiles or targeted commands so an active phase does not require every resource-heavy dependency and diagnostic backend.
### P01-R11

Select the service HTTP adapter through an ADR. Evaluate Express 5 with the maintained Apollo Server integration as the preferred candidate, keep framework types inside transport adapters, and verify middleware ordering, input limits, async error handling, cancellation, and graceful shutdown.

## Invariants

- Application startup either becomes ready or fails clearly; it does not hang indefinitely.
- Health endpoints do not expose secrets or detailed internal topology publicly.
- Telemetry export failure cannot block shutdown beyond its deadline.
- Reusable runtime packages contain no Identity domain rules.

## Implementation sequence

1. Define local dependency versions and resource limits.
2. Create configuration schemas and startup diagnostics.
3. Record the HTTP adapter ADR and create the transport boundary.
4. Create telemetry and logging baseline.
5. Create lifecycle and health behavior.
6. Create dependency adapters and smoke tests.
7. Apply the runtime to the Identity service skeleton.
8. Capture normal startup, dependency failure, and shutdown evidence.

## Required tests

- Start all dependencies from an empty local state.
- Start the Phase 01 demonstration from a clean checkout using only Git, the supported container runtime with Compose, and documented environment defaults.
- Stop PostgreSQL and verify readiness failure.
- Stop Redis and verify classified dependency telemetry.
- Send termination during in-flight work and verify bounded drain.
- Verify log redaction with representative secret fields.
- Verify no high-cardinality IDs appear in metric labels.
- Verify HTTP middleware ordering, body limits, async error translation, client cancellation, and bounded drain.

## Required evidence

Store the phase evidence index under `evidence/phase-01/` when implementation begins.

- local platform health output
- startup and shutdown trace
- readiness transition
- metric scrape sample
- redaction test output
- resource usage at idle
- Docker-only clean-start duration, image and volume footprint, and resource-profile behavior
- HTTP adapter ADR and middleware/lifecycle test output

Every measured result must identify commit, environment, exact command, workload, raw artifact, interpretation, and limitations.

## Non-goals

- Identity product behavior
- GraphQL Federation
- Media transcoding
- Hosted infrastructure
- Complete dashboards or SLOs
- Express or other HTTP framework types outside transport and runtime adapters

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

- Node process lifecycle
- Configuration validation
- Dependency readiness
- OpenTelemetry foundations
- Express middleware, error, and lifecycle behavior
- Local infrastructure reproducibility

## Agent constraints

- Load `skills/agent.md` and every skill related to this phase.
- Do not implement later-phase capabilities to hide an incomplete requirement.
- Do not add placeholder services, dashboards, events, or metrics.
- Use requirement IDs in the active change plan.
- Stop and write an ADR when a fixed architecture decision must change.
