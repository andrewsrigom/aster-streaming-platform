# Work Item: Verify and close the repository foundation

- Status: IN_PROGRESS
- Owner: Repository operations
- Phase: 00
- Requirement IDs: P00-R10
- Created: 2026-08-26
- Updated: 2026-08-26

## Outcome

The exact merged public revision is cloned into a new temporary directory with no repository-local dependency or Turbo state, every documented Phase 00 command and adverse gate passes, cleanup and frozen recovery pass, every Phase 00 requirement is linked to evidence, and the Phase 01 entry prerequisites are explicitly classified. Phase 00 is marked `VERIFIED` only after the closeout change also passes the protected public pull-request and post-merge paths.

## Current behavior

P00-R01 through P00-R09 are complete with local and applicable hosted evidence. The root README exposes the executable foundation path, and `main` at `91dbc7a` passed its post-merge workflow. The evidence index remains `IN_PROGRESS`, the public-clone limitation remains open, and no final review yet proves the Phase 00 exit gate or Phase 01 prerequisites as a set.

## Proposed behavior

Clone public `main` over HTTPS into a bounded temporary directory, record and compare its revision, execute the documented bootstrap, complete gate, audit, cleanup, frozen recovery, and repeated gate, and confirm the clone stays clean. Audit the full requirement/evidence matrix, repository governance, host prerequisites, and pending decisions. Add one raw closeout artifact, update the evidence index and repository memory, and publish the result through the protected path without implementing Phase 01.

## Boundaries

- Owning context: repository operations; no product bounded context or data owner changes.
- Affected services/packages: Phase 00 evidence index, clean-checkout evidence, root status documentation, repository memory, and temporary public clone only.
- Authoritative data: the public Git `main` revision and tracked evidence remain authoritative; the temporary clone, dependency tree, and Turbo cache are disposable.
- Read models/caches: the host Corepack and pnpm content-addressable caches may be warm and must be disclosed; repository-local state begins absent.
- Trust boundaries: public GitHub HTTPS, package registry responses, active Git/Node.js/Corepack/pnpm/Docker/Compose/FFmpeg executables, GitHub repository settings, and the temporary filesystem root.
- External dependencies: GitHub public clone and API, npm registry for audit and any missing package artifacts, and the local Docker daemon for Phase 01 prerequisite observation only.

## Invariants

- The clone uses the public HTTPS remote and the exact merged `main` revision, with no private manual file copy or credential-dependent application step.
- A clean checkout means no repository-local `node_modules`, `.turbo`, generated service, database, container, volume, or media state before bootstrap.
- Warm global caches are disclosed rather than mislabeled as a cold machine.
- All authoritative commands come from the root README or checked-in package scripts.
- Temporary cleanup targets only the recorded directory under `/tmp` after its absolute path and repository identity are verified.
- Phase 01 framework, dependency, version, and infrastructure decisions remain pending until their owning work items produce evidence.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Public clone fails or resolves a different revision | stop closeout and retain bounded diagnostic output | Git command, remote, and SHA output |
| Repository-local generated state exists before bootstrap | reject the clean-checkout claim | path-existence and Git status record |
| Frozen install, full gate, audit, cleanup, or recovery fails | keep P00-R10 active and record the exact failing command | raw command output and exit status |
| Cleanup changes a tracked file or escapes its allowlist | stop and treat as a release blocker | Git status plus cleanup report |
| Required evidence or a Phase 00 exit condition is missing | do not mark the phase verified | requirement/evidence matrix |
| A Phase 01 entry prerequisite is unavailable | record the blocker and keep Phase 00 open if the prerequisite is owned here | version/capability output and prerequisite review |
| Protected pull-request or post-merge workflow fails | do not close or advance the active phase | GitHub workflow and aggregate status |

## Data and contracts

