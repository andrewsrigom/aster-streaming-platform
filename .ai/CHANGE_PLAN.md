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

Identity profiles and Playback sessions exist. Engagement domain/application pass 25 focused tests; persistence/transport are not implemented. Phase 07 is released: PR 25 head c7f9f7c0e5ad14134fe260284fe7c1f8f2921efe passed protected CI/confirmation, squash 854592e5ff1213a306b45d61a547ad4f2a2d9395 passed exact post-merge 33171284170. This branch is already rebased on that identical tree. [Player release/rollback](../evidence/phase-07/release.md), [progress checkpoint](../evidence/phase-08/README.md).

## Proposed behavior

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
3. Owner-read ADR, retention and real PostgreSQL isolation/concurrency/atomicity.
4. Bounded GraphQL/runtime, explicit degraded behavior and protected operations.
5. Evidence/review/release after PR 25, then remaining Phase 08 work.

## Tests

Domain: threshold edges, tiny/long titles, deliberate seek, stale ordering, malformed/hostile input and clock bounds. Application: wrong owner/session/title, exact/conflicting replay, expiry, cancellation, capacity and ambiguous commit. Integration: synchronized real SQL, rollback, privilege isolation and actual owner transport. Contract: composition/operations/events. Browser resume follows player integration, not a fabricated current result.

## Evidence

Iteration: focused node:test, strict types and ESLint. Candidate: affected workspace gate plus changed SQL/owner transport. Artifacts: evidence/phase-08. Repeat heavy proofs only when transaction, trust, transport, packaging or player boundaries change. One initial and one confirmation review; only requirement/security/data/availability/public-contract blockers extend the item. No unchanged CPU/film/demo experiment.

## Rollback or recovery

No dependent publication before PR 25 release; rebase and rerun affected gates if it changes. Stop additive Engagement runtime and retain data on rollback. Never remove Identity/Playback/Catalog state. Migration down must refuse retained acknowledged data outside an explicitly disposable or approved backup/recovery target.

## Documentation updates

Record implemented versus planned behavior, threshold/receipt/retention contracts, owner-read ADR and recovery at coherent checkpoints. Keep queue/current state/handoff consistent with the sole dependent item.

## Completion checklist

- [x] Domain/application acceptance (pure/application fakes; real persistence/transport still pending)
- [ ] Durable isolation/concurrency/atomicity
- [ ] Owner transport and public contract
- [ ] Evidence and memory current
- [ ] Predecessor and protected release complete
