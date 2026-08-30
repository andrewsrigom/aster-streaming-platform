# Phase 11 Evidence Index

Status: P11-R01 is [released](safe-read-release.txt) through reviewed evidence
head `6d709b4`, protected run `33284610557`, squash main `ebdcb18` and successful
exact-main run `33285339274`. Phase 11 as a whole remains in progress. P11-R05
is verified locally at source `d039748`, with review, protected CI and release
pending.

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

Breaker metrics are verified in the local P11-R05 candidate but are not yet
released. Saturation reports, controlled game-day timelines and updated
operational runbooks remain planned later Phase 11 work.
