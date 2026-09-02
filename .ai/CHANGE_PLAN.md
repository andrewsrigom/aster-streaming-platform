# Work Item: Clarify Identity, Engagement, and Discovery application flows

- Status: IN_PROGRESS
- Owner: Identity and Profiles, Engagement, and Discovery
- Phase: 14
- Requirement IDs: P14-R16, P02-R03, P02-R05, P02-R10, P08-R01, P08-R03, P08-R04, P08-R09, P09-R03, P09-R05, P09-R08, P09-R09
- Created: 2026-09-02
- Updated: 2026-09-02

## Outcome

A reader can follow the Identity profile transaction, Engagement progress
write, and Discovery home-rail assembly through explicit domain names and
visible phases without changing observable behavior, contracts, ownership, or
failure results.

## Current behavior

Item71/P14-R16 is verified through PR62 squash main `34a32c4`, exact tree
`07641d9`, and exact-main workflow `33612201728`. Its successor inventory
selects three reader problems for item72:

- Identity's `run`, `owned`, and `mutate` names compress credential/session
  validation, owner checks, replay, capacity, versioning, audit, and outbox.
- Engagement's `timestamp`, `fresh`, `guarded`, `replay`, and `writing` names
  obscure owner snapshots, late dependency settlement, receipt replay, and the
  uncertain-commit boundary.
- Discovery's `rail`, `code`, `fixedResult`, `fallback`, `select`, and numeric
  selection indexes obscure independent rail outcomes, permitted fallback, and
  per-rail telemetry.

The linked profile, progress, and home-rail tests characterize these behaviors
before refactoring.

## Proposed behavior

Rename private helpers and local state with owner-specific domain vocabulary,
extract only concrete phases that reduce simultaneous state tracking, and name
each Discovery selection before assembly. Public methods, result statuses,
persistence order, authorization, deadlines, cancellation, replay, events,
fallbacks, and telemetry remain unchanged.

## Boundaries

- Owning context: Identity owns account sessions and viewer profiles;
  Engagement owns progress, receipts, and progress outbox facts; Discovery owns
  its home read model and response assembly
- Affected services/packages: `@aster/identity`, `@aster/engagement`, and
  `@aster/discovery`
- Authoritative data: existing PostgreSQL owners remain unchanged
- Read models/caches: Discovery continues to read its existing projection;
  Engagement continues to use owner-authoritative Identity and Playback reads
- Trust boundaries: untrusted credentials/profile mutation input at Identity;
  untrusted progress requests and owner snapshots at Engagement; untrusted home
  input and repository rows at Discovery
- External dependencies: existing Identity and Playback owner ports plus the
  existing transaction/repository ports; no new dependency

## Invariants

- Identity verifies the credential, locks the matching account and session,
  checks ownership and absolute expiry, and atomically records profile state,
  audit, outbox, and receipt.
- Profile count, journal capacity, optimistic version, replay, wrong-account,
  deletion, and active-profile behavior remains unchanged.
- Engagement performs owner authorization and receipt replay before Playback
  admission, keeps network work outside the transaction, and atomically saves
  progress, receipt, and outbox.
- Progress never moves backward; duplicate requests replay; failure after the
  durable write may start remains `indeterminate`.
- Discovery selects each rail independently, permits recent-content fallback
  only for empty or unavailable featured/trending rails, and preserves bounded
  per-rail telemetry and partial-result status.
- GraphQL, events, persistence, cache, media, authorization, telemetry, and
  error-status contracts do not change.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Invalid, expired, revoked, or substituted Identity session | Fail closed before durable profile intent | Existing Identity request status |
| Profile replay conflict, capacity, or optimistic version conflict | Preserve the existing typed result and atomic rollback | Existing Identity result/status telemetry |
| Engagement owner or Playback snapshot is invalid or expires | Return the existing `unavailable`, `not_found`, or `not_playable` result | Existing dependency and progress telemetry |
| Engagement write may have started before failure | Return `indeterminate`; same idempotency key remains replayable | Existing progress result/status telemetry |
| One Discovery rail fails or is empty | Preserve safe recent-content fallback or an explicit partial rail result | Existing bounded rail outcome/duration observation |
| Every Discovery rail is unusable | Preserve cancelled, indeterminate, or unavailable aggregate precedence | Existing bounded rail observations |

## Data and contracts

- Schema/migration: none
- GraphQL: no schema, operation, resolver, or status change
- Events: no type, version, payload, trace, ordering, or atomicity change
- Cache: none
- Compatibility: private names and local structure only; public exports remain
  compatible
- Retention/deletion: no data or evidence deletion

## Security and privacy

- Authorization: Identity and Engagement retain owner-side fail-closed checks
- Input limits: normalization, identifier, credential, capacity, pagination,
  clock, and deadline bounds remain unchanged
- Sensitive data: no new logging or telemetry; credentials, account/profile
  identifiers, and playback context stay out of events and rail metrics
- Abuse cases: credential substitution, cross-account access, replay conflict,
  stale progress, cancellation, ambiguous commit, corrupt projection rows, and
  unsafe fallback retain characterization

## Implementation steps

1. Run the linked Identity, Engagement, and Discovery characterization tests
   before editing.
2. Rename Identity transaction/authentication, ownership, and mutation phases.
3. Rename Engagement time validation, owner-snapshot, dependency-settlement,
   replay, admission, context, and durable-write phases.
4. Rename Discovery rail construction, outcome translation, fallback, selection,
   telemetry, and aggregate-result phases; remove numeric result indexing.
5. Run focused build/type/lint/tests during iteration and `pnpm check:changed`
   on the coherent candidate.
6. Update the readability inventory, evidence, and repository memory; publish
   one candidate for one review and one confirmation.

## Tests

- Domain: existing profile, progress, and home-rail domain policies remain
  covered by their package suites
- Application: `profiles.test.ts`, `record-progress.test.ts`, and
  `home-rails.test.ts` before and after refactoring
- Integration: existing package tests selected by the affected gate
- Contract: existing subgraph, event, and architecture checks
- Browser: not repeated because Web code and public behavior do not change
- Performance/failure: no benchmark claim; authorization, replay, expiry,
  cancellation, capacity, indeterminate write, independent failure, fallback,
  and telemetry outcomes remain covered by focused tests

## Evidence

- Commands: exact pinned-environment commands and raw output will be retained in
  `evidence/phase-14/p14-r16-identity-engagement-discovery-readability.txt`
- Raw artifact path: `evidence/phase-14/p14-r16-identity-engagement-discovery-readability.txt`
- Acceptance result: pre-edit and post-edit linked characterization passes
  47/47; complete Identity passes 163 tests, Engagement passes 129, and
  Discovery passes 110. All three affected builds/typechecks, changed-file
  lint, and architecture validation pass. The affected-scope candidate gate
  passes 44/44 tasks with 12 cached tasks in 1m4.03s. Exact source `6239362`,
  tree `217aaf6`, repeats it with 33 cached tasks in 39.287 seconds. Evidence
  head `1e45071` passes protected workflow `33616377473`; initial review found
  one stale repository-memory resume instruction, corrected without product
  source changes.
- Iteration gate: affected package build/typecheck plus the three linked
  characterization files
- Candidate gate: `pnpm check:changed`
- Heavyweight repeat triggers: a public contract, persistence/event shape,
  transaction/locking order, owner dependency call, deadline/cancellation rule,
  GraphQL/adapter wiring, cache policy, telemetry shape, or runtime configuration
  change
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
