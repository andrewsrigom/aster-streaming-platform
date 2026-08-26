# Work Item: Publish the executable foundation command contract

- Status: IN_PROGRESS
- Owner: Repository operations
- Phase: 00
- Requirement IDs: P00-R09
- Created: 2026-08-26
- Updated: 2026-08-26

## Outcome

A new contributor can use the root README to bootstrap the exact pinned foundation, choose the proportionate verification lane, exercise the current non-application checkpoint, and remove only generated foundation state. The same page clearly separates those executable commands from the planned Phase 01 Docker runtime laboratory and Phase 07 playable demonstration.

## Current behavior

The detailed local-development guide records the implemented package scripts and several planned application scripts, but the root README does not provide the exact P00-R09 bootstrap, check, or cleanup path. No repository-owned cleanup command currently bounds deletion to generated foundation paths. The current runnable checkpoint is repository validation; no application URL or Docker-only product demonstration exists.

## Proposed behavior

Add a compact copy-paste path to the root README, expose a dependency-free `pnpm clean:foundation` command that deletes only root `.turbo` and `node_modules` paths after validating repository markers, and align the detailed demonstration prose with phase ownership. Keep registry-dependent and offline-capable steps explicit, and do not invent future application or Compose commands.

## Boundaries

- Owning context: repository operations; no product bounded context or product data owner changes.
- Affected services/packages: root package scripts, dependency-free repository tooling, root README, local-development and engineering-demonstration documentation, Phase 00 evidence, and repository memory.
- Authoritative data: Git-tracked source and documentation remain authoritative; generated dependency and Turbo cache trees are disposable.
- Read models/caches: `.turbo` and `node_modules` are local generated state only.
- Trust boundaries: active Node.js and pnpm executables, registry responses during provisioning and audit, the current repository path, and local filesystem entries selected for cleanup.
- External dependencies: the first Corepack provisioning, frozen install, and registry audit require the configured package registry; no hosted application credential or Docker daemon is required for the Phase 00 checkpoint.

## Invariants

- Executable and planned commands remain visibly distinct.
- Cleanup never accepts an arbitrary CLI path and never targets the repository root, Git history, source, evidence, environment files, Docker state, or pnpm's shared store.
- Tool versions remain exact and repository validation continues to reject drift.
- The authoritative full gate stays explicit rather than moving into commit hooks.
- Phase 01 owns the first Docker runtime checkpoint and Phase 07 owns the first playable clean-start demonstration.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Unsupported Node.js or pnpm | `toolchain:check` and `pnpm check` fail with the expected exact version | structured toolchain diagnostic |
| Registry unavailable during provisioning, install, or audit | the command exits non-zero without weakening the frozen lockfile or audit policy | package-manager stderr and exit status |
| Cleanup is invoked outside the repository or required markers are missing | abort before deletion | bounded error naming the missing repository marker |
| A cleanup target is absent | treat it as already clean | successful command summary |
| A cleanup target is a symbolic link | remove only the link and preserve its external target | focused adverse test |
| A contributor expects an application or playable Docker demo in Phase 00 | README reports that no application URL exists and links to the owning future checkpoints | documentation validation and review |

## Data and contracts

- Schema/migration: none.
- GraphQL: none.
- Events: none.
- Cache: local Turborepo cache and dependency tree may be removed; no product cache exists.
- Compatibility: support the pinned Node.js and pnpm versions on the repository's current POSIX/WSL and CI path; the cleanup implementation uses Node.js filesystem APIs for cross-platform behavior.
- Retention/deletion: only `.turbo` and `node_modules` under the validated repository root are disposable; all evidence and source remain retained.

## Security and privacy

- Authorization: local developer filesystem permissions only; no remote mutation or credential use.
- Input limits: the cleanup CLI accepts no path argument and uses a fixed two-entry allowlist.
- Sensitive data: commands and evidence must not record registry credentials, tokens, environment secrets, or private paths beyond the named test environment.
- Abuse cases: path traversal, repository-root deletion, symlink traversal, and global-store or Docker-volume deletion remain outside the command.

## Implementation steps

1. Add and test the bounded foundation-cleanup command.
2. Add the exact bootstrap, validation, current-checkpoint, and cleanup paths to the root README.
3. Correct detailed local-development and demonstration phase ownership without making planned commands executable claims.
4. Run the focused command tests, complete repository gate, registry audit, documentation check, and cleanup fixture.
5. Record raw P00-R09 evidence and update repository memory.
6. Publish one protected pull request and require hosted checks before completion.

## Tests

- Domain: not applicable; no product domain behavior changes.
- Application: not applicable; no application exists.
- Integration: execute the documented bootstrap/check commands in the current pinned environment; P00-R10 owns the clean public-clone repetition.
- Contract: verify cleanup removes only allowlisted generated entries, rejects an unmarked root, and preserves an external target behind a symbolic link.
- Browser: not applicable; no application URL exists.
- Performance/failure: measure command duration and resident memory where useful; verify missing generated entries are idempotent and cleanup failure is non-zero.

## Evidence

- Commands: exact version, frozen install, focused test, complete gate, registry audit, documentation, secret, and Git integrity commands.
- Raw artifact path: `evidence/phase-00/developer-command-contract.txt`.
- Acceptance result: PASS_LOCAL; protected hosted validation remains pending.

## Rollback or recovery

Revert the coherent command-contract change. Because no durable product or Docker state changes, recovery is a frozen reinstall after restoring the previous package script and documentation. A failed cleanup can be retried after fixing local filesystem permissions.

## Documentation updates

- `README.md`
- `docs/operations/LOCAL_DEVELOPMENT.md`
- `docs/00-start-here/ENGINEERING_DEMONSTRATION.md`
- `evidence/phase-00/README.md`
- `.ai/CURRENT_STATE.md`
- `.ai/SESSION_LOG.md`
- `.ai/HANDOFF.md`

## Completion checklist

- [ ] Requirements satisfied
- [x] Tests pass
- [x] Evidence captured
- [x] Documentation current
- [x] `.ai/` state updated
- [x] Remaining risks recorded
