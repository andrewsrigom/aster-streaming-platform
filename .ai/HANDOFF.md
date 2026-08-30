# Handoff

## Resume point

Item59 (P12-R04/R11 browser QoE) is frozen in `WAITING_EXTERNAL` at exact
source `74780e520b598319ed07988e640dc2ab0b9a7d81`, tree
`412cc4ce8d8abb61447cc37421280308201ed9cd`. PR47 initial review is clean;
protected run `33305864184` is still executing its serial source-quality
integrations. Local focused19/19, Web116/116 and affected14/14 gates pass.

Item60 (P12-R05/R06) is the sole dependent `IN_PROGRESS` item on
`feat/p12-sli-slo-definitions`, based exactly on that frozen head. Its active
plan is `.ai/CHANGE_PLAN.md`. Do not publish or merge this branch before PR47.

## Exact next actions

1. Continue finite Router outcome and Prometheus SLI-rule implementation locally.
2. When run `33305864184` passes, request exactly one blocker-focused PR47 confirmation review.
3. If clean, squash-merge PR47, verify exact-main CI, rebase this dependent branch onto that squash and repeat only affected gates.
4. Complete P12-R05/R06 contract/rule/evidence work, run candidate gates and publish one coherent PR.
5. If PR47 changes, rebase first and invalidate any affected dependent evidence.

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

Do not publish the dependent branch, restart WSL/Docker, repeat host diagnostics,
reset retained projects or rebuild media. Protected CI owns the changed
Router/Prometheus runtime proof while the local daemon is unavailable.
