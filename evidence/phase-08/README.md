# Phase 08 progress implementation

P08-R01 is IN_PROGRESS on feat/p08-progress. Domain/application and isolated PostgreSQL persistence are implemented and tested. Private owner transports, subgraph, relay and player integration remain planned; there is no running Engagement/save feature yet.

## Implemented core

Engagement owns the (profile, title) aggregate. Sequence does not reset with a new playback session. Exact receipt replay returns the original result, including after a newer update or the old session's expiry; current Identity authorization is still required. Conflicting payloads and stale sequences do not write. Newer deliberate seeking may move the saved position backward. Positions clamp without collapsing distinct request digests.

Default policy: opening min(30 seconds, 5% observed duration), completion max(95% duration, duration minus 30 seconds). Reports use integer milliseconds, duration up to twelve hours, and bounded client clock skew/delivery age. These rules also make the six-second playable sample resumable. Progress is not viewing proof or access authority.

Application ports require current owned-profile authorization and title-bound Playback context before new writes, outside the transaction. Acknowledgement requires the transaction result; state, receipt and v1 outbox intent share the callback. Cancellation, finite snapshots, profile-deletion tombstones, receipt/outbox bounds and ambiguous-commit replay are covered. Credentials, account and playback-session IDs are absent from the event payload; validated correlation/trace propagate to owner reads and events.

## Evidence and limitations

Initial core commit 39d1b76711d43b1f1297f0c0ddb806c5a5d851a7 has [25 fake-backed tests](core-tests.txt) and [source hashes](core-source.sha256). Its base is released main 854592e5ff1213a306b45d61a547ad4f2a2d9395.

The SQL checkpoint is identified by [exact source hashes](progress-source.sha256), [32 focused tests](progress-tests.txt) and [ten real PostgreSQL scenarios](progress-postgres.jsonl). Environment: Node 24.19.0, pnpm 11.24.0, TypeScript 6.0.3; read-only Linux tooling container, two CPUs/2 GiB; separate PostgreSQL 18.6 pinned image (one CPU/512 MiB, tmpfs, private fixture network). Commands: `pnpm exec tsc --build services/engagement/tsconfig.json`, `node --test services/engagement/dist/test/*.test.js`, and `ASTER_POSTGRES_DISPOSABLE_FIXTURE=true node services/engagement/dist/test/integration/progress-postgres.js 5432 postgres`. Scoped lint, architecture, unused-code, documentation and memory checks pass.

SQL proves atomic commit, synchronized replay, stale rejection/newer backward seek, foreign-owner exclusion, role isolation, missing receipt/event rollback, cancellation/recovery, deletion fences, receipt pruning and guard/title/outbox ceilings. Empty up/down/up preserves unrelated state; nonempty down refuses. [ADR-0030](../../docs/adr/0030-local-engagement-progress.md) records bounds. The deletion consumer and relay remain planned. Owner responses are fakes; deployed authentication and browser saving remain unverified.

Existing PostgreSQL adapter and pinned pg/types are reused, with supply-chain checks enabled. The standard runner is `pnpm engagement:integration`. Native Windows could not resolve this workspace's Linux pnpm links, cleaned its fixture, and the exact compiled verifier passed in Linux tooling instead. Both disposable databases and their private network were removed after ownership checks; retained demo/media were untouched.

Next: current Identity/profile and Playback/session reads, then protected federated runtime. No complete candidate, hosted CI/release or complete Phase 08 claim is made.
