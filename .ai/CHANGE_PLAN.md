# Work Item: Durable owner-authorized playback progress

- Status: IN_PROGRESS
- Owner: Engagement
- Phase: 08
- Requirement IDs: P08-R01, P08-R02, P08-R03, P08-R04, P08-R05, P08-R09
- Created: 2026-08-28
- Updated: 2026-08-28

## Outcome

Save progress for an owned profile and valid title-bound playback context, with durable acknowledgement, exact replay and monotonic ordering.

## Current behavior

Engagement domain/application and isolated PostgreSQL pass focused and real SQL tests. The protected fourth subgraph now saves through current private Identity/Playback checks in Docker. Replay, ordering, cross-account rejection, lock recovery, session expiry, revocation and anonymous-media independence pass. The full candidate gate and protected release remain pending. Phase 07 is released at main 854592e5ff1213a306b45d61a547ad4f2a2d9395. [Evidence](../evidence/phase-08/README.md).

## Proposed behavior

PR 26 CI 33180440040 failed in the unchanged Catalog attestation fixture: its fixed command clock can precede PostgreSQL's later validated_at, causing media_not_ready on reused publication. Correct only the test clock: start before a deliberate second boundary, advance from each actual registered publication timestamp, preserve future-publication rejection and all production checks. Iteration: Catalog build/lint and real SQL regression. Candidate: affected gate. Existing Engagement/Playback Docker acceptance remains valid because no production source changes; do not repeat it. Review only this test correction and any already-requested blocking-boundary confirmation.

P08-R06 is preserved, not active, in exact stash d4320f6f84043fc92c2ffc687a075f087e377753 on feat/p08-history. Its 60 tests, rebased SQL and full federated reads passed with zero fixture resources; final candidate/release remain. Restore that stash once after rebasing; older stashes were already restored.

Implement progress domain/application first, then isolated PostgreSQL and owner-validated GraphQL. Only committed progress/receipt/outbox receives acknowledgement. Pure tests do not claim a running service or save UI. Watchlist, projections, relay and player integration follow within Phase 08.

## Boundaries

Engagement owns progress, receipts and outbox under services/engagement. Identity owns profile/session authorization; Playback owns session validity. No foreign SQL, Redis authority, browser-supplied account identity, media proxy or mandatory Engagement dependency for anonymous playback. Record private owner-read trust/expiry in an ADR before wiring network adapters.

## Invariants

Aggregate key is (profile, title); sequence is global to that key, not reset per session. Exact replay returns its accepted result; changed payload conflicts. Only a newer sequence may deliberately seek backward. Default configured opening threshold is min(30 seconds, 5% duration), completion max(95% duration, duration minus 30 seconds). Strictly exceed opening; reaching completion removes resumability. Integer millisecond position clamps to [0, observed duration]; positive duration is capped at twelve hours. This is reported progress, not proof of viewing or rights authority.

## Failure behavior

Malformed input, wrong owner, expired context and stale sequence do not write. Networks stay outside SQL transactions; deadlines/cancellation prevent later stages. Unknown COMMIT returns indeterminate; retry the same key. Bounded receipt/outbox capacity returns backpressure without deleting live history. Optional save failure never stops media.

## Data and contracts

Add only Engagement-owned tables/credentials/migration. Atomic state, receipt and engagement.progress-recorded v1 event. Digest the original canonical payload, not only its clamped position. Define retention, capacity, deletion tombstones and migration compatibility before persistence. Replay requires current profile authorization but must survive original playback expiry. Supergraph stays the public API; internal reads cannot recurse through a saturated Router. No unused dependencies.

## Security and privacy

Validate exact keys, UUIDs, integer sequence/position/duration/time and bounded collections. Profile/session IDs are references, never authority. Current Identity verification precedes disclosure; Playback binds session to title. No cookies/media URLs in events or logs. New reports allow at most 30 seconds future skew and 120 seconds delivery age; exact accepted replay is distinct from a late new update.

## Implementation steps

1. Pure progress input/state/threshold policy with deterministic tests.
2. Application authorization, replay, transaction intent and finite failure tests.
3. [ADR-0030](../docs/adr/0030-local-engagement-progress.md) defines private owner reads, one-hour receipts, retained progress and SQL capacity/lock order. Migration 0001 and the PostgreSQL adapter pass real isolation/concurrency/atomicity and safe rollback tests.
4. Bounded GraphQL/runtime, explicit degraded behavior and protected operations.
5. Evidence/review/release after PR 25, then remaining Phase 08 work.

### PR 26 confirmation remediation

Initial review 5453534315 and protected CI 33178308691 pass at 319ce4e7f4c02ce5991c9637200421d02b8f13cc. Confirmation 5051921328 found two blocking contract/availability defects: receipt keys were scoped per title, and private Engagement reads shared Playback admission/rate capacity. P08-R01 is IN_PROGRESS again. Batch a profile-scoped receipt key/lookup and one-request private Playback bulkhead with its own rate bucket. Add synchronized cross-title replay and public-during-private-saturation tests; repeat affected SQL/federated evidence because these boundaries change.

P08-R06 work is preserved, not active or publishable: local feat/p08-history and exact stash 678ccde78146453011ed7e9941d29afdad26111d. Its pagination/SQL/GraphQL checkpoint passed focused tests and real 25-row SQL pages; full candidate acceptance remains. After this predecessor is fixed, rebase that branch, restore this stash once and reconcile memory before continuing. No CPU/media loop.

## Tests

Domain: threshold edges, tiny/long titles, deliberate seek, stale ordering, malformed/hostile input and clock bounds. Application: wrong owner/session/title, exact/conflicting replay, expiry, cancellation, capacity and ambiguous commit. Integration: synchronized real SQL, rollback, privilege isolation and actual owner transport. Contract: composition/operations/events. Browser resume follows player integration, not a fabricated current result.

## Evidence

Iteration: focused node:test, strict types and ESLint. Candidate: affected workspace gate plus changed SQL/owner transport. Artifacts: evidence/phase-08. Repeat heavy proofs only when transaction, trust, transport, packaging or player boundaries change. One initial and one confirmation review; only requirement/security/data/availability/public-contract blockers extend the item. No unchanged CPU/film/demo experiment.

## Rollback or recovery

Stop additive Engagement and restore the prior compatible Router artifacts. Preserve all owner schemas/data/media. Disable new owner-read flags when rolling back Identity/Playback, whose old runtime rejects unknown configuration; keep trust volumes unless explicitly rotating exact verified disposable keys. Down migration refuses retained data. The guarded reset recognizes the new exact services/volumes and is tested with fake Docker only; it is not used against retained data.

## Documentation updates

Record implemented versus planned behavior, threshold/receipt/retention contracts, owner-read ADR and recovery at coherent checkpoints. Keep queue/current state/handoff consistent with the sole dependent item.

## Completion checklist

- [x] Domain/application acceptance
- [x] Durable isolation/concurrency/atomicity (disposable PostgreSQL)
- [x] Owner transport and public contract
- [x] Evidence and memory current
- [ ] Protected candidate review/CI, merge and exact post-merge complete
