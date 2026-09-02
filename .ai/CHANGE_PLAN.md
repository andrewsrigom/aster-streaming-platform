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
Fresh clone `/tmp/aster-reference-reader-20260902` is at exact main `2b6054a`
with no inherited repository output. The public bootstrap passed with
Node.js `24.19.0`, pnpm `11.24.0`, a frozen install, and the toolchain check.
The public capability index reached Playback requirements, source, adverse
tests, evidence, and operations; 16 focused tests and the complete 73-task
quality gate passed. The high-severity audit gate passed with one known
moderate finding. The Docker leg has not started: Docker Desktop failed during
startup on its stale `userAnalyticsOtlpHttp.sock`, and the owner closed it.

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

- Commands: exact fresh clone, bootstrap, capability navigation, 16 focused
  tests, 73-task complete quality gate, high-severity audit, accepted Docker
  startup/browser/replay/cleanup, and rejected-attempt incident with measured
  results
- Raw artifact path: `evidence/phase-14/p14-r18-reference-acceptance.txt`
- Current accepted runner: `evidence/phase-14/p14-r18-reference-acceptance.sh`,
  SHA-256 `cba6458212b4937015e41c45530e0c71395f1221398bae84a0fe7edcbe92604e`.
  Prior digests in the chronology are superseded evidence snapshots.
- Acceptance result: fresh local source and Docker path pass; protected review,
  merge, and exact-main acceptance remain
- Initial-review correction: the retained runner passes `bash -n`, is
  byte-identical to the executed script, and has the recorded SHA-256.
  `pnpm check:changed` then passes 9/9 tasks with no cached tasks in `14.519s`.
- Initial protected run `33643437047` passes. Review discussions `3915333547`
  and `3915333560` require the complete accepted runner and current public
  navigation; both corrections are batched without changing an executable
  product path.
- Confirmation discussions `3915467273` and `3915467277` require cleanup to
  fail when Compose or inventory inspection errors and source acceptance to
  prove creation in an absent directory with no ignored/generated state. Repeat
  the affected Docker cleanup and fresh-reader source path on new literal names;
  do not broaden product behavior.
- Confirmation remediation passes: the new clone target is absent and empty
  before installation; 16 focused tests and the complete 73-task source gate
  pass; project `aster-reference-confirm-20260902` passes browser playback 1/1,
  replay, checked teardown, and zero residue. Correction publication, protected
  CI, discussion resolution, blocker-boundary confirmation, merge, and exact
  main remain.
- Confirmation-remediation candidate: shell syntax and checksum pass;
  documentation and repository memory report zero violations;
  `pnpm check:changed` passes 9/9 tasks with two cached tasks in `10.912s`.
- Blocker-boundary review `5091554514` opened discussions `3915666140` and
  `3915666152`: project-namespace preflight must check inventory failures before
  arming teardown, and the exact README bootstrap must configure tracked Git
  hooks. Repeat those boundaries on new literal names; retain prior unaffected
  source and Docker evidence.
- Boundary source repeat proves an absent/empty clone, configures `.githooks`,
  and passes the accepted clean 73/73 gate in `52.379s`. Retain the earlier
  media timing failure, focused 2/2 pass, and overlapping build-lock rejection
  as non-accepted observations.
- Boundary Docker project `aster-reference-boundary-20260902` proves successful
  empty namespace inspection before arming teardown, then passes browser 1/1 in
  `5.2s`, replay, checked cleanup, independent zero residue, and retained-
  resource comparison. Executed runner SHA-256: `9d088971`.
- Boundary-remediation candidate passes 9/9 tasks with two cached tasks in
  `12.826s`; documentation, repository memory, formatting, syntax, checksum,
  and diff checks pass.
- Final exact-head review on `68dda8c` opened blocker discussions `3915872033`
  and `3915872044`: refuse Docker endpoint/configuration overrides and any
  non-local active endpoint, pin every Docker/Compose command to the inspected
  local context, and refuse project-prefixed physical names even without Compose
  labels before arming teardown. Repeat the invalidated Docker proof on a new
  literal project; source evidence remains unaffected.
- Endpoint remediation refuses Docker endpoint/configuration overrides, pins
  commands to inspected local context `default`, requires Linux containers, and
  rejects/preserves an unlabeled prefixed fixture volume before teardown is
  armed. Project `aster-reference-endpoint-20260902` then passes browser 1/1 in
  `3.9s`, replay, label-and-name cleanup, independent zero residue, and retained-
  resource comparison. Executed runner SHA-256: `d0d4564b`.
- Endpoint-remediation candidate passes 9/9 tasks with two cached tasks in
  `10.727s`; documentation, repository-memory, formatting, syntax, checksum,
  and diff checks pass.
- Exact-head review `5092002215` on `5c8724a` opened discussions `3916063357`
  and `3916063367`: pin the Docker subprocess inside the context verifier to the
  already inspected context, and remove ambiguity from the superseded primary
  runner checksum. Set `DOCKER_CONTEXT` only for that child process, repeat the
  invalidated Docker runner on a new literal project, and retain source evidence.
- The context-pinned runner passes on project `aster-reference-pinned-20260902`:
  context verifier 24/18, browser 1/1 in `10.5s`, replay, checked teardown,
  independent zero label-and-prefix residue, and retained-resource comparison.
  The source, refusal fixtures, and all unchanged runtime evidence remain valid.
- Nested-context/checksum candidate passes 9/9 tasks with five cached tasks in
  `7.123s`; documentation, repository-memory, formatting, syntax, checksum,
  and diff checks pass.
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
using a broad deletion command. A rejected nested-shell cleanup expanded its
project variable to empty and removed 13 unused `aster` volumes. Their Docker
data is not recoverable without an external backup; do not create replacements
that could hide the loss. No production or hosted state exists.

## Documentation updates

- `README.md`
- `docs/00-start-here/REFERENCE_VERIFICATION.md`
- `docs/00-start-here/DOCUMENTATION_MAP.md`
- `docs/00-start-here/FILE_INDEX.md`
- `evidence/phase-14/README.md`
- `evidence/phase-14/p14-r18-reference-acceptance.txt`
- `evidence/phase-14/p14-r18-reference-acceptance.sh`
- `.ai/CURRENT_STATE.md`, `.ai/WORK_QUEUE.md`, `.ai/SESSION_LOG.md`, and
  `.ai/HANDOFF.md`

## Completion checklist

- [ ] Requirements satisfied
- [x] Tests pass
- [x] Evidence captured
- [x] Documentation current
- [x] `.ai/` state updated
- [x] Remaining risks recorded
