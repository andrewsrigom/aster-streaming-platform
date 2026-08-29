# Handoff

## Resume point

Phases 00–09 are released locally. P10 Catalog cache-aside is also released:
PR37 exact `cb86c371849f895934af99f72c361ccb64bccf8e` passed protected run
`33270889083` and clean confirmation comment `5464418106`, squash-merged without
bypass as main `903f7b4330db8c47896ea82f5f487a268d817d88`, and exact-main run
`33272501078` passed all required jobs.

P10-R04 is the sole active item on `feat/p10-discovery-swr`, rebased onto that
main release. The implementation adds bounded whole-home stale-while-revalidate,
finite Redis envelopes and leases, PostgreSQL fallback, explicit Web stale shape
and finite telemetry. Redis remains disposable and non-critical.

Local evidence:

- Discovery 99/99, telemetry 11/11 and Web 111/111 pass.
- Real Redis passes: 24 cold callers use one source read, 24 stale callers use
  one refresh, two instances recover an excessive-TTL lease, outage falls back
  to the owner and cleanup reaches zero.
- The stale browser path passes 1/1; its affected Web blobs are byte-identical
  after the predecessor squash rebase.
- Exact `53bdbf2` passes `pnpm check:changed`, 73/73 tasks in 182.617 seconds.
- Exact `8faf35a` passes the eleven-service Discovery runtime in 395884 ms:
  configured Redis is absent, Discovery stays healthy, public home is served,
  projection lag is zero, quarantine replay and owner isolation/restart pass,
  and cleanup reaches zero.

Evidence is under `evidence/phase-10`. Full Phase00–14 goal remains active.

## Exact next actions

1. Finish the documentation/evidence candidate checkpoint and run its applicable
   final local gates.
2. Push `feat/p10-discovery-swr` once and open one PR.
3. Complete one initial review and protected CI, batch only defined blockers,
   then one confirmation review.
4. Squash-merge without bypass, verify exact-main CI, close P10-R04 and activate
   READY P10-R08 from clean main.

## Evidence boundaries

Phase09 browser/media evidence does not repeat. Discovery browser1/1 and real
Redis evidence carry forward because their affected source blobs did not change.
Repeat runtime only if Redis wire/envelope, cache visibility, composition or
failure behavior changes.

## Execution environment

Use native WSL Git and pinned Node 24.19.0/pnpm 11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Use
`CI=true NODE_OPTIONS=--max-old-space-size=1536 TURBO_CONCURRENCY=4` and bounded
deadlines. Never create or use `codex/` branches.

## Do not do yet

Do not cache browse ordering, rights or Playback authority. Do not make Redis a
critical readiness dependency, scan keys, add Phase11 retry/circuit policy, add
Phase13 GraphQL calibration, repeat unchanged media/browser/CPU work, restart WSL
or Docker globally, or alter unrelated retained projects and data.
