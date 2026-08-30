# Handoff

## Resume point

P12-R01 is active as the one unpublished dependent. It owns finite trace/log
context, telemetry privacy/cardinality and bounded exporter failure. It cannot
publish before the P11-R10 predecessor releases.

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

P11-R10 is frozen `WAITING_EXTERNAL` on PR44 at corrected executable source
`ad99ef675953d47a7f03161c94468f9292476de0`, tree
`999171632a8823886c47b4d7b06a86303c88d3d5`, based on that tree-identical
predecessor merge. It owns the remaining
P11-R06/R07/R10/R11/R12
evidence. Initial review discussions `3888491209` and `3888491214` found that
the Web regression bypassed Apollo link composition and the Router guard missed
flow-style YAML. The correction extracts the existing browser client composition
without changing behavior, exercises that exact chain and detects block, flow
and quoted retry keys. Web112/112, Router4/4 and the affected 17/17 gate with two
cached in 57.471 seconds pass. Only protected exact-head CI, confirmation, merge
and exact-main verification remain.

## Exact next actions

1. Complete one PR44 review/confirmation and protected exact-head CI.
2. Squash merge without bypass and verify exact-main CI.
3. Close Phase11; reconcile the one unpublished Phase12 dependent if it advanced
   while PR44 waited, then publish only after the predecessor release.

P12-R01 is active as that one unpublished dependent. It owns repository trace
context, structured-log correlation, privacy/cardinality and bounded exporter
failure under the current OpenTelemetry ADR. Start from the final PR44 head and
do not publish it before PR44 releases.

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
