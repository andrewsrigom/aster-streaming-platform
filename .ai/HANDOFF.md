# Handoff

## Resume point

Item61 (P12-R12) is released. PR49 reviewed head `ba3de93`, tree `73ee596`,
passed protected run `33318672382` and clean confirmation. Squash main is
`c297d32`; valid exact-main run `33319514232` passed every required job. Earlier
same-SHA run `33319497475` was superseded by concurrency.

Item62 (P12-R07) is the sole `IN_PROGRESS` item on
`feat/p12-burn-rate-alerts`, based exactly on main `c297d32`. Its active plan is
`.ai/CHANGE_PLAN.md`. Exact source is `9fbc2d1`, tree `580f7ab`; the evidence
head `88a9d02` opened PR50. Exact correction is `8185a81`, tree `51dc011`.

## Implemented candidate

- ADR-0043, the executable SLO contract and exact Prometheus rules define rapid
  14.4x 1h/5m plus 6x 6h/30m pairs for three page-class SLIs and sustained 3x
  1d/2h plus 1x 3d/6h pairs for all four.
- Complete sampled-window guards suppress fresh, partial or size-evicted
  history. The local time ceiling is three days while the 128 MB size cap and
  query/resource bounds remain.
- Prometheus 3.14.0 validates 9 SLI rules plus 26 alert-policy rules. Synthetic
  fixtures prove firing, paired-window/non-traffic/incomplete-history
  suppression and short-window recovery.
- A fresh isolated packaged image reported 35 healthy rules, seven alert
  instances, the exact 3-day coverage guard and zero active no-traffic alerts.
- Focused policy tests pass68/68. The affected candidate passes15/15 tasks with3
  cached in53.889 seconds, including platform75/75 and CI policy33/33.
- Every alert links to the operational overview and complete burn runbook. No
  Alertmanager delivery or field SLO compliance is claimed.
- Protected run `33322558877` exposed only pre-first-evaluation health
  `unknown`. The corrected finite poll passed against a fresh packaged image on
  attempt7/18 seconds; the corrected affected gate passes15/15 with3 cached in
  52.346 seconds.
- Initial review discussion `3889911170` found observability-only future diffs
  could skip platform/promtool. The classifier and dedicated five-path
  regression are corrected; classification/CI tests pass34/34. The final
  corrected affected gate passes15/15 with11 cached in3.476 seconds.
- Protected run `33323508793` passes every exact-head job, including the
  packaged 35-rule/seven-alert assertion, owner integrations and playable demo.
  Discussion `3889911170` is answered and resolved. Confirmation comment
  `5470101517` reports no major issue at `8185a81`.

## Exact next actions

1. Commit and publish the evidence closeout to PR50, then pass its protected
   documentation gate.
2. Squash merge, confirm exact-main CI and activate the first remaining Phase12
   diagnostic exercise from clean main.

## Execution boundary

Use WSL Git and Node.js24.19.0/pnpm11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Candidate gates use
`CI=true NODE_OPTIONS=--max-old-space-size=1536 TURBO_CONCURRENCY=4`. Never use a
`codex/` branch.

## Do not do yet

Do not add Alertmanager, hosted receivers, credentials or a historical SLO
claim. Do not restart WSL/Docker, reset retained projects or repeat host
diagnostics. The packaged proof is current; repeat it only if image,
configuration, rules or protected API assertions change.
