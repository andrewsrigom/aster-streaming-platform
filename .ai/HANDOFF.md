# Handoff

## Resume point

Phases00–13 are released. Phase13 final result checkpoint `db17bca`, tree
`41650b4`, passed protected run `33486901296` and clean final review. PR57
squash main `83cb510` retained that tree; exact-main run `33489232182`
passed every required job. The authoritative closeout is
`evidence/phase-13/release.md`.

Phase14's credential-free reference-quality track P14-R13–R18 is active under
ADR-0048. Hosted P14-R01–R12 remain planned and deferred until explicit owner
authorization.

Item68 (P14-R13) is the sole `IN_PROGRESS` item on
`docs/reference-first-roadmap`, worktree
`/tmp/aster-reference-roadmap`, from released main `83cb510`.

## Active outcome

Publish one documentation candidate that:

- records the exact Phase13 release;
- makes local reproducibility, navigation and readability the immediate
  Phase14 outcome;
- preserves hosted requirements and their identifiers without claiming they
  are implemented;
- defines an ordered, behavior-preserving reference-quality runway.

## Work completed locally

- Added ADR-0048.
- Extended the Phase14 specification with active P14-R13–R18 and a separate
  deferred hosted sequence.
- Updated public roadmap, README, phase index, charter, delivery model,
  engineering demonstration and file index.
- Added the concise Phase13 release record and final machine-readable release
  event.
- Replaced stale current-state and handoff narratives with the released
  baseline and active reference track.
- Updated work queue, decision ledger and context.
- Source `bd1191d`, tree `80337eb7`, passes the local iteration and
  changed-scope candidate gates; `evidence/phase-14/README.md` records exact
  results and the heavyweight-evidence carry-forward rationale.
- Evidence head `6bbb3da` passed protected run `33492326127`. Initial review
  discussion `3902757945` found the stale duplicate-commit instruction.
  Correction `7976c17`, tree `0af69fe`, fixes it and passes the repeated
  local gate.

Executable product behavior is unchanged.

## Exact next actions

1. Publish the current corrected checkpoint to PR58 if needed; do not create an
   additional empty or duplicate evidence commit.
2. Require corrected protected CI, resolve discussion `3902757945`, request
   one confirmation review, then squash merge and require exact-main CI.
3. Start item69 from clean released main and build the capability index.

## Execution boundary

Use WSL Git and Node.js24.19.0/pnpm11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Never use a `codex/` branch.
Preserve retained media, databases and unrelated Docker projects. No hosted
provider, credential, paid resource, public endpoint or new media-rights claim
is authorized.

## Heavyweight evidence

Item68 changes documentation only. The released Phase13 owner runtimes,
PostgreSQL integrations, browser suite, media demo and failure-diagnosis
evidence remain applicable because no executable path or gate selection
changes. Repeat them only if a later source change can invalidate the measured
behavior.

## Do not do yet

Do not start item69 before item68 releases. Do not create a hosted provider,
credential, paid resource, public endpoint or new media-rights claim. Do not
rename or reorganize implementation code before the capability index and
readability inventory identify a concrete owner-scoped problem.
