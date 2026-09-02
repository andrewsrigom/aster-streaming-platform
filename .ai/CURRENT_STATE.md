# Current State

Last updated: 2026-09-01

## Active phase

**Phase 14 — Reference Quality, Capacity Validation, and Hosted Release**

Status: **IN_PROGRESS**. Phases00–13 are released. The credential-free
reference-quality track P14-R13–R18 is active under ADR-0048; P14-R13 is
verified. Hosted capacity and release requirements P14-R01–R12 remain planned
and inactive until the repository owner explicitly authorizes provider choices,
credentials and resource creation.

Item69 (P14-R14), the capability index, is the sole active item on
`docs/capability-index`, worktree `/tmp/aster-capability-index`, from exact
post-closeout main `56acfb74020a73beb0e17f7b92579b988d315982`. That base
contains item68 as `DONE`, the verified P14-R13 evidence and passing exact-main
run `33496347713`.

## Verified

Phases00–12 retain their linked acceptance and exact-main evidence. Phase13 is
released:

- final correction source `a99b3af5212e4fb967ed41230c3ca59fa394cca7`,
  tree `dc84bbc4cf63b0e8ce977a8f90fbb296f9f6903e`;
- evidence checkpoint `71823fe18d11832183e6af8acdab2210e7486af4`
  passed protected run `33485233911`;
- result checkpoint `db17bca9154984642d9b11d00d06c5ebd6d31b80`,
  tree `41650b4d0ee4244084e0d0d34d8aa387cda52cc3`, passed protected run
  `33486901296`;
- the final corrected-candidate review completed without a new finding and all
  six PR57 review threads are resolved;
- PR57 squash main `83cb5100408a691da15550194af6763c55170ba7`
  retained candidate tree
  `41650b4d0ee4244084e0d0d34d8aa387cda52cc3`;
- exact-main run `33489232182` passed source quality, every owner runtime,
  the Docker-only playable demo, all three local diagnostic scenarios, exact
  cleanup and the aggregate gate.

[Phase13 release evidence](../evidence/phase-13/release.md) is authoritative
for the final source, runs, review, merge and limitations. No hosted deployment
is claimed.

## Current work

Item69 implements P14-R14. The public capability index now maps eleven required
capabilities to requirements, authoritative owners, representative source,
focused adverse tests, checked-in evidence and operations. Its dependency-free
verifier requires exact coverage, owner/status vocabulary and the reviewed
destination sequence for every capability/role pair; existing documentation
validation proves the concrete paths, anchors, root-escape policy and
symbolic-target policy.

Focused documentation tests pass28/28. Documentation validation passes for250
documents, 2,880 headings, 1,633 links, four supported status claims and the
eleven exact capability rows. The always-run protected governance job now
executes the capability verifier and its adverse tests even for a
documentation-only change; CI policy fails if either command moves outside that
job. Combined capability/CI-policy tests pass44/44. The corrected changed-scope
gate passes15/15 tasks, including101
platform-policy,39 CI-policy and13 repository-memory tests. No product runtime
behavior changed, so heavyweight PostgreSQL, browser, media and Docker journey
evidence remains applicable. Prior protected acceptance passes; protected
acceptance of the current public-rendering/traceability correction, merge and
exact-main acceptance remain pending.

The preceding correction adds the web player/browser proof for P07-R10,
the failure laboratory/injection proof for P11-R08, quoted-attribute-aware
CommonMark type-7 visibility and quoted unsafe YAML-key recognition. It passes
the complete local candidate gate. Correction source
`94b6c453f5ceb9da7731a5c6778d3e520854c091`, tree
`f5604e41aac98388ab657ba0166f67790a9493b4`, froze that batch.

