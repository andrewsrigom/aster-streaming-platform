# Work Item: Stage Discovery schema compatibility before home rails

- Status: IN_PROGRESS
- Owner: Discovery read model
- Phase: 09
- Requirement IDs: P09-R03, P09-R09
- Created: 2026-08-29
- Updated: 2026-08-29

## Outcome

The released search-only Discovery binary remains ready on its current migration
set and after the next additive home-rail migration, so migration-first rollout
and rollback do not create a readiness gap.

## Current behavior

P09-R01 is released in main `0bdcb27` through PR33 and exact-main CI33239191134.
PR34 candidate `7d31678` proved home rails locally, but confirmation review found
that the released binary requires exactly migrations `1–2` while the rails binary
requires exactly `1–3`. No deployment order keeps both versions ready.

## Proposed behavior

Release one compatibility precursor from current main. Search readiness accepts
only ordered markers `1–2` or the single reviewed additive successor `1–3`.
The local migration preflight preserves its valid bootstrap and partial-current
states and also tolerates ordered markers `1–3`, while continuing to use and
apply only the two migration-2-era scripts and objects. Both paths reject gaps,
rewrites and marker `4`. Merge this precursor before rebasing PR34 and applying
migration `0003`.

## Boundaries

- Owning context: Discovery.
- Affected services/packages: Discovery readiness, tests, migration/ADR docs and
  Phase 09 evidence/memory.
- Authoritative data: unchanged Discovery projection derived from Catalog.
- Read models/caches: PostgreSQL projection; no Redis or new data.
- Trust boundaries: database migration rows returned to readiness.
- External dependencies: existing PostgreSQL only.

## Invariants

- The search-only binary never queries migration-3 objects.
- The search-only migrator never applies migration `0003`; it only tolerates its
  marker after another reviewed image has applied it.
- Readiness compatibility is finite: only exactly `1–2` and `1–3` pass.
- Migration preflight additionally preserves valid bootstrap and partial-current
  states so it can still install migrations `1–2`.
- A missing, gapped, rewritten or future schema fails readiness closed.
- Migration `0003` is not applied before this precursor reaches main.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Migration rows missing, gapped or future | Readiness unavailable | existing finite dependency/readiness state |
| Marker `3` present | Search-only binary remains ready using existing objects | existing readiness state |
| Database unavailable/cancelled | Existing unavailable behavior | existing dependency outcome |

## Data and contracts

- Schema/migration: no schema mutation in this precursor.
- GraphQL: unchanged search contract and artifacts.
- Events: unchanged Catalog v1 events.
- Cache: none.
- Compatibility: released search binary accepts current and one additive successor.
- Retention/deletion: unchanged.

## Security and privacy

- Authorization: unchanged role/membership/privilege checks remain mandatory.
- Input limits: at most four ordered migration rows are read.
- Sensitive data: no new data or logs.
- Abuse cases: hostile row accessors are not invoked; unexpected rows fail closed.

## Implementation steps

1. Extract finite readiness and migrator schema-compatibility predicates with
   adverse tests.
2. Document the required two-stage rollout and rollback.
3. Run the affected candidate gate, one initial review and one confirmation.
4. Protected squash merge and exact-main CI, then rebase/remediate PR34.

## Tests

- Domain: not applicable; no domain rule changes.
- Application: readiness and migration-preflight current/successor/gap/future
  predicate tests, plus hostile readiness rows.
- Integration: PR34 repeats real migration-3 mixed-version evidence after rebase.
- Contract: no GraphQL change; source gate protects existing schema.
- Browser: not applicable.
- Performance/failure: no heavyweight runtime change; readiness failure behavior is
  bounded by focused tests and the later real SQL gate.

## Evidence

- Commands: Discovery build/tests, scoped lint/format, then `pnpm check:changed`.
- Raw artifact path: `evidence/phase-09/home-rails-compatibility.txt`.
- Acceptance result: first candidate passed 73/73 Discovery tests and the 42/42
  affected gate. Confirmation found the migration-preflight blocker; corrected
  verification passes Discovery75/75 and the affected42/42 gate; protected
  release is pending.
- Iteration gate: strict build, focused node:test, scoped ESLint/Prettier.
- Candidate gate: canonical affected `pnpm check:changed`.
- Heavyweight repeat triggers: predicate/test/doc changes do not repeat Docker,
  media or unchanged search runtime; PR34 must repeat migration-3 SQL/readiness.
- Review stopping rule: one initial and one confirmation round; reopen only for a
  requirement, security/data, availability or public-contract blocker.

## Rollback or recovery

Restore the prior search binary while schema remains at migration `2`. If this
precursor is already released it is behavior-compatible with migration `2`; do
not apply migration `3` until its exact-main gate passes. Preserve all projections,
fences, quarantine and retained media.

## Documentation updates

ADR-0035, Discovery migration guide, Phase 09 release/evidence and repository
memory.

## Completion checklist

- [x] Requirements satisfied
- [x] Focused tests pass
- [x] Candidate evidence captured
- [x] Documentation current
- [x] `.ai/` state updated
- [x] Remaining risks recorded