- Schema/migration: none.
- GraphQL: none.
- Events: none.
- Cache: repository-local dependencies and Turbo cache are created, removed, and recreated; warm host caches are non-authoritative.
- Compatibility: validate the pinned Node.js and pnpm path on the recorded WSL environment and the public Ubuntu runner; observe Docker, Compose, FFmpeg, and FFprobe capabilities without selecting Phase 01 versions.
- Retention/deletion: preserve raw closeout evidence in Git; delete only the verified temporary clone after results are copied and reviewed.

## Security and privacy

- Authorization: public HTTPS reads and already-authorized writes to this repository's branch and pull request only.
- Input limits: fixed repository URL, single branch, bounded temporary root, checked-in scripts, and fixed cleanup allowlist.
- Sensitive data: record no GitHub token, registry credential, private email, environment secret, personal data, signed URL, or host-global configuration.
- Abuse cases: clone redirection, Git hook execution, malicious package lifecycle, arbitrary temporary deletion, symlink escape, remote drift, and unsupported status claims are considered. The repository has no dependency lifecycle scripts and its cleanup tests cover the symlink boundary.

## Implementation steps

1. Observe the merged public revision, host tool capabilities, Phase 01 entry prerequisites, and outstanding public pull requests or security blockers.
2. Create one bounded temporary directory and clone public `main` with no local repository cache or generated state.
3. Execute the root README bootstrap, full gate, audit, cleanup, frozen recovery, repeated gate, documentation, secret, Git integrity, and unwanted-file checks.
4. Review every P00 requirement, required test, evidence artifact, exit condition, unresolved risk, and Phase 01 prerequisite.
5. Add the raw clean-checkout and closeout evidence, update indexes and repository memory, and keep the phase active until hosted validation passes.
6. Commit and publish one protected pull request, address review, record hosted results, mark P00-R10 done and Phase 00 verified, merge, and verify post-merge `main`.
7. Remove the exact temporary clone after its evidence is durable and begin no Phase 01 implementation until the closeout is unambiguous.

## Tests

- Domain: not applicable; no product behavior exists.
- Application: not applicable; no application exists.
- Integration: clean public clone, frozen materialization, complete repository gate, registry audit, real cleanup, frozen recovery, and repeated complete gate.
- Contract: all repository validators and adverse fixtures, public remote/SHA check, evidence matrix, Git cleanliness, and protected aggregate behavior.
- Browser: no application UI; public template rendering was already audited under P00-R07 and remains linked.
- Performance/failure: record install, gate, cleanup, recovery, and audit measurements; retain warm-cache and single-host limitations.

## Evidence

- Commands: public clone, version/capability observations, bootstrap, `pnpm check`, `pnpm audit --audit-level=high`, `pnpm clean:foundation`, recovery, Git integrity, documentation, secrets, and GitHub state queries.
- Raw artifact path: `evidence/phase-00/clean-checkout-closeout.txt`.
- Acceptance result: PASS_LOCAL_WITH_REMEDIATION for public main; public candidate clone and protected hosted validation remain pending.

## Rollback or recovery

If any acceptance fails, keep Phase 00 and P00-R10 active, preserve the diagnostic artifact, and fix only the failing foundation contract. Remove the temporary clone only after validating its absolute `/tmp` path and public-repository identity. Revert the closeout documentation if its claims exceed the evidence; no durable product or Docker data is changed.

## Documentation updates

- `README.md`
- `docs/00-start-here/BASELINE_VALIDATION.md`
- `docs/00-start-here/FILE_INDEX.md`
- `evidence/phase-00/README.md`
- `.ai/CURRENT_STATE.md`
- `.ai/WORK_QUEUE.md`
- `.ai/SESSION_LOG.md`
- `.ai/HANDOFF.md`
- `.ai/DECISIONS_LEDGER.md` only if a Phase 00 decision changes.

## Completion checklist

- [ ] Requirements satisfied
- [x] Tests pass
- [x] Evidence captured
- [x] Documentation current
- [x] `.ai/` state updated
- [x] Remaining risks recorded
