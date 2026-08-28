# Phase 08 acceptance

Status: local requirements verified and PR31 merged after protected CI33217783905 and two clean reviews. Exact main33218775702 failed in the personalized browser response-body/navigation observer. A focused harness correction and successful protected/exact-main acceptance are required before the phase is released.

## Requirement audit

| Requirement | Implemented boundary | Authoritative evidence |
|---|---|---|
| P08-R01 | Fresh Identity profile ownership and title-bound Playback context before new writes | [Owner runtime](federated-runtime.txt), [revised runtime](review-federated-runtime.txt), [progress release](progress-release-checks.json) |
| P08-R02 | Exact idempotency key, session, sequence, position, duration and time validation | [Progress domain](../../services/engagement/src/domain/progress.ts), [tests](../../services/engagement/test/progress.test.ts) and [core tests](core-tests.txt) |
| P08-R03 | Profile-scoped immutable receipt; same-key replay survives newer writes/session expiry, conflicting title or payload rejects | [Real SQL correction](review-postgres.jsonl), [progress closeout](progress-release-checks.json) |
| P08-R04 | Serialized guard/aggregate writes reject stale sequence; newer intentional backwards seek is valid | [Concurrent SQL](progress-postgres.jsonl), [revised runtime](review-federated-runtime.txt) |
| P08-R05 | Validated opening/completion policy with six-second and long-title boundary tests | [Policy tests](../../services/engagement/test/progress.test.ts), [source gate](player-demo-candidate.txt) |
| P08-R06 | Bounded keyset history and current-visibility continue-watching; hidden rows filtered before lookahead | [Read acceptance](history-visibility.md), [256-row adapter regression](history-row-limit-postgres.jsonl), [release](watchlist.md) |
| P08-R07 | Durable idempotent watchlist, current visibility, removal/replay without Catalog and owner isolation | [Watchlist acceptance and release](watchlist.md) |
| P08-R08 | Request-only bounded DataLoaders for Title/Profile fields; fresh ownership and lazy visibility | [Fields acceptance/release](engagement-fields.md), [20-to-1 SQL count/query plan](engagement-fields-postgres.jsonl), [federated plans](engagement-fields-runtime-cached.jsonl) |
| P08-R09 | Atomic progress/receipt/outbox; three owner relays, fenced claim/ack, at-least-once keyed delivery | [SQL](events-postgres.txt), [runtime and protected release](events-release.txt) |
| P08-R10 | Signed Identity consumer, durable deduplication/poison handling, explicit offset commit and exact replay | [Consumer/recovery evidence](events-release.txt), [runtime observations](events-runtime.txt) |
| P08-R11 | Bounded periodic/urgent reports, identical retry, honest status, actual media resume and private library | [Browser/demo acceptance](player-demo.md), [observations](player-demo-browser.json), [candidate gate](player-demo-candidate.txt) |
| P08-R12 | Permanent profile-deletion fence, atomic owned cleanup and continue-watching reconstruction from authoritative state | [SQL deletion/reconstruction](events-postgres.txt), [signed deletion and recovery](events-release.txt) |

The evidence includes the prescribed concurrency/constraints, query plans, duplicate events, Federation plans, N+1 comparison and end-to-end resume event record plus screenshot. Earlier checkpoints labelled planned are historical; their later linked release artifacts supersede those states. Small-fixture timings are not throughput/SLO claims.

## Current limitations and recovery

No hosted deployment or retained-demo Phase08 upgrade is claimed. The retained Phase07 demo, film, database, keys and pending state remain intact. Local browser checks cover isolated Chrome, keyboard focus and automated accessibility, not complete screen-reader/cross-browser certification. Unload delivery is best effort. Private history never enters public SSR, Redux or durable browser storage.

One immutable-seed transport attempt failed and later finite diagnosis/normal replay recovered. Its cause remains unproved; fresh protected acceptance must pass without weakening the gate. No unchanged host, film, SQL or Kafka experiment is required.

Stop optional reporting/event activation or restore compatible Web/Router/owner artifacts while retaining databases, deletion guards, media and signing keys. Additive owner migrations require compatible drained runtimes; never use an empty-state down migration as a retained-data recovery path.

## Next-phase eligibility

Catalog and Web were released in Phases03–07. Engagement backend and events passed PR26–30 protected/exact-main gates; PR31 must finish the player release. Catalog v1 events and source-version conventions exist. Discovery still needs its bounded current-metadata snapshot/export, rebuild-after-retention and retirement/freshness design described in phase09; these are that phase's work, not existing capabilities.