Evidence head `136def8`, tree `58e640d`, passed protected run
`33498081610`. Initial review discussions `3903242620`/`3903242629` found an
extended status label and one stale already-completed commit instruction.
Correction source `845933f`, tree `73b5487`, uses canonical `released` with
local/non-hosted qualification in prose, resumes from the existing checkpoint
and passes the repeated local gate13/13. Confirmation discussion `3903385086`
then identified that docs-only protected CI could bypass the capability check.
Source `2fff10d`, tree `2b80d56`, runs the verifier and its tests in the
always-run governance job and adds a job-scoped CI-policy regression. The
repeated local gate passes15/15; publication and new protected acceptance are
pending. Run `33499512053` on the superseded head is not accepted because its
Local platform diagnostic exercise timed out waiting for the Catalog TraceQL
search, although scoped cleanup completed. Evidence head `6c899e5`, tree
`0f6a642`, then passed protected run `33500581310`, including all three
diagnostic scenarios and scoped cleanup. Its confirmation opened discussions
`3903615478`/`3903615489` for an over-broad governance-job match and
role-agnostic repository links. Current correction `6d17f13`, tree `37ded46`,
bounds the job at the next top-level key, binds exact per-role destinations and
passes focused tests33/33 plus the local gate15/15. Evidence head `2200bcd`,
tree `dae7665`, passed protected run `33503123616`, including all owner
runtimes, the Docker/browser journey, all three diagnostic scenarios and exact
cleanup. Discussions `3903615478`/`3903615489` are resolved. Final
blocker-boundary confirmation completed on that exact head at
`2026-09-01T11:55:49Z` and opened discussions
`3903836632`/`3903836639`/`3903836650`: commented-out governance commands
could satisfy policy, display names were not bound to capability IDs and the
handoff could request duplicate evidence. Result checkpoint `cfe24f2`, tree
`14d2d28`, passed protected run `33505162146` in full. The three new findings
are accepted for batched correction; all five earlier PR60 discussions remain
resolved. Correction source `73efa54`, tree `8538ffc`, strips comment text from
the job-scoped command proof, binds reviewed capability display names and
advances from the existing checkpoint. Focused tests pass34/34, documentation
tests pass18/18 and the repeated changed-scope gate passes15/15. Protected
publication and confirmation of this correction began on head `2861714`.
Confirmation completed at `2026-09-01T12:30:55Z` and opened discussions
`3904105488`/`3904105494`: hidden Markdown tables still satisfied coverage and
environment-only command text still satisfied governance policy. The accepted
correction ignores fenced/commented tables and extracts only unsuppressed
step-level `run` commands. Focused boundary tests pass35/35, documentation tests
pass19/19 and the repeated changed-scope gate passes15/15. Protected
publication remains pending. Correction source `f239cf5`, tree `59094d0`, is
frozen without product runtime or deployment changes. Confirmation on evidence
head `a6e1388` completed at `2026-09-01T12:44:29Z` and opened discussions
`3904209124`/`3904209135`/`3904209144` for indented-code visibility,
conditional execution and the stale leading candidate summary. The accepted
working correction rejects CommonMark code indentation and any conditional or
non-blocking command step/job, and aligns this summary. Focused boundary tests
pass36/36, documentation tests pass20/20 and the affected gate passes15/15.
Correction source `fe36d5b`, tree `e47c8a0`, is frozen; protected publication
began on evidence head `6236aa9`. Its confirmation completed at
`2026-09-01T12:56:03Z` and opened discussions
`3904288838`/`3904288847`: raw HTML could hide the matrix and a here-document
could retain command text without executing it. The accepted working correction
tracks raw HTML blocks and validates complete standalone Node.js/test steps.
Focused boundary tests pass37/37, documentation tests pass21/21 and the affected
gate passes15/15. Correction source `c7c9c50`, tree `e65dbc0`, is frozen;
protected publication began on evidence head `253756c`. Its confirmation
completed at `2026-09-01T13:09:32Z` and opened discussions
`3904407727`/`3904407741`: an arbitrary type-7 HTML block could hide the matrix,
and the Router row did not connect P13-R07 to DataLoader/query-count proof. The
accepted working correction tracks arbitrary standalone HTML tags through the
blank-line boundary and adds the Catalog DataLoader plus federated query-count
test to the exact Router destination sequence. Focused boundary tests pass38/38;
documentation tests pass22/22 and the affected gate passes15/15, including101
platform tests. Correction source `51f49bc`, tree `510a0da`, is frozen;
protected run `33512605098` passed in full on attempt2 for evidence head
`4cfb46c`. Attempt1 is retained as a temporal observation: the unchanged
Identity storage integration reached conditional-immutable assertion `0 !== 1`
after all earlier scenarios passed and then cleaned zero remaining resources;
the rerun passed that scenario plus every owner runtime, Docker journey,
dependency audit and local diagnostic. Confirmation completed at
`2026-09-01T13:22:12Z` and opened discussions
`3904518312`/`3904518324`: processing-instruction/declaration/CDATA blocks could
still hide the table, and visible requirement labels were not bound to their
reviewed targets. The accepted working correction tracks all three
marker-terminated block forms and requires the exact requirement label derived
from each target anchor. Focused capability tests pass14/14, combined contract
tests pass40/40, documentation tests pass24/24 and the affected gate passes15/15,
including101 platform tests. Correction source `df8510b`, tree `6b6f81b`, is
frozen without product runtime or deployment changes. Evidence head `d2e4f02`
passed protected run `33516560847` in full. Its confirmation completed at
`2026-09-01T14:02:06Z` and discussion `3904890702` found that the incomplete
CommonMark type-6 tag set could still hide the table. Correction source
`2f94fdf`, tree `9f05826`, separates the four closing-tag blocks from all62
blank-line-terminated tags and tests every named tag. Focused capability tests
pass15/15, combined contract tests pass41/41, documentation tests pass25/25 and
the affected gate passes15/15, including101 platform tests. Protected
publication remains pending.

