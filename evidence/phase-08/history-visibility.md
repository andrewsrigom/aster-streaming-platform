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

### Reset volume-count correction

The complete [platform regression suite](history-reset-platform.txt) passes 62/62 tests after this correction, including unsafe-scope rejection. No running Docker target is used by these simulated reset tests.

Confirmation 5053033139 / inline 3882263770 found the full reviewed topology has twelve volumes while reset still refused the twelfth. The count now permits exactly twelve; all exact project/label/authority/mount/attachment checks remain unchanged. A simulated full-volume test fails on the old bound and passes after the correction, and a thirteenth volume is refused before teardown. [Focused acceptance](history-reset-bound.txt): 15/15 reset tests, platform validation, changed-file lint and memory/documentation checks pass. No real reset, Docker cleanup, data change or host experiment was performed. Earlier 46/46 candidate, SQL and federated results remain supporting evidence for unchanged service behavior; require final-head protected CI and focused confirmation of reset safety.

### Pre-merge adapter-row correction

d432bad received clean confirmation 5454854765. The next slice's capacity work then exposed a concrete mismatch: the shared SQL adapter permits 64 returned rows, but continue-watching can scan 256 candidates. The read now returns one ordered, bounded JSON aggregate, validates its array/ownership and retains the existing adapter ceiling. No schema, trust, runtime packaging or public shape changed.

67 Engagement tests, strict build and changed-file lint pass, including 256 decoded candidates and rejected overflow/malformed results. [Real SQL regression](history-row-limit-postgres.jsonl) passes 65 durable resumable titles, 64 hidden titles, one visible result after four Catalog batches, unchanged 64-row adapter rejection and zero read writes. All original atomicity/ordering/25-row pagination cases pass. Exact PostgreSQL fixture aster-p08-read-sql-2ce0e9b7-fb93-45a7-8628-26ea32bb6e41 and network were ownership-checked and removed; exit 0, zero remaining resources. Same pinned environment/compiled command as above.

[Row-correction source](history-row-limit-source.sha256) identifies this candidate. The [affected gate](history-row-limit-gate.txt) passes 46/46 tasks (27 cached, 1m54.071s), using the documented check:changed invocation with Turbo concurrency two. The earlier Docker proof remains supporting evidence for unchanged owner/trust/GraphQL/optional-playback behavior; the changed SQL path has fresh real SQL proof. No repeat of host/media/browser or unchanged Docker experiments. Require corrected-head CI and focused confirmation before merge.

Restore compatible prior Catalog/Engagement/Router images/artifacts and disable optional reads if needed; retain all data. No down migration. Original c512c9d had initial review 5454416119 and CI 33184567740 passing, neither waiving the confirmation blocker. Require corrected-boundary confirmation, protected squash merge and exact post-merge check before watchlist publication.
