# Work Item: Clarify Catalog commands and Playback session outcomes

- Status: IN_PROGRESS
- Owner: Catalog and Playback
- Phase: 14
- Requirement IDs: P14-R16, P03-R04, P03-R06, P03-R10, P07-R01, P07-R10
- Created: 2026-09-02
- Updated: 2026-09-02

## Outcome

A reader can follow the Catalog operator transaction and Playback session
creation flow through explicit domain names and visible phases without changing
their observable behavior, contracts, ownership, or failure results.

## Current behavior

Item70/P14-R15 is verified through PR61 squash main `3858bcb`, exact tree
`448be36`, and exact-main workflow `33603027919`. Its bounded inventory selects
two P0 reader problems for item71:

- Catalog's `planChange`, nested `execute`, `retirement`, `publishing`, and
  `lifecycle` names hide command decisions, lifecycle conversion, reserved
  takedown capacity, durable writes, and publication revalidation.
- Playback's `untilAborted` and `inserting` names hide dependency settlement and
  the boundary after which a failed session write is indeterminate.

The linked Catalog workflow and Playback session tests characterize these
behaviors before refactoring.

## Proposed behavior

Rename private helpers and local state with Catalog and Playback vocabulary,
extract only real command-decision phases from the Catalog planner, and replace
Playback's nested failure expression with explicit outcome branches. Public
methods, result statuses, persistence order, deadlines, cancellation, rights
checks, event payloads, and telemetry remain unchanged.

## Boundaries

- Owning context: Catalog owns title, rights, publication, audit, receipt, and
  outbox writes; Playback owns playback-session writes
- Affected services/packages: `@aster/catalog` and `@aster/playback`
- Authoritative data: Catalog and Playback PostgreSQL state remain authoritative
- Read models/caches: Playback continues to use one bounded owner-authoritative
  Catalog publication lookup; no cache changes
- Trust boundaries: untrusted operator input and credentials at Catalog;
  untrusted title/correlation identifiers and Catalog response at Playback
- External dependencies: existing Catalog owner lookup and existing transaction
  ports only; no new dependency

## Invariants

- Rights approval and publishable artwork precede Catalog publication.
- Retire, dispute, and expire retain reserved receipt and outbox capacity.
- Catalog audit, publication event, receipt, and final public-title validation
  retain their existing order and atomic transaction boundary.
- Playback performs one current-publication lookup before one session write.
- Cancellation before a session write is `cancelled` or `unavailable` according
  to the existing deadline boundary; failure after write start is
  `indeterminate` and is never retried.
- Session expiry is rechecked after the acknowledged write.
- GraphQL, events, persistence, cache, media, authorization, telemetry, and
  error-status contracts do not change.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Invalid or unauthorized Catalog command | Reject before durable command effects | Existing sanitized request span/log |
| Rights, artwork, lifecycle, or publication decision rejects | Preserve the existing typed Catalog status | Existing Catalog result/status telemetry |
| Receipt/outbox capacity is exhausted | Ordinary commands return `backpressure`; takedown capacity remains reserved | Existing Catalog backpressure metric/log |
| Catalog dependency fails before Playback write | Playback returns `unavailable`, or `cancelled` for caller cancellation | Existing Playback dependency span/status |
| Playback write may have started before failure | Return `indeterminate`; do not retry | Existing Playback result/status telemetry |
| Session expires during acknowledged write | Return `not_playable` | Existing Playback result/status telemetry |

## Data and contracts

- Schema/migration: none
- GraphQL: no schema, operation, resolver, or status change
- Events: no type, version, payload, causation, trace, or ordering change
- Cache: none
- Compatibility: private names and local structure only; public exports remain
  compatible
- Retention/deletion: no data or evidence deletion

## Security and privacy

- Authorization: Catalog reauthorizes the same operator before and after the
  transaction; Playback admission remains fail-closed
- Input limits: normalization, identifier checks, pending-count ceilings, and
  deadlines remain unchanged
- Sensitive data: no new logging or telemetry; credentials and media URLs stay
  out of events and evidence
- Abuse cases: replay substitution, actor substitution, rights bypass,
  publication races, cancellation, and uncertain writes retain characterization

## Implementation steps

1. Run the linked Catalog and Playback characterization tests before editing.
2. Rename private command predicates, lifecycle conversion, transaction flow,
   dependency settlement, and durable-write state with domain vocabulary.
3. Extract only concrete Catalog decision phases needed to make the command
   planner readable.
4. Make Playback failure translation explicit without changing outcomes.
5. Run focused build/type/lint/tests during iteration and `pnpm check:changed`
   on the coherent candidate.
6. Update the readability inventory, capability navigation, evidence, and
   repository memory; publish one candidate for one review and one confirmation.

## Tests

- Domain: existing Catalog lifecycle/rights and Playback session tests remain
  unchanged unless a missing characterization is discovered
- Application: `catalog-workflow.test.ts` and `create-session.test.ts` before
  and after refactoring
- Integration: existing package tests selected by the affected gate
- Contract: existing Catalog/Playback GraphQL, event, and architecture checks
- Browser: not repeated because player/Web code and public behavior do not
  change
- Performance/failure: no benchmark claim; deadline, cancellation,
  backpressure, replay, and indeterminate outcomes are covered by focused tests

## Evidence

- Commands: pinned install; focused Catalog/Playback builds and tests;
  formatting, lint, typecheck, architecture, documentation, repository-memory,
  and changed-scope checks
- Raw artifact path: `evidence/phase-14/README.md`
- Acceptance result: linked characterization passes 15/15 before and after the
  refactor; complete Catalog tests pass 249/249 and Playback tests pass 42/42;
  both builds/typechecks, changed-file lint, and architecture validation pass.
  The affected-scope candidate gate remains
- Iteration gate: affected package build/typecheck plus the two linked
  characterization files
- Candidate gate: `pnpm check:changed`
- Heavyweight repeat triggers: a public contract, persistence/event shape,
  transaction/locking order, dependency call, deadline/cancellation rule,
  GraphQL/adapter wiring, or runtime configuration change
- Review stopping rule: one complete initial review and one confirmation; an
  additional round requires a new blocker in requirements, ownership, security,
  availability, data, or a public contract

## Rollback or recovery

Revert the private renames and local extractions. No schema, data, cache, media,
provider, credential, or hosted state needs recovery.

## Documentation updates

- `docs/quality/CODE_READABILITY.md`
- `docs/00-start-here/CAPABILITY_INDEX.md` only if a reading entry path changes
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
