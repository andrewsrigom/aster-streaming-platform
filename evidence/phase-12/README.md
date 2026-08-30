# Phase 12 Evidence Index

Status: P12-R01/R02/R08/R09 are corrected at source commit `a2015d9`, tree
`51aaa29`, on PR45. Corrected protected run `33297684108` passed every required
job, including the formerly failing Local platform job. Confirmation review
then found two remaining operational boundaries: the one-shot media coordinator
discarded its spans and Discovery Catalog consumption did not scope durable work
or preserve an optional validated producer link. The source now configures the
bounded OTLP exporter and final flush for the coordinator, and runs Discovery
handling/logging inside the linked consumer observation. Event delivery passes
23/23, the focused Discovery handler passes 3/3, and the affected gate passes
73/73 with 44 cached in 54.527 seconds. A new exact-head protected run and the
single blocker-focused confirmation remain before verification or release.

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

- Focused OTLP tests use a real local HTTP receiver; PR45 runs `33297164589` and
  `33297684108` passed the pinned real-Collector telemetry scenario at earlier
  evidence heads.
- One local `pnpm integration:telemetry` attempt stopped before resource
  creation because Docker returned no Linux engine. Cleanup reported zero
  remaining resources; the unchanged local failure will not be retried.
- The bounded fixture now requires both repository span names in the exact owned
  Collector log and rejects credential, endpoint and GraphQL-document canaries.
  The latest exact-head PR CI remains the candidate gate.
- Existing Router/Collector evidence from Phase 11 supports the unchanged
  Router boundary, but it does not replace the pending repository-span
  Collector repeat after rebase.
- No browser source changed. Browser sampling and retention remain P12-R11.
