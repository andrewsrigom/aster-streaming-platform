# Handoff

## Resume point

Phases 00–10 and P11-R01/R05/R08/R09 are released. P11-R08/R09 evidence head
`371ba55eb7269520b72f41fd813a95aaeab819eb`, tree
`172cdff752d8fae3f25608e10128905778d8e8ba`, passed protected run
`33291705269` and clean confirmation. Initial review discussion
`3888409705` found a pending startup/close race. Corrected source `896a3df`
shares close state, waits for pending bind and proves in a child-process
regression that no listener leaks. Focused tests pass 11/11 and the affected gate
passes 11/11 in 49.422s. The discussion is resolved. PR43 squash-merged as
tree-identical main `bdbe2e0`; exact-main run `33292389504` passed all required
jobs.

P11-R10 is the one permitted dependent item, active on `feat/p11-game-days`
rebased onto that tree-identical merge. It owns the remaining
P11-R06/R07/R10/R11/R12
evidence. Exact current source `60ca6f1` adds only Web/Router retry-ownership
tests and the traffic-shaping-scoped verifier; the five game-day,
finite-capacity, fallback/no-amplification and runbook artifacts are written.
The corrected affected candidate passes 17/17 tasks, five cached, in 52.224
seconds. No product runtime changed.

## Exact next actions

1. Preserve the passing P11-R10 affected candidate; repeat only documentation/
   memory checks for closeout prose.
2. Publish one coherent P11-R10 candidate, complete one review/confirmation,
   protected CI, squash merge and exact-main verification.
3. Close Phase11 and activate Phase12 after the P11-R10 release.

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
