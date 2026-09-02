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
- Evidence head `d2e4f02` passed protected run `33516560847` in full;
  discussions `3904518312`/`3904518324` are resolved. Confirmation completed at
  `2026-09-01T14:02:06Z` and discussion `3904890702` found that incomplete
  CommonMark type-6 tag coverage could still hide the matrix.
- The accepted working correction separates the four end-tag blocks from the
  complete62-tag blank-line-terminated set and exercises every named tag.
  Focused capability tests pass15/15, combined contract tests pass41/41,
  documentation tests pass25/25 and the affected gate passes15/15, including101
  platform tests. Correction source `2f94fdf`, tree `9f05826`, is frozen without
  product runtime or deployment changes.
- Evidence head `be4e5aa` began run `33519414100`. A review triggered before the
  PR synchronized completed against prior head `d2e4f02` and opened discussions
  `3905151111`/`3905151124` for inline-code link coverage and job conditions
  appearing after `steps`. Both apply to the current implementation. The now
  superseded run was cancelled and is not acceptance evidence.
- The accepted working correction removes complete code spans before link
  extraction and detects job-level `if`, `env` and `defaults` keys independently
  of YAML order. Focused contracts pass42/42, documentation tests pass26/26 and
  the affected gate passes15/15, including101 platform tests. Correction source
  `39bce7d`, tree `c4504d7`, is frozen without product runtime or deployment
  changes.
- Exact-head confirmation on `66ef8d0` completed at
  `2026-09-01T14:46:15Z` and opened discussions
  `3905297905`/`3905297914` for the media adverse-proof destination and escaped/
  image link prefixes. Run `33520880432` was cancelled after supersession; Local
  platform passed, but the run is not acceptance evidence.
- The accepted working correction links the PostgreSQL rights-gate proof and
  rejects escaped links/images. Focused contracts pass43/43, documentation
  tests pass27/27 and the affected gate passes15/15, including101 platform
  tests. Correction source `00270fd`, tree `0bdbd6a`, is frozen without product
  runtime or deployment changes.
- Exact-head run `33522645385` on `1abb457` passed source quality but failed the
  unchanged PostgreSQL diagnostic on a TraceQL timeout; scoped cleanup passed,
  so the run is not acceptance evidence. Exact-head review opened findings
  `3905459958`/`3905459969`/`3905459981`/`3905459992` for incomplete P07-R10
  and P11-R08 proof routes, quoted-attribute HTML visibility and quoted unsafe
  YAML keys.
- The accepted working correction adds the web player/browser proof, failure
  laboratory/injection proof, complete quoted HTML attribute parsing and quoted
  YAML key handling. Focused contracts pass44/44, documentation tests pass28/28,
  documentation validation covers1,628 links and the affected gate passes15/15,
  including101 platform tests. Correction source `94b6c45`, tree `f5604e4`, is
  frozen. No product runtime or deployment behavior changed.
- Evidence head `70e6a4f` passed protected run `33555283617` on attempt2 after
  attempt1 hit a cleanly recovered Redis TraceQL timeout. Exact-head review at
  `2026-09-01T20:32:44Z` opened findings `3908181277`/`3908181285`/
  `3908181293` for job-level non-blocking expressions, missing Identity
  concurrency proof and mismatched observability evidence.
- The accepted working correction treats any job-level `continue-on-error` key
  as non-blocking, adds the Identity PostgreSQL/GraphQL integration workers and
  replaces P12-R10 diagnosis evidence with the exact P12-R01/R08/R09 artifacts.
  Focused contracts pass44/44, documentation validation covers1,633 links and
  the affected gate passes15/15, including101 platform tests. Correction source
  `d45f3ea`, tree `b1a004f`, freezes the batch.
- Checkpoint `366c92a` passed exact-head run `33558557773`. Its exact-head review
  opened findings `3908433143`/`3908433153`/`3908433161` for missing Discovery
  P10-R04/Phase 10 SWR ownership, missing Engagement P08-R03 replay ownership and
  incomplete P05-R10 browser proof.
- Correction source `44218b6`, tree `f2e3665`, links those exact requirements,
  evidence and browser proofs. Focused contracts pass44/44, documentation tests
  pass28/28, documentation validation covers1,638 links and the affected gate
  passes15/15. No product runtime or deployment behavior changed.
- Checkpoint `5a86f60` passed exact-head run `33561120111`. Its exact-head review
  opened findings `3908622075`/`3908622083` for a comment-only type-6 raw-HTML
  boundary and a governance dependency on a conditional job.
