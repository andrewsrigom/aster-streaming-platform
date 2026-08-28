# Work Item: Owned history and continue-watching pages

- Status: IN_PROGRESS
- Owner: Engagement
- Phase: 08
- Requirement IDs: P08-R06; supports ENG-R02, ENG-R03, ENG-R04, ENG-R06
- Created: 2026-08-28
- Updated: 2026-08-28

## Outcome

An authenticated profile can read recent history and resumable progress through bounded, ordered GraphQL pages, with Catalog metadata resolved by its federated owner.

### Confirmation blocker and remediation

PR 27 confirmation 5052590545 / thread PRRT_kwDOUEkeis6dN9km found that nullable metadata alone does not satisfy ENG-R04: continue-watching must exclude retired/disputed titles before page size/hasNextPage. P08-R06 remains IN_PROGRESS at c512c9d; protected CI 33184567740 passed but does not waive this blocker. P08-R07 local work is preserved in unapplied stash ced886f6094d1b07b53e52400ef188d3d5ac5c86 on feat/p08-watchlist (74 Engagement tests passed; watchlist SQL compiled but real SQL not run). Do not reapply until this candidate is again locally accepted/frozen.

Implement [ADR-0031](../docs/adr/0031-current-catalog-visibility.md): purpose-separated Catalog visibility batch, twenty IDs, current two-second bounded owner decision, no media URLs/Playback credentials. Continue-watching reads at most 256 retained candidates and filters current visibility in at most thirteen serial batches before first-plus-one. History retains nullable retired metadata. Add negative credential/admission/expiry and hidden-gap tests plus real federated retirement/dispute acceptance. Changed trust/runtime invalidates earlier read Docker evidence; run that affected proof once after stable remediation. Repeat a confirmation only because this correction changes a blocking trust/public-contract boundary.

## Current behavior

The [progress merge checkpoint](../evidence/phase-08/progress-candidate.md) is DONE with main push CI 33182876541 passing at 4082c3a463b50ba4397f080e1b81bc15e03bf140. PR 26 is merged with protected CI and review complete. P08-R06 is the sole dependent local item, rebased onto that identical tree; its publication condition is satisfied.

## Proposed behavior

History includes the latest report per title, including completed and not-started reports; not an append-only session log. Continue-watching selects currently visible IN_PROGRESS titles. Order by server updatedAt and stable progress ID descending, with one-visible-row lookahead. Versioned cursors bind profile and list kind, never authority. Default/maximum page size 20 matches Catalog's existing entity-batch ceiling.


## Boundaries

Engagement owns its PostgreSQL reads; Identity freshly authorizes every requested profile. No Redis cache, new projection store, foreign SQL or recursive Router call. Catalog owns the new separately credentialed visibility read and resolves Title metadata through Federation; missing/retired metadata remains nullable in history. Continue-watching filters current visibility before lookahead. Anonymous playback has no new dependency.

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

The initial history candidate passed 60 tests, real 25-row SQL and federated reads. Rebase onto the byte-identical squash tree used autostash a281042, already applied; d4320f6 and all older stashes were also restored once. PR 27's confirmation exposed missing current-visibility filtering despite those green checks. The remediation changes trust/runtime/read behavior, so fresh affected SQL/Docker evidence supersedes the original read proof. No CPU/media/browser repeat is relevant.

## Tests

Cursor ties/context/limits, malformed rows, fresh/expired/foreign authorization, cancellation, completion filter and live-update semantics. SQL keyset/limit/guards/empty profile/index plans/no writes. GraphQL limits, nullable metadata, cross-account denial, compatibility and bounded Catalog batches. Browser is not applicable until P08-R11.

## Evidence

Iteration gate: focused node:test, strict Engagement types and changed-file ESLint. Candidate gate: affected workspace check and composition. Acceptance: real SQL and federated Docker proof of the new read path. Raw output under evidence/phase-08. Repeat heavyweight checks only for changed query/trust/runtime/packaging behavior; reuse unchanged mutation/media evidence with source reasoning. One initial review and one confirmation; only requirement/security/data/availability/public-contract blockers extend the item.

## Rollback or recovery

Restore prior Engagement/Router images and compatible artifacts. No migration, durable deletion or media change. Preserve predecessor rollback and all retained data.

## Documentation updates

Record pagination, retention/live-update semantics, metadata nullability and evidence at the candidate checkpoint. Keep frozen predecessor and active dependent explicit.

## Completion checklist

- [x] Remediated requirements and boundary tests pass
- [x] Current candidate evidence and documentation captured
- [x] Predecessor protected and exact post-merge checks pass
- [ ] Corrected candidate protected review/CI and exact post-merge pass

[Remediation acceptance](../evidence/phase-08/history-visibility.md) passes current SQL/Docker and all applicable candidate tasks. The initial 45/46-task run's test-only lint failures are closed by full lint and focused/static checks; production source is unchanged after the heavy proofs. Publish one coherent correction, then freeze its exact head while awaiting protected confirmation/CI. No known local blocker remains.
