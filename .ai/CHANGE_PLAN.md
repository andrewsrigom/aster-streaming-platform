# Work Item: Establish the reference-first Phase 14 runway

- Status: IN_PROGRESS
- Owner: Repository architecture and documentation
- Phase: 14
- Requirement IDs: P14-R13
- Created: 2026-09-01
- Updated: 2026-09-01

## Outcome

Close Phase13 from exact release evidence and make the next delivery direction
unambiguous: Aster first becomes a navigable, locally reproducible reference
implementation. Hosted capacity and deployment requirements remain planned but
inactive until the owner explicitly authorizes provider choices, credentials and
resource creation.

## Current behavior

Phases00–13 are implemented and verified locally. PR57 squash main `83cb510`,
tree `41650b4`, preserves the final candidate; exact-main run `33489232182`
passes every required job. The current roadmap still describes Phase13 as
planned and Phase14 only as hosted capacity/release, while repository memory
still labels item67 in progress.

## Proposed behavior

Record ADR-0048 and extend Phase14 without renumbering its existing hosted
requirements. P14-R13–R18 define an immediate reference-quality track for
navigation, readability guardrails, behavior-preserving refactoring, examples
and fresh local verification. P14-R01–R12 remain the separately authorized
hosted track. Update roadmap, specifications, release evidence and repository
memory; do not change product behavior in this item.

## Boundaries

- Owning context: repository architecture and delivery governance
- Affected services/packages: documentation and `.ai/` state only
- Authoritative data: Git history, PR57 state and GitHub Actions results
- Read models/caches: none
- Trust boundaries: public status claims, media-rights claims and hosted-resource authorization
- External dependencies: read-only GitHub release evidence already completed

## Invariants

- Existing P14-R01–R12 identifiers and hosted safety obligations remain intact.
- No hosted environment, provider, credential, paid resource or public endpoint is created.
- A verified reference checkpoint is locally reproducible source and evidence,
  not a hosted production claim.
- Readability work must preserve domain boundaries, behavior and public contracts.
- Comments explain rationale, invariants, failure behavior or external constraints; they do not restate code.
- Refactoring proceeds in small slices backed by characterization and affected-scope gates.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Exact Phase13 release evidence is incomplete | Keep item67 and Phase13 unreleased | Repository-memory verifier and linked run IDs |
| Roadmap implies hosted behavior exists | Fail documentation review and retain explicit planned/deferred language | Documentation verifier plus review |
| Reference criteria are subjective or unbounded | Reject the specification until each criterion has observable evidence | Review findings and change-plan checklist |
| A later readability slice changes behavior without proof | Stop the slice, restore the last verified boundary and run characterization gates | Test and candidate-gate output |

## Data and contracts

- Schema/migration: none
- GraphQL: none
- Events: none
- Cache: none
- Compatibility: documentation-only; all existing runtime contracts remain unchanged
- Retention/deletion: no product or evidence deletion

## Security and privacy

- Authorization: no runtime authorization change
- Input limits: no runtime input change
- Sensitive data: do not add credentials, personal data or private business rationale
- Abuse cases: prevent false hosted/released claims and prevent examples from weakening owner authorization

## Implementation steps

1. Record PR57 merge, tree identity, final review and exact-main acceptance.
2. Add ADR-0048 with the reference/hosted distinction and activation boundary.
3. Extend the Phase14 specification with P14-R13–R18 and ordered work items.
4. Update roadmap, delivery index, current public status and repository memory.
5. Run repository-memory, documentation, formatting and affected-scope gates.
6. Publish one documentation candidate, complete review and exact-main acceptance.

## Tests

- Domain: not applicable
- Application: not applicable
- Integration: not applicable
- Contract: documentation links, repository-memory rules and status-claim validation
- Browser: not applicable
- Performance/failure: carried Phase13 release evidence is immutable; no heavyweight repeat is triggered

## Evidence

- Commands: `pnpm ai:check`, `pnpm docs:check`, `pnpm prettier --check ...`, `pnpm check:changed`
- Raw artifact path: `evidence/phase-13/release.md` and
  `evidence/phase-14/README.md`
- Acceptance result: source `bd1191d`, tree `80337eb7`, passes the local
  iteration and changed-scope candidate gates. Evidence head `6bbb3da` passed
  protected run `33492326127`; review discussion `3902757945` identified a
  stale handoff action. Correction `7976c17`, tree `0af69fe`, passes the
  repeated local gate; evidence head `9ced435` passed protected run
  `33492941279`. Confirmation discussions `3902818119`/`3902818121` found
  reference-release terminology and four stale Phase13 candidate descriptions.
  Source `c0e4c85`, tree `f559fab`, corrects both and passes the repeated
  gate9/9; final corrected protected acceptance is pending
- Iteration gate: repository-memory, documentation and formatting checks
- Candidate gate: affected-scope gate selected from the exact documentation diff
- Heavyweight repeat triggers: repeat runtime, PostgreSQL, browser, media or platform evidence only if executable behavior or its gate selection changes
- Review stopping rule: one initial review and one confirmation only if a finding changes a requirement, security/data invariant, availability behavior or public contract

## Rollback or recovery

Revert the documentation candidate. Phase13's released code and evidence remain
unchanged. No provider, credential, database, media, event or cache state exists
to roll back.

## Documentation updates

- ADR-0048
- Phase14 specification and phase index
- public roadmap and README status
- Phase13 release evidence
- `.ai/CONTEXT.md`, `.ai/CURRENT_STATE.md`, `.ai/WORK_QUEUE.md`, `.ai/SESSION_LOG.md`, `.ai/HANDOFF.md` and `.ai/DECISIONS_LEDGER.md`

## Completion checklist

- [ ] Requirements satisfied
- [x] Tests pass
- [x] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