- Correction source `7479a5c`, tree `1da233a`, preserves the raw-block state from
  original source lines and requires governance to depend only on `classify`.
  Focused contracts pass45/45, documentation tests pass29/29 and the affected
  gate passes15/15. No product runtime or deployment behavior changed.
- Checkpoint `c69cb0e` passed exact-head run `33563190969`. Its exact-head review
  opened findings `3908769122`/`3908769126` for missing P06-R10 cleanup/rollback
  proof and missing protected-CI implementation/adverse proof.
- Correction source `6d9551a`, tree `8bed61f`, adds the scratch-cleanup,
  publication-rollback, CI workflow, path-classification and workflow-policy
  destinations. Focused contracts pass45/45, documentation tests pass29/29,
  documentation validation covers1,643 links and the affected gate passes15/15.
  No product runtime or deployment behavior changed.
- Checkpoint `68718da` passed exact-head run `33565305721`. Its exact-head review
  opened finding `3908922118` for a same-line HTML-comment suffix that could
  expose a hidden table header.
- Correction source `c7534eb`, tree `994e72a`, discards the complete CommonMark
  block-comment source line. Focused contracts pass46/46, documentation tests
  pass30/30 and the affected gate passes15/15. No product runtime or deployment
  behavior changed.
- Checkpoint `76f320d`, tree `42af66d`, passed exact-head run `33567227882`.
  Its exact-head review opened findings `3909062923`/`3909062935`/
  `3909062942`/`3909062945` for closing type-6 tags, inline-HTML link syntax,
  workflow-level run defaults and the Web row's Phase 05 evidence route.
- Correction source `6285db2`, tree `8e181c9`, closes all four. Focused
  contracts pass47/47, documentation tests pass31/31, documentation validation
  covers1,645 links and the affected gate passes15/15. No product runtime or
  deployment behavior changed.
- Exact-head review on checkpoint `50a5184`, tree `7b17875`, opened findings
  `3909251619`/`3909251628` for inline processing-instruction/declaration/CDATA
  links and workflow-level shell-startup environment injection.
- Correction source `43fa31c`, tree `b2f1c28`, closes both. Focused contracts
  pass47/47 and the affected gate passes15/15, including101 platform-policy,39
  CI-policy and13 repository-memory tests. No product runtime or deployment
  behavior changed.
- Exact-head review on checkpoint `6f45c50`, tree `5323983`, opened findings
  `3909327287`/`3909327298` for an escaped closing link bracket and incomplete
  Catalog lifecycle proof.
- Correction source `c7a1dd7`, tree `79046ff`, rejects escaped structural link
  delimiters and adds the generated-publication lifecycle proof. Focused
  contracts pass47/47, documentation validation covers1,646 links and the
  affected gate passes15/15. No product runtime or deployment behavior changed.
- Exact-head review on checkpoint `a5be54f`, tree `65d50b5`, opened finding
  `3909383238` for a destination hidden inside another link's title.
- Correction source `7df3ff6`, tree `83e8c03`, replaces permissive Markdown
  extraction with a strict canonical link-list parser. Focused contracts
  pass48/48, documentation tests pass32/32, documentation validation covers1,646
  links and the affected gate passes15/15. No product runtime or deployment
  behavior changed.
- Exact-head review on checkpoint `47b80af`, tree `a25fe25`, opened findings
  `3909484066`/`3909484071` for preceding-step command poisoning and uppercase
  public status vocabulary.
- Correction source `c618464`, tree `75624f9`, makes the capability proof the
  first mutable governance steps after exact pinned setup and uses canonical
  `released`. Focused contracts pass48/48 and the affected gate passes15/15. No
  product runtime or deployment behavior changed.
- Exact-head review on checkpoint `346d7c3`, tree `f872d0e`, opened finding
  `3909542407` because a conditional classifier could skip its dependent
  governance job. Protected run `33573346002` was invalidated and cancellation
  was requested; it is not acceptance evidence.
- Correction source `ee8d25e`, tree `2920242`, allowlists the exact blocking
  classifier shape and rejects conditions, non-blocking behavior, dependencies
  and empty matrix strategies. Focused contracts pass48/48 and the affected
  gate passes15/15. No product runtime or deployment behavior changed.
- Candidate checkpoint `c8ad883`, tree `8b5d6a9`, received a clean exact-head
  review at `2026-09-02T00:14:52Z`; no review thread remains open.
- Protected workflow `33574235870` attempt1 hit a cleanly recovered PostgreSQL
  TraceQL search timeout after all other jobs passed. Attempt2 reran the failed
  path and passed Local platform plus the required aggregate.

## Exact next actions

1. Publish the result-only checkpoint and request confirmation only after
   GitHub exposes the new exact PR head.
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
