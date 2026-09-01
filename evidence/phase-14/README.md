# Phase 14 Evidence Index

Status: **in progress — reference track**

Hosted capacity and release requirements P14-R01–R12 remain planned and
inactive. This evidence index does not claim a hosted environment, production
capacity, public endpoint or operational release.

## P14-R13 — Reference-first runway

Status: **verified**

Source commit `bd1191d0fb09f623c442ce6cee598cff2375b0d0`, tree
`80337eb7bc06f5c10fd86d30044ab9a77cdbb6a5`, records:

- the exact Phase13 release and limitations;
- ADR-0048's reference/hosted activation boundary;
- active reference requirements P14-R13–R18;
- the ordered work queue through reference-track acceptance;
- current public status and concise repository memory.

No executable product path changes in this source.

### Local candidate evidence

The following checks pass on source commit `bd1191d`:

| Check | Result |
|---|---|
| `pnpm ai:check` | PASS — 10 files, 75 queue items, 61 session entries, active/target P14-R13 |
| `pnpm docs:check` | PASS — 248 documents, 2,859 headings, 1,540 links, 4 status claims, 0 violations |
| Changed-file Prettier check | PASS |
| Phase13 JSONL parse | PASS |
| `git diff --check` | PASS |
| `pnpm check:changed` | PASS — 9/9 tasks, 0 cached, 101 platform-policy tests and 13 repository-memory tests |

The changed-scope gate selected documentation, repository-memory, security and
static platform-policy checks. It did not rerun PostgreSQL, browser, media,
owner-runtime or diagnostic environments because the source commit changes no
executable path or CI classification. Their exact Phase13 release evidence
remains applicable.

### Verified acceptance

Final result checkpoint `7f1dd6c0aca3db60589beb7a330565e244488c4b`,
tree `b7398a9b4eaf42d5dc7ca54ac3c4524dd2960e6d`, passed protected run
`33494938005`.

PR58 squash-merged at `2026-09-01T09:58:52Z` as
`e9255041ba45bd298b26857f6ee3d5a9b97089ec`. Main tree
`b7398a9b4eaf42d5dc7ca54ac3c4524dd2960e6d` exactly matches the final
candidate tree. Exact-main run `33495029876` completed successfully at
`2026-09-01T09:59:25Z`.

The protected and exact-main classifiers ran the documentation/security and
aggregate gates and skipped executable source and Local platform jobs. This is
the expected scope because item68 changes no executable path or CI
classification. P14-R13 is verified; P14-R14–R18 remain planned.

### Repository-memory closeout

Closeout source `1078a943ef02008e7918a293abcb9aa3b7687660`, tree
`c9999214bf37c26b843925ea3c9ee7a0d7a9ef87`, records P14-R13 as verified,
leaves no active work item and selects P14-R14 as the next requirement. Its
local changed-scope gate passes7/7 tasks and protected run `33495326301`
passes.

Review discussion `3903007134` found that two resume instructions named
`e925504`, the parent of the closeout, as item69's base. Source
`a9711e94a20abf4fe07aaf60984564e6735bb3b2`, tree
`6b4e430c7027e2af4b5c447d6bb4a62c8a359e1c`, instead requires the
post-closeout `origin/main` and verifies it contains item68 as `DONE` plus
the P14-R13 evidence. The repeated local changed-scope gate passes7/7 tasks.

### Protected result and review correction

Evidence checkpoint `6bbb3da3ab18f2279be945a072b97f66a36cc056`,
tree `f05fc60b7a5a2873a3c3830628d4b3da2d01772d`, passed protected run
`33492326127`. Classification, dependency review, documentation/security and
the aggregate gate passed; executable source quality and Local platform jobs
were correctly skipped.

Initial review completed on that exact head at
`2026-09-01T09:32:05Z`. Discussion `3902757945` found that the handoff's
first action asked a resuming agent to commit the evidence checkpoint even
though that commit already contained the evidence. Source
`7976c170049b5f43d83b4c6fd2c9ffd867ca315f`, tree
`0af69fee9a8985fca9f04bc06546ffd433010c2c`, now directs the agent to publish
the existing checkpoint if needed and explicitly forbids an empty or duplicate
evidence commit. The repeated local changed-scope gate passes9/9 tasks.

