# Work Item: Owned history and continue-watching pages

- Status: IN_PROGRESS
- Owner: Engagement
- Phase: 08
- Requirement IDs: P08-R06; supports ENG-R02, ENG-R03, ENG-R04, ENG-R06
- Created: 2026-08-28
- Updated: 2026-08-28

## Outcome

An authenticated profile can read recent history and resumable progress through bounded, ordered GraphQL pages, with Catalog metadata resolved by its federated owner.

## Current behavior

The [progress merge checkpoint](../evidence/phase-08/progress-candidate.md) is DONE with main push CI 33182876541 passing at 4082c3a463b50ba4397f080e1b81bc15e03bf140. PR 26 is merged with protected CI and review complete. P08-R06 is the sole dependent local item, rebased onto that identical tree; its publication condition is satisfied.

## Proposed behavior

History includes the latest report per title, including completed and not-started reports; not an append-only session log. Continue-watching selects IN_PROGRESS only. Order by server updatedAt and stable progress ID descending, with one-row lookahead. Versioned cursors bind profile and list kind, never authority. Default/maximum page size 20 matches Catalog's existing entity-batch ceiling.


## Boundaries

Engagement owns its PostgreSQL reads; Identity freshly authorizes every requested profile. No Redis cache, new projection store, foreign SQL or recursive Router call. Catalog resolves Title metadata through Federation; missing/retired metadata is nullable rather than copied or re-exposed. Anonymous playback has no new dependency.

## Invariants

Never disclose before ownership succeeds, after authorization expires, for a deleted guard or from an unexpected account/profile. Validate returned shape, bound and strict order. Completed titles remain in history, not continue-watching. Live keyset pages are not snapshots: a concurrently updated title can move ahead of the cursor; refresh restarts traversal. Retention remains until profile deletion with the existing 256-title ceiling.

## Failure behavior

Malformed or wrong-context cursors fail before I/O. Identity/SQL failure is unavailable, not empty success. Pre-cancellation avoids dispatch; cancellation and the 2.5-second application budget prevent late disclosure. Read-only SQL uses the existing one-second ceiling. No retries or network calls inside transactions. Optional history failure never stops playback.

## Data and contracts

Reuse existing history and partial continue-order indexes; no migration/backfill. Add progressHistory and continueWatching connections and nullable Title references. Event delivery, general Title/Profile engagement extensions, watchlist and player integration remain later requirements. Continue-watching derives directly from authoritative state, so no separate rebuild is needed.

## Security and privacy

Exact keys, UUID profile, first 1–20 and bounded canonical cursor. Browser account IDs are not accepted. Reuse private Identity reads and cancellation/correlation. Return only public progress fields. Account/profile filters and deletion guard protect every SQL read.

## Implementation steps

1. Strict cursor/page policy and authorization-first application reads.
2. Bounded read-only SQL, real PostgreSQL tests and query plans.
3. Protected GraphQL, Title references, composition and known operations.
4. Real federated read proof, evidence/review/release after PR 26.

### Predecessor correction and evidence reuse

PR 26 merged as 4082c3a463b50ba4397f080e1b81bc15e03bf140; protected CI 33181780482 and production confirmation 5453879542 pass. The test-only Catalog clock correction is covered by real SQL and current CI. Post-merge 33182876541 also passes; the predecessor condition is satisfied.

History passes 60 tests, real 25-row SQL and complete federated reads. Rebase onto the byte-identical squash tree used autostash a281042, already applied; d4320f6 and all older stashes were also restored once. No history/runtime source changed. Composition against current main and the final affected gate pass 40/40 tasks. Reuse SQL/Docker evidence; no CPU/media repeat.

## Tests

Cursor ties/context/limits, malformed rows, fresh/expired/foreign authorization, cancellation, completion filter and live-update semantics. SQL keyset/limit/guards/empty profile/index plans/no writes. GraphQL limits, nullable metadata, cross-account denial, compatibility and bounded Catalog batches. Browser is not applicable until P08-R11.

## Evidence

Iteration gate: focused node:test, strict Engagement types and changed-file ESLint. Candidate gate: affected workspace check and composition. Acceptance: real SQL and federated Docker proof of the new read path. Raw output under evidence/phase-08. Repeat heavyweight checks only for changed query/trust/runtime/packaging behavior; reuse unchanged mutation/media evidence with source reasoning. One initial review and one confirmation; only requirement/security/data/availability/public-contract blockers extend the item.

## Rollback or recovery

Restore prior Engagement/Router images and compatible artifacts. No migration, durable deletion or media change. Preserve predecessor rollback and all retained data.

## Documentation updates

Record pagination, retention/live-update semantics, metadata nullability and evidence at the candidate checkpoint. Keep frozen predecessor and active dependent explicit.

## Completion checklist

- [x] Requirements satisfied
- [x] Focused and real boundary tests pass
- [x] Evidence captured
- [x] Documentation and memory current
- [ ] Predecessor released, protected review/CI and exact post-merge pass
