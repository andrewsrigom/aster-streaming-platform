# Handoff

## Resume point

Phases 00–10, P11-R01 and P11-R05 are released. P11-R08/R09 is frozen on PR43
at corrected evidence head `371ba55eb7269520b72f41fd813a95aaeab819eb`, tree
`172cdff752d8fae3f25608e10128905778d8e8ba`. Initial review discussion
`3888409705` found a pending startup/close race. Corrected source `896a3df`
shares close state, waits for pending bind and proves in a child-process
regression that no listener leaks. Focused tests pass 11/11 and the affected gate
passes 11/11 in 49.422s. The discussion is resolved. Exact-head protected run
`33291705269` and the single confirmation review are running.

P11-R10 is the one permitted dependent item, active on `feat/p11-game-days`
rebased exactly onto that corrected head. It owns the remaining
P11-R06/R07/R10/R11/R12
evidence: finite capacity, Discovery fallback, retry non-amplification, five
game days and complete runbooks. No production change is planned unless a named
experiment demonstrates a requirement blocker.

## Exact next actions

1. Finish mapping each remaining requirement to exact current code, test and
   evidence; do not mistake historical proof for current applicability.
2. Use the single PR43 protected run for its current-source Discovery, Redis and
   broker disposable events after it completes.
3. Run cheap focused current-source database saturation, fallback/amplification
   and media process-failure checks.
4. Record five bounded timelines and update runbooks; run the affected candidate
   gate.
5. If PR43 changes again, rebase this branch and repeat only invalidated checks.
   P11-R10 cannot publish or merge first.

## Evidence boundaries

Existing current protected workflows already execute real PostgreSQL, Redis,
broker, Discovery and owner runtimes. Reuse their exact run once. Browser and
full media evidence may carry forward only if later source-object comparison
proves the measured boundary unchanged; otherwise run one bounded scenario.
Shared-host observations are not SLO or capacity claims.

## Execution environment

Use native WSL Git and pinned Node24.19.0/pnpm11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Use
`CI=true NODE_OPTIONS=--max-old-space-size=1536 TURBO_CONCURRENCY=4` for the
candidate gate. Never use a `codex/` branch.

The local Docker daemon is unnecessary while exact hosted runtime evidence is
running. Do not restart WSL/Docker or repeat host CPU/memory diagnostics.

## Do not do yet

Do not publish the dependent branch, add chaos to product routes, invent SLOs,
repeat the full transcode/demo without an invalidating change, create hosted
resources or broaden Phase11 into Phase12 observability/Phase14 load testing.