Corrected evidence head `9ced4351f851038ef7b91767f8b2b5b0c8f1cb70`
passed protected run `33492941279`; discussion `3902757945` is resolved.
Confirmation completed at `2026-09-01T09:39:57Z` and opened two
public-contract findings:

- discussion `3902818119` found that the specification permitted an undeployed
  local track to use the contract's `released` label;
- discussion `3902818121` found four current architecture/handbook guides
  still describing Phase13 as a candidate or unreleased.

Source `c0e4c8585f752bf1f7bcada2c38cb047a23e89b1`, tree
`f559fab795c06353b4a6c2db33ea71a547cac08d`, reserves `released` for the
deployed track, uses `verified` for the local reference checkpoint and aligns
all four current Phase13 guides with its exact release record. The repeated
local changed-scope gate passes9/9 tasks with0 cached.

Evidence checkpoint `514467dc17e948e56354827a0d85c9181445e7b3`,
tree `e34853bcfc594b7b1bc07a5e0cdb9ae5ef6e7d6d`, passed protected run
`33493742758`; both status discussions are resolved. Blocker-boundary
confirmation completed at `2026-09-01T09:49:05Z`. Discussion `3902887907`
found that the engineering-demonstration completion rule still treated hosted
event-loop/load/heap, game-day, operational-readiness and media-capacity cells as
reference-track prerequisites.

Source `1a6233fb90edfd6ab1100ee752147b6ff8a96236`, tree
`2f9a7b19c49120be82ac6e2152d18a4f11f3b3f0`, labels those matrix cells as
hosted P14-R01–R12 work and makes P14-R13–R18 plus fresh reproduction of already
released local checkpoints the complete reference-verification condition. The
repeated local changed-scope gate passes9/9 tasks.

Corrected evidence checkpoint
`3087be155af83eb1b61184e1385d629338b8e6a9`, tree
`34f70cb758606a0d01f38cc0d36a9eb1dd980574`, passed protected run
`33494434609`; discussion `3902887907` is resolved. Final blocker-boundary
confirmation completed on that exact head at `2026-09-01T09:56:10Z` without
a new finding. All four PR58 review threads are resolved.

## P14-R14 — Capability-to-proof index

Status: **implemented — protected acceptance pending**

Source commit `91009bbcc68c40f5947fd93925b7d79498d115b2`, tree
`78742f48c2f939b9073f419aaded775be1e58876`, records:

- one public index for the eleven required capability IDs;
- direct links from each capability to requirements, authoritative owner,
  representative source, focused adverse test, evidence and operations;
- a dependency-free bounded verifier for exact coverage/order, owner/status
  vocabulary, complete cells and repository-relative links;
- six focused verifier tests, including malformed UTF-8 and input bounds;
- integration with `docs:check`, `docs:test` and public navigation.

### Local candidate evidence

The following final checks pass on the corrected source tree at
`2026-09-01T11:32:09Z`:

| Check | Result |
|---|---|
| `pnpm docs:test` | PASS — 17/17 documentation and capability-verifier tests |
| `pnpm docs:check` | PASS — 250 documents, 2,880 headings, 1,623 links, four supported status claims, eleven capability rows, zero violations |
| `pnpm typecheck` | PASS |
| Focused ESLint | PASS — verifier and its tests |
| `pnpm ai:check` | PASS — 10 files, 75 queue items, 62 session entries, active/target P14-R14 |
| `pnpm turbo run build` | PASS — 17/17 workspace packages |
| `pnpm check:changed` | PASS — 15/15 tasks after the CI-policy correction; includes 101 platform-policy, 39 CI-policy and 13 repository-memory tests |
| `git diff --check` | PASS |

The first changed-scope attempt in the fresh worktree started type-aware lint
before local package build artifacts existed and reported derived unresolved
workspace types. It did not identify a verifier finding. Building the 17
workspace packages established the normal lint prerequisite; the final gate on
the source tree then passed 13/13 tasks.

