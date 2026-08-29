# Handoff

## Resume point

Phases 00–09 are released locally. P10 Catalog cache-aside is released through
main `903f7b4` and exact-main run `33272501078`.

P10 Discovery stale-while-revalidate passed PR39 exact `601cc95`, protected run
`33274397440`, clean confirmation and squash-merged without bypass as main
`6a2fe3a8f55dd4c655f962d62d4ba017f5716cf0`. Exact-main run
`33275183338` passed. P10-R08 is the sole `IN_PROGRESS` item on
`feat/p10-operation-limiters`, based on that exact release.

The active plan implements an atomic Redis-server-time token bucket for
Engagement progress/watchlist after current owner authorization and idempotent
replay, with bounded local fallback/hot-key shielding. Discovery search receives
two active slots, one waiter and a 100 ms queue bound. P10-R08 also owns the real
atomicity, outage, cardinality and hot-key evidence and closes Phase 10.

PR40 initial protected run `33277368515` passed at exact `6719bda`. Its three P2
findings are corrected together at exact `ade7379`: same-key serialization before
receipt/rate admission, portable Engagement `retryAfterMs`, and portable
Discovery `LIMIT_EXCEEDED`. Focused Engagement123/123, Discovery105/105 and
Web111/111 pass. The corrected complete candidate passes73/73,48 cached,in73.641
seconds. Protected run33279111820 passed all required jobs and real fixtures at
exact041c75e. Confirmation discussion3887901456 then found duplicate token
charges when identical retries reach different Engagement replicas. Exact
c5ea7c8 adds a finite atomic v2 admission marker to the shared bucket decision;
Redis18/18, Engagement124/124, scoped static checks and affected73/73 pass,44
cached,in61.854 seconds. Confirmation at `aa5e6af` then found discussion3887956537.
The local correction binds shared admission to the canonical request digest, but
keeps local ordering key-only for receipt conflict detection. Engagement126/126
passes. The extended two-writer Redis fixture tests exact retry reuse and
changed-payload competition even when no receipt is written; execution is pending.
The corrected candidate passes73/73,56 cached,in48.173 seconds. Prior protected
run33280768684 passed at aa5e6af; it predates this digest correction.

## Exact next actions

1. Commit the accepted request-digest candidate/checkpoint and push PR40 once.
2. Require protected CI to repeat the real Redis/PostgreSQL fixtures at the exact
   head; Discovery/browser/media carry forward because their boundaries did not
   change.
3. Reply to and resolve discussion3887956537, then request the permitted
   blocking-boundary confirmation.
4. Capture release evidence, squash-merge, confirm exact-main CI and close Phase10.

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
