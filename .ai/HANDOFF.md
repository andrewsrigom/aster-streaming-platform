# Handoff

## Resume point

P12-R01 is active on PR45 from `feat/p12-trace-observability`. Corrected source
`82e9a616c39fc2159a54e8dba66fb82e71eb15af`, tree
`a6a1081f33d6e95326ae92c8817d072c0fdb1093`, implements the trace/export slice
and corrects all three first-candidate blockers. Focused owner tests pass11/11,
platform policy23/23, daemonless Compose rendering and the affected gate73/73
with51 cached in55.776 seconds pass. The old named P12 stashes are historical
and must not be restored over this branch.

Phases00–11 are released. P11-R08/R09 evidence head
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
found that Router configuration expansion could materialize a retry key; the
next review proved that the marker itself could be YAML-escaped. Final source
`aac04c753e3f1463ff55597a581136947fe7506c`, tree
`c2a6c93a85d7c65b2f475cb6694cfde0741c5100`, rejects raw and decoded expansion inside traffic
shaping. Router4/4, platform67/67 and the affected17/17 gate with five cached in
48.053 seconds pass.
P11-R10 passed protected exact-head CI `33295744010` and clean confirmation.
PR44 squash-merged as `834bf15a8fe9fb39dc3a807912234efd8ee39dbd`;
its tree `6ea7760e92a086310be63f79a670bd72d49263e6` equals the reviewed evidence
tree. Exact-main run `33296443777` passed every required job and releases
Phase11.

## Exact next actions

1. Commit and publish the corrected P12 evidence head once.
2. Resolve initial review discussions `3888669316` and `3888669317`, request
   the one confirmation review and require protected exact-head CI.
3. Squash-merge PR45 without bypass and prove exact main.
4. Complete the Phase12 metrics/SLI/SLO/dashboard/alert/diagnostic items in
   requirement order after this slice closes.

P12-R01 is active on PR45 and already based on released Phase11 main. It owns
repository trace context, structured-log
correlation, privacy/cardinality and bounded exporter failure under the current
OpenTelemetry ADR. Evidence is indexed under `evidence/phase-12/`. Rebase it
only if main changes again; current status is implemented, not verified or
released.

## Evidence boundaries

Existing current protected workflows already execute real PostgreSQL, Redis,
broker, Discovery and owner runtimes. Reuse their exact run once. Browser and
full media evidence may carry forward only if later source-object comparison
proves the measured boundary unchanged; otherwise run one bounded scenario.
Shared-host observations are not SLO or capacity claims.

The single local `pnpm integration:telemetry` attempt stopped before resource
creation because Docker returned an empty operating-system value instead of
`linux`; cleanup reported zero remaining resources. Do not repeat it unchanged.

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
