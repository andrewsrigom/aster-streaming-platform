# Phase 12 Evidence Index

Status: P12-R01/R02/R08/R09 are corrected at source commit `82e9a61`, tree
`a6a1081`, on PR45. First evidence head `eddbe17` passed source quality and the
real integration step in run `33297164589`, but its Local platform job exposed
an invalid optional-service overlay and initial review found two async trace
continuity defects. All three blockers are corrected together. Focused owner
tests pass 11/11, the optional-platform policy passes 23/23, daemonless Compose
rendering passes, and the corrected affected gate passes 73/73 with 51 cached in
55.776 seconds. Corrected protected CI and confirmation remain before
verification or release.

## Requirement traceability

| Requirement | Current evidence |
| --- | --- |
| P12-R01 | [Trace contract](trace-contract.txt) and [continuity](trace-continuity.txt) cover server, owner HTTP, database/Redis/broker/object-storage adapters, async events and the media-worker coordinator |
| P12-R02 | [Continuity](trace-continuity.txt) proves active request/dependency context reaches structured logs |
| P12-R08 | [Cardinality and privacy review](cardinality-review.txt) records finite vocabularies, limits and sensitive-data canaries |
| P12-R09 | [Exporter failure](exporter-failure.txt) records bounded queue, deadline, failure and recovery behavior |

Later Phase 12 requirements remain planned: product/golden-signal completion,
formal SLIs/SLOs, dashboards, alerts, three diagnostic exercises, sampling and
retention, and the operational overview.

## Current limitations

- Focused OTLP tests use a real local HTTP receiver; PR45 run `33297164589`
  additionally passed the pinned real-Collector telemetry scenario at the first
  evidence head.
- One local `pnpm integration:telemetry` attempt stopped before resource
  creation because Docker returned no Linux engine. Cleanup reported zero
  remaining resources; the unchanged local failure will not be retried.
- The bounded fixture now requires both repository span names in the exact owned
  Collector log and rejects credential, endpoint and GraphQL-document canaries.
  Corrected exact-head PR CI remains the candidate gate.
- Existing Router/Collector evidence from Phase 11 supports the unchanged
  Router boundary, but it does not replace the pending repository-span
  Collector repeat after rebase.
- No browser source changed. Browser sampling and retention remain P12-R11.
