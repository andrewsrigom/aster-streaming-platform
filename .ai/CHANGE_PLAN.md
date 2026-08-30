# Work Item: Phase 12 platform and product golden signals

- Status: IN_PROGRESS
- Owner: Platform telemetry; PostgreSQL, event-delivery, Playback, Engagement and Catalog own their observations
- Phase: 12
- Requirement IDs: P12-R03, P12-R04
- Created: 2026-08-30
- Updated: 2026-08-30

## Outcome

Every current Node service exports enough finite, privacy-safe signals to answer
whether serving, dependencies, runtime resources, database pools, event delivery
and backend product outcomes are healthy or saturated. Playback-session creation,
progress acceptance, cache effectiveness, media processing and publication have
explicit product-result metrics. Browser first-frame and rebuffer observations
remain local and bounded until their sampling, transport and retention policy is
owned by the following P12-R11 slice; this item does not silently create a field
telemetry ingestion service.

## Current behavior

P12-R01/R02/R08/R09 released through evidence head `9a058ee`, protected run
`33300561121`, clean confirmation, PR45 squash main `ce66f9c` and successful
exact-main run `33301425220`.

Source `2270745`, tree `c98c1c1`, now implements the contract below after a
tree-identical rebase onto that exact main. Local review found that future and
older-than-seven-day event times were clamped into false edge samples; the
remediation retains the finite delivery outcome while omitting invalid age and
assigns explicit operator/projection/consumer pool roles. Telemetry19/19,
PostgreSQL30/30, event delivery24/24, focused product/consumer7/7 and
affected73/73 gates pass; the final gate reused 52 valid tasks and completed in
52.554 seconds. Evidence and architecture documentation are current locally.
Publication, protected real-Collector CI and review remain.

The shared telemetry package already exports HTTP request duration/active work,
dependency duration/active/outcomes, CPU time/utilization, RSS, uptime, Node
event-loop metrics, V8 heap metrics, cache decisions, operation admission and
circuit-breaker events. PostgreSQL exposes an in-process bounded pool snapshot,
broker adapters expose bounded in-flight snapshots, event envelopes contain a
validated occurrence time, Playback and Engagement return finite owner results,
the media coordinator already owns its worker dependency span, and the
publication CLI records bounded structured evidence. The missing contract is a
complete, named connection from those sources to pool, queue/lag, memory detail
and product-outcome metrics.

## Proposed behavior

Extend `@aster/telemetry` with one finite golden-signal vocabulary and no new
backend: detailed Node memory gauges; PostgreSQL pool-state gauges; event age,
delivery outcome and active-work gauges; and backend product outcome/duration
metrics. Record snapshots at existing adapter and owner completion boundaries.
Reuse HTTP/dependency active instruments for request and media-worker saturation,
and reuse the existing cache metrics for effectiveness. Invalid, excessive or
accessor-backed observations fail closed and cannot alter product behavior.

## Boundaries

- Owning context: Platform owns the metric contract; each owner classifies its finite product outcome.
- Affected services/packages: `@aster/telemetry`, `@aster/postgres`, `@aster/event-delivery`, Playback, Engagement, Catalog media execution/publication and current owner compositions.
- Authoritative data: none; metrics are diagnostic and never authorize or persist product state.
- Read models/caches: existing cache observations only; no cache behavior changes.
- Trust boundaries: process/runtime readings, pool/vendor counters, signed event envelopes, GraphQL owner results, media subprocess results and OTLP export.
- External dependencies: existing OpenTelemetry SDK/Collector and current adapters only.

## Invariants

