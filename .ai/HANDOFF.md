# Handoff

## Resume point

1. Phase 01 is released: PR 18 squash `b0544c9c6a86ac1cdb48963707eedf0f0e153621`; protected `33047330768` and exact post-merge `33047629326` pass. No more Phase 01 metadata-only publication.
2. Local branch `feat/p02-identity-session` is not pushed. R01 assertion checkpoint `64a3aa8`; R02 durable sessions `1b45ebd`; R03–R08 profile checkpoint is identified by the containing commit and exact fingerprints in `evidence/phase-02/profiles-outbox.txt`.
3. Profiles are locally verified: Identity 111 tests, PostgreSQL 29 tests, all 49 tasks (34 cached, 16.103 s), audit, executing-agent initial/confirmation review. Real profile run 10780 ms; cleanup 1048 ms/zero remaining. No independent approval claimed. Use Turbo for dependency-aware builds.
4. P02-R09 resumed with explicit owner authorization on 2026-08-27. ADR-0014 accepts Elastic-2.0 Apollo and 0BSD tslib; the owner also permits future compatible licensing decisions without a new pause. Exact pins/lockfile/CI policy are updated. Audit has one moderate uuid advisory outside installed Apollo's v1/v4 call paths; no high/critical issue. Preserve notices and keep Aster MIT.
5. Profile commit is `5a263e87b6abfd1f72860529a90f6f4f9ce9b8b0`. Current transport/schema/config/runtime/initializer/tests/Compose/docs edits are ours. The candidate has 144 passing Identity tests and all 49 tasks; eleven real scenarios pass (162778 ms, cleanup 2732 ms/zero remaining). Review corrected late-response header cleanup and stale status prose; fresh subgraph acceptance passes (12545 ms, cleanup 1387 ms) and focused HTTP confirmation passes. Docker image `e3056cf9` is healthy with retained data; six-step smoke and migration no-op pass, 189 packaged dependency versions match source. No unrelated resources changed. Final pre-push gate and protected publication remain; exact evidence is in `evidence/phase-02/identity-subgraph.txt`.
6. Preserve owner validation and account-then-session lock order. Profile defaults/retention/deletion/retry semantics are in `services/identity/migrations/README.md`. Pending outbox never expires; relay/consumer cleanup belongs to Phase 08.
7. Final source gate and executing-agent confirmation pass: 49 tasks, 144 Identity tests, high/critical audit; no remaining local blocker. Publish the coherent candidate once, require protected exact-head CI and review-thread resolution, squash and confirm post-merge before Phase 03. No heavyweight rerun for prose; hosted clean-checkout integration/image gates verify the exact publication. Preserve local edits, retain the running demo and avoid metadata-only publication loops.

## Do not do yet

- No public signup/recovery/email/MFA UI, hosted identity credentials or later-phase product work.
- No Router trust shortcut, public identity headers, cross-context database access or Redis session authority.
- No broad Docker/WSL reset/prune, unrelated resources, protection bypass or unrelated dependency-major update.
