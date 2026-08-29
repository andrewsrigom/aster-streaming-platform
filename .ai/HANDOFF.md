# Handoff

## Resume point

Phases 00–09 are released locally. P10 Catalog cache-aside is released through
main `903f7b4` and exact-main run `33272501078`.

P10 Discovery stale-while-revalidate passed PR39 exact `601cc95`, protected run
`33274397440`, clean confirmation and squash-merged without bypass as main
`6a2fe3a8f55dd4c655f962d62d4ba017f5716cf0`. Exact-main run
`33275183338` is the sole predecessor condition. P10-R08 is the permitted
dependent `IN_PROGRESS` item on `feat/p10-operation-limiters`, based on that
exact merge, and must not publish before the run passes.

The active plan implements an atomic Redis-server-time token bucket for
Engagement progress/watchlist after current owner authorization and idempotent
replay, with bounded local fallback/hot-key shielding. Discovery search receives
two active slots, one waiter and a 100 ms queue bound. P10-R08 also owns the real
atomicity, outage, cardinality and hot-key evidence and closes Phase 10.

## Exact next actions

1. Verify exact-main run `33275183338` and record the Discovery release.
2. Write ADR-0039 and implement the Redis token-bucket command plus telemetry.
3. Apply Engagement rate admission and optional non-critical Redis lifecycle.
4. Add Discovery search bulkhead and focused adverse tests.
5. Run real Redis/PostgreSQL evidence, the affected gate, review and release.

## Evidence boundaries

Discovery's existing real Redis, browser and eleven-service outage artifacts stay
valid because P10-R08 changes neither its cache bytes nor stale public shape.
Repeat them only if that boundary changes. Redis script/key/policy changes repeat
the limiter atomicity/hot-key fixture. Engagement owner/result placement repeats
the durable Redis-outage fixture. Search admission changes repeat its concurrency
proof. Unchanged media/player evidence does not repeat.

## Execution environment

Use native WSL Git and pinned Node 24.19.0/pnpm 11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Use
`CI=true NODE_OPTIONS=--max-old-space-size=1536 TURBO_CONCURRENCY=4` and bounded
deadlines. Never create or use `codex/` branches.

## Do not do yet

Do not add Phase11 retries/circuits or Phase13 trusted-operation/public-proxy
calibration. Do not make Redis durable or critical readiness, expose raw account
identity in keys/telemetry, scan/flush Redis, repeat unchanged media/browser/CPU
work, restart WSL/Docker globally, or alter unrelated retained projects/data.
