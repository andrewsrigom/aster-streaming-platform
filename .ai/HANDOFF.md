# Handoff

## Resume point

Item59 (P12-R04/R11 browser QoE) is released from source `74780e5`, tree
`412cc4c`, protected run `33305864184`, clean exact-head confirmation, PR47
squash main `6dba10e` and successful exact-main run `33307059156`.

Item60 (P12-R05/R06) is the sole `IN_PROGRESS` item on
`feat/p12-sli-slo-definitions`. Source `524ab28`, tree `e442af1`, is based
directly on exact main `6dba10e`. Its active plan is `.ai/CHANGE_PLAN.md`.

## Exact next actions

1. Commit the evidence/memory closeout without changing source behavior.
2. Push the coherent branch and open one PR for P12-R05/R06.
3. Request one initial blocker-focused review and let protected CI prove the pinned Router/Prometheus runtime.
4. Batch only requirement, security/privacy, measurement-integrity, availability or public-contract blockers.
5. Run one confirmation review, squash-merge, verify exact-main CI, then activate P12 dashboard work.

## Verified candidate

- Four contract tests, ten Router tests and 23 platform-policy tests pass.
- Exact Apollo Router 2.17.0 configuration validation passes.
- Prometheus 3.14.0 `promtool` accepts nine rules and the synthetic good, bad,
  excluded and excluded-only workloads.
- The post-rebase affected gate passes 49/49 tasks with 41 cached in 47.444 seconds.
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
