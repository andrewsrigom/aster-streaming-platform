# Phase 07 implementation evidence

P07-R01's backend is released: [PR 24, protected CI, confirmation, squash and post-merge](backend-release.md). The player and clean playable demo are implemented with [local acceptance and limitations](player.md); their candidate gates and protected release remain open. Historical backend evidence follows; this is not yet full Phase 07 release.

The initial review and first hosted run found a startup dependency and an obsolete fixture cleanup ceiling. The [batched correction and fresh runtime evidence](backend-review.md) supersede the original startup topology below; session/SQL/media behavior is unchanged.

The core uses current Catalog approval, no cross-request authorization cache, a two-second application deadline, fifteen-minute rights-capped sessions, explicit uncertain-write results and no optional Identity/Redis/Engagement/Discovery dependency. [ADR-0027](../../docs/adr/0027-local-playback-sessions.md) records independent credentials, SQL-enforced capacity and retention.

## Source and environment

2026-08-28, feat/p07-playback based on released main 4083ea65edcf750bf4ba3e253654a529b72cd105. The historical [core source hashes](backend-core.sha256) identify core commit 9ab840abd236c49eca6195f1b8c36627609891ad. Node 24.19.0 / pnpm 11.24.0 in a bounded Linux tooling container (2 CPUs / 2 GiB); this is a test resource limit, not a performance measurement. No host CPU investigation or unchanged media work was performed.

## Historical core checkpoint

[Raw owner-scope results](owner-scope.txt): 233/233 passed with no skipped tests. Exact command after strict owner builds:

```sh
node --test --test-concurrency=2 packages/http-express/dist/test/*.test.js services/catalog/dist/test/*.test.js services/playback/dist/test/*.test.js apps/router/dist/test/*.test.js
```

Coverage includes owner publication eligibility, current rights between requests, ordered batched nulls, private credentials/headers/files, public-schema exclusion, forged/private query rejection, bounded HTTP bodies/requests, cancellation/deadlines, session policy and sanitized uncertain writes. HTTP checks use actual sockets, with in-memory Catalog fixtures rather than a new running product deployment. Expensive fixture boundaries from earlier phases were not repeated.

Strict builds, affected ESLint, architecture (zero violations), Knip and schema compatibility passed. `ASTER_SCHEMA_BASE=4083ea65edcf750bf4ba3e253654a529b72cd105 pnpm schema:check` retains the existing two-owner public API exactly; only Catalog's inaccessible internal contract changes. Manifest SHA-256: 05e59ea4583658ea7fec669a53d1b415b9fc46fa1de4e384104b5dfbc26e68e2.

## Historical core PostgreSQL check

[Raw results](playback-postgres.txt) use the repository-pinned PostgreSQL 18.6 image, isolated internal network and disposable tmpfs database (384 MiB / 1 CPU). Exact checker: `node services/playback/dist/test/integration/sessions-postgres.js 5432 postgres`. The normal Linux/WSL entry point is `pnpm playback:integration`; this workstation ran its same checker in the tooling container instead of host Node.

Verified acknowledged persistence and four concurrent creations; denied cross-owner reads/DDL/session updates; rejected stale/future/expired snapshots; bounded a blocked transaction and recovered; pruned exactly 64 of 65 old records while preserving recent/live records; admitted one of four callers into the last of 4096 SQL slots; rejected overflow; passed migration up/down/up while preserving unrelated data. The first INSERT failed integration until its parameters were explicitly typed; the recorded result is the corrected pass.

Exact fixture identities, labels, image, tmpfs-only mounts and empty network were checked before cleanup; remaining fixture resources were zero. Retained Catalog/media/Windows processes were untouched. [Migration policy](../../services/playback/migrations/README.md) distinguishes normal additive rollback from destructive disposable recovery.

## Connected backend candidate