Evidence head `be4e5aa` began protected run `33519414100`. A review request
issued before GitHub synchronized the PR head completed against prior head
`d2e4f02` at `2026-09-01T14:30:23Z` and opened discussions
`3905151111`/`3905151124`: inline-code destinations could satisfy link coverage,
and a governance-job condition after `steps` could evade the pre-steps scan.
Both findings apply to the current implementation. The run was cancelled after
the source became superseded; its governance/dependency jobs passed, but it is
not acceptance evidence. Correction source `39bce7d`, tree `c4504d7`, removes
complete code spans before link extraction and recognizes job-level `if`, `env`
and `defaults` keys independently of order. Focused contracts pass42/42,
documentation tests pass26/26 and the affected gate passes15/15, including101
platform tests. Protected publication remains pending.

Exact-head confirmation on `66ef8d0` completed at `2026-09-01T14:46:15Z` and
opened discussions `3905297905`/`3905297914`: the media row linked normalization
tests rather than the PostgreSQL rights rejection, and escaped link syntax or
images could satisfy the interactive-link matcher. Run `33520880432` was
cancelled after the source became superseded; its Local platform and governance
jobs passed, but its cancelled source-quality job and failed aggregate make it
non-acceptance evidence. Correction source `00270fd`, tree `0bdbd6a`, links the
actual rights-gate integration proof and rejects escaped/image prefixes. Focused
contracts pass43/43, documentation tests pass27/27 and the affected gate
passes15/15, including101 platform tests. Protected publication remains
pending.

Exact-head run `33522645385` on `1abb457` passed classification, dependency
review, governance and source quality but failed Local platform when the
unchanged PostgreSQL diagnostic timed out waiting for its TraceQL search; exact
scoped cleanup completed. It is not acceptance evidence. Exact-head review at
`2026-09-01T15:03:24Z` opened findings `3905459958`/`3905459969`/
`3905459981`/`3905459992`: Playback and resilience lacked requirement-specific
proof destinations, a quoted `>` HTML attribute could hide the matrix and a
quoted YAML `if` key could bypass CI policy. The accepted working correction
closes all four boundaries. Focused contracts pass44/44, documentation tests
pass28/28, documentation validation covers1,628 links and the affected gate
passes15/15, including101 platform tests. Publication remains pending.

Evidence head `70e6a4f` passed protected workflow `33555283617` on attempt2.
Attempt1 passed source quality but its Redis diagnostic timed out waiting for
TraceQL after the Catalog/PostgreSQL scenarios passed; scoped cleanup was clean.
Exact-head review completed at `2026-09-01T20:32:44Z` and opened findings
`3908181277`/`3908181285`/`3908181293`: job-level non-blocking expressions
could bypass governance, Identity P02-R10 lacked its concurrent integration
proof and observability linked P12-R10 evidence instead of the listed
P12-R01/R08/R09 evidence. The accepted working correction closes all three
boundaries. Focused contracts pass44/44 and documentation validation covers
1,633 links. The complete affected gate passes15/15, including101
platform-policy,39 CI-policy and13 repository-memory tests. Publication remains
pending. Correction source `d45f3eafd56dabaff36b3f60f355110f99432d1d`,
tree `b1a004f08a1caf8aa8a9df07293df7571e9a3c22`, freezes the batch.

