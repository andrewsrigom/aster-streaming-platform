# Work Item: Verify the local reference track from a fresh checkout

- Status: IN_PROGRESS
- Owner: Repository verification
- Phase: 14
- Requirement IDs: P14-R18
- Created: 2026-09-02
- Updated: 2026-09-02

## Outcome

A reader can start from a fresh checkout, install the pinned toolchain, locate
one capability, run its focused adverse test, start and exercise the documented
Docker reference journey, find its evidence, and complete exact project-scoped
cleanup. The published verification notes distinguish verified local behavior
from every deferred hosted claim.

## Current behavior

P14-R13–R17 are verified. Item74 final head `903f50e`, tree `3e905e`, passed
protected workflow `33633680649` on attempt 2 after attempt 1's isolated
`docker info` timeout. Every discussion is resolved. PR65 squash main
`2b6054a` retains the exact tree, and exact-main workflow `33636042474` passed.
The public bootstrap, capability index, journey guide, playable Docker command,
evidence links, and cleanup instructions exist but have not yet been exercised
together as the P14-R18 reader path from a new checkout.

## Proposed behavior

Create a temporary clone at exact main and follow only public instructions.
Verify pinned installation, capability navigation, one linked focused test, the
anonymous playable Docker journey, evidence lookup, replay-safe startup, and
project-scoped cleanup. Publish the raw transcript and concise reference-track
verification notes. Do not change executable product behavior.

## Boundaries

- Owning context: repository verification; product owners retain all existing
  data and behavior
- Affected services/packages: documentation and repository memory only
- Authoritative data: disposable `aster-reference-*` Docker project data only
- Read models/caches: disposable Docker volumes only
- Trust boundaries: public repository clone, package registry, local Docker
  daemon, loopback Web/Router/object-storage ports, synthetic generated media
- External dependencies: GitHub clone, pinned Node.js/pnpm, package registry,
  Docker Engine/Compose, digest-pinned images

## Invariants

- The checkout starts without inherited `node_modules`, build output, Git
  configuration, Docker containers, networks, or volumes.
- Exact main commit and tool versions are recorded before verification.
- Capability navigation begins at the public capability index and reaches its
  requirement, source, adverse test, evidence, and operations paths.
- The focused check is synthetic, bounded, credential-free, and exits cleanly.
- The Docker journey uses one unique explicit project name and loopback-only
  published ports.
- The generated technical sample is not represented as third-party media or a
  hosted release.
- Cleanup targets only the inspected disposable project and proves zero owned
  containers, networks, and volumes remain.
- Existing projects, retained media, credentials, and host processes are not
  changed.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Clone, install, or version pin fails | Stop before Docker startup and retain the exact diagnostic | Command transcript only |
| Capability link or focused test fails | Stop and correct documentation or source before any verification claim | Test output only |
| Docker startup or browser journey fails | Capture status/logs, run the same exact scoped cleanup, and do not claim the checkpoint | Existing structured logs and browser output |
| Cleanup ownership cannot be proved | Refuse destructive cleanup and retain exact project identifiers for diagnosis | Cleanup command output |
| Hosted or media-rights claim is implied | Correct the notes before publication | Documentation validation |

## Data and contracts

- Schema/migration: existing migrations run only inside disposable containers
- GraphQL: existing public and private contracts are exercised, not changed
- Events: none changed
- Cache: disposable local cache/state only
- Compatibility: current public bootstrap, navigation, test, Docker, evidence,
  and cleanup instructions are the acceptance contract
- Retention/deletion: delete only the uniquely named disposable Docker project;
  retain images and package caches

## Security and privacy

- Authorization: existing anonymous playback and owner-side publication checks
  remain active
- Input limits: existing generated fixture and bounded test limits apply
- Sensitive data: no credentials, personal data, signed URLs, or external media
  enter evidence
- Abuse cases: remote Docker endpoints, inherited Compose project names,
  unscoped cleanup, historical rights replay, and public-hosting claims are
  rejected

## Implementation steps

1. Record item74's exact protected, merge, and exact-main acceptance and
   activate item75.
2. Create one new temporary clone at exact main and record its clean state,
   origin, commit, tool versions, and absence of generated state.
3. Follow the README bootstrap with the pinned toolchain and frozen lockfile.
4. Use the capability index to locate the playback path and run its linked
   focused adverse test.
5. Verify the linked evidence and operations destinations.
6. Start the anonymous playable Docker checkpoint under a unique project name,
   run the existing real browser journey, and verify replay-safe initialization.
7. Inspect exact ownership, perform documented project-scoped cleanup with
   volumes, and prove zero owned residue.
8. Publish raw evidence and reference-verification notes, run local gates, then
   complete one review and one confirmation.

## Tests

- Domain: existing Playback session characterization test selected through the
  capability index
- Application: existing Web playback state test
- Integration: playable Catalog/Playback/Router/object-storage Docker path
- Contract: documentation, capability-index, and local platform validation
- Browser: existing anonymous playable journey
- Performance/failure: no capacity claim; startup, replay, failure diagnostics,
  and exact cleanup only

## Evidence

- Commands: exact fresh-clone and Docker commands with measured results
- Raw artifact path: `evidence/phase-14/p14-r18-reference-acceptance.txt`
- Acceptance result: pending
- Iteration gate: public bootstrap/version checks, selected focused tests,
  Docker startup/journey/replay/cleanup, `pnpm docs:check`, and `pnpm ai:check`
- Candidate gate: `pnpm check:changed`
- Heavyweight repeat triggers: any executable, Docker model, browser journey,
  generated-media, migration, cleanup, dependency, or public-command change
- Review stopping rule: one complete initial review and one confirmation; an
  additional round requires a new blocker in requirements, security, data,
  availability, cleanup, rights, or a public contract

## Rollback or recovery

Delete only the verified temporary clone after evidence capture and revert the
verification notes/memory updates. If Docker cleanup cannot prove ownership,
retain the project and its exact identifiers for manual diagnosis rather than
using a broad deletion command. No production or hosted state exists.

## Documentation updates

- `README.md`
- `docs/00-start-here/REFERENCE_VERIFICATION.md`
- `evidence/phase-14/README.md`
- `evidence/phase-14/p14-r18-reference-acceptance.txt`
- `.ai/CURRENT_STATE.md`, `.ai/WORK_QUEUE.md`, `.ai/SESSION_LOG.md`, and
  `.ai/HANDOFF.md`

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
