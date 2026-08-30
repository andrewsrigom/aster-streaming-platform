# Phase 12 Evidence Index

Status: P12-R01/R02/R08/R09 are released from source `03abe8a`, evidence head
`9a058ee`, protected run `33300561121`, clean exact-head confirmation, PR45
squash main `ce66f9c` and successful exact-main run `33301425220`. The released
path exports the one-shot media coordinator and scopes real Catalog event
production without fabricating broker work.

P12-R03 and the backend portion of P12-R04 are released from exact head
`95e3a73`, tree `c0eb46a`, protected run `33303267611`, clean confirmation, PR46
squash main `2245251` and successful exact-main run `33304196111`.

P12-R04/R11 browser QoE exact head `74780e5`, tree `412cc4c`, passed protected
run `33305864184` and clean confirmation. PR47 squash main `6dba10e` has the
same tree; exact-main run `33307059156` passed every job. P12-R05/R06 final head
`72d5656`, tree `2374279`, passed protected run `33313090638` attempt2 and clean
confirmation. PR48 squash main `a99d3d5` retained that tree; exact-main run
`33314309449` passed every job. P12-R12 evidence head `ba3de93`, tree `73ee596`,
passed protected run `33318672382` and clean confirmation. PR49 squash main
`c297d32` retained the reviewed tree; valid exact-main run `33319514232` passed
every required job. P12-R07 corrected source `8185a81`, evidence head `4b6db71`,
protected run `33324696622`, clean confirmation, PR50 squash main `633e819` and
exact-main run `33325544350` release the finite burn-rate alerts. P12-R10 is the
only active Phase 12 item. Its diagnostic profile and runner are implemented in
the current worktree. Protected run `33331974187` passed Catalog diagnosis,
PostgreSQL recovery and clean teardown, then failed on premature V1 trace
retrieval before Redis. Run `33332980729` proved the exact PostgreSQL TraceQL
match, recovery and teardown but showed that its subsequent V2 result remained
incomplete. Run `33333896159` passed Catalog and exact cleanup but showed that
prefiltering PostgreSQL by failure outcome was too restrictive. The corrected
dependency-first run `33334497056` returned the selected PostgreSQL dependency
but exposed a missing intrinsic-error-status fallback in classification. The
finite dependency-failure run `33335112383` then stopped on an earlier selected
dependency without a failure mark. The failure-marked TraceQL path still needs
all-scenario acceptance.

## Requirement traceability

| Requirement | Current evidence |
| --- | --- |
| P12-R01 | [Trace contract](trace-contract.txt) and [continuity](trace-continuity.txt) cover server, owner HTTP, database/Redis/broker/object-storage adapters, async events and the media-worker coordinator |
| P12-R02 | [Continuity](trace-continuity.txt) proves active request/dependency context reaches structured logs |
| P12-R03 | [Golden signals](golden-signals.txt) and [cardinality budget](metric-cardinality.txt) cover Node memory, pools, event delivery and current saturation sources |
| P12-R04 | [Backend product signals](product-signals.txt) cover playback-session, progress, cache and media outcomes; [browser telemetry](browser-playback-telemetry.txt) covers local first-frame/rebuffer measurement |
| P12-R05 | [SLI query definitions](sli-query-definitions.txt) record executable population/good/exclusion semantics and pinned synthetic rule results |
| P12-R06 | [Initial SLO and error-budget report](slo-error-budget-report.md) records targets, owners, windows, budgets, activation gates and the absence of historical compliance data |
| P12-R07 | [Burn-rate alerts](slo-burn-rate-alerts.txt) record finite rapid/sustained policy, exact Prometheus firing/recovery tests, runbook navigation and current candidate limits |
| P12-R08 | [Cardinality and privacy review](cardinality-review.txt) records finite vocabularies, limits and sensitive-data canaries |
| P12-R09 | [Exporter failure](exporter-failure.txt) records bounded queue, deadline, failure and recovery behavior |
| P12-R11 | [Browser telemetry](browser-playback-telemetry.txt) records sampling, privacy, transport and retention boundaries |
| P12-R12 | [Operational overview](operational-overview.txt) records the bounded Grafana topology, immutable three-layer dashboard, adverse checks and protected/exact-main release proof |
| P12-R10 | [Failure diagnosis](failure-diagnosis.md) records the implemented bounded Tempo profile, first protected runtime finding, correction and pending three-scenario acceptance |

P12-R03's affected gate passed 73/73 tasks with 28 cached in 63.79 seconds.
Review corrected invalid event ages, malformed pool snapshots, missing outbox
age before broker connection and insufficient media-duration buckets. Protected
run `33302931164` exposed the superseded diagnostic Host bug; corrected run
`33303267611` and exact-main run `33304196111` passed the real Collector/
Prometheus assertions and every required job.