Checkpoint `366c92ad59d4380fa63bf9d081e2b378e7d1d2d8` passed exact-head run
`33558557773`. Its exact-head review completed at `2026-09-01T21:05:08Z` and
opened findings `3908433143`/`3908433153`/`3908433161`: the cached Discovery
row omitted P10-R04 and its Phase 10 SWR evidence, Engagement replay omitted its
owning P08-R03 requirement, and the P05-R10 route omitted public SSR/hydration
and real profile-selection browser proofs. Correction source
`44218b64fd3fae8d4cc17b1679d5c2dadc60eed1`, tree
`f2e366557fc14bf91227a796d84a9e303d4a00b1`, closes the three navigation gaps.
Focused contracts pass44/44, documentation tests pass28/28, documentation
validation covers1,638 links and the affected gate passes15/15. Publication
remains pending.

Checkpoint `5a86f6060c33a88c894ed0cd9ad32ceee1c73dc7` passed exact-head run
`33561120111`. Its exact-head review completed at `2026-09-01T21:31:48Z` and
opened findings `3908622075`/`3908622083`: comment stripping could end a type-6
raw HTML block at a nonblank comment-only source line, and governance could
depend on a conditional job skipped for documentation-only changes. Correction
source `7479a5c8ba28391b260b8415f8ac38f518d6a2f7`, tree
`1da233a4b6a451e59d3ffc89cc7eabd928ae2fb3`, closes both bypasses. Focused
contracts pass45/45, documentation tests pass29/29 and the affected gate passes
15/15, including101 platform-policy,39 CI-policy and13 repository-memory tests.
Publication remains pending.

Checkpoint `c69cb0eb00a73b3b308e496eb73b50ff735daf5f` passed exact-head run
`33563190969`. Its exact-head review completed at `2026-09-01T21:54:26Z` and
opened findings `3908769122`/`3908769126`: P06-R10 stopped before scratch
cleanup/publication rollback proof, and the repository-workflows row stopped
before the protected-CI implementation and its path/policy adverse tests.
Correction source `6d9551a12d5432b438a1221f355d8d8e71fb8485`, tree
`8bed61ffb3d772d1364d8472878da4c6a7402600`, closes both routes. Focused
contracts pass45/45, documentation tests pass29/29, documentation validation
covers1,643 links and the affected gate passes15/15. Publication remains
pending.

Checkpoint `68718dae39f2142d3f526bdcf8aca9a429fbcaec` passed exact-head run
`33565305721`. Its exact-head review completed at `2026-09-01T22:18:25Z` and
opened finding `3908922118`: a same-line CommonMark HTML comment could hide the
matrix header while exposing its suffix to the verifier. Correction source
`c7534eb2d01dd3cc2998e51dd738a9e15f8f2d72`, tree
`994e72a5fe2d6851c17aaa32c68f60a1b97c23d4`, discards the complete block-comment
source line. Focused contracts pass46/46, documentation tests pass30/30 and the
affected gate passes15/15. Publication remains pending.

Checkpoint `76f320dffda06f71d1e10471f06e03c30be25343`, tree
`42af66d84cd6bc2ab4c4a8a3c0326819be204a0b`, passed exact-head run
`33567227882`. Its exact-head review completed at `2026-09-01T22:43:19Z` and
opened findings `3909062923`/`3909062935`/`3909062942`/`3909062945`: closing
type-6 HTML tags, inline-HTML attributes and workflow-level run defaults could
bypass validation, while the Web row did not link the exact Phase 05 evidence.
Correction source `6285db283d4ae7622821fef2442313e76cdc7ce4`, tree
`8e181c97e0169b37ede39c01ec62ac980f7fb964`, closes all four. Focused contracts
pass47/47, documentation tests pass31/31, documentation validation covers1,645
links and the affected gate passes15/15. No product runtime or deployment
behavior changed. Publication remains pending.