This item changes documentation and repository verification tooling, not a
product runtime, schema, persistence, event, cache, media or deployment path.
Existing PostgreSQL, browser, media and Docker journey evidence remains
applicable. Protected CI, review, merge and exact-main acceptance remain
pending.

### Initial protected result and batched review remediation

Evidence checkpoint `136def8e12116cf0e498d7b28d58f2ece3c7087b`, tree
`58e640dee5bc42db03f94ebb49261ffcc6f7b602`, passed protected run
`33498081610`. Dependency review, documentation/security, source quality, the
Local platform, every owner runtime, the Docker-only playable demo and the
stable aggregate all passed.

Initial review completed on that exact head at
`2026-09-01T10:37:36Z` and opened two findings:

- discussion `3903242620` found that `released locally` extended the canonical
  maturity vocabulary instead of using `released` with local/hosted scope in
  surrounding prose;
- discussion `3903242629` found that the session log asked a resuming agent to
  commit source/evidence already present in the checkpoint.

Source `845933f4c396b9f81a4cff3d5e1b6a530aec7482`, tree
`73b5487efe3a66780e00eb146ddb0a3b6f9cc9a0`, uses the exact canonical status,
keeps the non-hosted qualification explicit, and directs resumption to publish
the existing checkpoint without a duplicate commit. Focused documentation,
repository-memory and lint checks pass; the repeated changed-scope gate passes
13/13 tasks.

### Confirmation finding and protected docs-only enforcement

Evidence head `1348c3d05a706d95ce9ac11e643bdaf4a803bc4d` started protected
run `33499512053`. Its documentation/security and dependency-review jobs
passed. The Local platform job reached the diagnostic exercises but timed out
waiting for the `scenario-catalog` TraceQL search for trace
`0e089c7a8a474aaf0241cc3323d1ad8d`; scoped cleanup completed. The same
diagnostic path passed on initial protected run `33498081610`, and no product
runtime path changed. The run is recorded as a failed temporal observation,
not accepted evidence; the failed step belongs to a subsequently cancelled run,
and the later CI-contract correction supersedes this head.

Confirmation review completed at `2026-09-01T10:55:55Z` and opened discussion
`3903385086`: a later change confined to the capability index would select the
documentation-only path, while the always-run governance job executed only the
general documentation verifier and omitted the capability verifier and its
tests.

Correction source `2fff10d76595abf2372c301d0cacd4c098f7fa14`, tree
`2b80d5694a2e2cd3bcb52bbd661e4d0dd05cf7fd`, now executes the capability
verifier and adverse tests inside the always-run governance job. CI policy
validation checks that both commands remain in that specific job; moving them
elsewhere fails the new regression test. Focused policy/index tests pass32/32,
and the repeated changed-scope gate passes15/15 tasks. Publication, protected
acceptance and one final blocker-boundary confirmation remain pending.

### Protected correction result and additional boundary remediation

Evidence head `6c899e575df86196348fcdae2a01454ee2b9c57b`, tree
`0f6a6426e37432ac999eb810e86111c59f61cf9e`, passed protected run
`33500581310`. The always-run governance job exercised the capability verifier
and tests successfully. Source quality, all owner integrations, generated media,
the Docker/browser journey, all three injected diagnostic scenarios, scoped
cleanup, dependency audit and the aggregate gate also passed. This successful
diagnostic repeat supersedes the temporal TraceQL observation from cancelled
run `33499512053` without hiding it.

The blocker-boundary confirmation completed at `2026-09-01T11:26:19Z` and
opened two further public-contract findings:

- discussion `3903615478` demonstrated that the governance-job matcher could
  consume an inserted job before `quality`, allowing the commands to move into
  an `if: false` job without a policy violation;
- discussion `3903615489` demonstrated that existing but unrelated repository
  links could be exchanged across capability roles while both validators still
  passed.

Correction source `6d17f13eaffd3c2c3243cbd7f983bd066afd90a2`, tree
`37ded461d71b2e23ea5197650f879c94888b3b04`, extracts `governance` only until
the next top-level job and binds every capability/role pair to its reviewed
destination sequence. Regression tests insert the skipped intermediate job and
swap real Requirement, Implementation, Adverse test, Evidence and Operations
destinations. Focused policy/index tests pass33/33, documentation tests pass
17/17 and the repeated changed-scope gate passes15/15 tasks.

