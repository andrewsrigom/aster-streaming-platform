# Phase 12 Evidence Index

Status: P12-R01/R02/R08/R09 are released from source `03abe8a`, evidence head
`9a058ee`, protected run `33300561121`, clean exact-head confirmation, PR45
squash main `ce66f9c` and successful exact-main run `33301425220`. The released
path exports the one-shot media coordinator and scopes real Catalog event
production without fabricating broker work.

## Requirement traceability

| Requirement | Current evidence |
| --- | --- |
| P12-R01 | [Trace contract](trace-contract.txt) and [continuity](trace-continuity.txt) cover server, owner HTTP, database/Redis/broker/object-storage adapters, async events and the media-worker coordinator |
| P12-R02 | [Continuity](trace-continuity.txt) proves active request/dependency context reaches structured logs |
| P12-R03 | [Golden signals](golden-signals.txt) and [cardinality budget](metric-cardinality.txt) cover Node memory, pools, event delivery and current saturation sources |
| P12-R04 | [Backend product signals](product-signals.txt) cover playback-session, progress, cache and media outcomes while preserving the P12-R11 browser boundary |
| P12-R08 | [Cardinality and privacy review](cardinality-review.txt) records finite vocabularies, limits and sensitive-data canaries |
| P12-R09 | [Exporter failure](exporter-failure.txt) records bounded queue, deadline, failure and recovery behavior |

P12-R03 and the backend portion of P12-R04 are implemented locally on source
`442ecab`, tree `28d7ba7`, rebased onto exact main. The affected gate passes
73/73 tasks with 28 cached in 63.79 seconds. Local review corrected future and
excessive event ages that would otherwise have been clamped into false samples.
PR46 initial review then corrected malformed vendor pool snapshots, missing
outbox age before broker connection and insufficient media-duration buckets.
These signals remain unverified until protected CI and confirmation complete.
Formal SLIs/SLOs, dashboards, alerts, three
diagnostic exercises, browser sampling/retention and the operational overview
remain planned.

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
- No browser source changed. Browser sampling and retention remain P12-R11.
- The dependent branch is not yet published. Its current focused
  process-local/loopback evidence does not replace its future protected
  real-Collector run.
