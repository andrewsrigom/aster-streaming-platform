# Work Item: Request-scoped federated engagement fields

- Status: IN_PROGRESS
- Owner: Engagement
- Phase: 08
- Requirement IDs: P08-R08; supports GQL-R03, ENG-R04, ENG-R05
- Created: 2026-08-28
- Updated: 2026-08-28

## Outcome

Federated Title and Profile expose optional owned progress and current visible watchlist membership, batching repeated pairs without sharing state across requests.

## Current behavior

P08-R07 is DONE: PR 28 is squash-merged as 9a7ab087034d69589a8388d62f5973cb9950b2da, tree-identical to reviewed head 05fbead7c8d3345bbd44d4e0685f10e7581bda29. Protected CI 33193355470, clean initial review 5455665142, clean confirmation 5455734225 and exact main push 33195546036 pass. R08 local acceptance is complete: 98 Engagement tests, nine composition tests, real SQL and full federated Docker proof, plus 67/67 candidate tasks. This sole dependent uses feat/p08-engagement-fields and is ready for protected publication. Preserve all stashes/data.

## Proposed behavior

[ADR-0033](../docs/adr/0033-request-scoped-engagement-fields.md): nullable Title.progress(profileId)/inWatchlist(profileId) and Profile.progress(titleId)/inWatchlist(titleId). Request-owned DataLoader 2.2.3, already pinned in Identity/Catalog, batches at most twenty canonical profile/title pairs into one owned SQL read. A separate lazy request-owned Catalog batch checks only present memberships, so progress-only reads do not depend on Catalog.

## Boundaries

Engagement owns progress/membership PostgreSQL reads. Identity alone supplies account/profile authority; Catalog owns current visibility. Domain/application remain framework-free. Reuse existing purpose-separated owner clients and SQL adapter; no new service, credential, migration, Redis authority, cross-owner SQL or media work. Affected paths: Engagement application/infrastructure/transport/tests, package lock and compatible Router artifacts/known operations.

## Invariants

Exact entity representations contain only typename/id; neither representations nor browser account data authorize access. Cache at most twenty pairs and five profiles per request, batch size twenty, Identity concurrency two. Return results in input order, distinguish missing from unavailable, recheck authority/visibility freshness and cancellation on cache hits and before disclosure. Current retirement hides membership, not retained progress. No cross-request cache.

## Failure behavior

Invalid/oversized inputs fail before I/O. Foreign/deleted/revoked profiles fail only their optional fields. Owner/SQL failures produce nullable errors, not false/empty success. Catalog failure affects membership only. One 2.5-second request budget, existing owner two-second and SQL one-second ceilings, no retries, queues or production rate exemptions. Keep sanitized correlated outcomes.

## Data and contracts

Additive nullable fields and resolvable Title/Profile references; existing mutation/page shapes unchanged. Strict at-most-twenty representations, fragment type conditions and multiplied field cost under existing global bounds. One bounded parameterized SELECT joins only Engagement guard/progress/watchlist rows; read-only rollback. No state write, event or retention change.

## Security and privacy

Fresh credential-bound Identity checks; preserve deletion fences and owner-account joins. Bound keys, profiles, collections, dependencies and recursive selections. No account/session/media data in GraphQL, logs or cache labels. Per-request authorization and Catalog snapshots are never global.

## Implementation steps

1. Implement owned batch reader and SQL adapter.
2. Wire bounded request DataLoaders, resolvable entities and preflight.
3. Add compatible known operations/composition and boundary tests.
4. Measure real SQL batching and prove actual federated fields; publish only after R07 closeout.

## Tests

Query counts/order/nulls/dedup, independent accounts/requests, five-profile/20-key bounds, fresh/expired/deleted/foreign authority, visibility expiry/cancellation, malformed representations/fragments/cost, real SQL guard joins and composed query plans. Compare a named synthetic sequential baseline with batching, not a claimed prior production defect. Browser resume belongs to R11.

## Evidence

Hosted candidate 74c3976 failed CI 33196837907 only at the existing Identity diagnostic parent watchdog. [Focused remediation](../evidence/phase-08/fields-ci-harness.txt) changes that single test's outer process budget, not runtime deadlines. Ten Identity composition tests pass. Preserve prior R08 heavy evidence; publish the test-only correction once and require fresh CI/final-head confirmation. R09 is parked in recovery stash 8212c15d42e15d77e7fa5725c651c9d6bc4adbaf until the predecessor is coherent again.

Iteration gate: focused node:test, strict affected build and changed-file lint. Candidate gate: affected workspace quality and schema compatibility. Acceptance: real SQL query-count/plan and isolated real Router-owner flow. Store sources, commands, environment and raw outputs under evidence/phase-08. Repeat heavy checks only for changes to measured SQL/trust/admission/runtime behavior. Unchanged watchlist/media/browser/CPU evidence is supporting, not rerun. One initial and one confirmation review; only requirement/security/data/availability/public-contract blockers extend it.

## Rollback or recovery

Restore prior compatible Engagement/Router images/artifacts; retain all data. No migration or destructive cleanup. Keep R07's exact candidate and existing recovery stashes untouched. Rebase this unpublished dependent if predecessor changes.

## Documentation updates

Update the GraphQL contract, Engagement README, evidence and memory at coherent checkpoints. Relay/deletion and browser integration remain planned.

## Completion checklist

- [x] Requirements and focused/real tests pass
- [x] Evidence, contracts and memory current
- [ ] Predecessor complete; protected CI/review/merge and exact post-merge pass
