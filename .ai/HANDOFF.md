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
Catalog ratios. Its active plan is `.ai/CHANGE_PLAN.md`.

## Exact next actions

1. Publish the documented 300 ms Router-bucket correction to PR48.
2. Let protected CI prove the pinned Router/Prometheus runtime and both live Router-backed ratios.
3. Reply to and resolve confirmation discussion `3889248449` with exact evidence.
4. Run the permitted blocker-focused confirmation, squash-merge and verify exact-main CI.
5. Activate P12 dashboard work from clean exact main.

## Verified candidate

- Four contract plus Router/CI policy focused checks pass 31/31; telemetry19/19 remains valid.
- Exact Apollo Router 2.17.0 configuration validation passes.
- Prometheus 3.14.0 `promtool` accepts nine rules and the synthetic good, bad,
  excluded and excluded-only workloads.
- The corrected affected gate passes 60/60 tasks with 50 cached in 49.715 seconds.
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
