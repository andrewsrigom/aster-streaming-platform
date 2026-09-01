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

Focused documentation tests pass20/20. Documentation validation passes for250
documents, 2,880 headings, 1,623 links, four supported status claims and the
eleven exact capability rows. The always-run protected governance job now
executes the capability verifier and its adverse tests even for a
documentation-only change; CI policy fails if either command moves outside that
job. The corrected changed-scope gate passes15/15 tasks, including101
platform-policy,39 CI-policy and13 repository-memory tests. No product runtime
behavior changed, so heavyweight PostgreSQL, browser, media and Docker journey
evidence remains applicable. Prior protected acceptance passes; correction of
the current public/governance/repository-memory findings, merge and exact-main
acceptance remain pending.

Correction source `c7c9c50fe65a011438c533c8ff3434c3b3e7eb09`, tree
`e65dbc0b3cda2c24ad7a1bf974082a026a9afc9d`, is the latest frozen correction
recorded in [Phase14 evidence](../evidence/phase-14/README.md).

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
protected publication remains pending.

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
