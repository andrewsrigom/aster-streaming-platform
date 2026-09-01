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
  owner metadata cannot mask a misleading label.
- Only a visible Markdown table satisfies capability coverage; rows inside
  fenced code, HTML comments, named raw containers, arbitrary CommonMark type-7
  HTML blocks or four-column indented code are ignored.
- Documentation-only changes cannot bypass the capability-index verifier or
  its adverse tests in protected CI; the policy parser bounds `governance` at
  the next top-level job rather than a later named job and recognizes only
  unconditional, blocking step-level `run` invocations in an unconditional job.
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
| The complete table is indented as CommonMark code | Treat the public table as missing | Indentation-aware table diagnostic |
| The complete table is wrapped in a raw HTML block | Treat the public table as missing | HTML-block-aware table diagnostic |
| An arbitrary complete HTML tag begins a type-7 block around the table | Ignore rows through the CommonMark blank-line boundary | Generic HTML-block diagnostic |
| A listed requirement lacks a representative implementation or adverse proof | Require the reviewed additional destinations in that row | Per-role destination diagnostic |
| A required command is conditional, non-blocking or belongs to a conditional job | Treat the command as absent | Executable-step diagnostic |
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
  destinations, incomplete multi-requirement proof, fenced/commented/raw-HTML/
  indented tables, conditional/
  non-blocking/commented/printed/environment/here-document-only or isolated
  governance commands, malformed UTF-8 and bounds
- Browser: not applicable
- Performance/failure: dependency-free bounded parser completes within the
  existing documentation gate

## Evidence

- Commands: focused Node.js test, `pnpm docs:check`, `pnpm docs:test`,
  `pnpm ai:check`, `pnpm check:changed`
- Raw artifact path: `evidence/phase-14/README.md`
- Acceptance result: prior protected full gates pass; the latest
  public-rendering and traceability correction passes focused tests38/38,
  documentation tests22/22 and the affected gate15/15. Source `51f49bc`, tree
  `510a0da`, is frozen; protected acceptance, merge and exact-main acceptance
  remain pending
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
