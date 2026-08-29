# Phase 09 Discovery evidence

The first Phase 09 slice implements P09-R01, P09-R02, P09-R06 and P09-R07 on the unpublished `feat/p09-discovery-search` candidate. It adds a Catalog-authorized versioned projection, retention-independent rebuild, bounded PostgreSQL search, a fifth Federation subgraph and an opt-in disposable runtime. Home rails, personalized composition, browser integration, hosted controls, load capacity and phase release remain planned.

## Checkpoints

- [Projection domain rules](projection-core.txt) record normalization, cursors, version fences, freshness and hostile-input tests.
- [Catalog snapshots](catalog-snapshots.txt) record the owner snapshot/export contract, purpose-separated role and real PostgreSQL isolation.
- [Projection persistence](projection-postgres.txt) records additive migrations, relevance, GIN search, keyset traversal and generation promotion.
- [Event recovery](catalog-events.txt) records current-owner refresh, bounded quarantine/replay and acknowledgement rules.
- [Rebuild runtime](rebuild-runtime.txt) records broker barriers, durable catch-up and resumable maintenance.
- [Federated search runtime](search-runtime.txt) records the exact current commit, real PostgreSQL/Kafka/Router behavior, restart recovery, timer-patch packaging and exact cleanup.

The current source passes 68 Discovery tests, nine Router composition/compatibility tests, 67 platform-policy tests, 33 CI-policy tests, schema composition for five subgraphs, strict TypeScript, workspace lint, unused-code, architecture and formatting gates. Real PostgreSQL integration passes migrations 1–2, relevance/diacritic behavior, stable keysets, retirement fences, rebuild state, role isolation, exact event recovery, the GIN plan and exact cleanup.

Exact commit `1fe7edb53451ea25f4d55658dd7432f7d084f568` passes the repeated PostgreSQL and disposable Docker gates. The Docker fixture built 11 services, projected the Catalog event with zero lag, returned one federated result plus an explicit empty result, retained its active generation through restart, emitted no raw query/title/secret or negative/overflow timer warning, and cleaned every fixture resource. Candidate-wide acceptance, review and protected release remain pending. No retained-project upgrade, hosted deployment or complete Phase 09 claim is made here.
