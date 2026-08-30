# Handoff

## Resume point

P12-R01 is active as the one unpublished dependent. Its uncommitted trace work
is preserved in named stash
`p12-trace-observability-wip-before-p11-final-review-2`; restore it on the
dependent branch based on the final PR44 head.

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

P11-R10 exact-head confirmation discussion `3888512532` found that the lexical
Router guard did not decode a double-quoted YAML Unicode escape. The first
parser-based correction passed locally but protected run `33294397540` exposed
its dependency in an intentionally dependency-free policy job. Final exact
source `402b48897f6d679c243093eaf9199c0430aab397` removed that dependency and fully
decoded YAML quoted-key escapes within the bounded policy. Confirmation then
found that Router configuration expansion could materialize a retry key. Final
source `473c58444fc02c65ecbfdd3d454d475214fb6c49`, tree
`f2b0d0bbcfbf239d759836d578e127cc46f9e44a`, rejects expansion inside traffic
shaping. Router4/4, platform67/67 and the affected17/17 gate with five cached in
48.055 seconds pass.
P11-R10 is frozen `WAITING_EXTERNAL`; protected exact-head CI, confirmation,
merge and exact-main verification remain.

## Exact next actions

1. Push the batched PR44 correction once, resolve the current review discussions and
   request one exact-head confirmation.
2. Restore the named P12 stash on the dependent branch and continue locally.
3. After protected CI and confirmation, squash merge without bypass, verify
   exact-main CI, close Phase11 and rebase/recheck P12 before publication.

P12-R01 is active locally. It owns repository trace context, structured-log
correlation, privacy/cardinality and bounded exporter failure under the current
OpenTelemetry ADR. Rebase it onto the final PR44/main tree before publication.

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
