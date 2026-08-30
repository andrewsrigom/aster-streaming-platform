# Phase 11 Evidence Index

Status: P11-R01 is [released](safe-read-release.txt) through reviewed evidence
head `6d709b4`, protected run `33284610557`, squash main `ebdcb18` and successful
exact-main run `33285339274`. Phase 11 as a whole remains in progress. P11-R05
passed confirmation and protected run `33289750207`, then PR42 squash-merged as
main `59600ae` with the reviewed tree; exact-main run `33290477608` passed every
required job. P11-R08/R09 is frozen on PR43 at evidence head `371ba55` after one
initial review cleanup finding. Its discussion is resolved and exact-head
confirmation is clean; protected run `33291705269` and release remain.

## Current work item

ADR-0040 and the dependency policy registry cover P11-R01/R02/R03/R04/R06/R11.
Playback and Discovery are the only synchronous retry owners introduced by this
work item, and only for their fixed, read-only Catalog operations.

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

Breaker metrics and behavior are released. The tools-only failure laboratory is
implemented and its affected candidate passes. The five game days, saturation,
fallback/no-amplification proof and complete operator procedures are implemented
on the dependent candidate. Candidate/protected gates and release remain.
