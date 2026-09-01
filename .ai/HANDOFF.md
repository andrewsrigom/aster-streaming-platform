# Handoff

## Resume point

Phases00–13 are released. P14-R13/item68 is verified. PR59 corrected closeout
head `ee97d3d`, tree `8f6603e`, passed protected run `33495819403` and
clean confirmation. Squash main `56acfb7` retained that exact tree; exact-main
run `33496347713` passed.

Item69 (P14-R14) is the sole `IN_PROGRESS` item on
`docs/capability-index`, worktree `/tmp/aster-capability-index`, from that
exact post-closeout main.

## Active outcome

Publish one maintained index covering:

- Identity and Profiles
- Catalog
- Playback
- Engagement
- Discovery
- Apollo Router and GraphQL controls
- Web and accessibility
- media processing and delivery
- resilience and degraded modes
- observability and diagnosis
- repository verification and local Docker workflows

Every row links its requirement, authoritative owner, representative
implementation, focused adverse test, evidence and operational guidance. A
bounded repository check requires exact coverage and delegates concrete
path/anchor validity to the existing documentation validator.

## Work completed locally

- Restored the post-closeout repository context and verified item68 is `DONE`.
- Activated item69/P14-R14 on exact main `56acfb7`.
- Defined the index/verifier boundary in `.ai/CHANGE_PLAN.md`.
- Published the eleven-row index with concrete requirement, source, adverse
  test, evidence and operations links.
- Added a bounded dependency-free verifier for exact IDs/order, authoritative
  owner/status vocabulary, reviewed per-role destinations, complete cells,
  local links, UTF-8 and size limits.
- Added seven focused verifier tests and wired the check into `docs:check`,
  `docs:test`, root navigation, the documentation map and the file index.
- Wired the verifier and its tests into the always-run protected governance
  job. CI policy now rejects removing either command or moving it to a job that
  a documentation-only change skips.
- Focused documentation tests pass16/16; documentation validation passes for250
  documents and eleven capability rows. The corrected changed-scope gate passes
  15/15 tasks, including39 CI-policy regression tests.
- Source `91009bbcc68c40f5947fd93925b7d79498d115b2`, tree
  `78742f48c2f939b9073f419aaded775be1e58876`, is the coherent local candidate.
- Evidence head `136def8` passed protected run `33498081610`. Initial review
  opened discussions `3903242620`/`3903242629`; correction source `845933f`,
  tree `73b5487`, addresses both and passes the repeated local gate13/13.
- Protected run `33499512053` on superseded head `1348c3d` passed governance
  and dependency review but failed the Local platform job on a Catalog TraceQL
  search timeout; scoped cleanup completed. Confirmation review then opened
  discussion `3903385086` because docs-only CI could bypass the capability
  verifier.
- Correction source `2fff10d`, tree `2b80d56`, closes that CI-contract gap and
  passes the corrected changed-scope gate15/15.
- Evidence head `6c899e5`, tree `0f6a642`, passed protected run `33500581310`,
  including all owner integrations, the Docker/browser journey, all three
  diagnostic scenarios and cleanup. Confirmation discussions
  `3903615478`/`3903615489` then exposed an intermediate-job bypass and
  role-agnostic link validation.
- Current correction source `6d17f13`, tree `37ded46`, bounds `governance` at
  the next top-level job and requires the exact reviewed destination sequence
  for every capability/role pair. Focused tests pass33/33, documentation tests
  pass17/17 and the changed-scope gate passes15/15.
- Evidence head `2200bcd`, tree `dae7665`, passed protected run `33503123616`,
  including the always-run governance proof, every owner runtime, the
  Docker/browser journey, all three diagnostic scenarios and exact cleanup.
- Discussions `3903615478`/`3903615489` are resolved. Final blocker-boundary
  confirmation completed on exact head `2200bcd` at
  `2026-09-01T11:55:49Z` and opened discussions
  `3903836632`/`3903836639`/`3903836650` for comment-only command matching,
  unbound capability display names and a stale evidence action.
- Result checkpoint `cfe24f2`, tree `14d2d28`, passed protected run
  `33505162146` in full. All five earlier PR60 discussions are resolved; the
  three new findings are accepted for batched correction.
- Correction source `73efa54`, tree `8538ffc`, strips YAML comment text before
  the job-scoped command proof, binds exact public capability names and
  advances from the existing result checkpoint. Focused tests pass34/34,
  documentation tests pass18/18 and the changed-scope gate passes15/15.
