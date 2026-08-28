# Phase 08 progress implementation

P08-R06 is IN_PROGRESS on dependent local feat/p08-history. The [progress backend](progress-candidate.md) is merged and DONE, with protected and exact post-merge checks passing. Durable owner-authorized saves and bounded history/continue-watching reads are implemented and pass real SQL/federated Docker checks. Protected release, player integration, watchlist and relay remain pending.

## Implemented core

Engagement owns the (profile, title) aggregate. Sequence does not reset with a new playback session. Exact receipt replay returns the original result, including after a newer update or the old session's expiry; current Identity authorization is still required. Conflicting payloads and stale sequences do not write. Newer deliberate seeking may move the saved position backward. Positions clamp without collapsing distinct request digests.

Default policy: opening min(30 seconds, 5% observed duration), completion max(95% duration, duration minus 30 seconds). Reports use integer milliseconds, duration up to twelve hours, and bounded client clock skew/delivery age. These rules also make the six-second playable sample resumable. Progress is not viewing proof or access authority.

Application ports require current owned-profile authorization and title-bound Playback context before new writes, outside the transaction. Acknowledgement requires the transaction result; state, receipt and v1 outbox intent share the callback. Cancellation, finite snapshots, profile-deletion tombstones, receipt/outbox bounds and ambiguous-commit replay are covered. Credentials, account and playback-session IDs are absent from the event payload; validated correlation/trace propagate to owner reads and events.

## Evidence and limitations

Initial core commit 39d1b76711d43b1f1297f0c0ddb806c5a5d851a7 has [25 fake-backed tests](core-tests.txt) and [source hashes](core-source.sha256). Its base is released main 854592e5ff1213a306b45d61a547ad4f2a2d9395.

The SQL checkpoint is identified by [exact source hashes](progress-source.sha256), [32 focused tests](progress-tests.txt) and [ten real PostgreSQL scenarios](progress-postgres.jsonl). Environment: Node 24.19.0, pnpm 11.24.0, TypeScript 6.0.3; read-only Linux tooling container, two CPUs/2 GiB; separate PostgreSQL 18.6 pinned image (one CPU/512 MiB, tmpfs, private fixture network). Commands: `pnpm exec tsc --build services/engagement/tsconfig.json`, `node --test services/engagement/dist/test/*.test.js`, and `ASTER_POSTGRES_DISPOSABLE_FIXTURE=true node services/engagement/dist/test/integration/progress-postgres.js 5432 postgres`. Scoped lint, architecture, unused-code, documentation and memory checks pass.

SQL proves atomic commit, synchronized replay, stale rejection/newer backward seek, foreign-owner exclusion, role isolation, missing receipt/event rollback, cancellation/recovery, deletion fences, receipt pruning and guard/title/outbox ceilings. Empty up/down/up preserves unrelated state; nonempty down refuses. [ADR-0030](../../docs/adr/0030-local-engagement-progress.md) records bounds. The deletion consumer and relay remain planned. Owner responses are fakes; deployed authentication and browser saving remain unverified.

Existing PostgreSQL adapter and pinned pg/types are reused, with supply-chain checks enabled. The standard runner is `pnpm engagement:integration`. Native Windows could not resolve this workspace's Linux pnpm links, cleaned its fixture, and the exact compiled verifier passed in Linux tooling instead. Both disposable databases and their private network were removed after ownership checks; retained demo/media were untouched.

## Initial connected runtime candidate

[Real Docker proof](federated-runtime.txt) uses Router → Engagement → private Identity/Playback → PostgreSQL. It proves durable progress/receipt/event, concurrent exact replay, conflicting/stale rejection, intentional backward seek, foreign-profile exclusion, title-bound/expired Playback rejection, bounded Identity row-lock failure/recovery, accepted replay after expiry, deleted-profile/revoked-session denial and shared trace/correlation. Stopping Identity and Engagement leaves anonymous Playback available. The initializer replay preserves data; exact cleanup leaves zero containers/volumes/networks.

Command: `node tools/run-engagement-runtime.mjs` after strict workspace compilation. Node 24.19.0 on Windows supervises the pinned Linux Docker services; exact images/project are in the raw artifact. The database is tmpfs, all data is synthetic, and no media is fetched. [Runtime contract](../../services/engagement/README.md). This validates backend saving, not a browser save/resume journey, event delivery, deletion consumer or hosted service identity.