Checkpoint `50a51843f66974c84cf7b9935081904ddf68553a`, tree
`7b1787582cbb346c0b57caa7f44c8d3f27887948`, received exact-head review at
`2026-09-01T23:14:04Z`. Findings `3909251619`/`3909251628` showed that inline
processing instructions, declarations and CDATA could hide proof links, and
workflow-level environment could inject shell startup behavior into governance.
Correction source `43fa31ca27d30c3b1243da7000f43e0c3c9df011`, tree
`b2f1c28a54c2872986b5d5803119413df3636d01`, closes both. Focused contracts
pass47/47 and the affected gate passes15/15, including101 platform-policy,39
CI-policy and13 repository-memory tests. No product runtime or deployment
behavior changed. Publication remains pending.

Checkpoint `6f45c50ab76e1e55f991ac491e5a407d2213730f`, tree
`5323983c92fe86cc425567262fb802c4168aa1d3`, received exact-head review at
`2026-09-01T23:24:56Z`. Findings `3909327287`/`3909327298` showed that an
escaped closing link bracket could satisfy a non-rendered proof link and that
the Catalog row stopped before generated publication, public visibility,
retirement removal and outbox proof. Correction source
`c7a1dd78ab4ef4a12d8bc88e165410395ece1c7a`, tree
`79046ff12ad19a4513f20ffdcbd4b1fc4ce0fca2`, closes both. Focused contracts
pass47/47, documentation validation covers1,646 links and the affected gate
passes15/15. No product runtime or deployment behavior changed. Publication
remains pending.

Checkpoint `a5be54f66d1e0357433f52cfe4bb530e8975d912`, tree
`65d50b5a07bdb6ee3d814c92bd3d9d2af11ccbab`, received exact-head review at
`2026-09-01T23:34:14Z`. Finding `3909383238` showed that a reviewed destination
inside another link's title could satisfy permissive extraction without being
navigable. Correction source `7df3ff66baa77a4298fa1b08ac8f98cf70791bf3`,
tree `83e8c036420d58c9cfa8c8347b05365e261fed89`, replaces permissive Markdown
extraction with a strict canonical link-list parser. Focused contracts
pass48/48, documentation tests pass32/32, documentation validation covers1,646
links and the affected gate passes15/15. No product runtime or deployment
behavior changed. Publication remains pending.

Checkpoint `47b80af8e388c0b5f3e8ba0bdf8e54d0ff0310eb`, tree
`a25fe257bf64416235eebd8f652cb16cdbf41d3f`, received exact-head review at
`2026-09-01T23:50:59Z`. Findings `3909484066`/`3909484071` showed that a
preceding governance step could poison later command lookup and that the public
status vocabulary used uppercase `Released` instead of canonical `released`.
Correction source `c618464b8a23de5e9f94a21867179cb0d01a5951`, tree
`75624f9b837c4952cc9fcf5ac4a3753d41182a0c`, makes the capability check/test
the first mutable governance steps after exact pinned setup and fixes the
label. Focused contracts pass48/48 and the affected gate passes15/15. No
product runtime or deployment behavior changed. Publication remains pending.

Checkpoint `346d7c3b65f74718e41f3317223b0eeff364c801`, tree
`f872d0e540d3dfec36374b8c2485a507aecd7ba2`, received exact-head review at
`2026-09-02T00:02:57Z`. Finding `3909542407` showed that adding a condition to
the classifier would skip its dependent governance job. Protected run
`33573346002` was invalidated by that finding and cancellation was requested;
it is not acceptance evidence. Correction source
`ee8d25ea62497d838a5cb29ada95f83fd88d7c39`, tree
`29202423f51a869974c8fabfd633e95eb1cf6024`, allowlists the exact classifier
job-level shape and rejects conditions, non-blocking behavior, dependencies and
empty matrix strategies. Focused contracts pass48/48 and the affected gate
passes15/15. No product runtime or deployment behavior changed. Publication
remains pending.