The P12-R04/R11 browser candidate samples every local attempt into one bounded
memory-only report, explicitly erases it on retry/unmount and keeps remote
sampling at zero. Recorder/adapter tests pass 19/19, Web tests pass 116/116 and
the exact affected candidate passes 14/14 in 48.518 seconds. Protected run
`33305864184`, exact-head confirmation and exact-main run `33307059156` passed.

The dependent SLI/SLO candidate defines four machine-readable objectives and
nine Prometheus recording rules. Repository checks pass 4/4, Router checks
10/10 and platform policy passes 23/23 after correcting a two-job validator
gap. Exact upstream Router 2.17.0 configuration validation passes. Prometheus
3.14.0 `promtool` accepts all nine rules and its good/bad/failure-only/excluded synthetic
workloads. Initial review discussion `3889183230` found and corrected the absent
runtime 400 ms progress bucket; telemetry19/19 and the corrected60/60 affected
gate passed. Protected run `33308328939` then passed at head `60c72a7`, but
confirmation discussion `3889248449` found the absent 300 ms Router bucket.
Source `fa4f0b8` adds the exact finite boundary, cross-validates Router thresholds
and requires live supergraph plus Catalog ratios. Router configuration and
31/31 focused checks pass. The Local platform job in protected run `33309698941`
proved that the Catalog ratio series exists, then incorrectly rejected its valid
measured value of zero. Source `ef78d11`, tree `3c21d78`, accepts finite present
ratios from zero through one and retains the separate absent-series rejection.
The accepted affected gate passes60/60 with45 cached in47.73 seconds. Protected
run `33310118280` passed every job at evidence head `aca4aba`, including both
live Router-backed ratios and the Docker-only playable demo. Discussion
`3889248449` is answered and resolved. Final confirmation and release remain.
Final confirmation discussion `3889344066` found that a failure-only population
lost its ratio when no completed series had ever existed. Source `757f6a0`, tree
`e9c7d24`, derives zero only from the same present population for all recording
and objective queries. Exact `promtool` tests prove all four failure-only ratios
and full-window queries return zero while excluded-only/no-population remains
absent;27/27 focused checks and the affected60/60 gate with50 cached in49.705
seconds pass. Invalidated run `33310999656` was cancelled. Corrected protected
run `33311729108` passed every job, but confirmation discussion `3889416115`
found idle populations could retain `0/0` as `NaN`. Source `c4e6a76`, tree
`cfc21f6`, filters recording and objective ratios on positive denominators.
Exact `promtool` tests cover prior-traffic five-minute idle and preexisting-
counter objective idle;27/27 focused checks and the corrected60/60 affected gate
with50 cached in47.383 seconds pass. Final head `72d5656`, tree `2374279`, passed
protected run `33313090638` attempt2 and clean confirmation. PR48 squash main
`a99d3d5` and exact-main run `33314309449` release the SLI/SLO work. Burn-rate
alerts are released through PR50 and exact-main run `33325544350`. Three
diagnostic exercises remain the sole Phase 12 acceptance gap.
The operational overview is released through its protected and exact-main
live-container acceptance.

## Current limitations

- Focused OTLP tests use a real local HTTP receiver; PR45 runs `33297164589` and
  `33297684108` passed the pinned real-Collector telemetry scenario at earlier
  evidence heads.
- One local `pnpm integration:telemetry` attempt stopped before resource
  creation because Docker returned no Linux engine. Cleanup reported zero
  remaining resources; the unchanged local failure will not be retried.
- The bounded fixture requires both repository span names in the exact owned
  Collector log and rejects credential, endpoint and GraphQL-document canaries.
  PR45 and exact-main CI passed that real-Collector boundary.
- Existing Router/Collector evidence from Phase 11 supports the unchanged
  Router boundary; Phase12 additionally passed its repository-span Collector
  repeat.
- Browser telemetry has no remote transport or server retention. Local/CI
  measurement cannot establish field availability or latency distributions.
- Browser telemetry is released, but still has no remote transport or
  field-retention claim.
- SLI/SLO synthetic ratios prove query behavior only. At-most-three-day local
  retention cannot prove a 28/30-day objective, and no historical compliance result is
  claimed.
- The P12-R10 source/profile checks do not substitute for real Tempo export,
  trace search, failure recovery and exact Docker cleanup. Protected run
  `33331974187` proves Catalog diagnosis, PostgreSQL recovery and clean teardown.
  Run `33332980729` additionally proves the exact PostgreSQL TraceQL match, but
  both stop before Redis because trace-by-ID completeness was required.
  Run `33333896159` proves the selected-span Catalog path and clean recovery,
  then stops at the PostgreSQL pre-selection outcome predicate.
  Run `33334497056` reaches PostgreSQL classification with the exact dependency
  but exposes the missing intrinsic-status fallback. Run `33335112383` stops on
  an earlier dependency fact without a failure mark. No three-scenario
  acceptance is claimed until the failure-marked query/poll passes.
