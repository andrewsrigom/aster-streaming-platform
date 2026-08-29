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
initial implementation was `a54c324`; initial review comment3886890023 was fixed
at `3746868`. Confirmation comments3886917843/44/46 found unbounded Redis GET
materialization, whole-batch coalescing and a dropped oversized-corruption metric.
Exact `2a9b86c221180f2df8caf74f66d9a2495c794888` corrects all three. Catalog242/242,
Redis17/17, affected73/73 and repeated real Redis/PostgreSQL fixtures pass.
Candidate evidence is under `evidence/phase-10`. Full Phase00–14 goal remains
active.

Protected run33260411345 passed exact b65688b. Its final confirmation added
discussion3886966492: cold/expired absence checks reached `findFences` before
coalescing and leasing. Exact local correction
`62afee15240ab1d197aac84b4d63e1a0e1dce382` coordinates the negative key before
the owner read. Corrected confirmation discussions3887086778/82 found that work
could still cross request-time visibility and wrong-type Redis keys persisted.
Exact `2930332e7b1c049c081bfad8c5d62c71009f03bf` scopes fence sharing by time and
policy and classifies non-string values before Redis size/read operations.
Catalog244/244, Redis17/17, affected73/73, real Redis positive/negative/wrong-type
behavior and the complete PostgreSQL fixture pass with cleanup0. Discussion
3887146000 then found that a recognizable negative marker without bounded Redis
expiry could hide later publication. Exact
`f50acbb7cbb26cef480b0bb87018510660da48ca` embeds and validates cache time,
deletes missing/future/over-age envelopes and rechecks the owner. Catalog245/245,
affected73/73 and repeated real Redis/PostgreSQL fixtures pass. Protected run
33265036497 passed exact4afe12f, but review discussion3887201296 found shifted
owner-inclusive waiter buckets. Exact6088bf8 counts only attached callers;
Catalog245/245 and affected73/73 pass without changing the real cache boundary.
The separate
`feat/p10-discovery-swr` branch preserves checkpoint423c33d on old predecessor
b65688b; do not publish it before predecessor release.

## Exact next actions

1. Commit this documentation-only waiter-bucket evidence and publish one PR37
   update.
2. Reply to and resolve discussion3887201296, then obtain corrected
   confirmation and protected CI before squash merge and exact-main acceptance.
3. Rebase only dependent commits after b65688b onto released squash main, repeat
   affected gates, and resume P10-R04.

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