Candidate checkpoint `c8ad883c43b25f3bbc4e0155c033d8a09dc1d495`, tree
`8b5d6a933d0bc6ea05be075f6dc1c184d1534315`, received a clean exact-head review
at `2026-09-02T00:14:52Z`; no review thread remains open. Protected workflow
`33574235870` attempt1 passed classification, dependency review, governance and
source quality but Local platform timed out waiting for PostgreSQL TraceQL
search for trace `08f10a32423dfc23029f02e60e67d7f7`; scoped cleanup reported
clean. Attempt2 reran the failed path and passed Local platform and the required
aggregate, so the exact candidate is accepted. No product runtime or deployment
behavior changed. A result-only checkpoint, its exact-head confirmation, merge
and exact-main acceptance remain.

Result checkpoint `aec45b2a832a88b11d651e369af38bd5af57d8b5`, tree
`2e2720a6a0ada813bc0ae44463575f6074c441dc`, received exact-head review at
`2026-09-02T00:43:29Z`. Finding `3909731071` showed that the P13-R06 row stopped
at demand metadata and query-count proof instead of linking deadline,
concurrency and identity-aware rate-limit enforcement. Protected run
`33576156958` was invalidated and cancellation was requested; it is not
acceptance evidence. Correction source
`f600992de4c9ff3e6f56b5023395e7f71c2ac4b8`, tree
`6fd14ae407f50725586d30f178f16d2e01889ea7`, links Router traffic shaping,
Router runtime adverse tests and Identity's account-partitioned limiter
implementation and tests, then binds those destinations in the verifier.
Focused contracts pass48/48, documentation validation covers1,650 links and the
affected gate passes15/15. No product runtime or deployment behavior changed.
Publication remains pending.

Checkpoint `2ec803220b2877b9c06d35b3587d90cfef397351`, tree
`abe220fd7951cda5e6185b9abaf265b4fbedfaa1`, received exact-head review at
`2026-09-02T00:51:28Z`. Finding `3909766066` showed that the Discovery row
claimed independent partial/fallback rail behavior but linked only its cache
wrapper. Protected run `33576761686` was invalidated and cancellation was
requested; it is not acceptance evidence. Correction source
`258b36b29ddc9383e42825576845cf9da7925548`, tree
`7fb2a25665f251da196110146c5128b9181be92f`, adds the independent rail assembly
and unavailable, indeterminate, cancelled and fallback adverse tests. The same
traceability audit adds direct documentation and repository-memory
implementation/adverse proof for the already listed P00-R05/R08. Focused
contracts pass48/48, documentation validation covers1,656 links and the affected
gate passes15/15. No product runtime or deployment behavior changed.
Publication remains pending.

Checkpoint `0e043f73ebce63ad375fe9b30d697fd0bfc0baee`, tree
`72b41e9cfeb102091dd31af6dedac268b920a1ba`, received exact-head review at
`2026-09-02T01:01:03Z`. Findings `3909806922`/`3909806926` showed that a
governance job container could inject `NODE_OPTIONS` before mandatory commands
and that P05-R05 implementation navigation stopped at the profile dialog.
Protected run `33577392566` was invalidated and cancellation was requested; it
is not acceptance evidence. Correction source
`f85b83355d5171507f0788c2222d8b289d5caeb2`, tree
`c2cea95eab42fae6725d03fa476314bc950c1c0f`, allowlists the exact governance
job-level shape, rejects containers and adds representative navigation,
home-rail and catalog/title Web implementation sources. Focused contracts
pass48/48, documentation validation covers1,659 links and the affected gate
passes15/15. No product runtime or deployment behavior changed. Publication
remains pending.

Checkpoint `aa12f6b8ed0e2d7de14442180437b42807bbdbc7`, tree
`1c4206c6ec0443ebfc5932558de1ab784a251393`, received exact-head review at
`2026-09-02T01:10:16Z`. Finding `3909847310` showed that a list-contained fence
could hide an indented matrix while the parser still accepted it. Protected run
`33577968379` was invalidated and cancellation was requested; it is not
acceptance evidence. Correction source
`9e34ee24e6d26b59e42e4a207fd396747fdea1eb`, tree
`c60d9e010eeb0306e1e849618688a1edd520b731`, requires every public matrix line
at the Markdown root and adds the exact nested-list fence regression. Focused
contracts pass49/49, documentation validation covers1,659 links and the affected
gate passes15/15. No product runtime or deployment behavior changed.
Publication remains pending.

