# Phase 11 Evidence Index

Status: P11-R01 is [released](safe-read-release.txt) through reviewed evidence
head `6d709b4`, protected run `33284610557`, squash main `ebdcb18` and successful
exact-main run `33285339274`. Phase 11 as a whole remains in progress. P11-R05
passed confirmation and protected run `33289750207`, then PR42 squash-merged as
main `59600ae` with the reviewed tree; exact-main run `33290477608` passed every
required job. P11-R08/R09 evidence head `371ba55` passed protected run
`33291705269` and clean confirmation after one resolved cleanup finding. PR43
squash-merged as tree-identical main `bdbe2e0`; exact-main run `33292389504`
passed every required job and releases the private failure laboratory.

## Current work item

ADR-0040 and the dependency policy registry cover P11-R01/R02/R03/R04/R06/R11.
Playback and Discovery are the only synchronous retry owners introduced by this
work item, and only for their fixed, read-only Catalog operations.

## Requirement traceability

| Requirement | Current evidence |
| --- | --- |
| P11-R01 | [Dependency policy registry](dependency-policies.txt) covers every current operation class and retry owner |
| P11-R02 | [Retry timing](retry-timing.txt) proves parent deadline exhaustion prevents another attempt |
| P11-R03 | [Dependency policies](dependency-policies.txt) and safe-read tests limit retries to selected transient safe reads |
| P11-R04 | [Retry timing](retry-timing.txt) records bounded equal-jitter delay and total attempts |
| P11-R05 | [Circuit breakers](circuit-breakers.txt) records scoped transitions, suppression and finite telemetry |
| P11-R06 | [Bulkhead saturation](bulkhead-saturation.txt) records finite queues/admission and overflow |
| P11-R07 | [Game days](game-days.md) records explicit Discovery fallback with Catalog/Playback isolation |
| P11-R08 | [Failure injection](failure-injection.txt) covers latency, timeout, reset, error, malformed, partial, duplicate and saturation modes |
| P11-R09 | [Failure injection](failure-injection.txt) proves loopback/local-only tagging and production-source isolation |
| P11-R10 | [Game days](game-days.md) records all five named timelines and recovery |
| P11-R11 | [Retry amplification](retry-amplification.txt) proves the 1 x 1 x at-most-2 attempt path |
| P11-R12 | [Operational runbooks](../../docs/operations/RUNBOOKS.md) cover detection through follow-up for all five failures |

Required deadline, retry classification, idempotency, breaker transition,
bulkhead overflow, fallback, amplification and worker-cancellation tests are
linked by those artifacts. No requirement is marked non-applicable.

- [Dependency policies](dependency-policies.txt): exact registry coverage,
  focused runtime/telemetry checks and the complete affected candidate gate.
- [Retry timing](retry-timing.txt): deterministic budget/jitter trace plus real
  loopback HTTP 503, reset, permanent-failure and timeout behavior.
- [Safe-read release](safe-read-release.txt): exact review, protected CI,
  tree-identical squash merge and exact-main proof.
- [Circuit breakers](circuit-breakers.txt): exact local candidate, focused and
  affected gates, deterministic transition/call suppression and current limits.
- [Failure injection](failure-injection.txt): private scenario matrix,
  production-isolation contract and focused/candidate gates.
- [Bulkhead saturation](bulkhead-saturation.txt): current-source finite
  Discovery, Catalog, PostgreSQL, Web, owner-client and media admission proof.
- [Retry amplification](retry-amplification.txt): explicit 1 x 1 x at-most-2
  Web/Router/service attempt matrix and regression checks.
- [Game days](game-days.md): Discovery, Redis, broker, database and media-worker
  timelines, source applicability, recovery and exact cleanup.

Breaker metrics, behavior and the tools-only failure laboratory are released.
The five game days, saturation,
fallback/no-amplification proof and complete operator procedures are implemented
on the dependent candidate. Candidate/protected gates and release remain.
