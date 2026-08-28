# Current Catalog visibility correction

Status: implemented and locally acceptance-tested; corrected protected review/CI and merge pending. Supersedes the initial history proof for continue-watching visibility. PR 27 confirmation 5052590545 / PRRT_kwDOUEkeis6dN9km identified ENG-R04's failure: null metadata did not exclude hidden progress before pagination.

[ADR-0031](../../docs/adr/0031-current-catalog-visibility.md) defines the separate Catalog credential, exact private operation, two-second snapshot and bounded scan. Catalog retains rights decisions; Engagement retains profile ownership/order. No migration, media, cache or foreign SQL is added.

## Evidence

- Focused correction tests 26/26, complete Engagement 66/66, Catalog 202/202 and shared HTTP 17/17 pass. Coverage includes hidden gaps, 256 hidden candidates/thirteen serial batches, expired/malformed/missing visibility, early lookahead, cancellation, purpose denial and independent optional admission/rate credits. Strict builds and composition pass against main 4082c3a463b50ba4397f080e1b81bc15e03bf140.
- [Real PostgreSQL](history-visibility-postgres.jsonl): compiled progress-postgres verifier, pinned PostgreSQL 18.6, Linux Node 24.19.0 tooling (two CPU/2 GiB), database one CPU/384 MiB/tmpfs, exit 0. Atomicity/concurrency/privilege/retention and 25-row keyset/query-plan checks pass. Exact fixture aster-p08-read-sql-b39e367e-8060-41f9-941a-67fbaa4792ed and network were ownership-checked and removed; zero resources remain. Tiny query plans are not production performance claims.
- [Federated Docker acceptance](history-visibility-runtime.jsonl): `node tools/run-engagement-runtime.mjs`, native Node 24.19.0 supervisor and pinned Linux images, exit 0. Real owners prove current visibility, hidden-gap pagination, a new DISPUTED rights revision with provenance, retirement exclusion and nullable retained history. Reads perform zero writes. Durable mutation/replay/revocation and anonymous Playback after optional owners stop pass. Exact UUID project 5b81a6b0-6206-48e2-8396-411f78c48904 removed thirteen containers, eight trust volumes and two networks with ownership checks.
- [Changed source hashes](history-visibility-source.sha256) identify tested sources. The [affected candidate gate](history-visibility-gate.txt) passed 45/46 tasks; only two void-arrow style errors in a new test failed lint. After that semantics-preserving test correction, [final checks](history-visibility-final-checks.txt) pass the focused four tests, strict Catalog build, full workspace lint, documentation/memory checks and full formatting. Together these complete the applicable gate; no heavy boundary changed or required repetition.

Both heavy proofs ran once for the changed query/trust/runtime boundary. Retained demo/media/data, WSL and user processes were untouched. No CPU, browser or film experiment was repeated. Evidence prose does not invalidate these results. Browser resume, watchlist acceptance, events and complete Phase 08 release remain pending.

## Recovery and review

Restore compatible prior Catalog/Engagement/Router images/artifacts and disable optional reads if needed; retain all data. No down migration. Original c512c9d had initial review 5454416119 and CI 33184567740 passing, neither waiving the confirmation blocker. Require corrected-boundary confirmation, protected squash merge and exact post-merge check before watchlist publication.
