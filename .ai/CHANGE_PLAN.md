# Work Item: Pin every public Compose operation to the Aster project

- Status: IN_PROGRESS
- Owner: Local platform operations
- Phase: 01
- Requirement IDs: P01-R01
- Created: 2026-08-26
- Updated: 2026-08-26

## Outcome

Every public startup, status, diagnostic, interactive, and stop command explicitly selects project `aster`, so an inherited `COMPOSE_PROJECT_NAME` cannot redirect an operator to another Compose project. Static adverse tests, a hostile-environment runtime check, a corrected clean public checkout, protected CI, and resolved review prove the remediation.

## Current behavior

Candidate `90e497b` passes local, clean public-checkout, and protected hosted gates, but automated review identified that the top-level Compose `name` has lower precedence than environment variable `COMPOSE_PROJECT_NAME`. The public commands therefore do not yet prove the exact project scope claimed by P01-R01.

## Proposed behavior

Add `--project-name aster` to every public command and status diagnostic, validate the documentation as part of the dependency-free platform policy, reject an unpinned adverse fixture, and rerun the runtime with a conflicting environment override. Preserve the run-ID-derived project supplied by the CI job rather than forcing CI to use the public project name.

## Boundaries

- Owning context: local platform operations; no product context or data owner changes.
- Affected files: public command documentation, status output, platform policy and tests, Turbo inputs, Phase 01 evidence, and repository memory.
- Authoritative data: the Aster PostgreSQL volume remains the only durable local state; the hostile collision project must remain absent and untouched.
- Trust boundaries: inherited shell environment, Docker Compose project-name precedence, operator copy-paste commands, and CI run-specific environment.

## Invariants

- Public commands always pass `--project-name aster`.
- CI continues to use its unique `aster-ci-<run>-<attempt>` project through `COMPOSE_PROJECT_NAME` and does not receive the public override.
- Normal stop preserves the Aster PostgreSQL volume.
- Verification cleanup deletes only resources proven to carry the expected project labels.
- No application, dependency, port, schema, or future Phase 01 scope is added.

## Failure behavior

| Failure | Expected behavior | Evidence |
|---|---|---|
| Public command omits the explicit name | dependency-free platform policy fails | adverse test diagnostic |
| Host exports a conflicting project name | CLI option wins and only `aster` resources appear | project-label queries |
| Diagnostic suggests an unscoped command | Compose policy fails | status-string assertion |
| Corrected public clone fails to start | P01-R01 returns to incomplete and PR remains blocked | bounded Compose output |
| CI cleanup widens | CI policy rejects broad prune and the required job fails | protected run |

## Data and contracts

- Schema/migration: none.
- GraphQL/events/cache semantics: unchanged.
- Public command contract: explicit `--project-name aster` is now mandatory.
- Retention/deletion: normal stop remains data-preserving; verification cleanup remains exact and temporary.

## Security and privacy

- The change closes cross-project lifecycle risk from untrusted inherited environment state.
- No hosted credential, personal data, secret, or new network exposure is introduced.
- Public and status text become platform-policy inputs so future drift fails locally and in governance CI.

## Implementation steps

1. Update every public command and status diagnostic with the explicit project name.
2. Add documentation validation and an override adverse test to the platform policy.
3. Run the checkpoint with a hostile `COMPOSE_PROJECT_NAME` and inspect both project labels.
4. Run complete repository gates and commit the focused remediation.
5. Push, repeat from a clean public checkout with the hostile variable, require protected CI, resolve review, and close P01-R01 again.

## Tests

- Domain/application/browser: not applicable; no application behavior exists.
- Contract: checked-in public commands and status output require exact project selection.
- Integration: real Compose startup, diagnostics, normal stop, persistence, and cleanup with a conflicting environment variable.
- Failure/security: adverse fixture rejects environment-vulnerable public commands; label queries prove isolation.

## Evidence

- Raw artifact: `evidence/phase-01/local-platform-checkpoint.txt`.
- Review: pull request 6 discussion `3860940991`.
- Acceptance remains in remediation until the corrected public clone, final protected run, and review resolution pass.

## Rollback or recovery

Revert the public commands, policy, test, and status text together only if a different explicit local project-selection mechanism is accepted. Never respond by deleting a colliding project. On a failed runtime test, inspect exact labels and remove only the test-owned Aster project after evidence capture.

## Documentation updates

- `README.md`
- `docs/operations/LOCAL_DEVELOPMENT.md`
- `evidence/phase-01/local-platform-checkpoint.txt`
- `.ai/CURRENT_STATE.md`
- `.ai/WORK_QUEUE.md`
- `.ai/SESSION_LOG.md`
- `.ai/HANDOFF.md`

## Completion checklist

- [ ] Requirements satisfied
- [x] Tests pass
- [x] Evidence captured locally
- [x] Documentation current
- [x] `.ai/` state updated
- [x] Remaining risks recorded