Evidence head `2200bcdc837b9e97ebf6b1e17fd84865d43b6032`, tree
`dae7665d34441890d2337ea5245e60ac66d85ecc`, passed protected run
`33503123616`. The always-run documentation/security job exercised the exact
capability verifier and its adverse tests. Source quality, every owner runtime,
the generated-media path, Docker/browser journey, dependency audit, all three
injected diagnostic scenarios, exact scoped cleanup and the aggregate gate
passed. Discussions `3903615478` and `3903615489` are resolved.

The permitted blocker-boundary confirmation completed at
`2026-09-01T11:55:49Z` and opened three additional findings on the subsequently
published result checkpoint `cfe24f2917efb32e7fea44071a2454e3a3ae2e5b`,
tree `14d2d28726850679f29d3228e833be84599fade0`:

- discussion `3903836632` found that YAML comment text inside `governance`
  could satisfy the command matcher after the executable command was replaced;
- discussion `3903836639` found that the public capability display name was
  not bound to its reviewed ID;
- discussion `3903836650` found that the handoff could still direct a resuming
  agent to record an already committed evidence checkpoint.

Result-checkpoint run `33505162146` passed the complete protected gate,
including every owner runtime, the generated-media path, Docker/browser
journey, all three diagnostic scenarios, exact cleanup and aggregate
protection. The three findings are accepted for batched correction; publication
and confirmation of that correction, merge and exact-main acceptance remain
pending.

Correction source `73efa54827d1535cb818399eea46e7910639d5b1`, tree
`8538ffccf36f39eec937bad861fa98e056d506bb`, removes YAML comment text before
checking commands inside the exact `governance` job, binds each ID to its
reviewed public capability name and advances the handoff from the already
recorded result checkpoint. Regression tests retain each required command only
as an inline YAML comment and substitute a misleading capability name.

Focused CI-policy and capability-index tests pass34/34. Documentation tests
pass18/18; documentation validation still covers250 documents, 2,880 headings,
1,623 links, four status claims and eleven rows with zero violations.
TypeScript, focused ESLint, repository-memory validation and `git diff --check`
pass. The repeated changed-scope gate passes15/15 tasks, including101
platform-policy,39 CI-policy and13 repository-memory tests. Protected
publication and confirmation of this correction, merge and exact-main
acceptance remain pending.

Confirmation on evidence head `28617148ec66d4a2bf5051ace49e67956ba553c4`
completed at `2026-09-01T12:30:55Z` and opened two additional public-contract
findings:

- discussion `3904105488` found that a complete table inside a balanced fence
  or HTML comment still satisfied the capability verifier while remaining
  unavailable to a Markdown reader;
- discussion `3904105494` found that command text in an unused step-level
  environment value still satisfied the governance matcher without an actual
  invocation.

The findings are accepted for batched correction. Table discovery now excludes
fenced and HTML-commented regions while preserving source line numbers. The CI
policy proof extracts only unsuppressed step-level `run` commands and rejects
comment-only, environment-only, printed, suppressed and cross-job command text.
Focused protected-boundary tests pass35/35, documentation tests pass19/19 and
the repeated changed-scope gate passes15/15 tasks, including101
platform-policy,39 CI-policy and13 repository-memory tests. Publication,
protected acceptance and one blocker-boundary confirmation remain pending.

Correction source `f239cf57273880ce1e4988985b60263db1c73e8b`, tree
`59094d0f970500b252220cb583376a31dca629a3`, is the frozen implementation of
that visibility and executable-step proof. The implementation remains bounded
to dependency-free Markdown/workflow parsing and changes no product runtime or
deployment behavior.

Confirmation on evidence head `a6e13889499aecea6782b2db6dfc2858eeb237c9`
completed at `2026-09-01T12:44:29Z` and opened three findings:

- discussion `3904209124` found that four-space indentation rendered the table
  as CommonMark code while still satisfying the table parser;
- discussion `3904209135` found that an event-conditional capability step
  remained accepted even though pull-request governance could skip it;