- Domain and application layers do not import telemetry SDKs.
- Metric labels are finite enums and never contain account, profile, title, event, request, trace, publication or media identifiers.
- Event time is an untrusted numeric observation: invalid, future or excessive age is rejected, not exported as an arbitrary value.
- Metrics never change an owner result, retry, acknowledgement, readiness or shutdown decision.
- PostgreSQL and broker snapshots are bounded to configured capacity and expose no endpoint, SQL, group, topic or credential.
- Browser QoE is not remotely collected before the P12-R11 policy and acceptance gate.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Runtime or vendor snapshot throws | serving continues with no fabricated sample | one bounded dropped-observation reason |
| Pool/vendor count is malformed or exceeds policy | reject the whole sample | finite invalid-dimension drop |
| Event timestamp is invalid, future or outside the retained window | event business handling follows owner rules | no age sample; finite rejection only |
| Product recorder rejects or throws | preserve the already-decided owner result | finite dropped-observation reason |
| Exporter is absent, slow or failed | product and lifecycle behavior remain as P12-R09 | existing bounded exporter health |
| Dependent predecessor changes | stop publication, rebase onto corrected predecessor and repeat affected gates | record superseded source honestly |

## Data and contracts

- Schema/migration: none.
- GraphQL: no schema or response change.
- Events: no envelope or delivery-guarantee change; only validated occurrence time is observed.
- Cache: no key, TTL, authority or degraded-mode change.
- Compatibility: additive repository telemetry methods and metric names; existing optional recorder seams remain valid.
- Retention/deletion: no local time-series retention change; browser sampling/retention remains P12-R11.

## Security and privacy

- Authorization: telemetry never grants authority and records only an outcome after current owner checks.
- Input limits: finite enums, non-negative safe counts, bounded durations/ages and fixed maximum metric series.
- Sensitive data: automated canaries reject identifiers, URLs, SQL, GraphQL documents, credentials and vendor errors.
- Abuse cases: forged event clocks, extreme pool counters, hostile recorder objects, metric-cardinality amplification and exporter backpressure.

## Implementation steps

1. Freeze the metric names, finite dimensions, numeric limits and series budget with contract tests.
2. Complete Node memory detail and PostgreSQL pool observations without retaining vendor objects after close.
3. Add bounded event delivery age/outcome/active observations at current relay and consumer boundaries.
4. Record Playback session, Engagement progress, media processing/publication outcomes and reuse the existing cache contract.
5. Prove service composition, telemetry failure isolation, cardinality/privacy and Collector export.
6. Update observability architecture, signal catalog, evidence and repository memory.

## Tests

- Domain: unchanged; owner results remain the source classification.
- Application: product wrappers map every finite result without altering it.
- Integration: real Collector receives the new finite names from representative Playback/Engagement/Catalog paths.
- Contract: memory, pool, event and product input validation, finite labels, units and series ceilings.
- Browser: carry forward local first-frame/rebuffer behavior only when source comparison proves it unchanged; no remote collection claim.
- Performance/failure: snapshot/recorder exceptions and stopped exporter remain bounded; no capacity claim without a later load experiment.

## Evidence

- Commands: focused telemetry/PostgreSQL/event/owner suites, representative Collector fixture and complete affected gate.
- Raw artifact path: `evidence/phase-12/golden-signals.txt`, `product-signals.txt`, `metric-cardinality.txt` and updated index.
- Acceptance result: every P12-R03 source and backend P12-R04 outcome maps to an implemented finite signal or an explicit next-slice boundary.
- Iteration gate: focused changed-package build/tests, lint and metric-contract privacy checks.
- Candidate gate: `pnpm check:changed` plus one disposable Collector representative export and documentation/AI checks.
- Heavyweight repeat triggers: metric/export composition changes repeat only the representative Collector path; browser/media pipelines repeat only if their source or contract changes.
- Review stopping rule: one initial review and one confirmation; only requirement, privacy/security, boundedness, availability, evidence-integrity or public-contract blockers extend it.

## Rollback or recovery

Remove the additive recorders and registrations while retaining P12-R01 traces
and existing metrics. No database, event, cache, media object or public API needs
migration. If the predecessor changes, rebase this unpublished branch and rerun
only gates affected by the changed source.

## Documentation updates

- Observability architecture and finite signal catalog.
- Phase 12 evidence index and signal artifacts.
- Repository state, queue, session log and handoff.

## Completion checklist

- [ ] Requirements satisfied
- [x] Tests pass
- [x] Evidence captured
- [x] Documentation current
- [x] `.ai/` state updated
- [x] Remaining risks recorded
