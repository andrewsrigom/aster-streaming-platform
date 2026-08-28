# Work Item: Idempotent owned watchlist

- Status: IN_PROGRESS
- Owner: Engagement
- Phase: 08
- Requirement IDs: P08-R07; supports ENG-R05, P08-R09, P08-R12
- Created: 2026-08-28
- Updated: 2026-08-28

## Outcome

Authenticated profiles can set watchlist membership idempotently and read bounded pages hiding currently unavailable Catalog titles before pagination.

## Current behavior

P08-R06 is DONE: PR 27 is squash-merged at main 0401ae3e850add27ad73fe7be12a1672d5a73414. Protected CI 33190917857, clean final-head confirmation 5455176079 and exact main push 33191946442 pass; both review threads are resolved. The squash tree equals the reviewed tree. Watchlist is already rebased onto that main and may now publish from feat/p08-watchlist. Latest stash 416c574be8e3d14154943308efc1ed1f017683d3 and all older stashes were restored once; never reapply them.

## Proposed behavior

Follow [ADR-0032](../docs/adr/0032-owned-watchlist-visibility.md): strict set-membership commands, profile-scoped replay/conflict, reclaimable finite membership and filtered live keyset pages. Reuse the implemented [ADR-0031](../docs/adr/0031-current-catalog-visibility.md) Catalog port, credential, operation, snapshot and admission. UI, general entity batching and relay/consumers remain later items.

## Boundaries

Engagement owns PostgreSQL membership, receipts and events. Identity owns session/profile authority; Catalog owns visibility/metadata. No new dependency/service/cache, Playback authority reuse, foreign SQL or recursive Router calls. Affected paths: services/engagement domain/application/infrastructure/transport/tests/migrations and compatible Router artifacts/known operations.

## Invariants

Fresh ownership before reads/writes/replays. Same key/payload returns its original result after later opposite commands; changed title/action conflicts. Replay and removal do not depend on Catalog. Profile versions survive removals; slots are reclaimed. Membership/head/receipt/event commit atomically with the existing deletion fence. Hidden entries never affect page size/hasNextPage/cursors.

## Failure behavior

Malformed input fails before I/O. Identity/Catalog failures are unavailable, not empty success. One 2.5-second budget, one-second SQL and two-second owner ceilings; cancellation, no network within transactions or automatic retries. Capacity returns backpressure; unknown COMMIT is indeterminate. Optional watchlist failure must not block playback.

## Data and contracts

Additive migration 0002: one head/profile, 256 active entries and 1024 one-hour receipts/profile; prune at most 64 expired receipts and share existing 1024 pending outbox slots. Deferred authority/receipt/event checks. Profile-bound live cursor, first 1–20, at most 256 candidates/thirteen serial Catalog batches before first-plus-one. Add setWatchlist/watchlist GraphQL and known operations; nullable Catalog Title metadata. No backfill; down migration refuses retained state. Deletion consumer remains P08-R12.

## Security and privacy

Exact UUID/boolean/cursor inputs; account from Identity only. Reuse purpose-separated local credentials; no browser credential to Catalog or events. Validate response identity/order/bounds/expiry. Structured outcome/correlation telemetry, no secrets or membership labels.

## Implementation steps

1. Restore preserved domain/application/SQL work and adapt its Catalog port to ADR-0031.
2. Prove real SQL replay/conflict/concurrency/slots/atomicity/privileges/deletion/migration.
3. Wire GraphQL/runtime, compatible composition and focused negative tests.
4. Run affected acceptance/evidence; publish after history, then protected release.

## Tests

Replay/opposite commands, conflicts, filtered gaps, concurrency, capacity/reclaimed slots, atomic receipt/event, roles, deletion, cancellation and migration recovery.

## Evidence

Iteration gate: focused node:test, strict affected types and ESLint. Candidate gate: affected workspace check and compatible composition. Acceptance: real PostgreSQL and isolated federated add/read/remove/retirement/authorization/failure checks. Raw artifacts under evidence/phase-08. Repeat heavy checks only for relevant query/migration/trust/admission/runtime/packaging changes; reuse unchanged media/browser/CPU evidence. One initial and one confirmation review; only requirement/security/data/availability/public-contract blockers extend it. Browser is P08-R11.

## Rollback or recovery

Stop additive watchlist runtime; retain schema/data and compatible prior images/artifacts. Empty-state-only down migration, no retained deletion. Preserve recovery stashes/backups and predecessor-first publication.

## Documentation updates

Record API, retention, degraded mode, evidence and exact head at candidate checkpoint. Keep relay/player planned. Current strict build, 84 tests, compatible known operations, real SQL and full federated watchlist proof pass. Candidate gate: 47/47. History's exact main push passes; protected watchlist publication/review remain.

## Completion checklist

- [x] Requirements and focused/real boundary tests pass
- [x] Evidence, documentation and memory current
- [ ] Predecessor complete; protected review/CI/merge and exact post-merge pass
