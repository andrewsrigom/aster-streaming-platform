# Handoff

## Resume point

Phases 00–10 are released. P11-R01 passed exact-head review and protected CI,
then PR41 squash-merged as main `ebdcb18b344b3f8313575b7cd158f99a77a4026b`.
Exact-main run `33285339274` passed every required job; P11-R01 is released.

P11-R05 is active on `feat/p11-circuit-breakers`, based exactly on that merge.
The worktree intentionally contains implementation, tests, ADR-0041, P11-R01
release proof and current repository-memory changes.

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

Focused gates pass: runtime98/98, telemetry13/13, Playback40/40 and
Discovery108/108. Loopback tests prove open suppression, one half-open recovery
probe and snapshot/export isolation.

## Exact next actions

1. Run `pnpm ai:check`, documentation/static checks and the complete affected
   candidate for P11-R05.
2. Capture exact breaker events/call counts under `evidence/phase-11/` and update
   the active plan/state at the candidate checkpoint.
3. Commit coherent source/evidence blocks, publish one PR, run one full review
   plus one confirmation, and merge only after protected exact-head CI.

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
