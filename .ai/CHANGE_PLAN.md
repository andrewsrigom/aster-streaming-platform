# Work Item: Publish the capability-to-proof index

- Status: IN_PROGRESS
- Owner: Repository documentation and verification tooling
- Phase: 14
- Requirement IDs: P14-R14
- Created: 2026-09-01
- Updated: 2026-09-01

## Outcome

A reader can start from one maintained index and trace each primary Aster
capability to its requirement, authoritative owner, representative
implementation, focused adverse test, evidence and operational guidance. A
repository check fails when required capability coverage or a linked path
disappears.

## Current behavior

The documentation map, engineering-demonstration matrix, phase specifications
and evidence indexes expose the necessary material, but a reader must already
know how those documents correspond. The general documentation validator proves
that written Markdown links resolve; it does not require the finite P14-R14
capability set or the mapping columns.

Item68/P14-R13 is verified. PR59 squash main
`56acfb74020a73beb0e17f7b92579b988d315982`, tree
`8f6603e74a399aef54cbf0ea5e551848c686b738`, passed exact-main run
`33496347713`. Item69 starts from that post-closeout main.

## Proposed behavior

Add `docs/00-start-here/CAPABILITY_INDEX.md` with one bounded table covering
the five bounded contexts plus Router/GraphQL, Web/accessibility, media,
resilience, observability and repository workflows. Each row uses explicit
domain vocabulary and repository-relative links.

Add a dependency-free verifier with focused tests and execute both in the
always-required governance job, including for documentation-only changes. It
requires the exact capability IDs, authoritative owner and status vocabulary,
the complete mapping columns and the reviewed destination set for every
capability/role pair. Existing `docs:check` continues to prove that every linked
file and anchor exists.

## Boundaries

- Owning context: repository documentation and verification tooling
- Affected services/packages: root documentation scripts and protected CI
  governance job only
- Authoritative data: phase specifications, source, tests, evidence and
  operations documents remain authoritative; the index is navigation
- Read models/caches: none
- Trust boundaries: the Markdown table and links are untrusted parser input
- External dependencies: none

## Invariants

- The index does not become a second requirements, architecture or evidence
  source.
- Every row names one authoritative owner even when other contexts cooperate.
- Representative links are concrete and maintained, not exhaustive file lists.
- The Catalog lifecycle route reaches generated publication, public visibility,
  retirement removal and the resulting outbox record in addition to the
  focused editorial workflow tests.
- The media adverse-test destination reaches the PostgreSQL processing path and
  proves current rights are rechecked before claim, check and completion; its
  P06-R10 route also reaches disposable scratch cleanup and publication rollback.
- Playback P07-R10 reaches the web player and its browser adverse-state proof;
  resilience P11-R08 reaches the failure laboratory and its injection tests.
- Identity P02-R10 reaches the PostgreSQL and GraphQL concurrency/session
  workers. Observability P12-R01/R08/R09 reaches its exact trace, cardinality and
  exporter-failure evidence rather than the separate P12-R10 diagnosis proof.
- Engagement replay reaches its owning P08-R03 requirement. Discovery cached
  rails reach P10-R04 and the Phase 10 SWR release evidence in addition to the
  Phase 09 independent-rail contract. P05-R10 reaches the public SSR/hydration,
  navigation and real profile-selection browser proofs. P05-R05 reaches its
  Phase 05 web-boundary, screen-reader and UI-foundation evidence.
- Repository workflow proof reaches both the bounded local runner and the
  protected CI workflow, including path-classification and policy adverse tests.
- Status follows the repository's planned/implemented/verified/released
  vocabulary and does not promote hosted P14-R01–R12 work.
- Missing, duplicate, extra or malformed capability rows fail closed with
  bounded deterministic diagnostics.
- Existing but unrelated repository links fail when they do not match the
  reviewed requirement, implementation, adverse-test, evidence or operations
  destination for that capability.
- A row may name multiple representative destinations when one source/test pair
  cannot substantiate every listed requirement; the exact ordered sequence
  remains protected.
- Each capability ID is bound to its reviewed public display name; links and
  owner metadata cannot mask a misleading label. Inline-code destinations do
  not satisfy a link role because they are not interactive Markdown links;
  escaped link syntax, including any escaped structural delimiter, images and
  Markdown-looking syntax inside inline HTML tags, attributes, processing
  instructions, declarations or CDATA do not satisfy it either.
