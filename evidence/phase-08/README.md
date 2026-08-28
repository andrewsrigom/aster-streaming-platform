# Phase 08 progress implementation

P08-R01 is IN_PROGRESS on feat/p08-progress. Domain/application, isolated PostgreSQL, private owner reads, public Engagement mutation and Docker runtime are implemented. Actual federated saves pass in a disposable stack. Protected release, player integration, relay and other Phase 08 features remain pending.

## Implemented core

Engagement owns the (profile, title) aggregate. Sequence does not reset with a new playback session. Exact receipt replay returns the original result, including after a newer update or the old session's expiry; current Identity authorization is still required. Conflicting payloads and stale sequences do not write. Newer deliberate seeking may move the saved position backward. Positions clamp without collapsing distinct request digests.

Default policy: opening min(30 seconds, 5% observed duration), completion max(95% duration, duration minus 30 seconds). Reports use integer milliseconds, duration up to twelve hours, and bounded client clock skew/delivery age. These rules also make the six-second playable sample resumable. Progress is not viewing proof or access authority.

Application ports require current owned-profile authorization and title-bound Playback context before new writes, outside the transaction. Acknowledgement requires the transaction result; state, receipt and v1 outbox intent share the callback. Cancellation, finite snapshots, profile-deletion tombstones, receipt/outbox bounds and ambiguous-commit replay are covered. Credentials, account and playback-session IDs are absent from the event payload; validated correlation/trace propagate to owner reads and events.

## Evidence and limitations

Initial core commit 39d1b76711d43b1f1297f0c0ddb806c5a5d851a7 has [25 fake-backed tests](core-tests.txt) and [source hashes](core-source.sha256). Its base is released main 854592e5ff1213a306b45d61a547ad4f2a2d9395.

The SQL checkpoint is identified by [exact source hashes](progress-source.sha256), [32 focused tests](progress-tests.txt) and [ten real PostgreSQL scenarios](progress-postgres.jsonl). Environment: Node 24.19.0, pnpm 11.24.0, TypeScript 6.0.3; read-only Linux tooling container, two CPUs/2 GiB; separate PostgreSQL 18.6 pinned image (one CPU/512 MiB, tmpfs, private fixture network). Commands: `pnpm exec tsc --build services/engagement/tsconfig.json`, `node --test services/engagement/dist/test/*.test.js`, and `ASTER_POSTGRES_DISPOSABLE_FIXTURE=true node services/engagement/dist/test/integration/progress-postgres.js 5432 postgres`. Scoped lint, architecture, unused-code, documentation and memory checks pass.

SQL proves atomic commit, synchronized replay, stale rejection/newer backward seek, foreign-owner exclusion, role isolation, missing receipt/event rollback, cancellation/recovery, deletion fences, receipt pruning and guard/title/outbox ceilings. Empty up/down/up preserves unrelated state; nonempty down refuses. [ADR-0030](../../docs/adr/0030-local-engagement-progress.md) records bounds. The deletion consumer and relay remain planned. Owner responses are fakes; deployed authentication and browser saving remain unverified.

Existing PostgreSQL adapter and pinned pg/types are reused, with supply-chain checks enabled. The standard runner is `pnpm engagement:integration`. Native Windows could not resolve this workspace's Linux pnpm links, cleaned its fixture, and the exact compiled verifier passed in Linux tooling instead. Both disposable databases and their private network were removed after ownership checks; retained demo/media were untouched.

## Connected runtime candidate

[Real Docker proof](federated-runtime.txt) uses Router → Engagement → private Identity/Playback → PostgreSQL. It proves durable progress/receipt/event, concurrent exact replay, conflicting/stale rejection, intentional backward seek, foreign-profile exclusion, title-bound/expired Playback rejection, bounded Identity row-lock failure/recovery, accepted replay after expiry, deleted-profile/revoked-session denial and shared trace/correlation. Stopping Identity and Engagement leaves anonymous Playback available. The initializer replay preserves data; exact cleanup leaves zero containers/volumes/networks.

Command: `node tools/run-engagement-runtime.mjs` after strict workspace compilation. Node 24.19.0 on Windows supervises the pinned Linux Docker services; exact images/project are in the raw artifact. The database is tmpfs, all data is synthetic, and no media is fetched. [Runtime contract](../../services/engagement/README.md). This validates backend saving, not a browser save/resume journey, event delivery, deletion consumer or hosted service identity.

[Owner-focused tests](owner-tests.txt) record the earlier private-transport checkpoint. Subsequent focused checks pass 70 runtime/HTTP/transport tests, 58 platform/CI checks and 17 safe-reset/diagnostic checks. The final candidate gate and exact source hashes are recorded at closeout. SQL migration/transaction code is unchanged from the prior ten-scenario proof; the shorter outer application budget is exercised by current cancellation/owner-lock tests. No repeat of unchanged media/browser/CPU measurements is needed.

The [final candidate gate](candidate-gate.txt) passes 67/67 tasks (44 cached, 1m10.717s), including 147 Identity, 35 Playback, 45 Engagement and nine Router tests. Command: the existing check:changed invocation with Turbo concurrency two and continue=always, in Node 24.19.0 tooling with 4 GiB memory/2 GiB Node heap. [Exact executable source hashes](candidate-source.sha256) identify the candidate over released main 854592e. The [dependency audit](dependency-audit.txt) has zero high/critical and one moderate finding. Initial local gate attempts exposed only missing session-log sections, one formatting issue and a regex style rule; these were corrected without weakening checks.

After the Docker proof, only unused export visibility, formatting, safe-reset/diagnostics and gate/docs metadata changed; no owner authorization, transaction, schema, wire contract or runtime behavior changed. The passing Docker/SQL evidence therefore remains applicable; protected CI will independently exercise the fresh package. No retained application was upgraded.

Next: one initial and one confirmation review, protected merge/post-merge. No complete Phase 08 or hosted release claim is made.