[Owner-focused tests](owner-tests.txt) record the earlier private-transport checkpoint. Subsequent focused checks pass 70 runtime/HTTP/transport tests, 58 platform/CI checks and 17 safe-reset/diagnostic checks. The final candidate gate and exact source hashes are recorded at closeout. SQL migration/transaction code is unchanged from the prior ten-scenario proof; the shorter outer application budget is exercised by current cancellation/owner-lock tests. No repeat of unchanged media/browser/CPU measurements is needed.

The [final candidate gate](candidate-gate.txt) passes 67/67 tasks (44 cached, 1m10.717s), including 147 Identity, 35 Playback, 45 Engagement and nine Router tests. Command: the existing check:changed invocation with Turbo concurrency two and continue=always, in Node 24.19.0 tooling with 4 GiB memory/2 GiB Node heap. [Exact executable source hashes](candidate-source.sha256) identify the candidate over released main 854592e. The [dependency audit](dependency-audit.txt) has zero high/critical and one moderate finding. Initial local gate attempts exposed only missing session-log sections, one formatting issue and a regex style rule; these were corrected without weakening checks.

After the Docker proof, only unused export visibility, formatting, safe-reset/diagnostics and gate/docs metadata changed; no owner authorization, transaction, schema, wire contract or runtime behavior changed. The passing Docker/SQL evidence therefore remains applicable; protected CI will independently exercise the fresh package. No retained application was upgraded.

That initial candidate is 319ce4e7f4c02ce5991c9637200421d02b8f13cc in PR 26. Initial review 5453534315 and protected CI 33178308691 pass. Confirmation 5051921328 identified two blockers, addressed below. No complete Phase 08 or hosted release claim is made.

## Confirmation remediation

Profile-scoped receipt uniqueness/lookup now rejects a changed title under the same key before Playback or writes. Synchronized SQL attempts for two titles produce one accepted result, one conflict and one aggregate/receipt/event. Private Playback inspections have their own one-active-request/no-queue admission and independent rate credits; four public creations succeed while that private lane is occupied, and exhausting private credits does not exhaust public credits.

[Updated real SQL](review-postgres.jsonl), [repeated federated Docker proof](review-federated-runtime.txt) and [exact revised executable sources](review-source.sha256) supersede the initial evidence for these changed boundaries. The same compiled SQL verifier ran in the existing Linux tooling against a unique PostgreSQL 18.6 tmpfs fixture (two CPU/2 GiB tooling, one CPU/384 MiB database). All fixtures/networks were ownership-checked and removed. The Docker proof used the existing run-engagement-runtime command and recorded exact image IDs, cross-title conflict, fresh owner checks and available anonymous Playback after optional owners stop. Retained demo/media were untouched.

Focused tests pass 34; complete Engagement/Playback tests pass 46/36. [Revised affected gate](review-candidate-gate.txt) passes 67/67 tasks (47 cached, 2m15.567s) with Turbo concurrency two. The profile-key correction updates only unreleased migration 0001: no retained Engagement store exists, and readiness rejects the older per-title key shape instead of certifying it. Rollback preserves data; never drop an old candidate store to force readiness.

The corrected production candidate received clean confirmation 5453879542. [Catalog fixture clock correction](catalog-clock.md) fixes the subsequent unrelated CI test failure without changing runtime source. Its real SQL and 67-task gate pass.

## History and continue-watching

[Read-side checkpoint](history-checkpoint.md) records 60 passing Engagement tests, bounded keyset SQL against 25 aggregates, normal query plans and [real federated reads](history-federated-runtime.jsonl). Pages freshly authorize Identity, retain completed history, filter continue-watching, resolve Catalog metadata and keep retired metadata nullable. Invalid pages/cursors, foreign/deleted profiles and revoked sessions disclose no state. Reads perform one bounded SELECT and no writes. Retained data/media and host processes remain untouched.

History is rebased onto squash main 4082c3a463b50ba4397f080e1b81bc15e03bf140; all recovery stashes are already restored. The predecessor changed only a Catalog test and its squash tree is identical, so read-side SQL/Docker evidence remains applicable. The current-main gate passes 40/40 tasks; predecessor-first protected release remains required. Browser reports, watchlist, relay and general batched Title/Profile engagement extensions remain planned.