Checkpoint `8cd270fdc6fd1e22925738471f759f0a5d1ebb7a`, tree
`51eeb24fcff7bbac3927e2bac0cd377301e60176`, received exact-head review at
`2026-09-02T01:19:46Z`. Finding `3909888845` showed that prose immediately
before the matrix, without a blank separator, could prevent GFM table rendering
while the parser still accepted the rows. Protected run `33578618697` was
invalidated and cancellation was requested; it is not acceptance evidence.
Correction source `c2a05211982a6e0a08ac3a3e71d4b120741a441c`, tree
`790fe8d616835a4d9b3abddcfefba91883cc80d4`, requires the original blank block
boundary before the root matrix and adds the exact regression. Focused
contracts pass50/50, documentation validation covers1,659 links and the affected
gate passes15/15. No product runtime or deployment behavior changed.
Publication remains pending.

Checkpoint `30a22f2de193faa583007ba69200ff46c5f8385e`, tree
`8d7002e5f52fa559a698fa6a1fba55dddf884325`, received exact-head review at
`2026-09-02T01:28:18Z`. Finding `3909925502` showed that the governance job
could move to a mutable self-hosted runner while unrelated Ubuntu jobs
satisfied the global runner check. Protected run `33579229763` was invalidated
and cancellation was requested; it is not acceptance evidence. Correction
source `db1124576b64e3fc55975e0635ac8b845b6647c6`, tree
`61a21f6b8eb10067275355f24d2a46724e059271`, requires the exact reviewed
`ubuntu-24.04` governance runner and adds its regression. Focused contracts
pass51/51, documentation validation covers1,659 links and the affected gate
passes15/15, including101 platform-policy,40 CI-policy and13 repository-memory
tests. No product runtime or deployment behavior changed. Publication remains
pending.

Checkpoint `322df29f80f9e4696590665a2bd89bc02627572e`, tree
`4ae5096329c6032897e2c6cc7b3f0c592ae56e2a`, passed protected workflow
`33580036226` and received exact-head review at `2026-09-02T01:40:17Z`.
Findings `3909975893`/`3909975899` showed that the prerequisite classifier could
still move to a mutable runner and that a root-indented matrix could remain
inside an open hidden HTML element after CommonMark ended the raw block. The
review findings invalidate that workflow as final acceptance. Correction source
`1fb763738a6f7a0167b55da2c8139d08a4fbf426`, tree
`d0882e4e674785a442438d82b732650f998598f9`, requires the reviewed
`ubuntu-24.04` runner for all six protected jobs, tracks open HTML containers
across raw-block blank boundaries and verifies both hidden and correctly closed
containers. Focused contracts pass53/53, documentation validation covers1,659
links and the affected gate passes15/15, including101 platform-policy,40
CI-policy and13 repository-memory tests. No product runtime or deployment
behavior changed. Publication remains pending.

Item68 verifies P14-R13 as a documentation and delivery-governance slice:

- ADR-0048 separates the active reference track from the deferred hosted track;
- the Phase14 specification adds P14-R13–R18 without renumbering or weakening
  hosted P14-R01–R12;
- public roadmap, start-here documents and repository memory identify local
  reproducibility and navigability as the immediate outcome;
- Phase13 release evidence closes the former active item truthfully;
- repository-memory, documentation, formatting and changed-scope gates must
  pass before publication.

No GraphQL schema, service behavior, database, cache, event, media or runtime
configuration changes in item68.