- Only a visible Markdown table satisfies capability coverage; rows inside
  fenced code, HTML comments, named raw containers, arbitrary CommonMark type-7
  HTML blocks, complete CommonMark type-6 block tags or four-column indented
  code are ignored. Complete type-7 tags recognize quoted attribute values that
  contain `>`. A comment-only source line remains nonblank while a type-6 raw
  block is active; closing type-6 tags with trailing content start the same raw
  block. Comment stripping cannot end that block early. A source line that
  starts a CommonMark HTML-comment block is discarded completely even when the
  comment closes before a table-like suffix on the same line.
- Documentation-only changes cannot bypass the capability-index verifier or
  its adverse tests in protected CI; the policy parser bounds `governance` at
  the next top-level job rather than a later named job and recognizes only
  unconditional, blocking step-level `run` invocations in an unconditional job.
  Job-level conditions are recognized independently of YAML key order. Quoted
  YAML keys have the same suppressing semantics as plain keys. Job-level
  `continue-on-error` expressions are non-blocking even when their value is not
  the literal `true`. Workflow-level run defaults and environment are forbidden
  because they can replace or intercept every governance command. Governance
  depends exactly on `classify`, never on a conditional job that
  documentation-only changes skip.
  The required check is a standalone simple Node.js command and the required
  test is one finite `node --test` invocation, not comments, here-documents,
  environment values, printed command text or suppressed steps.
- No product behavior, schema, persistence, event, cache, media or deployment
  configuration changes.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Required capability row is missing or duplicated | `docs:check` fails with its stable capability ID | Finite verifier diagnostic |
| Unknown row or owner/status drift appears | Reject the index before publication | Finite verifier diagnostic |
| A traceability column lacks a Markdown link | Reject the row before the general link scan | Column-specific diagnostic |
| A valid repository link is moved into the wrong capability or role | Reject the row against its reviewed destination set | Capability-and-column diagnostic |
| A linked path or anchor disappears | Existing documentation validation fails | Broken-link or missing-anchor diagnostic |
| A later workflow edit removes, comments out, relocates or isolates the index check/tests in another job | CI policy tests fail before protected acceptance | Job-scoped command diagnostic |
| A capability display name drifts from the reviewed public vocabulary | Reject the row before publication | Capability-and-name diagnostic |
| The complete table is moved into a fence or HTML comment | Treat the public table as missing | Visibility-aware table diagnostic |
| A same-line HTML comment prefixes the table header | Discard the complete source line rather than parse its suffix | Comment-block diagnostic |
| The complete table is indented as CommonMark code | Treat the public table as missing | Indentation-aware table diagnostic |
| The complete table is wrapped in a raw HTML block | Treat the public table as missing | HTML-block-aware table diagnostic |
| An arbitrary complete HTML tag begins a type-7 block around the table | Ignore rows through the CommonMark blank-line boundary | Generic HTML-block diagnostic |
| A CommonMark type-6 block tag precedes the table | Ignore rows through the CommonMark blank-line boundary | Named HTML-block diagnostic |
| A closing CommonMark type-6 tag with trailing content precedes the table | Ignore rows through the CommonMark blank-line boundary | Closing HTML-block diagnostic |
| A comment-only line follows a type-6 block opener | Keep the raw block active because the original source line is nonblank | Source-line visibility diagnostic |
| A processing instruction, declaration or CDATA block wraps the table | Ignore rows through the matching CommonMark end marker | Marker-terminated HTML-block diagnostic |
| A requirement link keeps its target but mislabels the visible requirement ID | Reject the row before publication | Requirement-label diagnostic |
| A reviewed destination is wrapped in an inline code span | Treat the interactive link as missing | Link-role diagnostic |
| Reviewed link syntax is escaped or converted to an image | Treat the interactive link as missing | Link-prefix diagnostic |
| A closing bracket or parenthesis in reviewed link syntax is escaped | Treat the interactive link as missing | Link-delimiter diagnostic |
| Reviewed link syntax appears inside an inline HTML tag or attribute | Treat the interactive link as missing | Inline-HTML diagnostic |
| Reviewed link syntax appears inside a processing instruction, declaration or CDATA | Treat the interactive link as missing | Inline-raw-HTML diagnostic |
| A listed behavior lacks its owning requirement, evidence, implementation or complete adverse proof | Require the reviewed additional destinations in that row | Per-role destination diagnostic |
| A required command is conditional, non-blocking or belongs to a conditional job | Treat the command as absent | Executable-step diagnostic |
| An unsafe workflow key is quoted | Treat it like the equivalent plain YAML key | YAML-key diagnostic |
| A governance job is non-blocking through an expression | Treat every command in the job as absent | Job-level execution diagnostic |
| A job-level condition appears after `steps` | Treat every command in the job as absent | Order-independent job diagnostic |
| Governance depends on a conditional job instead of the classifier | Treat the capability commands as unavailable to documentation-only CI | Dependency diagnostic |
| Workflow-level run defaults can replace governance commands | Reject the workflow before command validation | Workflow-default diagnostic |
| Workflow-level environment can inject shell startup behavior | Reject the workflow before command validation | Workflow-environment diagnostic |
| Required command text exists only inside a here-document or shell structure | Treat the command as absent | Standalone-command diagnostic |
| Table size or input encoding is invalid | Stop within fixed byte/row limits | Bounded input diagnostic |

