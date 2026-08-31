# Handoff

## Resume point

Phases00–12 and Phase13 items64–65 are released. Item66 is `WAITING_EXTERNAL` as
PR56 at third corrected exact head `e6134ae`, based on main `8cd6c0b`. Source
`af47c62`, tree `bb2d476`, corrects the bounded current-plus-retained verifier
and expired local-marker pruning. Identity163/163, Router verifier6/6 and both
57/57 candidate gates pass. Protected exact-head CI, resolution of discussions
`3898857100`/`3898857110`, final confirmation and release remain.

Item67 (P13-R07/R08/R09) is the one dependent `IN_PROGRESS` item on
`feat/p13-n-plus-one-authorization`, worktree `/tmp/aster-p13-final`, rebasing
exactly on `e6134ae`. It must not publish or merge before item66 releases.

## Active outcome

- Encode an exact staleness-checked inventory for every public GraphQL list and
  federated entity path, including owner, request scope, batch maximum, query
  budget and authorization class.
- Record real PostgreSQL query count and observed latency for representative
  home, title, continue-watching and search operations using existing disposable
  fixtures.
- Prove owner-side identifier substitution, role escalation and cross-profile
  rejection in one executable authorization matrix.
- Close Phase13 only after focused, integration, candidate, protected and review
  evidence passes.

## Current local evidence

- Source before this predecessor rebase: `4d02211`, tree `fe8ded4`.
- Router focused tests pass25/25; the five-owner Turbo gate passes19/19.
- The complete affected gate passes57/57 with43 cached in65.902 seconds.
- Real PostgreSQL home, title, continue-watching and search measurements remain
  valid because the exact predecessor diff did not touch their measurement
  paths. Reconfirm that invariant after this rebase before carrying them.
- Post-rebase documentation checkpoint before this latest predecessor change:
  `b0ec35d`.

## Exact next actions

1. Complete this rebase onto `e6134ae`, preserving item67's active plan and the
   latest item66 evidence.
2. Prove whether the predecessor changed any measured/audited path. Repeat only
   invalidated focused or real PostgreSQL evidence.
3. Run the affected candidate gate and update exact source/evidence heads.
4. Keep item67 unpublished while PR56 completes protected CI and final review.
5. After item66 releases and exact-main CI passes, rebase item67 onto main,
   publish once and complete its protected review/release gates.

## Execution boundary

Use WSL Git and Node.js24.19.0/pnpm11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Never use a `codex/` branch.
All fixtures require exact labels, loopback-only ports, tmpfs PostgreSQL and
cleanup remaining0. Preserve retained media/databases and unrelated Docker
projects.

## Do not do yet

Do not publish item67, merge it, start Phase14, add GraphOS/hosted credentials,
or repeat unchanged browser/media evidence while PR56 remains unreleased.