Source `bd1191d0fb09f623c442ce6cee598cff2375b0d0`, tree
`80337eb7bc06f5c10fd86d30044ab9a77cdbb6a5`, passes repository-memory,
documentation, formatting, JSONL and changed-scope gates. The selected gate
passes9/9 tasks, including101 platform-policy and13 repository-memory tests.
[Phase14 evidence](../evidence/phase-14/README.md) records the exact local
candidate result. Evidence head `6bbb3da` passed protected run
`33492326127`. Initial review discussion `3902757945` found that the handoff
could request a duplicate evidence commit. Correction `7976c17`, tree
`0af69fe`, starts from the committed checkpoint. Evidence head `9ced435`
passed protected run `33492941279`; that discussion is resolved. Confirmation
discussions `3902818119`/`3902818121` found incorrect reference-release
terminology and four stale Phase13 candidate descriptions. Source `c0e4c85`,
tree `f559fab`, reserves `released` for deployment, aligns the current guides
and passes the repeated gate9/9. Evidence head `514467d` passed protected run
`33493742758`; those discussions are resolved. Blocker-boundary discussion
`3902887907` found hosted-only matrix cells still blocking reference
verification. Source `1a6233f`, tree `2f9a7b1`, separates P14-R13–R18 local
completion from P14-R01–R12 hosted evidence and passes the repeated gate9/9.
Evidence head `3087be1` passed protected run `33494434609`; discussion
`3902887907` is resolved. Final confirmation completed on that exact head
without a new finding, and all four PR58 threads are resolved. Final result
checkpoint `7f1dd6c`, tree `b7398a9`, passed protected run `33494938005`.
PR58 squash main `e925504` retained that exact tree; exact-main run
`33495029876` passed. P14-R13 and item68 are verified.
Closeout source `1078a94` passed protected run `33495326301`; review
discussion `3903007134` found its resume base pointed to the closeout's parent.
Correction `a9711e9`, tree `6b4e430`, requires post-closeout `origin/main`
and passes the repeated local gate7/7. Corrected protected acceptance remains
pending.

## Ordered reference-quality runway

Only one item may be active at a time:

1. item68 — verified the Phase13 release and reference-first runway (P14-R13);
2. item69 — publish a capability-to-code/test/evidence/operations index
   (P14-R14);
3. item70 — define readability guardrails and inventory concrete findings
   (P14-R15);
4. items71–73 — refactor representative owner-scoped slices with
   characterization evidence (P14-R16);
5. item74 — add rationale comments, examples and bounded reading paths
   (P14-R17);
6. item75 — run fresh-checkout and Docker-based reference acceptance and
   verify the reference track (P14-R18).

The detailed queue and activation conditions live in
[WORK_QUEUE.md](WORK_QUEUE.md).

## Verified local capabilities

The released baseline includes:

- guarded identity sessions and profile ownership;
- rights-aware Catalog ingestion and publication;
- federated GraphQL through Apollo Router with trusted-operation and bounded
  demand controls;
- public SSR discovery, title detail and accessible HLS playback;
- durable progress, resume and owned library behavior;
- versioned owner events, idempotent recovery and explicit Redis degradation;
- search and home discovery with measured query budgets;
- structured telemetry, executable SLIs/SLOs, alerts, dashboards and three
  telemetry-led failure diagnoses;
- Docker-only playable demonstration and exact fixture cleanup.

These are local/repository release claims backed by phase evidence, not claims
of public availability, production capacity or licensed commercial catalog.

## Not implemented

- P14-R15 readability standard and repository inventory;
- P14-R16 representative readability refactors;
- P14-R17 reading guides and focused examples;
- P14-R18 fresh-reference acceptance and reference-track verification;
- every hosted P14-R01–R12 outcome, including provider selection, production
  credentials, representative hosted load, backups/restores, edge controls,
  public endpoints, deployment rollback and production operations.

## Runtime and recovery

Use WSL Git and Node.js24.19.0/pnpm11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Integration fixtures use exact
project labels, loopback-only ports, tmpfs PostgreSQL and cleanup
`remaining=0`. Preserve retained databases, media and unrelated Docker
projects. Never use a branch beginning with `codex/`.

Heavy PostgreSQL, browser, media, owner-runtime or platform evidence remains
valid until an executable change can affect it. Documentation-only work runs
the repository-memory, link, formatting and changed-scope gates.

## Current risks

- Reference-track status can be confused with a hosted release; every claim
  must name the track.
- Readability can become subjective or behavior-changing; findings must cite a
  concrete reading problem and refactors require characterization tests.
- Broad cleanup can obscure ownership and invalidate evidence; changes stay
  small, context-owned and reversible.
- Examples can accidentally weaken security or licensing rules; they use
  synthetic identities, reviewed fixtures and the same trust boundaries as the
  implementation.
- Hosted work requires explicit owner activation and cannot create paid
  resources, credentials, public endpoints or media-rights claims autonomously.

## Next outcome

Publish, review and verify item69 (P14-R14) before renaming or reorganizing
implementation code.
