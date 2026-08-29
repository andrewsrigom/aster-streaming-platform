# Phase 09 Discovery evidence

The first Phase 09 slice implements P09-R01, P09-R02, P09-R06 and P09-R07 on the unpublished `feat/p09-discovery-search` candidate. It adds a Catalog-authorized versioned projection, retention-independent rebuild, bounded PostgreSQL search, a fifth Federation subgraph and an opt-in disposable runtime. Home rails, personalized composition, browser integration, hosted controls, load capacity and phase release remain planned.

## Checkpoints

- [Projection domain rules](projection-core.txt) record normalization, cursors, version fences, freshness and hostile-input tests.
- [Catalog snapshots](catalog-snapshots.txt) record the owner snapshot/export contract, purpose-separated role and real PostgreSQL isolation.
- [Projection persistence](projection-postgres.txt) records additive migrations, relevance, GIN search, keyset traversal and generation promotion.
- [Event recovery](catalog-events.txt) records current-owner refresh, bounded quarantine/replay and acknowledgement rules.
- [Rebuild runtime](rebuild-runtime.txt) records broker barriers, durable catch-up and resumable maintenance.
- [Federated search runtime](search-runtime.txt) records the exact current commit, real PostgreSQL/Kafka/Router behavior, restart recovery, timer-patch packaging and exact cleanup.
- [Candidate gate and initial review](search-candidate.txt) record the 73-task aggregate pass, dependency audit, batched test-harness corrections and heavyweight-evidence applicability.

The current source passes 70 Discovery tests, nine Router composition/compatibility tests, 67 platform-policy tests, 33 CI-policy tests, schema composition for five subgraphs, strict TypeScript, workspace lint, unused-code, architecture and formatting gates. Real PostgreSQL integration passes migrations 1–2, relevance/diacritic behavior, stable keysets, retirement fences, empty-partition promotion, proactive generation refresh, rebuild state, role isolation, exact event recovery, the GIN plan and exact cleanup.

Exact confirmation-remediated runtime commit `16d4921ff569a501ab3227d11ed6617863fb0ce7` passes the disposable Docker gate; unchanged real PostgreSQL evidence is carried from `04011af`. Initial candidate `e979d7dff4503c7c4dec35542d6dc8b92579eed0` passed the 73-task aggregate gate. Protected run 33236352596 exposed one stale standalone Catalog cleanup ceiling; correction `5287b29` passes. Automated review found four valid refresh, empty-offset, Router-isolation and documentation-contract issues; `04011af` corrected them. Exact-head confirmation then found maintenance readiness and unreachable quarantine replay. Commit `16d4921` keeps a valid active generation serviceable during maintenance and adds a bounded local exact-replay command. The final 70 Discovery tests, 11-service runtime in 107640 ms and 73/73 candidate gate pass. Runtime projects with zero lag, returns one result plus explicit empty, replays and reclaims one exact quarantine slot, serves Catalog while Discovery is stopped, recovers search, sanitizes logs and cleans every fixture resource. A new protected run and final blocking-boundary confirmation remain pending. No retained-project upgrade, hosted deployment or complete Phase 09 claim is made here.
