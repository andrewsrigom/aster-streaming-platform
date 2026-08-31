# Handoff

## Resume point

Phases00–12 and Phase13 items64–65 are released. Item66 is `WAITING_EXTERNAL` as
PR56 at third corrected exact head `e6134ae`, based on main `8cd6c0b`. Source
`af47c62`, tree `bb2d476`, corrects the bounded current-plus-retained verifier
and expired local-marker pruning. Identity163/163, Router verifier6/6 and both
57/57 candidate gates pass. Protected exact-head CI, resolution of discussions
`3898857100`/`3898857110`, final confirmation and release remain.

Item67 (P13-R07/R08/R09) is the one dependent `IN_PROGRESS` item on
`feat/p13-n-plus-one-authorization`, worktree `/tmp/aster-p13-final`, rebased
onto `e6134ae`. Source `40b7db8`, tree `3e5c0a3`, implements and
locally proves the exact path audit, four PostgreSQL measurements and owner
matrix. The latest affected gate passes, but it must not publish or merge before
item66 releases.

## Active outcome

- Preserve the exact local audit, four PostgreSQL measurements and owner matrix
  while item66 completes confirmation/release.
- Rebase item67 onto released main, repeat its invalidated affected gates and
  close Phase13 only after candidate, protected, review and exact-main evidence.

## Current local evidence

- Source after the third predecessor rebase: `40b7db8`, tree `3e5c0a3`.
- Router focused tests pass25/25; the five-owner Turbo gate passes19/19.
- The complete affected gate passes57/57 with41 cached in69.406 seconds.
- Real PostgreSQL home, title, continue-watching and search measurements remain
  valid because the exact predecessor diff did not touch their measurement
  or audited paths.

## Exact next actions

1. Keep item67 unpublished while PR56 completes protected CI and final review.
2. Resolve discussions `3898857100`/`3898857110` after exact-head CI is green and
   request one final blocker-focused confirmation.
3. Merge item66 only after those gates and require exact-main CI.
4. After item66 releases, rebase item67 onto tree-identical main, repeat only
   invalidated local gates and refresh exact evidence.
5. Publish item67 once and complete its protected review/release gates.

## Execution boundary

Use WSL Git and Node.js24.19.0/pnpm11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Never use a `codex/` branch.
All fixtures require exact labels, loopback-only ports, tmpfs PostgreSQL and
cleanup remaining0. Preserve retained media/databases and unrelated Docker
projects.

## Do not do yet

Do not publish item67, start Phase14, add GraphOS/hosted credentials, or repeat
unchanged PostgreSQL/browser/media evidence while PR56 remains unreleased.
