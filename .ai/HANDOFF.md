# Handoff

## Resume point

Item59 (P12-R04/R11 browser QoE) is released from source `74780e5`, tree
`412cc4c`, protected run `33305864184`, clean exact-head confirmation, PR47
squash main `6dba10e` and successful exact-main run `33307059156`.

Item60 (P12-R05/R06) is the sole `IN_PROGRESS` item on
`feat/p12-sli-slo-definitions`, based directly on exact main `6dba10e`. Initial
PR48 review discussion `3889183230` found the missing 400 ms runtime histogram
bucket. Corrected source `0661a81`, tree `d7978e0`, adds the bucket and a
cross-contract regression. Protected run `33308328939` passed every job at head
`60c72a7`; confirmation discussion `3889248449` then found the missing 300 ms
Router bucket. Corrected source `fa4f0b8`, tree `519908f`, adds the exact finite
boundary, rejects Router/query threshold drift and requires live supergraph plus
Catalog ratios. The Local platform job in protected run `33309698941` proved
that the Catalog ratio series exists but exposed a diagnostic error: the live
ratio was legitimately zero and the assertion required a value above zero.
Source `ef78d11`, tree `3c21d78`, accepts finite ratios in the inclusive range
from zero to one while the separate series-length assertion still rejects an
absent result. Evidence head `aca4aba`, tree `8d40140`, passed protected run
`33310118280`, including packaged Router/Prometheus acceptance and every required
job. Discussion `3889248449` has an exact-evidence reply and is resolved. Final
confirmation discussion `3889344066` then found that failure-only windows
disappeared when no completed series had ever existed. Source `757f6a0`, tree
`e9c7d24`, zero-fills recording and objective numerators only from their present
population and adds failure-only synthetic coverage. Invalidated run
`33310999656` was cancelled. Its active plan is `.ai/CHANGE_PLAN.md`.

## Exact next actions

1. Complete the corrected affected gate and publish one documented head.
2. Pass protected Prometheus/runtime acceptance.
3. Reply to and resolve discussion `3889344066` with exact evidence.
4. Run only the blocker-focused confirmation required by the changed measurement boundary.
5. Squash-merge PR48, verify exact-main CI and activate P12 dashboard work.

## Verified candidate

- Contract/platform focused checks pass27/27; Router10/10 and telemetry19/19 remain valid.
- Exact Apollo Router 2.17.0 configuration validation passes.
- Prometheus 3.14.0 `promtool` accepts nine rules and the synthetic good, bad,
  failure-only, excluded and excluded-only workloads.
- Failure-only recording ratios and full-window objective queries return zero;
  excluded-only/no-population queries remain absent.
- The failure-only corrected affected gate passes60/60 tasks with50 cached in49.705 seconds.
- Protected run `33310118280` supports the prior boundary; corrected source
  `757f6a0` still requires protected acceptance.
- Documentation, AI state, formatting, lint, security and `git diff --check` pass.

## Measurement boundary

The four required central SLIs use finite Router or released backend product
metrics. Browser first-frame remains diagnostic only because remote sampling and
server retention are zero. The local Prometheus store retains one hour, so it
proves query mechanics and synthetic classification, not a historical 28/30-day
service objective.

## Execution environment

Use native WSL Git and pinned Node.js 24.19.0/pnpm 11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Candidate gates use
`CI=true NODE_OPTIONS=--max-old-space-size=1536 TURBO_CONCURRENCY=4`. Never use a
`codex/` branch.

## Do not do yet

Do not restart WSL/Docker, repeat host diagnostics, reset retained projects or
rebuild media. Protected CI owns the changed Router/Prometheus runtime proof
while the local daemon is unavailable.
