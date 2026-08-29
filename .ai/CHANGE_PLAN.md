# Work Item: Versioned Discovery projection and bounded title search

- Status: IN_PROGRESS
- Owner: Discovery read model; Catalog owns title and publication truth
- Phase: 09
- Requirement IDs: P09-R01, P09-R02, P09-R06, P09-R07
- Created: 2026-08-28
- Updated: 2026-08-28

## Outcome

A viewer can search published titles through the supergraph using a bounded, versioned PostgreSQL read model that can be rebuilt after broker retention expires. Retired or disputed titles disappear within the explicit freshness limit.

## Current behavior

PR32 is frozen at d2ba88f54dcb82c568b8aa4e286632a044e63799 after103 Web tests, strict types, scoped lint and43/43 affected tasks pass. P08-R11 is WAITING_EXTERNAL only for CI33223692248, confirmation request5459202276, squash and exact main. Run33222164370 proved immutable replay and exposed the response-body race corrected by this exact head.

PR32 is frozen at 6c78d2a87853d8b6d0830214be8d434fb76122b9 after104 Web tests, seven observer regressions, strict types, scoped lint and43/43 affected tasks pass. P08-R11 is WAITING_EXTERNAL only for its automatically triggered protected CI, exact-head review request5459353777, squash and exact main. Run33223692248 proved immutable replay and every preceding owner/platform boundary, then exposed the Profiles body race corrected by this exact head.

PR32 is frozen at dc571bd77e08529b8c91ccb53d44b0bf3bfdf089 after105 Web tests, eight observer regressions, strict types, scoped lint and43/43 affected tasks pass. P08-R11 is WAITING_EXTERNAL only for protected CI, exact-head confirmation request5459416204, squash and exact main. Review5056138342's selected-body deadline blocker is corrected by this exact head.

P09-R01 is the sole unpublished dependent on feat/p09-discovery-search, being rebased onto that exact predecessor. Domain and Catalog snapshot/query rules pass31 focused tests. Real SQL passes migration0010, separate-reader privileges, expiry/retirement, bounded global pages and data-preserving view round-trip with2055 synthetic titles; the full Catalog compatibility suite passes. Its complete private transport/runtime WIP remains in stash 01b1dad9bbda289976d137b1a20af9f7cf102add until this rebase completes; older stashes must not be reapplied. No running search API is claimed. No publication before predecessor closeout; rebase/recheck if it changes.

## Proposed behavior

Use the existing PostgreSQL, broker, Node/Express and Federation boundaries. Implement projection rules, Catalog-owned current snapshots/export, owned persistence/rebuild/consumer, then a bounded search subgraph. ADR-0035 defines consistency and freshness. No external search engine, Redis authority, media work or personal recommendation store.


## Boundaries

Catalog owns metadata/visibility and its private read adapter. Discovery owns searchable copies, source versions, projection generations and query ordering. Existing event-delivery/broker adapters transport facts; events are invalidation hints, not publication authority. Public fields return Catalog Title references. Planned paths: services/discovery, narrow services/catalog application/transport/persistence reads, Router artifacts/known operations and opt-in Compose. Web rails remain the later P09-R10 slice.

## Invariants

Only current Catalog snapshots can populate public metadata. Older source versions cannot overwrite newer state; same-version conflicting metadata cannot silently replace it; hidden state cannot become visible at the same version. Preserve retirement fences through replay/rebuild. Public results expire within300seconds, with source-rights expiry as an earlier cap, and never grant media access. Query metadata continues to come from Catalog.

## Failure behavior

Cancellation/deadlines stop uncommitted work. Unknown commits are replayable through source version. Invalid or conflicting events are durably quarantined before acknowledgement; full bounded quarantine leaves the offset uncommitted. Snapshot failure is unavailable, never a fabricated empty or hidden title. A partial rebuild never replaces the active generation. Discovery failure must not affect Catalog/Playback admission.

## Data and contracts

Add owned Discovery schema/roles with additive migrations and empty-state-only down migration. Keep Catalog v1 events unchanged. Add purpose-separated private snapshot/export GraphQL reads under the existing owner-read model; do not reuse another consumer's key. No cross-owner SQL. Search queries are normalized and bounded with query-bound keyset cursors. Keep at most two projection generations; retain source-version fences and bounded quarantine/rebuild checkpoints. No personal data or new cache.

## Security and privacy

Validate all source/event/query input and exact ownership. Bound metadata, response bytes, page size, concurrency and total traversal. Separate optional Catalog admission from public traffic. No media URLs, rights records, browser credentials or raw search text in telemetry. Reject cursor/query substitution and oversized or malformed documents.

## Implementation steps

1. Pure snapshot/projection/search-input rules and deterministic adverse tests.
2. Catalog snapshot/export adapter and purpose isolation; real owned SQL evidence.
3. Discovery persistence, generation rebuild and current-snapshot event consumer; duplicate/retirement/outage/replay evidence.
4. Search GraphQL, composition/cost limits, opt-in runtime and representative query plans/relevance.
5. Protected candidate/release, then independent rails and client integration in their queued slices.

## Tests

Domain: bounds, canonicalization, duplicate/stale/conflicting versions, fresh/expired input and retirement fences. Application: cancellation, snapshot failure, invalid event and finite rebuild. Integration: real PostgreSQL constraints/generation switch, Kafka acknowledgement/replay and actual owner isolation. Contract: schema/known operations, page/cost/cursor safety. Browser: no new UI in this slice; existing public browse/playback remains a smoke boundary. Failure: unavailable Catalog/broker/Discovery, expired freshness and incomplete rebuild.

## Evidence

Iteration gate: scoped strict TypeScript, deterministic node:test and changed-file lint. Candidate gate: canonical check:changed and exact-main schema compatibility. Capture raw output, hashes, environment, workload and limitations under evidence/phase-09. Repeat SQL/Kafka/runtime evidence only for changes affecting their semantics, packaging or bootstrap; no unchanged host/media experiment. One initial and one confirmation review; extend only for requirement, security/data, availability or public-contract blockers.

## Rollback or recovery

Disable optional Discovery and restore compatible Router/Catalog artifacts. Retain source data, version fences, quarantine and the prior active index. Never repair a failed rebuild by deleting Catalog or retained demo data. No WSL/Docker restart or global cleanup. Publication is predecessor-first.

## Documentation updates

ADR-0035, Discovery operations and contracts, phase evidence, and concise repository memory at candidate/closeout checkpoints.

## Completion checklist

- [ ] Projection and search implementation satisfies the four requirements
- [ ] Required tests and real runtime evidence pass
- [ ] Relevance, freshness and retirement behavior measured
- [ ] Documentation and memory current
- [ ] Predecessor and own protected release complete

