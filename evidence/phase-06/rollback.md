# Compatible publication replacement and rollback

Source base: `4bc9b3a`, branch `feat/p06-media-pipeline`, 2026-08-28. Requirements P06-R09/R10; [ADR-0026](../../docs/adr/0026-local-media-publication.md). Catalog owns the decision and durable pointer; no worker, viewer or public GraphQL authority changes.

## Implementation and scope

The local operator can replace a PUBLISHED title's pointer with a different registered reference for the same title, current rights revision and original checksum. Rollback additionally requires prior activation history. Metadata/artwork and approval remain unchanged; both operations increment the title version and write reason/audit, receipt, event and activation history in the same transaction. Current rights and artwork are rechecked before success. Retired/disputed titles cannot be revived this way. Without a compatible target, retire remains the safe mitigation.

Migration 0008 extends audit kinds and adds append-only activation history, backfilled from exact retained published-event references. A non-public, fixed-search-path trigger records future activations with the event, checking that it matches the actual title pointer/version. Runtime reads history but cannot directly write/delete it. History does not depend on keeping delivered outbox rows. Populated down migration refuses data loss.

## Checks

- Focused command/CLI checks: 18/18 via `node --test services/catalog/dist/test/publication-rollback.test.js services/catalog/dist/test/catalog-workflow.test.js services/catalog/dist/test/operator-input.test.js`. Coverage includes replacement, rollback, exact replay/conflict, stale version, forged authority/input, unactivated/missing/foreign/wrong-source/old-rights/future references, expiry during commit, cancellation, revocation, transaction failure and reserved takedown capacity.
- [Real PostgreSQL](rollback-postgres.jsonl): full Catalog integration passes with empty 0008 down/up, pre-migration publication backfill, five denied direct-history operations, fixed search path, replacement/rollback after simulated outbox delivery, retained-history downgrade rejection and atomic rollback after trigger execution. Both real rollback/dispute lock orders produce a completed winner, stale conflict and final RETIRED title.
- The [initial PostgreSQL run](rollback-postgres-initial.jsonl) passed the new rollback checks but left its synthetic title public, affecting the shared browse fixture. The test now retires that owned title through the normal command. No production behavior or existing expectation was weakened.
- The [initial source gate](rollback-source-initial.txt) passed 50/51 tasks and all 158 Catalog tests; lint found test-only query result types, bracing and promise generic notation. Those were corrected together. Final [source gate](rollback-source.txt) passes 51/51 tasks (39 cached, 47.578 s), including 158 Catalog tests. [Documentation/security closeout](rollback-closeout.txt) passes 10/10 (5 cached, 4.673 s). [Source fingerprints](rollback-source.sha256) identify this checkpoint.

Environment: native Docker on the same Windows/WSL repository, Node 24.19.0 / pnpm 11.24.0 in `aster-p06-tooling:git`, canonical Linux bind path, UID/GID 1002:1002. Integration command: `node services/catalog/dist/test/integration/rights-postgres.js 5432`, with a uniquely named pinned PostgreSQL 18.6-alpine3.23 container, network disabled, 384 MiB/one CPU and 256 MiB tmpfs. The client shares only that fixture's network namespace. Exact ID/name/image/label/tmpfs ownership is checked before removing the disposable fixture; retained development data is untouched.

## Review and remaining work

Initial review covered current approval/source matching, immutable references, idempotency, rollback history independent of relay, title-lock races, final expiry checks, trigger privilege/search path and data-preserving migrations. Confirmation is the focused/real integration and affected source gate after batching the test-only fixes. No media, GraphQL or Web contract changed.

Migration 0008 is not applied to the retained first-film database, which remains version 9 / rights revision 4 / PUBLISHED on its single original bundle. There is no second real version to roll back to. These are synthetic recovery checks, not a second source acquisition, decode, public release or CPU benchmark. The source, HLS, JPEG, origin and actual publication evidence remain valid: none of those code paths or bytes changed.

P06-R01 remains active. Orphan recovery, representative browser HLS playback and complete Phase 06 release still require completion. Do not claim Phase 06 VERIFIED/RELEASED or a finished player.