- discussion `3904209144` found that the leading Current State summary still
  called source `6d17f13` the current candidate after later frozen corrections.

The findings are accepted for one batch. Table parsing now computes space/tab
indentation columns and rejects candidate lines at the CommonMark code
threshold. Governance extraction rejects job-level defaults/conditions and any
required-command step with a condition, custom shell or non-blocking failure
policy; exact command forms cannot be replaced with printed or shell-suppressed
text. Current State identifies the latest frozen correction and current pending
review findings. Focused boundary tests pass36/36, documentation tests pass20/20
and the repeated changed-scope gate passes15/15 tasks, including101
platform-policy,39 CI-policy and13 repository-memory tests. Protected
publication remains pending.

Correction source `fe36d5b22ab59ed25812c6c59cd0e2ef9448c33f`, tree
`e47c8a06a6f05c18f659be3938867364e032e988`, freezes the indentation,
conditional-execution and repository-memory correction without changing
product runtime or deployment behavior.

Confirmation on evidence head `6236aa9f3a30a63a09141e252774b3469aef0e66`
completed at `2026-09-01T12:56:03Z` and opened two further findings:

- discussion `3904288838` found that a matrix wrapped in `<pre>` remained
  accepted even though raw HTML rendered its links as preformatted text;
- discussion `3904288847` found that a literal here-document body containing
  the exact command line remained accepted without executing Node.js.

The findings are accepted for one batch. Markdown visibility now tracks raw
HTML block containers as well as comments, fences and indentation. Governance
validation evaluates complete unsuppressed steps: the capability check must be
a standalone simple Node.js command and its tests must be one finite
`node --test` invocation containing only checked-in tool-test paths. A
here-document, function body, printed string, extra shell control or modified
execution environment fails closed. Focused boundary tests pass37/37,
documentation tests pass21/21 and the repeated changed-scope gate passes15/15
tasks, including101 platform-policy,39 CI-policy and13 repository-memory tests.
Protected publication remains pending.

Correction source `c7c9c50fe65a011438c533c8ff3434c3b3e7eb09`, tree
`e65dbc0b3cda2c24ad7a1bf974082a026a9afc9d`, freezes the raw-HTML and
standalone-step correction without changing product runtime or deployment
behavior.

Confirmation on evidence head `253756c758c83e550db1d34ee94e85cc47c8b9ca`
completed at `2026-09-01T13:09:32Z` and opened two findings:

- discussion `3904407727` found that an arbitrary standalone `<span>` tag starts
  a CommonMark type-7 HTML block until the next blank line, while the parser
  only tracked a named tag set;
- discussion `3904407741` found that the Router row listed P13-R07 but linked
  only demand-control source/tests rather than a request-scoped DataLoader and
  query-count proof.

The findings are accepted for one batch. Visibility state now treats any
standalone complete HTML tag as a raw block through the blank-line boundary,
while named raw containers remain active through their closing tag. The Router
row and its reviewed destination sequence add the Catalog request-scoped
DataLoader and the federated query-count proof alongside demand controls.
Focused boundary tests pass38/38; documentation validation covers1,625 links
with zero violations, and documentation tests pass22/22. The affected gate
passes15/15, including101 platform tests; TypeScript, focused lint and diff
validation also pass. Correction source
`51f49bc845a99ce23c65a12c436c02390ca92083`, tree
`510a0da0fd67879bb397d22356da34d57ad936b6`, freezes the two-finding batch
without product runtime or deployment changes. Protected publication remains
pending.

Evidence head `4cfb46cb2699406d999ae1294483effa0a64fff2`, tree
`61e91ce91b9bcd9eccef95290d2b0e7cee965158`, passed protected run
`33512605098` in full on attempt2 at `2026-09-01T13:44:21Z`. Attempt1 remains a
temporal observation rather than accepted evidence: the unchanged Identity
storage integration reached conditional-immutable assertion `0 !== 1` after
all earlier scenarios passed, then scoped cleanup reported zero remaining
resources. The selective rerun passed that scenario, every owner runtime, the
Docker-only journey, dependency audit and complete local-platform diagnostics.

