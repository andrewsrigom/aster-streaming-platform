# ADR-0035: Current-source Discovery projections and bounded search

- Status: Accepted
- Date: 2026-08-28
- Owners: Discovery and Catalog
- Requirements: P09-R01, P09-R02, P09-R06, P09-R07

## Decision

Implement the already planned Discovery context using the existing PostgreSQL, broker and Node/Federation baseline. Discovery owns a derived search index, never title, profile or playback truth. Keep Catalog v1 events compatible: they contain IDs/version, not metadata, and act as refresh hints. Every applied hint uses a fresh Catalog-owned snapshot. A forged or delayed event cannot itself publish, hide or resurrect a title.

Add purpose-separated private Catalog GraphQL snapshot/export reads, hidden from public composition and enforced at the owner with a distinct credential. Never reuse Engagement/Playback/Router credentials or read Catalog SQL from Discovery. The snapshot exposes only source version, current visibility, publication time and bounded searchable public metadata: at most four localizations, title160/synopsis1024 characters and eight genre/editorial slugs. No rights records, media URLs or personal data. Export at most two titles per page so worst-case UTF-8 fits a64-KiB response. An independent optional lane admits one request without a queue; requests have a two-second deadline and cancellation.

Accept snapshots checked no more than two seconds ago and never in the future. Record source version, source observation, indexed time, projection version and the actual triggering event ID when present; a rebuild has no invented event ID. A public row's visibility lease lasts at most300seconds from source observation, shortened by rights/publication expiry. Start a periodic current-source rebuild when the active generation reaches150seconds, leaving half the maximum lease for bounded renewal; failures retain the active generation and expose stale/unavailable state rather than fabricated results. Queries exclude expired rows and expose unavailable/stale state explicitly. This is bounded discovery staleness, not a playback grant. Current Catalog still resolves public Title metadata. Emergency containment disables optional Discovery and falls back to Catalog; scoped reindex/invalidation follows the same owner checks.

Catalog's optional snapshot lane uses a separate one-connection read-only pool and a role limited to its source view. The existing public reader gains no privilege, so its strict readiness and old binaries remain compatible with the additive migration. The view includes hidden source IDs/versions but no unpublished metadata. Publication time comes from the latest activation of the current pointer joined to retained command audit, not event arrival or a fabricated timestamp. View-only rollback drops no product data; Discovery-owned persistent-state rollback remains empty-state-only.

Source versions are monotonic. Older snapshots cannot overwrite newer state. Equal-version conflicting public metadata fails closed; hidden state cannot become public again at that version. A newer authoritative version can republish. Equal-version public refresh may renew freshness only after another current owner read. Retain hidden version fences; stale broker delivery cannot resurrect content.

Rebuild cannot assume more than the existing one-hour broker retention. Use bounded Catalog keyset export plus concurrent event catch-up into a second generation; version checks reconcile their order. Persist scan/offset checkpoints and promote only a completed generation after its captured broker barrier is handled. A missing checkpoint means position zero only, allowing an empty partition whose high-water mark is zero to promote without inventing an event. Keep the previous active generation on partial failure and at most two generations. A valid active generation remains serviceable during maintenance until its lease expires; bootstrap or expired state remains unavailable. Commit event offsets only after durable handling; bounded quarantine has one UUID-selected, local-only, five-second replay command that revalidates exact retained bytes through current Catalog authority and removes them only after durable success. Never blindly skip or edit an offset. Snapshot unavailability is not a hidden/empty success. Hosted retention, ACLs and TLS remain Phase14.

Search will use explicit PostgreSQL simple-dictionary full-text vectors over normalized title, synopsis and genres, weighted toward title. Apply the same bounded Unicode/diacritic normalization to documents and plain queries; no free-form query language, prefix/fuzzy promise or external engine. Limit queries to80 code points/eight terms and pages to20. Query-bound cursors use rank/title ordering and index generation; generation changes expire old cursors instead of mixing indexes. Ordinary inserts must not duplicate previously returned rows; live metadata updates are not snapshot isolation.

## Verification and recovery

Require strict projection/boundary tests, real SQL constraints and query plans, duplicate/stale/retirement behavior, retained-offset exhaustion and rebuild, current-owner isolation, bounded failure recovery and a representative relevance set. The first domain checkpoint is not a running search service. Rails/trending/Engagement composition and SSR remain their later Phase09 slices. No placeholder telemetry or new host/media experiment.

Disable optional Discovery or restore compatible prior Router/Catalog artifacts for rollback. Preserve source data, projection fences and recovery records; never reset Catalog or retained media. Migrations are additive and down migration is empty-state-only. A failed rebuild does not justify dropping the active index.

The optional Compose overlay does not add Discovery as a Router startup dependency. Router may start and serve Catalog/Playback while Discovery is unavailable; only search degrades through the existing subgraph timeout/error boundary.

Sources checked2026-08-28: PostgreSQL18 [plain-query parsing and ranking](https://www.postgresql.org/docs/18/textsearch-controls.html) and [GIN text-search indexes](https://www.postgresql.org/docs/18/textsearch-indexes.html). Bounds, consistency and recovery above are Aster decisions; runtime and relevance evidence remain required.
