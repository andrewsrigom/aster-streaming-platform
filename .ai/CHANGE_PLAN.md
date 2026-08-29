# Work Item: Versioned Discovery projection and bounded title search

- Status: IN_PROGRESS
- Owner: Discovery read model; Catalog owns title and publication truth
- Phase: 09
- Requirement IDs: P09-R01, P09-R02, P09-R06, P09-R07
- Created: 2026-08-28
- Updated: 2026-08-29

## Outcome

A viewer can search published titles through the supergraph using a bounded, versioned PostgreSQL read model that can be rebuilt after broker retention expires. Retired or disputed titles disappear within the explicit freshness limit.

## Current behavior

PR32 exact d295ec7 passed protected CI33228909828 and clean confirmation review5459788095, squash-merged as6f38ce0 and passed exact-main CI33229726626. P08-R11 and Phase08 are released. Run33225822813 proved immutable replay and every preceding owner/platform boundary, then disproved observer-owned body reads; the released source leaves bodies to the application and requires rendered durable confirmation within12 seconds.

P09-R01 is the sole active unpublished item on feat/p09-discovery-search. Review-remediated source04011af composes the owned projection, finite broker consumer/rebuild, bounded GraphQL subgraph, five-owner supergraph and opt-in runtime. Initial candidate e979d7d passes the canonical73/73 gate; dependency audit has zero high/critical findings. Protected run33236352596 passed all independent jobs and Catalog integration behavior, then exposed a stale nine-volume cleanup ceiling; correction5287b29 passes focused and real cleanup gates. Automated review identified four valid renewal, empty-offset, Router-isolation and documentation-contract findings. Commit04011af starts refresh at150seconds, handles a missing checkpoint as position zero only, keeps Router startup independent and documents the implemented80-code-point limit. Discovery69/69, focused platform4/4, exact PostgreSQL18.6 in2481ms, the disposable11-service Kafka/Router failure-isolation proof in104158ms and the final73/73 candidate gate pass. Confirmation found no blocker; exact-head publication, protected CI/review, squash and exact-main CI remain. Historical stashes are superseded and must not be reapplied.

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
3. Complete broker/runtime orchestration around the implemented current-snapshot event consumer, durable quarantine/replay, persistence and generation rebuild.
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

- [x] Projection, consumer and search implementation satisfies the four requirements
- [x] Required tests and real runtime evidence pass
- [x] Relevance, freshness and retirement behavior measured
- [x] Documentation and memory current
- [ ] Predecessor and own protected release complete