The confirmation on that exact head completed at `2026-09-01T13:22:12Z` and
opened two findings:

- discussion `3904518312` found that CommonMark processing-instruction,
  declaration and CDATA blocks could still hide the public matrix;
- discussion `3904518324` found that a visible requirement label could drift
  while retaining its reviewed target.

The findings are accepted for one batch. Visibility state now tracks the exact
`?>`, `>` and `]]>` end markers, and requirement labels must equal the target
anchor in canonical uppercase form. Focused capability tests pass14/14,
combined contract tests pass40/40 and documentation tests pass24/24. The
affected gate passes15/15, including101 platform tests; TypeScript, lint,
formatting and diff validation also pass. Correction source
`df8510b0804c54dc36d829e017798f8de322bca5`, tree
`6b6f81b7e249b0771dce1751ce1dd6b1e1245784`, freezes the two-finding batch
without product runtime or deployment changes. Evidence head
`d2e4f0262c9675736fc04c968f9cb50c547f948f` passed protected run
`33516560847` at `2026-09-01T14:15:15Z`. Dependency review, governance, source
quality, every owner runtime, the Docker-only playable demo, local platform,
diagnostics, scoped cleanup, dependency audit and aggregate gate passed.
Discussions `3904518312` and `3904518324` are resolved.

The confirmation on that exact head completed at `2026-09-01T14:02:06Z` and
opened discussion `3904890702`: named HTML handling did not include the complete
CommonMark type-6 tag set, so an opener such as `<p>` or `<h1>` immediately
before the matrix could hide it until the next blank line without a violation.

The finding is accepted. Visibility state now separates the four CommonMark
blocks that end at a matching closing tag from the complete62-tag set that ends
at a blank line. A regression exercises every type-6 tag around the exact
matrix. Focused capability tests pass15/15, combined capability/CI-policy tests
pass41/41 and documentation tests pass25/25. Documentation validation covers250
documents, 2,880 headings, 1,625 links, four status claims and eleven rows with
zero violations. The affected gate passes15/15, including101 platform-policy,
39 CI-policy and13 repository-memory tests; formatting and diff validation also
pass. Correction source `2f94fdf2d5d8acf0adb4438a0036f54dc9c1749f`,
tree `9f058267a8fbdac5102d80f0928478595d99c638`, freezes the correction without
product runtime or deployment changes. Protected publication remains pending.

Evidence head `be4e5aa7ff0feb60a4caed9d1efd08ac0231c3a1` began protected run
`33519414100`. A confirmation request issued before GitHub synchronized the PR
head completed against prior head `d2e4f02` at `2026-09-01T14:30:23Z` and
opened two fresh findings that also apply to `be4e5aa`:

- discussion `3905151111` found that a reviewed Markdown destination wrapped in
  backticks still satisfied link extraction even though it rendered as literal
  code rather than an interactive link;
- discussion `3905151124` found that a governance job's `if: false` key after
  `steps` evaded the job-condition scan while leaving earlier commands counted.

Run `33519414100` was cancelled after the source became superseded. Its
classification, dependency-review and governance jobs passed, but the
cancelled runtime jobs and failed aggregate are not acceptance evidence.

The findings are accepted for one batch. Link extraction removes complete code
spans before parsing destinations, including multi-backtick delimiters. The CI
policy recognizes job-level `if`, `env` and `defaults` keys independently of
their order relative to `steps`. Focused capability/CI-policy tests pass42/42,
documentation tests pass26/26 and documentation validation covers250 documents,
2,880 headings, 1,625 links, four status claims and eleven rows with zero
violations. The affected gate passes15/15, including101 platform-policy,39
CI-policy and13 repository-memory tests. Correction source
`39bce7daa6c55231c4eaba913861d50f0c25e609`, tree
`c4504d7fd44c0f2c9e13b0a7f647bc42de2d3923`, freezes the batch without product
runtime or deployment changes. Protected publication remains pending.

## Planned evidence

- P14-R15 readability guardrails and findings inventory
- P14-R16 owner-scoped refactoring characterization
- P14-R17 examples and reading-path verification
- P14-R18 fresh-checkout and Docker reference verification
