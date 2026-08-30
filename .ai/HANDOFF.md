# Handoff

## Resume point

Phases 00–10 and P11-R01 are released. P11-R05 passed confirmation and protected
CI at reviewed head `dfaf47d55f23e3e0ba04265592af80eb4379b506`, then PR42
squash-merged without bypass as main
`59600aea669d34ec727c1f243d162608261295aa`. The merge tree is exactly the
reviewed tree `d1ed21c23fc17638cb7909e96c5e5a43bcc8cbaf`. Exact-main run
`33290477608` passed every required job; P11-R05 is released.

P11-R08 is active on `feat/p11-failure-injection`, based exactly on that main
merge. Tools-only loopback HTTP fault injection and synthetic duplicate delivery
are implemented. Initial PR43 review discussion `3888409705` found a pending
startup/close race. Corrected source
`896a3df02a60faeddeb6a6dffc3b2dc7a3714381` has tree
`9584024a7e96335a3d95da64e3babdc67efca0c2`; one shared close promise waits for
pending bind, closes the listener and makes the racing start reject. Focused
tests pass11/11 and the corrected affected gate passes11/11 in49.422s.

## Exact next actions

1. Commit the corrected evidence checkpoint and push PR43 once.
2. Reply to and resolve the initial discussion, then request one confirmation.
3. Require protected exact-head CI.
4. Squash merge without bypass, verify exact-main CI, then activate the Phase11
   game-day/runbook closeout item.

## Evidence boundaries

P11-R05 wire/admission behavior is already covered by real ephemeral Node HTTP
and protected Docker CI. P11-R08 is tools-only and requires real loopback socket
tests, not retained Docker, PostgreSQL, Redis, broker, media or browser reruns.
Those dependency mechanics belong to the following game-day work item.

## Execution environment

Use native WSL Git and pinned Node24.19.0/pnpm11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Use
`CI=true NODE_OPTIONS=--max-old-space-size=1536 TURBO_CONCURRENCY=4` for the
candidate gate. Never use a `codex/` branch.

The local Docker daemon is unnecessary for this item. Do not restart WSL/Docker
or repeat host CPU/memory diagnostics.

## Do not do yet

Do not add a product-facing injection endpoint, credentials, public listener,
runtime fault selector, new infrastructure image or hosted resource. Do not
claim game-day, fallback, broker/database/Redis/worker recovery or Phase11
closeout from a tools-only candidate.
