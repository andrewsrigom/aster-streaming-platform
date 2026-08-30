# Phase 12 Evidence Index

Status: P12-R01/R02/R08/R09 are released from source `03abe8a`, evidence head
`9a058ee`, protected run `33300561121`, clean exact-head confirmation, PR45
squash main `ce66f9c` and successful exact-main run `33301425220`. The released
path exports the one-shot media coordinator and scopes real Catalog event
production without fabricating broker work.

P12-R03 and the backend portion of P12-R04 are released from exact head
`95e3a73`, tree `c0eb46a`, protected run `33303267611`, clean confirmation, PR46
squash main `2245251` and successful exact-main run `33304196111`.

## Requirement traceability

| Requirement | Current evidence |
| --- | --- |
| P12-R01 | [Trace contract](trace-contract.txt) and [continuity](trace-continuity.txt) cover server, owner HTTP, database/Redis/broker/object-storage adapters, async events and the media-worker coordinator |
| P12-R02 | [Continuity](trace-continuity.txt) proves active request/dependency context reaches structured logs |
| P12-R03 | [Golden signals](golden-signals.txt) and [cardinality budget](metric-cardinality.txt) cover Node memory, pools, event delivery and current saturation sources |
| P12-R04 | [Backend product signals](product-signals.txt) cover playback-session, progress, cache and media outcomes; [browser telemetry](browser-playback-telemetry.txt) covers local first-frame/rebuffer measurement |
| P12-R08 | [Cardinality and privacy review](cardinality-review.txt) records finite vocabularies, limits and sensitive-data canaries |
| P12-R09 | [Exporter failure](exporter-failure.txt) records bounded queue, deadline, failure and recovery behavior |
| P12-R11 | [Browser telemetry](browser-playback-telemetry.txt) records sampling, privacy, transport and retention boundaries |

P12-R03's affected gate passed 73/73 tasks with 28 cached in 63.79 seconds.
Review corrected invalid event ages, malformed pool snapshots, missing outbox
age before broker connection and insufficient media-duration buckets. Protected
run `33302931164` exposed the superseded diagnostic Host bug; corrected run
`33303267611` and exact-main run `33304196111` passed the real Collector/
Prometheus assertions and every required job.

The P12-R04/R11 browser candidate samples every local attempt into one bounded
memory-only report, explicitly erases it on retry/unmount and keeps remote
sampling at zero. Recorder/adapter tests pass 19/19, Web tests pass 116/116 and
the exact affected candidate passes 14/14 in 48.518 seconds. Browser/protected
acceptance remains pending. Formal SLIs/SLOs, dashboards, alerts, three
diagnostic exercises and the operational overview remain planned.

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
- The browser candidate is not yet published. Its focused evidence does not
  replace playable-browser, protected and exact-main acceptance.
