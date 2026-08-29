# Handoff

## Resume point

Phases 00–09 are released locally. P09-R10 corrected exact `b5ccd59` passed
protected run 33253867475 and clean confirmation; PR36 squash-merged as main
`ffe8e24`, whose exact-main run 33254719311 passed. Release evidence is under
`evidence/phase-09`.

P10-R01/R02/R03/R05/R06/R07/R10 is active on `feat/p10-catalog-cache` from that
clean main. The selected slice caches only public-title entity reads. PostgreSQL
must confirm the current visibility/version fence before positive reuse. Redis is
optional, bounded and non-authoritative. Implementation, focused suites, real
PostgreSQL/Redis behavior and the complete affected gate pass locally. Exact
implementation commit is `a54c324f7d2312851bd036f763362d84574bf826`;
candidate evidence is recorded under `evidence/phase-10`. Full Phase00–14 goal
remains active.

## Exact next actions

1. Recheck documentation/repository memory, publish one branch update and open the
   candidate PR.
2. Complete one initial review, batch only requirement blockers, then run one
   confirmation and protected CI before squash merge and exact-main acceptance.

## Evidence boundaries

Phase09 browser/media evidence is complete and does not repeat. Phase10 records
only cache behavior, source-query count, expiry, contention, atomic release and
Redis-loss evidence under `evidence/phase-10`. Runtime proof repeats only when the
Redis wire, cache envelope/fence query, composition or failure behavior changes.

## Execution environment

Use native WSL Git and pinned Node 24.19.0/pnpm 11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Use
`CI=true NODE_OPTIONS=--max-old-space-size=1536` and bounded deadlines. Never
create or use `codex/` branches.

## Do not do yet

Do not cache browse ordering, rights or Playback authority. Do not make Redis a
critical readiness dependency, scan keys, add Phase11 retry/circuit policy, add
Phase13 GraphQL calibration, repeat unchanged media/browser/CPU work, restart WSL
or Docker globally, or alter unrelated retained projects and data.