## Data and contracts

- Schema/migration: none
- GraphQL: none
- Events: none
- Cache: none
- Compatibility: adds one public navigation document and extends the existing
  `docs:check` plus always-required protected governance contracts
- Retention/deletion: no product data or evidence deletion

## Security and privacy

- Authorization: no runtime change
- Input limits: verifier bounds file bytes, rows, columns and diagnostics
- Sensitive data: index contains only repository paths and public engineering
  vocabulary
- Abuse cases: reject pathless prose, duplicate IDs and arbitrary unbounded
  table content; rely on the existing link validator for root escape and
  symbolic-target refusal

## Implementation steps

1. Inventory exact representative implementation, adverse-test, evidence and
   operations paths for all eleven required capability IDs.
2. Define the compact capability-index table and status/owner vocabulary.
3. Implement the bounded dependency-free verifier and focused tests.
4. Add the verifier to `docs:check`/`docs:test`, the always-required governance
   job and relevant file maps; make CI policy fail if either protected command
   disappears.
5. Run focused verifier tests, documentation/repository-memory checks and the
   changed-scope candidate gate.
6. Publish one candidate, complete review, merge and exact-main acceptance.

## Tests

- Domain: not applicable
- Application: not applicable
- Integration: capability-index verifier against the checked-in document
- Contract: accept exact coverage; reject missing/duplicate/extra rows,
  capability/owner/status drift, missing columns/links, role-swapped
  destinations, misleading requirement labels, inline-code destinations,
  escaped/image destinations, incomplete multi-requirement
  proof, fenced/commented/raw-HTML/indented tables, conditional/
  non-blocking/commented/printed/environment/here-document-only or isolated
  governance commands, job-level non-blocking expressions, quoted HTML
  delimiters, quoted unsafe YAML keys, malformed UTF-8 and bounds
- Browser: not applicable
- Performance/failure: dependency-free bounded parser completes within the
  existing documentation gate

## Evidence

- Commands: focused Node.js test, `pnpm docs:check`, `pnpm docs:test`,
  `pnpm ai:check`, `pnpm check:changed`