- Confirmation on evidence head `2861714` completed at
  `2026-09-01T12:30:55Z` and opened discussions
  `3904105488`/`3904105494`: hidden tables still satisfied public coverage and
  environment-only command text still satisfied governance policy.
- The accepted correction filters fenced and HTML-commented Markdown regions
  and extracts only unsuppressed step-level `run` commands. It rejects comment,
  environment, printed, suppressed and cross-job substitutes. Focused boundary
  tests pass35/35, documentation tests pass19/19 and the changed-scope gate
  passes15/15.
- Correction source `f239cf5`, tree `59094d0`, is frozen without product
  runtime or deployment changes.
- Confirmation on evidence head `a6e1388` completed at
  `2026-09-01T12:44:29Z` and opened discussions
  `3904209124`/`3904209135`/`3904209144` for CommonMark code indentation,
  conditional execution and a stale leading candidate summary.
- The accepted working correction computes indentation columns, rejects any
  conditional/non-blocking required-command step or job and aligns Current
  State to the latest frozen checkpoint. Focused boundary tests pass36/36,
  documentation tests pass20/20 and the affected gate passes15/15.
- Correction source `fe36d5b`, tree `e47c8a0`, is frozen without product
  runtime or deployment changes.
- Confirmation on evidence head `6236aa9` completed at
  `2026-09-01T12:56:03Z` and opened discussions
  `3904288838`/`3904288847`: raw HTML could hide the table and a here-document
  could retain command text without executing it.
- The accepted working correction tracks raw HTML containers and requires
  complete standalone Node.js/test steps with no shell wrapper or modified
  execution context. Focused boundary tests pass37/37, documentation tests
  pass21/21 and the affected gate passes15/15.
- Correction source `c7c9c50`, tree `e65dbc0`, is frozen without product
  runtime or deployment changes.
- Confirmation on evidence head `253756c` completed at
  `2026-09-01T13:09:32Z` and opened discussions
  `3904407727`/`3904407741`: arbitrary CommonMark type-7 HTML could hide the
  matrix, and the Router row did not substantiate P13-R07 DataLoader/query-count
  behavior.
- The accepted working correction tracks any standalone HTML tag through the
  blank-line boundary and adds the Catalog request DataLoader plus federated
  query-count test to the exact Router destination sequence. Focused boundary
  tests pass38/38, documentation tests pass22/22 and the affected gate
  passes15/15, including101 platform tests. Correction source `51f49bc`, tree
  `510a0da`, is frozen without product runtime or deployment changes.
- Evidence head `4cfb46c` passed protected run `33512605098` on attempt2. Its
  first attempt failed one unchanged conditional-immutable storage assertion
  after prior integration scenarios passed and cleaned zero resources; the
  rerun passed the full source/runtime/Docker/platform suite.
- Confirmation completed at `2026-09-01T13:22:12Z` and opened discussions
  `3904518312`/`3904518324`: marker-terminated CommonMark HTML blocks could hide
  the matrix, and visible requirement labels could drift independently of their
  reviewed destinations.
- The accepted working correction tracks processing-instruction, declaration
  and CDATA end markers and binds requirement labels to target anchors. Focused
  capability tests pass14/14, combined contract tests pass40/40, documentation
  tests pass24/24 and the affected gate passes15/15, including101 platform
  tests. Correction source `df8510b`, tree `6b6f81b`, is frozen without product
  runtime or deployment changes.

## Exact next actions

1. Publish the exact correction evidence for discussions
   `3904518312`/`3904518324`, then resolve both discussions and require protected
   CI plus one blocker-boundary confirmation.
2. Merge only after a clean exact-head review, verify exact-main CI and close
   item69 before activating
   item70/P14-R15.

## Execution boundary

Use WSL Git and Node.js24.19.0/pnpm11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Never use a `codex/` branch.
No hosted provider, credential, paid resource, public endpoint or media-rights
claim is authorized.

## Heavyweight evidence

Item69 is documentation and dependency-free verification tooling. Existing
runtime evidence remains applicable unless source wiring changes CI
classification or executable product behavior.

## Do not do yet

Do not rename/reorganize product implementation in item69. Do not start the
readability inventory (item70) before capability coverage verifies. Do not
activate hosted P14-R01–R12.
