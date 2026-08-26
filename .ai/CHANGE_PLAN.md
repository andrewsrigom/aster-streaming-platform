# Work Item: Add an explicit project-scoped destructive local reset

- Status: IN_PROGRESS
- Owner: repository maintainer
- Phase: 01
- Requirement IDs: P01-R02
- Created: 2026-08-26
- Updated: 2026-08-26

## Outcome

Provide one Docker-only command that deliberately deletes only the current Aster local Compose project and its durable PostgreSQL volume, refuses hosted or ambiguous execution targets, preserves unrelated Docker resources and images, and reports whether the reset completed.

## Current behavior

P01-R01 provides verified scoped startup, diagnostics, and a normal stop that preserves PostgreSQL. No supported command deletes the durable local volume; the documentation explicitly prohibits adding `--volumes` to the normal stop command.

## Proposed behavior

Add one repository-owned POSIX shell command with a fixed Compose file and project name. It requires the exact local-environment marker and destructive confirmation phrase, accepts no target or URL, rejects hosted CI and Docker endpoint overrides, verifies that the selected Docker context uses a local socket, validates every discovered Aster resource against the expected Compose and Aster labels, executes the scoped Compose volume teardown, and proves that no Aster project resource remains.

## Boundaries

- Owning context: local platform operations; no product bounded context owns this operator action.
- Affected services/packages: `infra/compose`, repository-owned platform tools, root and local-development documentation, Phase 01 evidence and repository memory.
- Authoritative data: the local PostgreSQL `postgres-data` volume is deliberately deleted; no hosted or product-context data is addressed.
- Read models/caches: disposable local Redis container state is removed with the project.
- Trust boundaries: command arguments, process environment, active Docker context and endpoint, Docker resource metadata, and the checked-in Compose file.
- External dependencies: supported Docker Engine and Docker Compose only; Node.js remains unnecessary for the public reset command.

## Invariants

- The command always targets Compose project `aster` and the checked-in `infra/compose/compose.yml`.
- Destruction requires `ASTER_ENVIRONMENT=local` and the exact `DELETE-ASTER-LOCAL-DATA` confirmation.
- The command accepts no path, project name, Docker host, database URL, Redis URL, or hosted target.
- Remote Docker endpoints, CI environments, unexpected services, and mismatched project, logical-resource, environment, owner, authority, or Compose-file labels fail closed before teardown.
- Only Aster containers, networks, named volumes, and disposable container state may be removed; images and unrelated Docker resources remain untouched.
- A completed reset leaves zero resources carrying `com.docker.compose.project=aster` and is safe to repeat from empty state.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Missing or incorrect local marker or confirmation | Exit nonzero before any Docker mutation | Bounded stderr names the required marker without echoing environment values |
| Extra argument or hosted URL/configuration variable | Exit nonzero before Docker mutation | Bounded stderr states that targets and connection URLs are prohibited |
| Hosted CI indicator or Docker endpoint override | Exit nonzero before Docker mutation | Bounded stderr classifies the environment as unsafe without printing credentials or URLs |
| Docker unavailable, context unreadable, or endpoint remote | Exit nonzero before Compose mutation | Bounded stderr identifies the failed precondition or endpoint scheme |
| Unexpected or mislabeled Aster resource | Exit nonzero and preserve all discovered resources | Bounded stderr identifies the resource kind and name, not stored data |
| Compose teardown fails or resources remain | Exit nonzero with no broad fallback cleanup | Bounded stderr reports the failed command or remaining project resource counts |
| No Aster resources exist | Exit zero without creating resources | Stdout reports that local state is already reset |

## Data and contracts

- Schema/migration: none.
- GraphQL: none.
- Events: none.
- Cache: local Redis state remains disposable and is removed with its container.
- Compatibility: preserve the P01-R01 Docker/Compose support floor and POSIX-shell Docker-only lane.
- Retention/deletion: delete the complete current local PostgreSQL volume irreversibly after confirmation; retain images, build cache, repository files, and all unrelated Docker state.

## Security and privacy

- Authorization: possession of local Docker access plus deliberate environment and confirmation inputs; no hosted authorization is accepted.
- Input limits: exactly one fixed confirmation option; no arbitrary paths, resource names, URLs, or passthrough flags.
- Sensitive data: do not read or print database contents, credentials, URLs, Docker certificate paths, or environment values.
- Abuse cases: remote context deletion, inherited Compose override, misleading labels, broad prune/remove commands, confirmation bypass, CI execution, symlinked repository inputs, and partial teardown.

## Implementation steps

1. Add the fixed-scope reset script with local-target, repository, argument, context, resource-label, and postcondition checks.
2. Add focused adverse tests and extend the dependency-free local-platform policy so unsafe weakening fails the normal gate.
3. Document the exact command, irreversible effect, refusal modes, normal-stop distinction, and recovery path.
4. Exercise refusal, populated reset, empty idempotence, clean restart, and unrelated-resource preservation against the real local Docker daemon.
5. Capture raw evidence, update repository memory, and run the complete quality, Compose, audit, Git, documentation, and secret gates.

## Tests

- Domain: not applicable; no product-domain rule changes.
- Application: not applicable; no application code exists.
- Integration: real local Aster startup, durable marker creation, refused unsafe calls, confirmed reset, zero-resource postcondition, clean restart, and repeated empty reset.
- Contract: static command/policy checks plus fake-Docker tests for confirmation, CI, endpoint, URL, label, exact command, idempotence, and partial-failure behavior.
- Browser: not applicable; no URL exists.
- Performance/failure: measure reset duration; inject remote endpoint, unexpected label, Compose failure, and remaining-resource results without arbitrary sleeps.

## Evidence

- Commands: focused shell syntax and tests; `pnpm platform:check`; `pnpm platform:test`; `pnpm platform:compose:check`; real Docker refusal/reset/restart sequence; `pnpm check`; `pnpm audit --audit-level=high`; Git and resource integrity checks.
- Raw artifact path: `evidence/phase-01/local-reset.txt`.
- Acceptance result: pending.

## Rollback or recovery

Before release, revert the script, tests, documentation, and memory changes. After an intentional reset, the deleted local PostgreSQL data cannot be restored by this command; recovery is a clean Compose startup now and will use phase-owned seed or backup procedures when those exist. Never attempt a broad Docker cleanup or restore unrelated resources.

## Documentation updates

- `README.md`
- `docs/operations/LOCAL_DEVELOPMENT.md`
- `evidence/phase-01/local-reset.txt`
- `.ai/CURRENT_STATE.md`
- `.ai/WORK_QUEUE.md`
- `.ai/SESSION_LOG.md`
- `.ai/HANDOFF.md`

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