- Raw artifact path: `evidence/phase-14/README.md`
- Acceptance result: protected run `33516560847` passes for evidence head
  `d2e4f02`, including every owner runtime, the Docker-only journey and local
  diagnostics. Source `2f94fdf`, tree `9f05826`, corrects its type-6 visibility
  finding. A review triggered before the PR synchronized to that correction
  then found inline-code links and an order-dependent job-condition scan; the
  findings also apply to the current source. Source `39bce7d`, tree `c4504d7`,
  corrects them. Exact-head review on `66ef8d0` then found a media adverse-proof
  mismatch plus escaped/image link prefixes. Source `00270fd`, tree `0bdbd6a`, passes
  focused contract tests43/43, documentation tests27/27 and the affected
  gate15/15. Runs `33519414100`/`33520880432` were cancelled when their sources
  became superseded. Exact-head run `33522645385` on `1abb457` passed source
  quality but failed the unchanged PostgreSQL diagnostic on a TraceQL timeout;
  cleanup passed and the run is not acceptance evidence. Exact-head review
  opened findings `3905459958`/`3905459969`/`3905459981`/`3905459992`. The
  working correction completes P07-R10/P11-R08 proof routes and closes quoted
  HTML/YAML parser gaps. Focused contracts pass44/44, documentation tests
  pass28/28 and the affected gate passes15/15. Correction source `94b6c45`,
  tree `f5604e4`, freezes the batch. Evidence head `70e6a4f` passed protected
  run `33555283617` on attempt2 after a Redis TraceQL timeout on attempt1.
  Exact-head review opened findings `3908181277`/`3908181285`/`3908181293`.
  The working correction closes job-level non-blocking expressions, Identity
  concurrency proof and observability evidence routing. Focused contracts
  pass44/44 and the affected gate passes15/15. Correction source `d45f3ea`,
  tree `b1a004f`, freezes the batch. Exact-head run `33558557773` passed on
  checkpoint `366c92a`; its exact-head review opened findings `3908433143`,
  `3908433153` and `3908433161` for Discovery Phase 10 ownership, Engagement
  replay ownership and complete P05-R10 browser proof. Correction source
  `44218b6`, tree `f2e3665`, closes those navigation gaps. Focused contracts
  pass44/44, documentation tests pass28/28, documentation validation covers
  1,638 links and the affected gate passes15/15. Exact-head run `33561120111`
  passed on checkpoint `5a86f60`; its exact-head review opened findings
  `3908622075` and `3908622083` for a comment-only raw-HTML boundary and a
  conditional governance dependency. Correction source `7479a5c`, tree
  `1da233a`, closes both bypasses. Focused contracts pass45/45, documentation
  tests pass29/29 and the affected gate passes15/15. Exact-head run
  `33563190969` passed on checkpoint `c69cb0e`; its exact-head review opened
  findings `3908769122` and `3908769126` for missing P06-R10 cleanup/rollback
  proof and missing protected-CI implementation/adverse proof. Correction source
  `6d9551a`, tree `8bed61f`, closes both routes. Focused contracts pass45/45,
  documentation tests pass29/29, documentation validation covers1,643 links and
  the affected gate passes15/15. Exact-head run `33565305721` passed on
  checkpoint `68718da`; its exact-head review opened finding `3908922118` for a
  same-line HTML-comment suffix that could expose a hidden table header.
  Correction source `c7534eb`, tree `994e72a`, closes that parser gap. Focused
  contracts pass46/46, documentation tests pass30/30 and the affected gate
  passes15/15. Exact-head run `33567227882` passed on checkpoint `76f320d`; its
  exact-head review opened findings `3909062923`, `3909062935`, `3909062942`
  and `3909062945` for closing type-6 tags, inline-HTML link syntax,
  workflow-level run defaults and the P05-R05 evidence route. The working
  correction closes all four. Focused contracts pass47/47, documentation tests
  pass31/31, documentation validation covers1,645 links and the affected gate
  passes15/15. Correction source `6285db2`, tree `8e181c9`, freezes the batch.
  Its exact-head review opened findings `3909251619` and `3909251628` for
  inline processing-instruction/declaration/CDATA links and workflow-level
  shell-startup environment injection. The working correction closes both.
  Focused contracts pass47/47 and the affected gate passes15/15. Correction
  source `43fa31c`, tree `b2f1c28`, freezes the batch. Publication, protected
  acceptance, merge and exact-main acceptance remain pending. Exact-head review
  on checkpoint `6f45c50` opened findings `3909327287` and `3909327298` for an
  escaped closing link bracket and incomplete Catalog lifecycle proof. The
  working correction closes both
- Iteration gate: focused verifier tests plus documentation/repository-memory
- Candidate gate: changed-scope gate selected from exact source/documentation
  diff
- Heavyweight repeat triggers: repeat runtime, PostgreSQL, browser, media or
  platform evidence only if executable product behavior or CI classification
  changes
- Review stopping rule: one initial review and one confirmation only when a
  finding changes a requirement, security/data invariant, availability
  behavior or public contract

## Rollback or recovery

Revert the index, verifier, script wiring and navigation links. Existing
requirements, source, evidence and operations documentation remain unchanged.

## Documentation updates

- `docs/00-start-here/CAPABILITY_INDEX.md`
- documentation map, file index and root README entry point
- `evidence/phase-14/README.md`
- repository memory and quality-gate descriptions

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
