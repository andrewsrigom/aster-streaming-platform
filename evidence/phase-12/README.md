# Phase 12 Evidence Index

Status: P12-R01/R02/R08/R09 are implemented at rebased source commit `2cd63a3`,
tree `b2bb86b`, on the unpublished dependent branch. They are not verified or
released: hosted real Collector execution and protected review/CI must pass.
The final local affected gate passes 73/73 with 57 cached in 47.814 seconds.

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

- The successful OTLP proof uses a real local HTTP receiver implementing the
  OTLP endpoint, not the pinned Collector image.
- One local `pnpm integration:telemetry` attempt stopped before resource
  creation because Docker returned no Linux engine. Cleanup reported zero
  remaining resources; the unchanged local failure will not be retried.
- The bounded fixture now requires both repository span names in the exact owned
  Collector log and rejects credential, endpoint and GraphQL-document canaries.
  Hosted PR CI remains the real Collector candidate gate.
- Existing Router/Collector evidence from Phase 11 supports the unchanged
  Router boundary, but it does not replace the pending repository-span
  Collector repeat after rebase.
- No browser source changed. Browser sampling and retention remain P12-R11.
