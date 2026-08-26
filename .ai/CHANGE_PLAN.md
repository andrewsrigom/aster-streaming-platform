# Work Item: Make repository memory consistency executable

- Status: IN_PROGRESS
- Owner: Repository memory and contribution governance
- Phase: 00
- Requirement IDs: P00-R08; supports QLT-R01 and QLT-R04
- Created: 2026-08-26
- Updated: 2026-08-26

## Outcome

The durable `.ai/` execution state is validated by a bounded dependency-free command, focused adverse tests, the root task graph, and the always-applicable GitHub governance job. Queue state, active-plan metadata, current-state and handoff resume targets, session ordering, required files, encoding, and resource bounds fail deterministically when they drift, without turning the fast commit hook into a repository-wide gate.

## Current behavior

The repository documents an explicit memory workflow and the files are maintained manually, but no repository-owned command verifies their existence, input safety, queue ordering, plan consistency, session shape, or resume target. Markdown validation proves general document structure and links but does not understand `.ai/` state transitions. P00-R08 therefore remains incomplete despite the earlier planning and traceability slice.

## Proposed behavior

Add `tools/verify-ai-state.ts` with a pure source validator and a bounded filesystem scanner. Require the durable memory files as regular UTF-8 inputs; validate the work-queue table and blocker references; require at most one active item; bind an active item to a complete change plan and bind the current-state next outcome and handoff to the active or first ready requirement; and validate current-state and reverse-chronological session structure. Add adverse tests and expose `ai:check` and `ai:test` through `pnpm check`, Turborepo, and the dependency-free CI governance path.

## Boundaries

- Owning context: Repository memory and contribution governance; no product bounded context or durable product data owner changes.
- Affected services/packages: Root repository tooling, `.ai/` state files, package scripts, Turbo task definitions, CI governance validation, operational documentation, and Phase 00 evidence.
- Authoritative data: Checked-in `.ai/` Markdown files remain authoritative; validator output is a reconstructable projection.
- Read models/caches: Turborepo task cache may cache deterministic static checks but never becomes authoritative.
- Trust boundaries: Public Git content, malformed or adversarial Markdown, symbolic files, oversized inputs, invalid UTF-8, queue metadata, and CI runner filesystem state.
- External dependencies: None at runtime; Node.js standard library, GitHub Actions, and the existing repository toolchain only.

## Invariants

- Required durable memory files exist as bounded regular UTF-8 files and symbolic inputs are rejected.
- Work-queue order is unique, contiguous, and starts at one; recognized statuses are `DONE`, `READY`, `IN_PROGRESS`, and explicit `BLOCKED_BY_<order>` references.
- Completed work forms a prefix; blocker references exist, point backward, and do not retain completed blockers.
- At most one work item is `IN_PROGRESS`, and it is the earliest unfinished work item.
- An active queue item requires an `IN_PROGRESS` change plan with its requirement ID, metadata matching the current active phase, and every template section.
- No active queue item requires the canonical inactive change-plan state.
- The current-state next outcome and handoff identify the active requirement or, when idle, the first ready requirement.
- Session entries are reverse chronological and preserve Completed, Evidence, and Next action sections.
- The validator checks structural consistency and explicit cross-file facts; it does not claim to prove the semantic truth of arbitrary prose.
- Commit hooks remain staged and fast; the repository-memory gate runs through explicit local checks and authoritative CI.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Required file missing, symbolic, oversized, or invalid UTF-8 | Fail with bounded file and rule detail | Stable JSON violation or bounded scanner error |
| Queue table malformed or ambiguous | Fail without guessing a state transition | Queue rule and source line |
| Multiple or out-of-order active items | Fail and identify the conflicting queue row | Queue-state violation |
| Blocker references completed, missing, or later work | Fail until the queue is made current | Blocker violation |
| Active plan does not match queue requirement or template | Fail before contribution acceptance | Plan rule and missing metadata or section |
| Idle queue retains an active plan | Fail until the plan is reset or queue is corrected | Plan-state violation |
| Current state or handoff points at stale work | Fail with the required resume requirement | Resume-target violation |
| Session entries regress in time or omit required sections | Fail with the affected entry | Session-log violation |
| CI command is removed or weakened | Existing CI-policy validator and adverse test fail | CI-policy command violation |

## Data and contracts

- Schema/migration: None.
- GraphQL: None.
- Events: None.
- Cache: Static results are reconstructable from Git; no product cache changes.
- Compatibility: Strict TypeScript on Node.js `24.19.0`; no new package or runtime dependency.
- Retention/deletion: Existing `.ai/` history remains in Git; the validator does not rewrite or delete state.

## Security and privacy

- Authorization: The check is read-only; repository write authorization remains Git and protected pull-request policy.
- Input limits: Fixed required-file list, bounded per-file and aggregate bytes, bounded queue rows, bounded session entries, strict UTF-8, NUL rejection, and no symbolic traversal.
- Sensitive data: Diagnostics include rule, file, and structural detail only; they do not echo arbitrary file contents or credentials.
- Abuse cases: Path substitution, symbolic redirection, parser ambiguity, unbounded tables or logs, fake active state, stale resume instructions, and CI removal.

## Implementation steps

1. Define the smallest structural and cross-file invariants that current repository state can satisfy without semantic overreach.
2. Implement a pure validator and bounded filesystem scanner with deterministic sorted violations and stable JSON output.
3. Add focused positive and adverse tests for queue, plan, blocker, resume, session, encoding, size, and symbolic-file behavior.
4. Add `ai:check` and `ai:test` scripts and Turborepo tasks, then include them in the root complete gate.
5. Add both commands to the dependency-free CI governance job and make the CI-policy validator reject their removal.
6. Update repository-memory and operations documentation, capture measured evidence, and update Phase 00 memory.
7. Commit in one coherent implementation block, run the protected pull-request path, address review findings, squash merge, and verify `main`.

## Tests

- Domain: Pure validation of valid state, queue ordering/statuses/blockers, active-versus-idle plan binding, resume target, and session ordering/shape.
- Application: Actual repository scan over all required memory files and stable diagnostic ordering.
- Integration: Root Turbo graph, dependency-free governance path, CI-policy check, and protected GitHub pull-request workflow.
- Contract: Exact scripts, CI commands, task inputs, required state filenames, status vocabulary, and change-plan template sections.
- Browser: Not applicable.
- Performance/failure: Measure focused and complete local paths; test bounded size, invalid UTF-8, and symbolic input without sleeps.

## Evidence

- Commands: Focused validator/tests, CI-policy tests, dependency-free governance path, complete root graph, registry audit, secret scan, documentation check, staged hook, and hosted pull-request workflow.
- Raw artifact path: `evidence/phase-00/ai-state-workflow.txt`
- Acceptance result: Pending.

## Rollback or recovery

Remove the new scripts, tasks, CI steps, validator, tests, and documentation in one protected change if the structural contract proves disproportionate. Existing `.ai/` files remain unchanged and authoritative. Narrow an over-strict rule with an adverse fixture and evidence; do not bypass or silently remove the entire gate.

## Documentation updates

- `.ai/README.md`
- `.ai/QUALITY_GATES.md`
- `docs/operations/LOCAL_DEVELOPMENT.md`
- `docs/operations/REPOSITORY_GOVERNANCE.md`
- `docs/00-start-here/FILE_INDEX.md`
- `evidence/phase-00/README.md`
- `.ai/CURRENT_STATE.md`, `.ai/WORK_QUEUE.md`, `.ai/SESSION_LOG.md`, and `.ai/HANDOFF.md`

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
