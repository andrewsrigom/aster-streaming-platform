# Handoff

## Resume point

Phases 00–10 are released. P11-R01 passed exact-head review and protected CI,
then PR41 squash-merged as main `ebdcb18b344b3f8313575b7cd158f99a77a4026b`.
Exact-main run `33285339274` passed every required job; P11-R01 is released.

P11-R05 is active on `feat/p11-circuit-breakers`, based exactly on that merge.
Initial PR42 review at `f2a0faf` found two P1 domain-accounting blockers.
Corrected source `92452d1ec64d20e87b5a15d678f525fffba67fe6` has tree
`804c9cd007619553a2c4dc8cf9042a5b18e86b4a`; candidate evidence and current
repository-memory changes form the pending evidence checkpoint.

Implemented locally:

- `@aster/runtime` owns a 64-sample bounded rolling circuit breaker with
  closed/open/half-open states, monotonic time, one probe and generation fencing.
- The fixed policy is 30-second window, four minimum samples, 50% failures and
  five-second open interval.
- Playback publication, Discovery snapshot and Discovery export have independent
  process-local instances outside retries and inside existing bulkheads.
- One complete safe read records one success/failure/ignored outcome. Local
  validation/capacity does not poison samples.
- Open/probe contention makes no Catalog HTTP call. Playback never allows a
  session; Discovery creates no snapshot or fallback authority.
- OpenTelemetry records fixed dependency/operation/state/event dimensions only.
- ADR-0041, the dependency registry, resilience/failure docs and service guides
  describe implemented behavior and remaining limits.

Focused gates pass: runtime98/98, telemetry13/13, Playback41/41 and
Discovery109/109. Loopback tests prove open suppression, one half-open recovery
probe, snapshot/export isolation and invalid publication/snapshot failure
accounting. The corrected complete affected gate passes 53/53 with 39 cached in
52.928 seconds. Evidence is recorded in
`evidence/phase-11/circuit-breakers.txt`.

## Exact next actions

1. Commit the remediation evidence checkpoint and push PR42 once.
2. Reply to and resolve both initial P1 threads, then request the single
   confirmation review at the corrected exact head.
3. Require protected exact-head CI, squash merge without bypass, verify the
   exact-main run and then activate the next Phase 11 work item.

## Evidence boundaries

The changed wire/admission behavior is covered by ephemeral real Node HTTP
servers. No PostgreSQL, Redis, broker, media, browser or schema behavior changed.
Protected CI remains the Docker composition check. Repeat a heavyweight local
fixture only if later remediation crosses its boundary.

## Execution environment

Use native WSL Git and pinned Node24.19.0/pnpm11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Use
`CI=true NODE_OPTIONS=--max-old-space-size=1536 TURBO_CONCURRENCY=4` for the
candidate gate. Never use a `codex/` branch.

The local Docker daemon remains unavailable and is unnecessary for this slice.
Do not restart WSL/Docker or repeat host CPU/memory diagnostics.

## Do not do yet

Do not add public failure injection, game-day tuning, generic mutation retries,
authorization/rights fallback, Router/Apollo Client retries or Phase13 GraphQL
calibration inside P11-R05. Other dependency breaker classes need their own
failure and fallback proof.
