# Handoff

## Resume point

P11-R10 is active for one exact-head confirmation correction on PR44. P12-R01
is paused; its uncommitted trace work is preserved in named stash
`wip/p12-trace-observability-before-pr44-confirmation-fix` and must resume only
after this predecessor is coherent again.

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
Router guard did not decode a double-quoted YAML Unicode escape. Exact local
source `4becc1ab3b0658eecf01bba6b59109b3fcaebe8a`, tree
`0a8e215439377b095c44b28ed8fc778c1f9a316f`, now parses the 32 KiB-bounded
policy structurally with declared `yaml@2.9.0`, rejects warnings/aliases and
detects decoded `retry` keys. Router4/4, platform67/67 and the affected73/73
gate with50 cached in54.184 seconds pass. Evidence publication, protected
exact-head CI, confirmation, merge and exact-main verification remain.

## Exact next actions

1. Commit and push the correction evidence/state to PR44 once.
2. Resolve discussion `3888512532`, request one exact-head confirmation and wait
   for protected CI.
3. Squash merge without bypass, verify exact-main CI, close Phase11 and restore
   the named P12 stash on its dependent branch.

P12-R01 remains next. It owns repository trace context, structured-log
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