[Final candidate gate](candidate-gate.txt): `pnpm check:changed`, 64/64 successful tasks, 36 cached, including governance, secret scan, CI policy, owner tests and source checks. This run used the same Node/pnpm container with a 4 GiB memory ceiling; no performance claim is derived from its duration. [Candidate source hashes](backend-api.sha256) cover the changed executable/configuration files relative to released 4083ea65. The final prose/hash closeout receives cheap documentation, memory and secret checks; runtime evidence is not repeated for metadata.

[Affected API/runtime suite](backend-api-scope.txt): 248/248 passed, zero skipped, using the same owner-scope command above. The new cases cover mutation preflight, forged context, alias amplification, body/concurrency/deadline limits, sanitized results, startup/readiness/recovery, graceful shutdown and trace forwarding. Scoped platform/reset/image contract tests also passed 42/42. No new dependency version was introduced.

[Full source gate](source-gate.txt): `pnpm check:source --concurrency=2`, 54/54 successful tasks, 41 cached. The first attempt found an unnecessary optional chain in the new integration assertion; the recorded pass follows that lint-only correction. Its default schema baseline is the stale local main ref f36f9aa7043dc1fe7b6394a0a800e4e842bf6865. A separate explicit `ASTER_SCHEMA_BASE=4083ea65edcf750bf4ba3e253654a529b72cd105 pnpm schema:check` passed against the released base: three subgraphs, six artifacts, manifest SHA-256 d4b22c951a4ec16709271439036fcac27a00198f7e1f8d6a6ee1587052161ddd. Public changes are additive; private Catalog publication facts remain inaccessible.

[Runtime PostgreSQL check](playback-runtime-postgres.txt) repeats the core SQL acceptance once with the new actual migrator and readiness code. It verifies absent-schema initialization, idempotent migration, up/down/up, the restricted `aster_playback_local` login, rejected foreign-owner/schema/column privileges and version drift, and recovery after each rejection. The fixture is tmpfs-only; checked cleanup left zero resources.

[Federated Docker proof](federated-runtime.txt) runs `pnpm playback:runtime` (this Windows workstation used its built-in-only supervisor with the same precompiled checker). It creates a unique labeled project with a disposable PostgreSQL database, separate owner credentials, real Catalog/Playback images and Apollo Router. Synthetic publication fixtures have no real media bytes and do not approve a film. The proof verifies:

- Router-to-Playback-to-private-Catalog-to-PostgreSQL session creation and rights-capped expiry;
- missing, retired, disputed and expired titles denied without a write, including a title retired between requests;
- forged owner authority and aliased mutation fan-out denied;
- no Identity process or optional service needed, and an invalid Identity cookie ignored;
- real Catalog/Playback SQL lock failures bounded, followed by recovery and persisted session counts;
- correlated owner logs, finite Router operation metrics, and no credentials or manifest URLs in exported logs.

Images: Catalog sha256:87734425af3f102fa63f0bb4d122a597713764e6e744ee268ab596d36ecc0e49; Playback sha256:e34ec8371279778723c7dd7ea6a9691e51f9f08d64fda053a0b7695302a65f16; Router sha256:b71b5cfe7d5d83fa34d2f7b5cba3416adaa7ef6a3751e7c92e5603dc47d74ab5. The first setup attempts exposed missing init build targets and a rejected synthetic evidence path; both fixture defects were corrected before the recorded pass. Production eligibility was not weakened. Ownership-checked cleanup removed the exact fixture containers, four trust volumes and networks; remaining resources zero, retained runtime untouched.

The later assertion cleanup, local variable rename (avoiding a false-positive secret assignment), and documentation edits cannot invalidate the passing production-image/SQL behavior. Source checks cover the later code. The existing protected CI job now runs both Playback persistence and the federated proof; path selection and Turbo inputs include the new owner. Repeat the local heavy proof only for changes to its runtime, SQL, trust, schema, image or Compose boundary.

## Remaining boundary

Finish the player/demo candidate gates and protected release, then activate Phase 08. The backend proof is not itself a browser test or field SLO; separate [player/demo evidence](player.md) records real decode and the local delivery journey. [Session runbook](../../services/playback/README.md), [playable demo runbook](../../apps/web/PLAYBACK.md).
