# Phase 12 Evidence Index

Status: P12-R01/R02/R08/R09 are corrected at source commit `03abe8a`, tree
`b1474c7`, on PR45. Protected run `33298943743` passed every required job at the
previous exact head. Its blocker-focused confirmation found that the actual
base-plus-media candidate path did not pass the OTLP endpoint to the one-shot
coordinator and real Catalog publication/retirement events still lacked an
active producer context. The corrected source wires that exact media path and
uses a finite event-producer span around the real Catalog operator transaction,
without fabricating a broker dependency. Telemetry passes 18/18, Catalog
247/247, event delivery 23/23, the media runner 3/3, and the complete affected
gate 73/73 with 53 cached in 53.307 seconds. New exact-head protected CI and one
blocker-focused confirmation of these two corrections remain before
verification or release.

## Requirement traceability

| Requirement | Current evidence |
| --- | --- |
| P12-R01 | [Trace contract](trace-contract.txt) and [continuity](trace-continuity.txt) cover server, owner HTTP, database/Redis/broker/object-storage adapters, async events and the media-worker coordinator |
| P12-R02 | [Continuity](trace-continuity.txt) proves active request/dependency context reaches structured logs |
| P12-R03 | [Golden signals](golden-signals.txt) and [cardinality budget](metric-cardinality.txt) cover Node memory, pools, event delivery and current saturation sources |
| P12-R04 | [Backend product signals](product-signals.txt) cover playback-session, progress, cache and media outcomes while preserving the P12-R11 browser boundary |
| P12-R08 | [Cardinality and privacy review](cardinality-review.txt) records finite vocabularies, limits and sensitive-data canaries |
| P12-R09 | [Exporter failure](exporter-failure.txt) records bounded queue, deadline, failure and recovery behavior |

P12-R03 and the backend portion of P12-R04 are implemented locally on the sole
unpublished dependent at source `ce9ac1c`, tree `fb0717f`. The rebased affected
gate passes 73/73 tasks with 63 cached in 49.553 seconds. These signals remain unverified
until the predecessor releases, this branch rebases onto exact main, and its own
review/protected CI completes. Formal SLIs/SLOs, dashboards, alerts, three
diagnostic exercises, browser sampling/retention and the operational overview
remain planned.

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
- The dependent branch is not published and cannot merge before PR45. Its
  current focused process-local/loopback evidence does not replace its future
  protected real-Collector run.
