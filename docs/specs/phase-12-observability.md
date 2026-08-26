# Phase 12 — Observability, SLIs, and SLOs

## Objective

Make critical user journeys measurable end to end and connect actionable alerts to verified operational response.

## Product traceability

- Primary: `OPS-R03`, `OPS-R04`, `OPS-R05`.
- Supports: `PBK-R05`, `QLT-R02`, `QLT-R04`.

## Prerequisites

- Critical paths and resilience behavior exist.
- Local telemetry stack is stable.

## Deliverables

- consistent semantic telemetry
- end-to-end traces
- service and product dashboards
- formal SLI definitions
- initial SLOs and error budgets
- burn-rate alerts
- alert-linked runbooks
- telemetry privacy and cardinality review

## Requirements

### P12-R01

Trace browser/server, router, subgraph, database, Redis, event, object-storage, and media-worker boundaries where applicable.
### P12-R02

Correlate structured logs with traces and stable operation context.
### P12-R03

Expose golden signals and Node event-loop, memory, CPU, pool, lag, queue, and worker saturation.
### P12-R04

Measure playback-session success, first-frame success, rebuffering, progress acceptance, cache effectiveness, and media publication.
### P12-R05

Define SLI population, good event, exclusions, source, aggregation, owner, and window.
### P12-R06

Define initial SLOs for supergraph, catalog read, playback start, and progress write.
### P12-R07

Implement multi-window burn-rate or equivalent alerts that link to runbooks.
### P12-R08

Remove high-cardinality and sensitive telemetry fields; add automated regression checks where possible.
### P12-R09

Verify telemetry exporter failure is bounded and does not block critical serving.
### P12-R10

Use traces and metrics to diagnose at least three injected failures without source-code guessing.
### P12-R11

Document sampling and retention for browser and playback telemetry.
### P12-R12

Create an operational overview that distinguishes user impact, dependency health, and saturation.

## Invariants

- Metrics do not label by user, profile, title, request, or trace ID.
- Telemetry contains no credentials or signed media URLs.
- Alerts are actionable and owned.
- SLOs measure user outcomes rather than process uptime alone.
- Exporter failure is visible but bounded.

## Implementation sequence

1. Standardize names and attributes.
2. Complete distributed tracing.
3. Complete metrics and structured logs.
4. Define SLIs and SLOs.
5. Build dashboards.
6. Build alerts and connect runbooks.
7. Run diagnostic exercises.
8. Review privacy, sampling, retention, and cost.

## Required tests

- Trace continuity through router and subgraphs.
- Async event trace/causation link.
- Log redaction.
- Metric cardinality budget.
- Exporter outage.
- SLO query correctness with synthetic good and bad events.
- Alert firing and recovery.
- Runbook navigation.

## Required evidence

Store the phase evidence index under `evidence/phase-12/` when implementation begins.

- trace examples
- dashboard exports
- SLI query definitions
- SLO and error-budget report
- alert test
- cardinality review
- failure-diagnosis notes

Every measured result must identify commit, environment, exact command, workload, raw artifact, interpretation, and limitations.

## Non-goals

- Collecting every browser event
- Storing full GraphQL documents
- Alerting on every exception
- Unowned dashboards

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

- Distributed tracing
- Metric design
- SLIs and SLOs
- Error budgets
- Actionable alerting
- Telemetry privacy

## Agent constraints

- Load `skills/agent.md` and every skill related to this phase.
- Do not implement later-phase capabilities to hide an incomplete requirement.
- Do not add placeholder services, dashboards, events, or metrics.
- Use requirement IDs in the active change plan.
- Stop and write an ADR when a fixed architecture decision must change.
