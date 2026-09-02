# Work Item: Define readability guardrails and a bounded findings inventory

- Status: IN_PROGRESS
- Owner: Repository documentation and bounded-context maintainers
- Phase: 14
- Requirement IDs: P14-R15
- Created: 2026-09-02
- Updated: 2026-09-02

## Outcome

Aster has one repository-owned readability standard and a finite prioritized
inventory that identifies concrete naming, control-flow, organization, comment,
test, and example problems before implementation refactoring begins.

## Current behavior

P14-R14 is merged through PR60 as exact-main commit `b3f409b`, retaining tree
`f57a2e5`. The protected pull-request run `33596017500` passed on attempt 3 and
all review discussions are resolved. Exact-main run `33598493566` has one
cleanly scoped Local-platform diagnostic failure while the unchanged source
jobs continue; item69 is frozen as `WAITING_EXTERNAL` for its failed-only rerun.

The source is formatted, strictly typed, linted, tested, and organized by
bounded context. Those executable controls do not define when a generic name,
dense branch, comment, fixture alias, or local organization makes correct code
hard to study.

## Proposed behavior

Publish `docs/quality/CODE_READABILITY.md`. It separates the executable
formatting/static baseline from reviewable domain naming, control-flow, layout,
comment, test, and example rules. Its bounded inventory names nine concrete
reader problems, their owners, preserved requirements, characterization proofs,
priorities, and owning follow-up items 71–74.

## Boundaries

- Owning context: repository documentation; each finding retains its existing
  bounded-context owner
- Affected services/packages: documentation and repository memory only; source
  and tests are inspected but not changed in item70
- Authoritative data: requirements, source, tests, and evidence remain
  authoritative; the inventory prioritizes reading work
- Read models/caches: none
- Trust boundaries: no runtime boundary changes; future slices must preserve
  authorization, rights, cancellation, idempotency, and uncertain-commit rules
- External dependencies: none

## Invariants

- Mechanical whitespace remains owned by Prettier.
- Readability findings cite a concrete reader problem and preserved behavior.
- Priority reflects obscured ownership or failure behavior, not file size or
  personal style.
- The inventory selects one representative slice for every owner and
  cross-cutting surface required by P14-R16.
- No GraphQL, persistence, event, cache, media, telemetry, or public contract
  changes in item70.
- No bulk rewrite, speculative abstraction, arbitrary score, or narration
  comment is introduced.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| A proposed finding lacks a concrete reader problem or characterization proof | Do not enter it in the active inventory | Documentation review result |
| A rule conflicts with architecture or domain ownership | Preserve the existing boundary and require a separate ADR proposal | Repository-memory finding |
| A later refactor changes observable behavior | Stop the slice and treat it as implementation work with its own requirement and evidence | Focused test or affected-gate failure |
| Formatting preference conflicts with Prettier | Keep the formatter output and solve the reading problem through names or structure | Format-check result |
| The inventory expands beyond items71–74 | Record the issue for a later bounded update instead of widening the active item | Handoff entry |

## Data and contracts

- Schema/migration: none
- GraphQL: none
- Events: none
- Cache: none
- Compatibility: documentation-only addition; all public and runtime contracts
  remain unchanged
- Retention/deletion: no product data, evidence, or historical decision deletion

## Security and privacy

- Authorization: unchanged
- Input limits: no new runtime input
- Sensitive data: documentation contains repository paths and synthetic examples
  only
- Abuse cases: future renames cannot move or weaken owner authorization, rights
  review, demand limits, deadlines, or sanitized error behavior

## Implementation steps

1. Audit representative source and characterization tests across the five
   bounded contexts, Router, Web, and repository tooling.
2. Define the executable baseline and reviewable readability guardrails.
3. Record a finite priority-ordered inventory with owner, behavior, proof, and
   planned item for each finding.
4. Link the standard from quality navigation and repository memory.
5. Run documentation, repository-memory, formatting, and changed-scope gates.
6. Publish one candidate, complete one review and one confirmation, then merge
   and verify exact main.

## Tests

- Domain: not applicable; no domain behavior changes
- Application: not applicable; characterization tests are linked for items71–73
- Integration: not repeated because item70 changes documentation only
- Contract: documentation links/status claims and repository-memory consistency
- Browser: not repeated because Web behavior is unchanged
- Performance/failure: not applicable

## Evidence

- Commands: `pnpm docs:check`, `pnpm docs:test`, `pnpm ai:check`,
  `pnpm ai:test`, `pnpm format:check`, and `pnpm check:changed`
- Raw artifact path: `evidence/phase-14/README.md`
- Acceptance result: focused documentation tests pass 37/37, repository-memory
  tests pass 13/13, documentation validation covers 251 documents and 1,703
  links, and changed-file formatting plus diff checks pass. Source checkpoint
  `66db1ce`, tree `754cc39`, passes the changed-scope candidate gate 7/7 with
  zero cached tasks
- Iteration gate: documentation and repository-memory checks plus formatting
- Candidate gate: changed-scope gate from the exact item70 diff
- Heavyweight repeat triggers: executable source, dependency, CI
  classification, packaging, Docker, browser, database, cache, broker, or media
  changes
- Review stopping rule: one complete initial review and one confirmation; a
  further round requires a new blocker in requirements, ownership, security,
  availability, data, or a public contract

## Rollback or recovery

Revert the readability document and navigation/memory updates. No runtime,
schema, data, media, provider, or credential state needs recovery.

## Documentation updates

- `docs/quality/CODE_READABILITY.md`
- `docs/00-start-here/DOCUMENTATION_MAP.md`
- `docs/00-start-here/FILE_INDEX.md`
- `evidence/phase-14/README.md`
- `.ai/CURRENT_STATE.md`, `.ai/WORK_QUEUE.md`, `.ai/SESSION_LOG.md`, and
  `.ai/HANDOFF.md`

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
