# Handoff

## Resume point

1. Phase 01 is released: PR 18 squash `b0544c9c6a86ac1cdb48963707eedf0f0e153621`; protected `33047330768` and exact post-merge `33047629326` pass. No more Phase 01 metadata-only publication.
2. Local branch `feat/p02-identity-session` is not pushed. R01 assertion checkpoint `64a3aa8`; R02 durable sessions `1b45ebd`; R03–R08 profile checkpoint is identified by the containing commit and exact fingerprints in `evidence/phase-02/profiles-outbox.txt`.
3. Profiles are locally verified: Identity 111 tests, PostgreSQL 29 tests, all 49 tasks (34 cached, 16.103 s), audit, executing-agent initial/confirmation review. Real profile run 10780 ms; cleanup 1048 ms/zero remaining. No independent approval claimed. Use Turbo for dependency-aware builds.
4. P02-R09 is active: guarded cookie/CSRF transport, Federation subgraph, public error sanitization and finite product startup/migration ownership. Follow `.ai/CHANGE_PLAN.md`. Runtime is still health-only; no cookie route/GraphQL/product seed is wired yet.
5. Preserve owner validation and account-then-session lock order. Profile defaults/retention/deletion/retry semantics are in `services/identity/migrations/README.md`. Pending outbox never expires; relay/consumer cleanup belongs to Phase 08.
6. Reuse existing Express/Apollo compatibility fixtures and isolated Docker supervisor. Do not repeat passing heavyweight tests for prose/unwired type-only changes. Before publication, require clean runnable product evidence and the full combined integration matrix.
7. Commit coherent local functional blocks; publish once the product candidate is usable. Never skip protected CI or claim an unrun experiment.

## Do not do yet

- No public signup/recovery/email/MFA UI, hosted identity credentials or later-phase product work.
- No Router trust shortcut, public identity headers, cross-context database access or Redis session authority.
- No broad Docker/WSL reset/prune, unrelated resources, protection bypass or unrelated dependency-major update.
