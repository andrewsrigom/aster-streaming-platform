# Phase 07 implementation evidence

P07-R01 is in progress. Current-publication projection, protected Catalog GraphQL read, bounded HTTP consumer, anonymous session rules and Playback-owned PostgreSQL persistence are implemented locally. Public Playback mutation, running service/Compose wiring, player and clean playable demo remain unfinished. Component proof below is not full phase acceptance.

The core uses current Catalog approval, no cross-request authorization cache, a two-second application deadline, fifteen-minute rights-capped sessions, explicit uncertain-write results and no optional Identity/Redis/Engagement/Discovery dependency. [ADR-0027](../../docs/adr/0027-local-playback-sessions.md) records independent credentials, SQL-enforced capacity and retention.

## Source and environment

2026-08-28, feat/p07-playback based on released main 4083ea65edcf750bf4ba3e253654a529b72cd105. [Source hashes](backend-core.sha256) identify the tested checkpoint. Node 24.19.0 / pnpm 11.24.0 in a bounded Linux tooling container (2 CPUs / 2 GiB); this is a test resource limit, not a performance measurement. No host CPU investigation or unchanged media work was performed.

## Affected checks

[Raw owner-scope results](owner-scope.txt): 233/233 passed with no skipped tests. Exact command after strict owner builds:

```sh
node --test --test-concurrency=2 packages/http-express/dist/test/*.test.js services/catalog/dist/test/*.test.js services/playback/dist/test/*.test.js apps/router/dist/test/*.test.js
```

Coverage includes owner publication eligibility, current rights between requests, ordered batched nulls, private credentials/headers/files, public-schema exclusion, forged/private query rejection, bounded HTTP bodies/requests, cancellation/deadlines, session policy and sanitized uncertain writes. HTTP checks use actual sockets, with in-memory Catalog fixtures rather than a new running product deployment. Expensive fixture boundaries from earlier phases were not repeated.

Strict builds, affected ESLint, architecture (zero violations), Knip and schema compatibility passed. `ASTER_SCHEMA_BASE=4083ea65edcf750bf4ba3e253654a529b72cd105 pnpm schema:check` retains the existing two-owner public API exactly; only Catalog's inaccessible internal contract changes. Manifest SHA-256: 05e59ea4583658ea7fec669a53d1b415b9fc46fa1de4e384104b5dfbc26e68e2.

## Real PostgreSQL

[Raw results](playback-postgres.txt) use the repository-pinned PostgreSQL 18.6 image, isolated internal network and disposable tmpfs database (384 MiB / 1 CPU). Exact checker: `node services/playback/dist/test/integration/sessions-postgres.js 5432 postgres`. The normal Linux/WSL entry point is `pnpm playback:integration`; this workstation ran its same checker in the tooling container instead of host Node.

Verified acknowledged persistence and four concurrent creations; denied cross-owner reads/DDL/session updates; rejected stale/future/expired snapshots; bounded a blocked transaction and recovered; pruned exactly 64 of 65 old records while preserving recent/live records; admitted one of four callers into the last of 4096 SQL slots; rejected overflow; passed migration up/down/up while preserving unrelated data. The first INSERT failed integration until its parameters were explicitly typed; the recorded result is the corrected pass.

Exact fixture identities, labels, image, tmpfs-only mounts and empty network were checked before cleanup; remaining fixture resources were zero. Retained Catalog/media/Windows processes were untouched. [Migration policy](../../services/playback/migrations/README.md) distinguishes normal additive rollback from destructive disposable recovery.

## Remaining boundary

Connect the private owner read and persisted session application behind the public Playback mutation, wire its service credentials/migration/runtime in Compose, and prove that integrated journey. Then player, telemetry/accessibility and fresh-volume demo. Retain these component results until changes affect their source or measured boundary; full candidate/protected/review gates still apply before publication.
